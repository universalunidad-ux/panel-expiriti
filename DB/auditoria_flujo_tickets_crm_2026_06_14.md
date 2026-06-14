# Auditoría funcional integral — Panel Expiriti
**Fecha:** 2026-06-14  
**Modo:** Solo lectura. Sin remediación. Sin cambios de código.  
**Repos auditados:**  
- `panel-expiriti` (rama `main`, limpio)  
- `panel-expiriti-audit-bd` (rama `audit/supabase-flows`, con `ticket-internal-reply` modificado sin commit)

---

## 1. Resumen ejecutivo

### Funcional y operativo
- El ciclo completo de soporte público (formulario → ticket → portal → respuesta del cliente → respuesta de soporte) está implementado y es coherente en sus partes principales.
- La autenticación en Edge Functions que requieren sesión usa JWT Bearer correctamente; el fix de `qrBoardRestRows` (ya publicado en `main`) eliminó la fuga de `supabaseKey` como Bearer.
- Los flujos de altas y registros son funcionales pero tienen una capa legacy activa en producción (`quick-function`) que probablemente falla silenciosamente.
- El sistema de idempotencia en `ticket-internal-reply` está bien implementado y maneja replay, conflicto, reintento y timeout.

### Incompleto / en transición
- Coexisten dos modelos de historial de ticket: `ticket_eventos` (canónico nuevo) y `tickets.timeline_publica` (JSON legacy). Ambos se escriben en paralelo en la mayoría de los flujos; si uno falla, el otro puede divergir.
- Coexisten dos tablas de archivos: `archivos_ticket` (canónica) y `ticket_archivos` (legacy). La segunda tiene inserts como soft-fail en varias funciones, lo que puede dejar filas fantasma o faltantes.
- `crear-ticket-interno` referencia una tabla `ticket_match_decisiones` que no aparece mencionada en ningún otro lugar auditado; su existencia en BD no está confirmada.
- El folio interno usa prefijo "IN" y el público "EX". No hay validación cruzada de que no colisionen (depende del RPC `next_ticket_folio`).

### Riesgoso
- `quick-function` usa hashes SHA-256 hardcodeados como nombre de variable de entorno (`Deno.env.get("6fb8db5c...")`). Esto produce `undefined` en Deno y el `createClient` falla o usa valores vacíos. Si esta función sigue activa en producción con ese código, cada llamada falla con 500.
- `match-cliente` (Edge Function standalone) usa `SUPABASE_SERVICE_ROLE_KEY` sin autenticación del llamante. Cualquier POST puede ejecutar una consulta sobre la tabla `clientes` y `cliente_aliases` y obtener candidatos de matching.
- Turnstile está deshabilitado tanto en frontend (`TURNSTILE_ENABLED=false`) como en Edge (`REQUIRE_TURNSTILE=false`). Cualquier bot puede crear tickets o solicitudes sin captcha.
- `altas.js` y `registros.js` hacen inserts directos a `clientes` y `clientes_contactos` desde el navegador sin pasar por Edge Function. La seguridad depende exclusivamente de RLS.

### No tocar todavía
- Esquema de BD, RLS, policies y triggers (fuera de scope de esta fase).
- `ticket_archivos` (tabla legacy activa): limpiarla requiere auditar todos los lectores primero.
- `tickets.timeline_publica`: migrar a solo `ticket_eventos` es un refactor mayor; requiere validar que `estado-ticket-ts` ya funcione bien con el fallback.
- `quick-function` y `super-service`: diagnosticar antes de retirar.

---

## 2. Mapa funcional del ciclo de tickets de punta a punta

### 2.1 Creación de ticket vía soporte público

**Frontend:** `PANEL/soporte.html` + `PANEL/soporte.js`

**Flujo de usuario:**
1. Usuario llena el formulario. En paralelo, al cambiar empresa/correo/teléfono, `soporte.js` llama debounced a `match-cliente` (EF standalone, POST a `MATCH_ENDPOINT`).
2. El usuario puede aceptar, rechazar o ignorar el match sugerido. Los flags `empresa_confirmada`, `contacto_confirmado`, `contacto_es_nuevo` se guardan en campos ocultos del formulario.
3. Al enviar: `send()` construye un `FormData` con `payload` (JSON stringify) + archivos como `file_0`, `file_1`...
4. POST a `SUPPORT_ENDPOINT` = `https://ovfmqqqwezfdtgrtkjhf.supabase.co/functions/v1/support-submit-secure`.

**Validaciones en frontend (`soporte.js`):**
- Campos obligatorios: nombre, empresa, sistema, correo válido, teléfono ≥ 10 dígitos, título ≥ 6 chars, descripción ≥ 20 chars.
- Archivos: máx 10, cada uno máx 20 MB, total máx 60 MB, extensiones permitidas: jpg, jpeg, png, webp, pdf, xml, xls, xlsx, csv, txt, zip.
- Turnstile: deshabilitado (`TURNSTILE_ENABLED=false`).
- Guard anti-duplicado: si hay aviso global activo y el texto sugiere timbrado, pregunta al usuario.

**Edge Function:** `support-submit-secure/index.ts`

| Paso | Detalle |
|---|---|
| CORS | `*` en todos los métodos |
| Turnstile | `REQUIRE_TURNSTILE=false` — deshabilitado en producción |
| Rate limit | `rate_limit_events`: 5 requests / 10 min por IP. Scope: `support_submit` |
| Validación | Repite validaciones del front: campos oblig., correo, teléfono, archivos |
| matchCliente inline | Consulta `clientes` (límite 250) + `cliente_aliases` (límite 800). Score ponderado por empresa exacta/parcial/alias/correo/teléfono/dominio. Luego busca contacto en `clientes_contactos` (límite 40). |
| Folio | RPC `next_ticket_folio(p_prefix: "EX")` — genera folio tipo `EX-NNNN` |
| Token público | 64 chars hex (2× UUID sin guiones concatenados), expira en 30 días |
| SLA packs | Automático por prioridad: urgente (2h/8h), alta (4h/24h), media (8h/48h), baja (24h/72h) |

**Tablas escritas (en orden):**

1. **`solicitudes_soporte`** (INSERT)  
   Columnas clave: `folio`, `nombre`, `empresa`, `correo`, `telefono`, `titulo`, `descripcion`, `impacto`, `prioridad`, `sistema`, `canal`, `adjuntos_count`, `total_peso`, `cliente_id`, `contacto_id`, `cliente_id_sugerido`, `contacto_id_sugerido`, `match_nivel`, `match_score`, `match_confirmado`, `contacto_confirmado`, `contacto_es_nuevo`, `requiere_consolidacion`, `estatus: "nuevo"`, `origen: "soporte_publico"`, `empresa_capturada`, `nombre_capturado`, `correo_capturado`

2. **`tickets`** (INSERT)  
   Columnas clave: `cliente_id`, `titulo`, `descripcion`, `prioridad`, `estado: "abierto"`, `tipo`, `origen: "soporte_publico"`, `folio`, `token_publico`, `token_publico_expira`, `timeline_publica: [{ kind: "mensaje", ... }]` (array JSON inicial), `adjuntos: []`, `evidencia_count: 0`, `solicitud_soporte_id` (FK a `solicitudes_soporte`), `correo_cliente`, `nombre_cliente_contacto`, `contacto_id`, `empresa_capturada`, `nombre_capturado`, `correo_capturado`, `cliente_id_sugerido`, `match_nivel`, `match_score`, `sla_policy`, `sla_first_response_deadline`, `sla_resolution_deadline`

3. **`ticket_eventos`** (INSERT ×2)  
   - Evento sistema "abierto": `autor_tipo: "sistema"`, `visibilidad: "publica"`, `kind: "sistema"`, texto de confirmación  
   - Evento interno si `requiere_consolidacion`: `visibilidad: "interna"`, `kind: "sistema"`, registra empresa/contacto capturado

4. **`solicitud_archivos`** (INSERT por archivo) — tabla canónica de archivos de solicitud  
   Columnas: `solicitud_id`, `nombre_archivo`, `storage_path`, `mime_type`, `tamano_bytes`, `tipo_detectado: "soporte_publico"`  
   Storage bucket: `soporte_adjuntos`  
   Path: `{ticket_id}/{timestamp}_{uuid}_{safe_name}`

5. **`ticket_archivos`** (INSERT por archivo, **soft-fail con `console.error`**)  
   Columnas: `ticket_id`, `nombre_archivo`, `url_archivo`, `mime_type`, `tamano_bytes`  
   **Riesgo:** si falla, el archivo existe en storage y en `solicitud_archivos` pero NO en `ticket_archivos`.

6. **`archivos_ticket`** (INSERT por archivo vía `addArchivoTicket`)  
   Columnas: `ticket_id`, `solicitud_id`, `origen: "solicitud"`, `visibilidad: "publica"`, `nombre_archivo`, `storage_path`, `mime_type`, `tamano_bytes`, `meta: { canal: "soporte_publico" }`  
   **Esta es la tabla canónica nueva.**

7. **`ticket_eventos`** (INSERT si hay archivos)  
   Evento: `autor_tipo: "sistema"`, `visibilidad: "publica"`, `kind: "archivo"`, texto `"Se recibieron N archivo(s)..."`, `meta.adjuntos` (array con storage_path, sin URL firmada)

8. **`tickets`** (UPDATE)  
   Actualiza: `fecha_actualizacion`, `timeline_publica` (agrega entrada de archivos), `adjuntos` (array JSON de archivos), `evidencia_count`

9. **`solicitudes_soporte`** (UPDATE)  
   Actualiza: `ticket_id` (FK al ticket creado), `estatus: "ticket_creado"`

10. **`bitacora`** (INSERT)  
    Acción: `ticket_creado_desde_soporte_publico`  
    También: `rate_limit_events` INSERT, y `bitacora` para log de seguridad

**Correo Resend:** Se envía al `correo` capturado con folio, título, sistema y magic_link. Si `RESEND_API_KEY` no está configurado, se omite silenciosamente.

**Respuesta al frontend:** `{ ok, solicitud_id, ticket_id, folio, magic_link, magic_expires, token_publico, cliente_id, cliente_id_sugerido, ... }`

El frontend muestra el folio y el magic_link en una caja de éxito con link a `estado.html?folio=...&token=...`.

**Riesgo:** Si el INSERT a `tickets` falla después del INSERT a `solicitudes_soporte`, la solicitud queda en estado `"nuevo"` sin ticket vinculado. No hay rollback transaccional.

**Prueba manual sugerida:** Enviar formulario completo con 1 archivo, verificar que `folio` aparece en respuesta, que `magic_link` abre `estado.html` y que el ticket aparece en `tickets.html`.

---

### 2.2 Portal de estado público (lectura)

**Frontend:** `PANEL/estado.html` + `PANEL/estado.js`

**Autenticación:** Folio + `token_publico` (sin sesión de usuario)

**Carga:** `load()` → GET a `estado-ticket-ts?folio=X&token=Y`

**Edge Function:** `estado-ticket-ts/index.ts`

| Paso | Detalle |
|---|---|
| Autenticación | `eq("folio", folio).eq("token_publico", token)` — no requiere sesión |
| Expiración | `token_publico_expira < Date.now()` → 410 |
| Lectura ticket | SELECT con campos específicos (no expone `descripcion` completa, `contexto_adicional`, ni correo directamente) |
| Timeline | Prioridad 1: `ticket_eventos` WHERE `visibilidad="publica"` ORDER BY `created_at`. Si vacío → fallback a `tickets.timeline_publica`. Hidrata adjuntos con signed URLs |
| Adjuntos | Prioridad 1: `archivos_ticket` WHERE `visibilidad="publica"`. Si vacío → `tickets.adjuntos` (JSON). Si aún vacío → `ticket_archivos` (legacy) |
| Dedup adjuntos | Por `storage_path` o `url` o `nombre` |
| Signed URLs | `soporte_adjuntos.createSignedUrl(path, 8h)` — vigencia 8 horas |
| Portal log | INSERT en `ticket_portal_logs` (throttle 10min por IP+evento) |
| Bitácora | INSERT en `bitacora` accion `portal_abierto` (throttle 60min) |
| `read_only` | `true` si `estado === "cerrado"` |

**Tablas leídas:** `tickets`, `ticket_eventos`, `archivos_ticket`, `ticket_archivos`  
**Tablas escritas:** `ticket_portal_logs`, `bitacora`

**Polling en frontend:**
- Estado `esperando_cliente`: cada 15 segundos
- Estado `en_proceso`: cada 25 segundos
- Estado `resuelto`: cada 40 segundos
- Se pausa si la pestaña pierde foco, se reanuda al recuperarla (`visibilitychange`)
- Detecta cambios por `sigOf(t)` = JSON de estado + updated + longitud de timeline + longitud de adjuntos

**Render del chat:** Lee `timeline_publica` del ticket retornado (ya hidratado por la EF). Agrupa por día, clasifica mensajes como cliente/soporte/sistema. Si hay archivos sin evento "archivo", agrega entrada sintética.

**Riesgo:** Signed URLs duran 8 horas. Un usuario con acceso al enlace de estado puede descargar archivos por 8 horas sin reautenticar. Para archivos sensibles esto puede ser un problema.

**Prueba manual sugerida:** Abrir magic_link después de crear ticket desde soporte, verificar que timeline muestra al menos el evento de confirmación y que los archivos tienen link funcional.

---

### 2.3 Respuesta pública del cliente (portal)

**Frontend:** `PANEL/estado.js` → `sendReply()`

**Acción:** POST a `RESPONDER_ENDPOINT` = `estado-ticket-responder-ts`

**Edge Function:** `estado-ticket-responder-ts/index.ts`

| Paso | Detalle |
|---|---|
| Autenticación | Folio + token_publico en FormData (no sesión) |
| Expiración | Verifica `token_publico_expira` |
| Estado cerrado | 409 si `estado === "cerrado"` |
| Anti-spam | Lee últimas 2 entradas de `ticket_eventos` (publica, autor cliente o soporte). Si las 2 últimas son del cliente → 409 "Ya envió 2 mensajes seguidos" |
| Reapertura | Si `estado === "resuelto"`: INSERT evento sistema "caso reabierto" antes de cualquier otro |
| Mensaje texto | INSERT en `ticket_eventos`: `autor_tipo: "cliente"`, `visibilidad: "publica"`, `kind: "mensaje"` |
| Archivos | Por cada archivo: upload a `soporte_adjuntos`, INSERT en `archivos_ticket` (canónico, fallo duro), INSERT en `ticket_archivos` (legacy, soft-fail `console.error`) |
| Error de archivos | Si algún archivo falla: INSERT evento interno de error. Si no hay mensaje ni archivos exitosos → 500 |
| Evento de archivos | INSERT en `ticket_eventos`: `autor_tipo: "cliente"`, `kind: "archivo"`, meta con array de adjuntos subidos |
| Update ticket | `estado: "en_proceso"`, `fecha_actualizacion`, `timeline_publica` (append JSON compat), `adjuntos` (append), `evidencia_count` |
| Portal log | INSERT `ticket_portal_logs` evento `"reply"` |
| Bitácora | INSERT `bitacora` accion `"portal_respondio"` |

**Tablas escritas:** `ticket_eventos` (×2-3), `soporte_adjuntos` (storage), `archivos_ticket`, `ticket_archivos` (soft-fail), `tickets`, `ticket_portal_logs`, `bitacora`

**Riesgo principal:**
- El campo `ticket_archivos.url_archivo` almacena el `storage_path` (no una URL firmada). La columna se llama `url_archivo` pero en realidad es un path relativo. Cualquier lector que trate `url_archivo` como URL directa fallará.
- El update final de `tickets` actualiza `timeline_publica` con un formato "compat" (JSON array), no delegando a `ticket_eventos`. Esto mantiene la doble verdad.
- Si el UPDATE de `tickets` falla, los eventos ya están insertados en `ticket_eventos` pero el ticket no refleja el nuevo estado ni los adjuntos en su JSON.

**Prueba manual sugerida:** Desde el portal de estado, enviar un texto + 1 archivo. Verificar que el ticket pasa a `en_proceso` en `tickets.html` y que el archivo aparece en `ticket.html`.

---

### 2.4 Board de tickets internos

**Frontend:** `PANEL/tickets.html` + `PANEL/tickets.js`

**Carga de tickets:**
- `fetchTicketsRest()` — carga vía REST API de Supabase con `tkSessionToken()` como Bearer (fix ya aplicado)
- Timeout: 4500ms en modo AUTH_FAST
- Si falla con error de JWT/sesión expirada → redirect a `index.html`
- Vista: kanban (por estado) o compacta (lista). Persistida en `localStorage`

**Acciones directas desde el board (sin Edge Function):**
- `moveTicket(id, next)`: UPDATE `tickets` SET `estado`, `fecha_actualizacion` [, `primera_respuesta_en`]
- `closeTicket(id)`: UPDATE `tickets` SET `estado: "cerrado"`, `fecha_actualizacion`, `fecha_cierre`
- En `DEV_READONLY` mode: llama `window.__updateTicketRest(id, patch)` (fallback REST directo)

**Quick Reply (con Edge Function):**  
`sendQuickReply()` → `s.functions.invoke("ticket-internal-reply", { body: payload })`

Payload: `{ ticket_id, texto, replyAction, source, quick_key, idempotency_key, request_hash }`

- `idempotency_key`: UUID v4 generado por `tkQuickPayload()`
- `request_hash`: SHA256 de los campos clave (calculado en el frontend también)
- `tkQuickRemember(payload)`: guarda en `localStorage` el payload pendiente para reintento
- Si falla: toast de advertencia, texto copiado al clipboard, no se pierde

**Creación de ticket interno:**  
`saveTicket()` → `s.functions.invoke("crear-ticket-interno", { body: payload })`

Payload: `{ cliente_id, empresa, nombre, correo, telefono, sistema, titulo, descripcion, tipo, prioridad, notificar }`

**Tablas leídas:** `tickets`, `clientes` (join en SELECT), `perfiles`  
**Tablas escritas (acciones directas):** `tickets`  
**Edge Functions invocadas:** `ticket-internal-reply`, `crear-ticket-interno`

**Riesgo:** `moveTicket` y `closeTicket` actualizan `tickets` directamente desde el navegador (SDK). No generan `ticket_eventos`. Esto significa que un cambio de estado desde el board NO deja traza en el historial canónico. Solo queda reflejado en `tickets.estado` y `tickets.fecha_actualizacion`.

**Prueba manual sugerida:** Cambiar estado de un ticket desde el board, luego abrir el portal de estado del mismo ticket y verificar si el cambio de estado aparece en la timeline (no debería, porque no se crea `ticket_evento`).

---

### 2.5 Vista individual de ticket

**Frontend:** `PANEL/ticket.html` + `PANEL/ticket.js`

**Carga inicial:**
1. `loadTicketCore()`: SELECT `tickets.*` WHERE `id = :ID`
2. `loadTicketContext()` en paralelo:
   - `clientes` (si `cliente_id`)
   - `bitacora` WHERE `detalle->>ticket_id = :ID`
   - `tickets` (historial de cliente: heatmap)
   - `ticket_archivos` (legacy, todos)
   - `ticket_eventos` (todos, orden por `created_at`)
   - `archivos_ticket` (canónico, todos)

**Lógica de renderizado:**
- `LOGS`: usa `ticket_eventos` si hay filas. Si no, cae a `bitacora` (legacy).
- `FILES`: unión deduplicada de `archivos_ticket` (canónico) + `tickets.adjuntos` (JSON) + `tickets.timeline_publica[].adjuntos` + `ticket_archivos` (legacy). Dedup por `fileUniqKey`.
- Muestra en panel: `DATA_MODE = "new"` si hay datos en `ticket_eventos` o `archivos_ticket`.

**Acciones de soporte (directas, sin Edge Function):**

`saveLog()`:
1. Si hay archivos adjuntos (`ST.logFiles`): upload a `soporte_adjuntos`, INSERT en `ticket_archivos` (legacy, soft-fail), INSERT en `archivos_ticket` (canónico, fallo duro)
2. INSERT en `ticket_eventos`: `autor_tipo: "soporte"`, visibilidad según `kind`
3. Si hay cambio de estado: INSERT segundo `ticket_evento` de estado
4. INSERT en `bitacora`
5. UPDATE `tickets`: `estado`, `timeline_publica` (append JSON), `primera_respuesta_en` (si primera vez), `fecha_cierre` (si cerrado), `adjuntos` (append JSON), `evidencia_count`

**Acciones CRM desde ticket:**
- Guardar/editar sistema cliente: INSERT/UPDATE `cliente_sistemas`
- Guardar AnyDesk: INSERT/UPDATE `cliente_accesos` + UPDATE `tickets.contexto_adicional`
- Cambiar contacto ligado: UPDATE `tickets.contacto_id`
- Cambiar cliente ligado: UPDATE `tickets`
- Cargar contactos: SELECT `clientes_contactos`

**Quick replies desde ticket.js (diferentes a tickets.js):**
- `loadQuickReplies()`: SELECT `ticket_respuestas_rapidas` con filtro por scope (global/cliente/contacto)
- `qrSaveAll()`: DELETE lógico (UPDATE `activo=false`) + INSERT nuevas filas
- Lógica duplicada parcialmente con `quick-replies.shared.js`

**Tablas leídas:** `tickets`, `clientes`, `bitacora`, `ticket_archivos`, `ticket_eventos`, `archivos_ticket`, `clientes_contactos`, `cliente_sistemas`, `cliente_accesos`, `documentos`, `ticket_respuestas_rapidas`, `ticket_portal_logs`, `perfiles`  
**Tablas escritas:** `tickets`, `ticket_eventos`, `bitacora`, `ticket_archivos` (soft-fail), `archivos_ticket`, `cliente_sistemas`, `cliente_accesos`, `ticket_respuestas_rapidas`

**Riesgo principal:** Si `archivos_ticket` INSERT falla (fallo duro), el archivo está en storage pero no en BD. La función lleva `console.error` para `ticket_archivos` pero fallo duro para `archivos_ticket`, lo cual es la lógica correcta. Sin embargo, si el bucket `soporte_adjuntos` acepta el upload pero el INSERT en `archivos_ticket` falla por error de BD, el archivo queda huérfano en storage.

**Prueba manual sugerida:** Abrir un ticket existente, agregar nota con archivo, verificar que aparece en la sección de archivos y en el portal de estado.

---

### 2.6 Respuesta interna de soporte — `ticket-internal-reply`

**Invocado desde:** `tickets.js` (quick reply board) y potencialmente desde `ticket.js` en el futuro

**Edge Function:** `ticket-internal-reply/index.ts`

**Estado en repo:** Modificado sin commit (diff: 4 líneas, 2 inserciones + 2 eliminaciones en la misma función)

| Paso | Detalle |
|---|---|
| Auth | JWT Bearer → `sb.auth.getUser(jwt)` → `perfiles` WHERE `id = uid`. Roles permitidos: `admin`, `soporte` |
| Idempotencia | `idemStart()` en `edge_idempotency`. Modos: `new`, `replay`, `conflict`, `processing`, `retry`. Timeout de reset: 90s. `replay` devuelve respuesta guardada sin re-ejecutar. `conflict` = misma key, diferente hash → 409. `processing` = en proceso → 409. `retry` = falló o >90s → reinicia |
| Idempotency key | Sanitizado, máx 220 chars, solo `[a-zA-Z0-9:_\-.]` |
| Request hash | SHA-256 de `{ticket_id, texto, replyAction, source, quick_key}` |
| Ticket | SELECT con timeout 4.5s. Campos: `id, cliente_id, folio, titulo, estado, timeline_publica, primera_respuesta_en, correo_cliente, correo_capturado, nombre_cliente_contacto, nombre_capturado, empresa_capturada, token_publico, token_publico_expira`. Rechaza si `estado = "cerrado"` |
| `replyAction` | Normaliza a `esperando_cliente`, `en_proceso`, `resuelto`. Default: `esperando_cliente` |
| Evento | INSERT `ticket_eventos`: `autor_tipo: "soporte"`, `visibilidad: "publica"`, `kind: "mensaje"`, `meta` incluye `idempotency_key`, `autor_id`, `replyAction` |
| idempotencia en evento | Si hay error 23505 + idemKey: busca el evento existente por `meta->>idempotency_key` |
| Update ticket | `estado = nextEstado`, `fecha_actualizacion`, `timeline_publica` (append, skip si ya tiene la key), `primera_respuesta_en` (si primera vez) |
| Bitácora | Con timeout 2.5s, soft-fail |
| Correo | Si `correo_cliente` o `correo_capturado` válido + `token_publico` existe: envía con magic_link a `estado.html`. Timeout 5s |
| idemDone | Guarda `responseBody` en `edge_idempotency.response` |
| idemFail | Si excepción global: marca como `failed` |

**Tablas leídas:** `perfiles`, `tickets`  
**Tablas escritas:** `edge_idempotency`, `ticket_eventos`, `tickets`, `bitacora`

**Tablas NO escritas:** No inserta en `ticket_archivos` ni `archivos_ticket` (solo texto, no archivos).

**Riesgo:** El cambio no commiteado (4 líneas) es pequeño pero no sabemos qué contiene sin leer el diff exacto. La versión auditada puede no ser la que está en producción si la función ya fue desplegada del repo anterior.

**Prueba manual sugerida:** Enviar quick reply desde `tickets.html`, verificar `{ ok: true, mail_sent: true/false, estado: "esperando_cliente" }` en respuesta, abrir portal de estado y ver que aparece el mensaje.

---

### 2.7 Creación interna de ticket — `crear-ticket-interno`

**Invocado desde:** `tickets.js` → `saveTicket()` → `s.functions.invoke("crear-ticket-interno")`

**Edge Function:** `crear-ticket-interno/index.ts`

| Paso | Detalle |
|---|---|
| Auth | JWT Bearer, rol `admin` o `soporte` |
| Contacto lookup | Si `contacto_id`: valida que exista, esté activo y pertenezca al `cliente_id` |
| Cliente lookup | Si `cliente_id`: valida que exista |
| Folio | RPC `next_ticket_folio(p_prefix: "IN")` — prefijo "IN" (interno) |
| Token público | 64 chars hex, expira 30 días |
| SLA | Automático por prioridad |
| INSERT tickets | `origen: "tickets"`, `timeline_publica` inicial, `adjuntos: []` |
| `ticket_match_decisiones` | INSERT si `requiere_consolidacion` → tabla potencialmente no existente en BD |
| Evento | INSERT `ticket_eventos`: soporte, publica, sistema |
| Bitácora | INSERT |
| Correo | Si `notificar=true` y correo válido: envía correo con magic_link (folio IN) |

**Tablas leídas:** `clientes_contactos`, `clientes`, `perfiles`  
**Tablas escritas:** `tickets`, `ticket_eventos`, `bitacora`, `ticket_match_decisiones` (tabla no confirmada)

**Riesgo:** Si `ticket_match_decisiones` no existe en BD, el INSERT falla con log de error (`console.error`) pero continúa (no es fallo duro). Sin embargo, si produce excepción no capturada, el endpoint devuelve 500 y el ticket puede haberse creado ya.

---

### 2.8 Quick Replies

**Módulo:** `PANEL/quick-replies.shared.js` (importado por `estado.js` y otros)  
**También:** `PANEL/ticket.js` tiene lógica inline duplicada

**Tabla:** `ticket_respuestas_rapidas`

**Columnas usadas:** `id`, `activo`, `modo` (seguimiento/captura), `scope` (global/cliente/contacto), `cliente_id`, `contacto_id`, `titulo`, `texto`, `orden`

**Funciones del módulo compartido:**
- `qrList()`: carga hasta 3 queries en paralelo (global + cliente + contacto), mergea y ordena
- `qrLoadScope()`: carga por scope específico con seeding de filas vacías si hay menos del mínimo
- `qrSaveScope()`: soft-delete de filas anteriores + INSERT nuevas
- `qrSoftDelete()`: UPDATE `activo=false`

**Tablas leídas/escritas:** `ticket_respuestas_rapidas`

**Riesgo:** La lógica de quick replies está duplicada entre `ticket.js` (`qrSaveAll`, `qrLoadEditor`) y `quick-replies.shared.js`. Si se actualiza una, la otra puede quedar desincronizada.

---

## 3. Fuentes de verdad

| Entidad | Canónico | Legacy / Compat | Doble escritura | Puede divergir |
|---|---|---|---|---|
| Historial de eventos | `ticket_eventos` | `tickets.timeline_publica` (JSON) | Sí, en todos los flujos | Sí |
| Archivos de ticket | `archivos_ticket` | `ticket_archivos` | Sí (ticket_archivos como soft-fail) | Sí |
| Archivos de solicitud | `solicitud_archivos` | — | No | No |
| Adjuntos rápidos en ticket | `tickets.adjuntos` (JSON) | — | Se actualiza junto con archivos_ticket | No (es derivado) |
| Estado del ticket | `tickets.estado` | — | — | No |
| Conteo de archivos | `tickets.evidencia_count` | — | Se actualiza junto con inserts | Puede quedar desactualizado |
| CRM contactos | `clientes_contactos` | — | — | No |
| Historial CRM | `clientes_contacto_historial` | — | — | No |

### Detalle de divergencias

**`ticket_eventos` vs `tickets.timeline_publica`:**
- `ticket_eventos` es el modelo normalizado nuevo: tabla relacional, tiene `created_at`, `autor_tipo`, `visibilidad`, `kind`, `meta` (JSONB), `idempotency_key` en meta.
- `tickets.timeline_publica` es un array JSONB en la tabla `tickets`. Se construye como una representación "compatible" que los lectores del portal podían usar antes de que `ticket_eventos` existiera.
- Ambos se actualizan en `support-submit-secure`, `estado-ticket-responder-ts`, `ticket-internal-reply`, y `ticket.js`.
- `estado-ticket-ts` tiene la lógica correcta: primero lee `ticket_eventos`, y solo si está vacío cae a `tickets.timeline_publica`. Sin embargo, si hay eventos en ambos, el portal mostrará solo `ticket_eventos` (correcto).
- El riesgo es si `ticket_eventos` tiene filas pero `tickets.timeline_publica` tiene datos adicionales que no se migraron. Esto puede ocurrir con tickets creados antes de que `ticket_eventos` existiera.

**`archivos_ticket` vs `ticket_archivos`:**
- `archivos_ticket` tiene columnas `origen`, `visibilidad`, `storage_path`, `creado_en` (TIMESTAMPTZ), `meta` (JSONB). Es la tabla canónica.
- `ticket_archivos` tiene `url_archivo` (string, en realidad almacena el `storage_path`), `fecha_subida`. Es la tabla legacy.
- En `support-submit-secure`: fallo en `ticket_archivos` es soft (console.error), fallo en `archivos_ticket` es duro → prioridad correcta.
- En `estado-ticket-responder-ts`: fallo en `archivos_ticket` es duro, fallo en `ticket_archivos` es soft → correcto.
- En `ticket.js` (`uploadPublicLogFiles`): fallo en `ticket_archivos` es soft, fallo en `archivos_ticket` es duro → correcto.
- **Inconsistencia:** `support-submit-secure` escribe en `solicitud_archivos`, `ticket_archivos` Y `archivos_ticket`. `ticket_archivos` podría quedar sin `solicitud_id`.

**`tickets.adjuntos` (JSON):**
- Se actualiza en `support-submit-secure` y `estado-ticket-responder-ts` como array de objetos `{nombre, tipo, peso, storage_path, url: null}`.
- `url: null` significa que estos adjuntos necesitan firmarse en el momento de lectura.
- `estado-ticket-ts` lo hidrata con `hydrate()` que firma URLs.
- Puede divergir de `archivos_ticket` si el UPDATE de `tickets` falla después del INSERT en `archivos_ticket`.

---

## 4. Auditoría de adjuntos

### Matriz de escritura por flujo

| Flujo | Storage bucket | `solicitud_archivos` | `ticket_archivos` | `archivos_ticket` | `tickets.adjuntos` | `ticket_eventos` |
|---|---|---|---|---|---|---|
| Soporte público (support-submit-secure) | `soporte_adjuntos` | ✓ (duro) | ✓ (soft-fail) | ✓ (duro) | ✓ (update) | ✓ archivo+meta |
| Portal respuesta cliente (estado-ticket-responder-ts) | `soporte_adjuntos` | — | ✓ (soft-fail) | ✓ (duro) | ✓ (update) | ✓ archivo+meta |
| Soporte interno ticket.js (uploadPublicLogFiles) | `soporte_adjuntos` | — | ✓ (soft-fail) | ✓ (duro) | ✓ (update) | vía saveLog |
| Alta pública (submit-alta/quick-function) | `altas_tmp` | ✓ (duro) | — | — | — | — |

### Archivos en la solicitud de alta
- Los archivos de `solicitudes_alta` van al bucket `altas_tmp` (no `soporte_adjuntos`).
- `solicitud_archivos.solicitud_id` puede referir a `solicitudes_alta` o a `solicitudes_soporte` dependiendo del flujo.
- La columna `tipo_detectado` diferencia `"soporte_publico"` vs `"pdf"/"zip"/"imagen"`.

### Signed URLs
- Las URLs firmadas se generan en `estado-ticket-ts` con vigencia de **8 horas**.
- `estado.js` no regenera URLs; usa las que devuelve la EF.
- Si el usuario mantiene abierta la página más de 8 horas, los links de archivos expirarán.
- En `ticket.js` (panel interno): `signedEvidenceUrl()` genera signed URLs de `soporte_adjuntos` con 8 horas al abrir el ticket. Las URLs no se renuevan automáticamente.

### Visibilidad pública vs interna
- `archivos_ticket` tiene columna `visibilidad: "publica" | "interna"`.
- `estado-ticket-ts` filtra: `WHERE visibilidad = "publica"`.
- Archivos con visibilidad interna NO son expuestos en el portal público. Correcto.
- Sin embargo, si la RLS no está configurada correctamente, un usuario con el SDK (publishable key) podría leer `archivos_ticket` sin filtro de visibilidad.

### Archivos huérfanos en storage
- Si el INSERT en `archivos_ticket` falla después del upload a `soporte_adjuntos`, el archivo queda en storage sin metadata en BD → huérfano.
- No hay proceso de limpieza de huérfanos detectado en este repo.
- En el flujo de portal cliente (`estado-ticket-responder-ts`), el upload es por archivo en loop. Si el archivo 3 de 5 falla el upload a storage, los archivos 1 y 2 ya están subidos pero el insert de metadata puede no haberse hecho aún (depende del punto de fallo).

---

## 5. Auditoría de comunicación

### Qué ve el cliente (portal `estado.html`)
- Timeline pública: mensajes del equipo de soporte, cambios de estado, archivos recibidos, mensajes del propio cliente.
- Archivos con visibilidad `"publica"` (filtrado en `estado-ticket-ts`).
- Estado del ticket en tiempo (semi)real con polling.
- NO ve: notas internas, eventos internos, datos de match/consolidación, correo de otros usuarios.
- Puede responder (texto + archivos) con límite de 2 mensajes seguidos sin respuesta de soporte.
- Recibe notificaciones del navegador si las activa.

### Qué ve el agente de soporte (panel)
- Vista de ticket completa: todos los eventos (públicos e internos), archivos (todos), bitácora.
- Metadata de portal: cuándo abrió el cliente el portal, cuándo respondió por última vez.
- Información de cliente: sistemas, accesos AnyDesk, contactos, historial.
- Quick replies por scope (global/cliente/contacto).

### Notas públicas vs internas
- `ticket_eventos.visibilidad = "publica"`: el cliente las ve en el portal.
- `ticket_eventos.visibilidad = "interna"`: solo el panel interno las ve.
- En `saveLog()` de `ticket.js`: los kinds `nota` y `asignacion` son internos; `seguimiento`, `solucion`, `solicitud` son públicos.
- En `ticket-internal-reply`: todos los eventos de respuesta son `visibilidad: "publica"`.

### Correos Resend
- Enviado al crear ticket (soporte público): con folio y magic_link.
- Enviado al responder de soporte (`ticket-internal-reply`): con folio, título, texto de respuesta y magic_link.
- Enviado al crear ticket interno (`crear-ticket-interno`): si `notificar=true` y correo válido.
- No hay correo al cliente cuando CAMBIA el estado sin respuesta (ej: moveTicket desde el board).
- No hay correo al cliente cuando el ticket se cierra desde el board.
- `RESEND_API_KEY` puede no estar configurado → envío silenciosamente omitido.

### Reapertura automática
- Si el cliente responde desde el portal y el ticket está en `"resuelto"`: `estado-ticket-responder-ts` inserta evento sistema "caso reabierto" y cambia a `"en_proceso"`.
- No hay notificación automática al agente de la reapertura (solo aparece en el board en el siguiente refresh/realtime).

---

## 6. CRM relacionado

### Relación ticket → cliente/contacto

Un ticket puede tener:
- `cliente_id`: FK a `clientes` (puede ser null si `requiere_consolidacion=true`)
- `contacto_id`: FK a `clientes_contactos` (puede ser null)
- `cliente_id_sugerido`: sugerencia del matchCliente
- `contacto_id_sugerido`: sugerencia del matchCliente
- `requiere_consolidacion`: flag de que el ticket necesita ser vinculado manualmente
- `empresa_capturada`, `nombre_capturado`, `correo_capturado`, `telefono_capturado`: datos tal como fueron escritos en el formulario

Esta arquitectura permite crear tickets sin cliente registrado y consolidarlos después.

### Tablas CRM auditadas

**`clientes`:** Tabla maestra. Campos clave: `id`, `nombre`, `correo`, `telefono`, `estatus`, `origen_registro`, `ultima_interaccion`, `rol_responsable`.

**`clientes_contactos`:** Contactos por cliente. Campos clave: `id`, `cliente_id`, `nombre`, `correo`, `telefono`, `puesto`, `es_principal`, `activo`, `origen_alta`, `datos_confirmados_en`, `datos_verificacion_estatus`, `ultima_interaccion_en`.

**`clientes_contacto_historial`:** Historial de cambios de datos de contacto. Escrito en altas y registros aprobados.

**`cliente_sistemas`:** Sistemas instalados en el cliente. Se lee y escribe desde `ticket.js` y `cliente.js`.

**`cliente_accesos`:** Accesos tipo AnyDesk. Se lee y escribe desde `ticket.js`. Columnas: `tipo`, `valor`, `etiqueta`, `activo`.

**`cliente_aliases`:** Aliases para matching. Leídos en `matchCliente` de todas las funciones. No se editan desde ningún frontend visible en esta auditoría.

### Flujos que tocan CRM

| Flujo | Tablas CRM afectadas |
|---|---|
| Ticket público (soporte.js → support-submit-secure) | Lectura: `clientes`, `cliente_aliases`, `clientes_contactos` (solo match, no escribe si requiere_consolidacion) |
| Alta pública (alta.js → submit-alta → altas.js → alta-aprobar) | Escribe: `clientes` (upsert), `clientes_contactos` (upsert), `clientes_contacto_historial` |
| Registro público (registro.js → submit-registro → registros.js → registro-aprobar) | Escribe: `clientes` (upsert), `clientes_contactos` (upsert), `clientes_contacto_historial` |
| Vista cliente (cliente.js) | Escribe: `clientes` (UPDATE), `clientes_contactos` (INSERT/UPDATE/DELETE soft), `cliente_sistemas` (INSERT/UPDATE) |
| Vista ticket (ticket.js) | Escribe: `cliente_sistemas` (INSERT/UPDATE/DELETE), `cliente_accesos` (INSERT/UPDATE), `tickets.contacto_id` (UPDATE) |

### Campos duplicados entre tickets y CRM
Los tickets capturan al momento de creación: `empresa_capturada`, `nombre_capturado`, `correo_capturado`, `telefono_capturado`, `nombre_cliente_contacto`. Estos son snapshots del momento del envío; el CRM puede evolucionar después sin afectar estos campos en el ticket.

### Consolidación pendiente
Los tickets con `requiere_consolidacion=true` necesitan ser vinculados manualmente a un cliente. No hay un flujo de consolidación masiva visible en este repo. El panel de tickets muestra el flag visualmente pero la acción es manual (editar el ticket individual).

---

## 7. Altas y Registros

### Flujo de alta pública

**Versión NUEVA (auditada):** `alta.js` + `submit-alta/index.ts` + `alta-aprobar/index.ts`
- `alta.js` → POST multipart a `submit-alta` (URL hardcodeada en el JS, endpoint correcto)
- `submit-alta`: matchCliente inline, INSERT `solicitudes_alta` (campos completos con contacto principal/alterno), upload a `altas_tmp`, update `solicitudes_alta.archivos`
- Panel `altas.js` → POST a `alta-aprobar` (URL hardcodeada)
- `alta-aprobar`: autenticado (JWT, rol admin/soporte/superadmin), upsert de `clientes`, upsert de `clientes_contactos` principal + alterno, INSERT `clientes_contacto_historial`, UPDATE `solicitudes_alta.estatus="aprobada"`

**Versión LEGACY (`quick-function`):**
- Misma lógica que `super-service` pero con env vars inválidas (hashes SHA256 como nombres)
- Inserta en `solicitudes_alta` y `solicitud_archivos`, sube a `altas_tmp`
- Storage bucket: `altas_tmp`
- No tiene matchCliente, campos limitados

**Versión SEMI-LEGACY (`super-service`):**
- Código funcionalmente idéntico a `quick-function` pero con env vars correctas
- No tiene matchCliente, campos limitados

**Tabla `solicitudes_alta` — discrepancia de schema:**
- `quick-function`/`super-service` insertan campos: `nombre`, `telefono`, `correo`, `contacto`, `comentarios`, `origen`, `ip`, `user_agent`, `archivos_count`
- `submit-alta` (nuevo) inserta muchos más: `contacto_principal_*`, `contacto_alterno_*`, `cliente_id_sugerido`, `match_nivel`, `match_score`, `requiere_revision`, etc.
- Los campos extra pueden ser NULL para filas creadas por las versiones legacy.

### Flujo de registro público

**`registro.js` → `submit-registro/index.ts` → `registros.js` → `registro-aprobar/index.ts`**

- `submit-registro`: matchCliente inline, INSERT `solicitudes_registro` (campos empresa + contacto principal + alterno)
- `registro-aprobar`: autenticado (JWT, rol admin/soporte/superadmin), upsert de `clientes`, upsert/update de `clientes_contactos` principal + alterno (con update de campos confirmados: `datos_confirmados_en`, `datos_verificacion_estatus`), INSERT `clientes_contacto_historial`
- `registro-aprobar` es más completo que `alta-aprobar`: actualiza datos del contacto existente si ya existe (no solo activa)

**Panel `altas.js` y `registros.js` — riesgo:**
- Tienen funciones como `createClientFromRequest`, `createPrimaryContactFromRequest`, etc. que hacen inserts directos a `clientes` y `clientes_contactos` desde el frontend (SDK).
- Estas funciones parecen ser el código de aprobación ANTERIOR (antes de que existieran `alta-aprobar` y `registro-aprobar`).
- El panel ahora llama a la EF, pero el código JS de aprobación alternativa sigue presente en los archivos.
- Si hay un bug en la EF y el usuario usa el path JS anterior, las operaciones de CRM se harían sin validación server-side.

---

## 8. Edge Functions — Clasificación

| Función | Clasificación | Auth | Notas |
|---|---|---|---|
| `support-submit-secure` | **ACTIVA CRÍTICA** | Pública + rate_limit | Flujo principal de ingesta de tickets. Sin Turnstile activo. |
| `estado-ticket-ts` | **ACTIVA CRÍTICA** | Token público (folio+token) | Lectura del portal público. Fallback correcto entre ticket_eventos y timeline_publica. |
| `estado-ticket-responder-ts` | **ACTIVA CRÍTICA** | Token público (folio+token) | Respuesta del cliente. Doble write archivos. |
| `ticket-internal-reply` | **ACTIVA CRÍTICA** | JWT sesión (rol soporte/admin) | Con idempotencia robusta. **Tiene cambio sin commit en el repo.** |
| `crear-ticket-interno` | **ACTIVA CRÍTICA** | JWT sesión (rol soporte/admin) | Referencia `ticket_match_decisiones` no confirmada. |
| `match-cliente` | **ACTIVA SECUNDARIA** | **Sin auth** (service_role) | Standalone, cualquier POST puede consultarlo. |
| `alta-aprobar` | **ACTIVA SECUNDARIA** | JWT sesión (rol admin/soporte/superadmin) | Upsert CRM correcto. |
| `registro-aprobar` | **ACTIVA SECUNDARIA** | JWT sesión (rol admin/soporte/superadmin) | Más completo que alta-aprobar en actualización de datos. |
| `submit-alta` | **ACTIVA SECUNDARIA** | Pública (sin auth, sin captcha) | Versión nueva con matchCliente. Reemplaza quick-function/super-service. |
| `submit-registro` | **ACTIVA SECUNDARIA** | Pública (sin auth, sin captcha) | Sin captcha. |
| `super-service` | **LEGACY — candidata a retirar** | Sin auth | Duplicado de quick-function con env vars correctas. Misma lógica que la versión vieja de submit-alta. |
| `quick-function` | **PELIGROSA — retirar** | Sin auth | Env vars inválidas (hashes SHA256). Falla silenciosamente. Sigue activa como EF deployada si no fue removida. |

---

## 9. Riesgos por severidad

### CRÍTICO

**C1 — `quick-function` en producción con env vars inválidas**  
`Deno.env.get("6fb8db5c658ab3abb5c898c2d90c9d17a5f3a30a19f006c8415fb9632180f418")` devuelve `undefined` en Deno. El `createClient` recibe `undefined!` (TypeScript non-null assertion). Dependiendo de la versión de supabase-js, puede crear un cliente inválido o lanzar excepción. Cada llamada a esta función devuelve 500. Si sigue activa y el frontend la llama, los usuarios ven error silencioso.  
Evidencia: `quick-function/index.ts:14-15`

**C2 — Sin transacciones atómicas en el flujo de creación de ticket**  
`support-submit-secure` hace: INSERT `solicitudes_soporte` → INSERT `tickets` → INSERT archivos × N → UPDATE `tickets` → UPDATE `solicitudes_soporte`. Si cualquier paso falla, los anteriores no se revierten. El escenario más grave: ticket creado pero sin archivos en BD (sí en storage), o solicitud sin ticket vinculado.  
Evidencia: `support-submit-secure/index.ts:125-160`

### ALTO

**A1 — `match-cliente` sin autenticación**  
La EF usa `SUPABASE_SERVICE_ROLE_KEY` internamente, pero cualquier POST externo puede ejecutarla y recibir candidatos de clientes con scores y razones de matching. Expone indirectamente nombres de empresa y IDs de contactos.  
Evidencia: `match-cliente/index.ts:16`

**A2 — Turnstile deshabilitado globalmente**  
Tanto `soporte.js` (`TURNSTILE_ENABLED=false`) como `support-submit-secure` (`REQUIRE_TURNSTILE=false`) tienen el captcha deshabilitado. El rate limit (5/10min por IP) es la única protección contra spam de tickets.  
Evidencia: `soporte.js:11`, `support-submit-secure/index.ts:6`

**A3 — Cambios de estado desde el board no generan `ticket_eventos`**  
`moveTicket` y `closeTicket` en `tickets.js` actualizan `tickets.estado` directamente (SDK). No se inserta ningún `ticket_evento`. El historial canónico queda incompleto para estos cambios.  
Evidencia: `tickets.js:265-268`

**A4 — `ticket-internal-reply` tiene cambio sin commit y posiblemente sea versión distinta a la desplegada**  
El diff muestra 4 líneas cambiadas. No sabemos si la versión en producción corresponde al estado pre o post commit. Si la EF desplegada difiere del código auditado, los hallazgos de idempotencia pueden no aplicar.  
Evidencia: `status_actual_2026_06_13.txt:1`, `diff_stat_2026_06_13.txt`

### MEDIO

**M1 — Doble verdad: `ticket_eventos` vs `tickets.timeline_publica`**  
Ambos se actualizan en todos los flujos pero la sincronización no es transaccional. Si el INSERT en `ticket_eventos` tiene éxito pero el UPDATE de `timeline_publica` falla, el portal usará los eventos pero el panel (que también lee `timeline_publica` como fallback) mostrará datos diferentes.  
Evidencia: múltiples flujos.

**M2 — Signed URLs de 8 horas sin renovación**  
URLs de archivos expiran en 8 horas. Usuarios con sesión larga o que guardan el link no pueden reabrir archivos sin recargar.  
Evidencia: `estado-ticket-ts/index.ts:13`

**M3 — `crear-ticket-interno` referencia `ticket_match_decisiones`**  
Si la tabla no existe, el INSERT falla con `console.error` pero el flujo continúa. La tabla no aparece en ningún otro lugar del código auditado.  
Evidencia: `crear-ticket-interno/index.ts:74`

**M4 — `altas.js` y `registros.js` tienen código de aprobación JS directo (sin EF)**  
Las funciones de aprobación directas (sin Edge Function) permanecen en el código. Si hay un error en la EF y el código antiguo se activa, la aprobación ocurre sin validación server-side ni auditoría.  
Evidencia: `altas.js:34-39`, `registros.js:45-56`

**M5 — `ticket_archivos.url_archivo` almacena `storage_path`, no URL**  
El nombre del campo es engañoso. Los lectores que tratan este valor como URL directa fallan. Actualmente `estado-ticket-ts` hidrata correctamente usando `storage_path`, pero un lector nuevo podría confundirse.  
Evidencia: `estado-ticket-responder-ts/index.ts:29`, `estado-ticket-ts/index.ts:21`

**M6 — Archivos potencialmente huérfanos en storage**  
Si el upload a `soporte_adjuntos` tiene éxito pero el INSERT en `archivos_ticket` falla, el archivo existe en storage sin metadata. No hay proceso de limpieza.  
Evidencia: flujo de archivos en múltiples EF.

### BAJO

**B1 — Polling sin backoff exponencial**  
El portal hace polling a intervalo fijo (15/25/40s). En picos de carga, muchos portales abiertos simultáneamente pueden generar carga innecesaria.  
Evidencia: `estado.js:61-63`

**B2 — Lógica de quick replies duplicada entre `ticket.js` y `quick-replies.shared.js`**  
Dos implementaciones paralelas pueden divergir con el tiempo.  
Evidencia: `ticket.js:77-88`, `quick-replies.shared.js:13-23`

**B3 — Folio generado por RPC sin validación de unicidad en app**  
Si el RPC `next_ticket_folio` tiene un bug de concurrencia (dos llamadas simultáneas), puede generar folios duplicados. La garantía de unicidad depende de la implementación del RPC en BD.  
Evidencia: `support-submit-secure/index.ts:21`, `crear-ticket-interno/index.ts:16`

**B4 — `solicitudes_alta` tiene schema diferente entre versiones de `submit-alta`**  
Las filas creadas por `quick-function`/`super-service` tienen menos columnas que las creadas por el `submit-alta` nuevo. El panel de altas debe manejar columnas null.  
Evidencia: `quick-function/index.ts:33-47`, `submit-alta/index.ts:45`

---

## 10. Porcentaje de confianza funcional

| Área | Confianza | Notas |
|---|---|---|
| Soporte público (formulario → ticket) | **82%** | Flujo completo; sin Turnstile; riesgo de fallo parcial sin rollback |
| Portal de estado (lectura) | **88%** | Fallback correcto ticket_eventos → timeline; URLs expiran |
| Respuesta pública del cliente | **80%** | Doble write sin transacción; reapertura automática correcta |
| Panel board de tickets (carga + vista) | **85%** | Fix de token Bearer ya aplicado; cambios de estado sin evento |
| Vista individual de ticket | **78%** | Doble write; lógica QR duplicada; referencias legacy |
| Adjuntos (integridad) | **70%** | Doble write; posibles huérfanos; `url_archivo` engañoso |
| Quick replies | **75%** | Funcionales pero lógica duplicada entre módulos |
| CRM cliente/contacto | **82%** | Upsert correcto en EF; riesgo en paths directos de altas.js/registros.js |
| Altas (flujo nuevo) | **80%** | `submit-alta` + `alta-aprobar` bien estructurados |
| Altas (flujo legacy quick-function) | **10%** | Env vars inválidas → falla en producción |
| Registros | **82%** | `submit-registro` + `registro-aprobar` bien estructurados |
| Edge Functions (globalmente) | **75%** | 2 legacy problemáticas; 1 sin auth; 1 con cambio no commiteado |
| RLS | **Sin datos** | No se pudo auditar RLS directamente (sin acceso a schema); confianza desconocida |
| Performance (a escala) | **65%** | Polling sin backoff; matchCliente hace full-scan de clientes; sin índices visibles |

**Confianza global del ciclo de tickets (punta a punta):** **79%**

---

## 11. Plan recomendado

### Corregir primero (prioridad alta, bajo riesgo de romper algo)

1. **`quick-function`:** Desactivar o eliminar de Supabase Functions. No tiene usuarios legítimos si `submit-alta` ya reemplazó su funcionalidad. Confirmar primero que ningún frontend la llama actualmente.

2. **Changios de estado desde el board (`moveTicket`, `closeTicket`) sin `ticket_evento`:** Evaluar si agregar INSERT en `ticket_eventos` al momento del cambio de estado. Bajo riesgo; mejora trazabilidad.

3. **Turnstile:** Re-habilitar (`REQUIRE_TURNSTILE=true` en EF + `TURNSTILE_ENABLED=true` en frontend) o documentar explícitamente la decisión de mantenerlo deshabilitado con los riesgos asociados.

4. **Commitear `ticket-internal-reply`:** El cambio pendiente (4 líneas) debe ser commiteado o revertido para sincronizar lo que está en el repo con lo que está en producción.

### Revisar manualmente

5. **`match-cliente` sin autenticación:** Determinar si debe requerir un header de servicio interno o una API key. Evaluar si los datos retornados (IDs de clientes, scores) son sensibles.

6. **`ticket_match_decisiones`:** Verificar si la tabla existe en producción. Si no existe, el INSERT en `crear-ticket-interno` falla silenciosamente y la funcionalidad de tracking de decisiones no opera.

7. **Folios "IN" vs "EX":** Verificar que el RPC `next_ticket_folio` genera secuencias independientes por prefijo y que no hay colisiones.

8. **`altas.js`/`registros.js` — código de aprobación directo:** Determinar si las funciones JS directas (`createClientFromRequest`, etc.) aún pueden ser invocadas o si están dead code.

### No tocar todavía

9. **`tickets.timeline_publica` y `tickets.adjuntos`:** Migrar a solo `ticket_eventos` y `archivos_ticket` es un cambio de fondo. Requiere auditar todos los lectores y asegurar que el fallback de `estado-ticket-ts` es suficiente para datos históricos. Planificar como sprint dedicado.

10. **`ticket_archivos` (tabla legacy):** No eliminar hasta confirmar que `archivos_ticket` tiene todos los datos históricos y que ningún lector depende exclusivamente de `ticket_archivos`.

11. **Schema de BD, RLS, policies:** Requiere acceso directo a Supabase o al SQL exportado. No auditar sin el schema completo.

12. **`super-service`:** Candidata a retirar después de `quick-function`. Pero primero confirmar que `submit-alta` (nuevo) es el reemplazo completo (tiene más campos y matchCliente).

### Puede esperar

13. **Backoff exponencial en polling de `estado.js`:** Mejora de performance no urgente.

14. **Refactor de lógica duplicada de quick replies:** Unificar `ticket.js` y `quick-replies.shared.js` en una segunda fase de limpieza.

15. **Renovación automática de signed URLs:** Mejoría de UX; no es un blocker funcional.

### Pertenece al carril de seguridad avanzada (segunda fase)

- Auditoría completa de RLS: verificar que `archivos_ticket`, `ticket_eventos`, `tickets`, `solicitudes_soporte` tienen policies correctas para las tres vistas (anónimo, usuario autenticado, service_role).
- CORS en Edge Functions: actualmente `*`; evaluar si debe restringirse al dominio de la app.
- Expiración de `token_publico`: actualmente 30 días sin posibilidad de revocar desde el frontend. Evaluar si se necesita revocación explícita.
- Rate limiting en `estado-ticket-responder-ts`: no tiene rate limit por IP ni por token. Un atacante con acceso al token puede enviar spam de mensajes (limitado a 2 seguidos, pero puede seguir si soporte responde).
- Logging de acceso a archivos: actualmente no hay registro de quién descargó qué archivo (solo throttled views del portal).

---

## Apéndice — Estructura de tablas inferida

### `tickets` (columnas principales detectadas)
`id`, `cliente_id`, `contacto_id`, `titulo`, `descripcion`, `tipo`, `prioridad`, `estado`, `origen`, `folio`, `token_publico`, `token_publico_expira`, `timeline_publica` (JSONB), `adjuntos` (JSONB), `evidencia_count`, `solicitud_soporte_id`, `correo_cliente`, `correo_capturado`, `nombre_capturado`, `nombre_cliente_contacto`, `empresa_capturada`, `telefono_capturado`, `cliente_id_sugerido`, `contacto_id_sugerido`, `match_nivel`, `match_score`, `match_confirmado`, `contacto_confirmado`, `contacto_es_nuevo`, `requiere_consolidacion`, `sla_policy`, `sla_first_response_deadline`, `sla_resolution_deadline`, `sla_breached_first_response`, `sla_breached_resolution`, `primera_respuesta_en`, `fecha_actualizacion`, `fecha_creacion`, `fecha_cierre`, `impacto`, `afecta_a`, `desde_cuando`, `ultimo_cambio`, `horario_contacto`, `horario_desde`, `horario_hasta`, `horario_notas`, `contexto_adicional`, `canal`, `sistema`, `documento_id`, `creado_por`

### `ticket_eventos` (columnas principales detectadas)
`id`, `ticket_id`, `autor_tipo` (cliente|soporte|sistema), `visibilidad` (publica|interna), `kind` (mensaje|estado|nota|archivo|sistema|asignacion|sla), `texto`, `meta` (JSONB), `created_at`, `created_by`

### `archivos_ticket` (columnas principales detectadas)
`id`, `ticket_id`, `solicitud_id`, `origen` (solicitud|ticket|portal|interno), `visibilidad` (publica|interna), `nombre_archivo`, `storage_path`, `url_firma`, `mime_type`, `tamano_bytes`, `subido_por`, `meta` (JSONB), `creado_en`

### `ticket_archivos` (columnas principales detectadas, legacy)
`id`, `ticket_id`, `nombre_archivo`, `url_archivo` (= storage_path), `mime_type`, `tamano_bytes`, `fecha_subida`, `subido_por`

### `solicitud_archivos` (columnas principales detectadas)
`id`, `solicitud_id` (puede ser de solicitudes_soporte o solicitudes_alta), `nombre_archivo`, `storage_path`, `mime_type`, `tamano_bytes`, `tipo_detectado`

### `edge_idempotency` (columnas principales detectadas)
`idempotency_key` (PK), `action`, `resource_id`, `request_hash`, `status` (processing|completed|failed), `response` (JSONB), `error`, `created_at`, `updated_at`

### `rate_limit_events` (columnas principales detectadas)
`id`, `scope`, `key`, `created_at`

### `ticket_portal_logs` (columnas principales detectadas)
`id`, `ticket_id`, `folio`, `evento` (view|reply), `ip`, `user_agent`, `detalle` (JSONB), `created_at`

---

*Reporte generado en modo solo-lectura. Sin cambios de código. Sin ejecución SQL. Sin acceso a Supabase remoto.*  
*Archivos auditados: 22 (JS frontend + TypeScript Edge Functions + archivos DB)*  
*Siguiente fase recomendada: auditoría de RLS y schema con acceso a `schema_public_actual.sql`*
