# Auditoría de Repositorio — panel-expiriti-audit-bd
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo lectura. Sin remediación. Sin cambios de código. Sin SQL. Sin deploy.  
**Herramienta:** Claude Sonnet 4.6 vía claude-code  

---

## 1. Estado Git

| Campo | Valor |
|---|---|
| **Rama** | `audit/supabase-flows` |
| **Estado** | LIMPIO — ningún archivo modificado ni untracked peligroso |
| **Sincronía con origin** | En sync con `origin/audit/supabase-flows` |
| **git status --short** | (sin salida — repo completamente limpio) |

### Commits recientes relevantes

```
f54e22b  docs: add ticket-internal-reply pre-fix backup
5ce8502  docs: add supabase public schema snapshot
fad413e  docs: add rollback policies dev snapshot
9be701e  chore: ignore supabase local temp files
8ee7f4e  docs: plan maestro ticket core comercial
567ef9a  fix: harden ticket internal reply idempotency
5f650eb  docs: auditoría funcional panel Expiriti 2026-06-14
e455f6e  fix: use session token for quick replies REST fallback
5cbe9ee  Update tickets.css
8a5bd02  Update tickets.css
```

**Notas sobre commits clave:**
- `f54e22b` — backup del estado pre-fix de `ticket-internal-reply` (diff de 4 líneas `2++ 2--`). El cambio quedó commiteado; backup disponible en `DB/backups/`.
- `5ce8502` — snapshot del schema público de Supabase capturado el 2026-06-13. Fuente de verdad de estructura de tablas para esta auditoría.
- `9be701e` — agrega `.gitignore` para `supabase/.temp/`, explicando por qué esos archivos ya no aparecen como untracked.
- `e455f6e` — fix aplicado en `panel-expiriti` (rama main): `qrBoardRestRows` en `tickets.js` usa `tkSessionToken()` como Bearer en lugar de `supabaseKey`. Habilitó el cierre de `qr_dev_anon_select`.

---

## 2. Archivos Relevantes Encontrados

| Archivo | Descripción | Commiteado |
|---|---|---|
| `DB/auditoria_edges_rls_2026_06_13.md` | Auditoría de 12 Edge Functions + 6 RLS policies dev anon. Incluye flujos, riesgos, SQL diagnóstico y rollback. | ✓ |
| `DB/auditoria_flujo_tickets_crm_2026_06_14.md` | Auditoría funcional integral de 760 líneas. Flujo completo tickets/CRM punta a punta. Fuentes de verdad, matriz de adjuntos, confianza por área. | ✓ |
| `DB/estado_actual_panel_expiriti_2026_06_14.md` | Checkpoint ejecutivo del sprint de auditoría. Resumen de hallazgos críticos/altos, próximos pasos ordenados. | ✓ |
| `DB/plan_maestro_ticket_core_comercial_2026_06_14.md` | Matriz maestra por área con cobertura, riesgo, dificultad de remediación y decisión humana requerida. | ✓ |
| `DB/rollback_policies_dev_B1_2026_06_13.sql` | SQL de rollback para 5 de las 6 policies dev anon (excluye `qr_dev_anon_select` deliberadamente, dado que el fix de `tickets.js:111` aún no se había aplicado al momento de redactar el SQL). | ✓ |
| `DB/rls_dev_closed_2026_06_13.txt` | Confirmación textual: las 6 policies dev anon fueron cerradas. `SELECT pg_policies` devolvió 0 filas. Validación en navegador realizada. | ✓ |
| `DB/diff_stat_2026_06_13.txt` | Diff stat del cambio en `ticket-internal-reply`: `4 ++--` (2 inserciones, 2 eliminaciones). | ✓ |
| `DB/status_actual_2026_06_13.txt` | Snapshot de `git status` del 2026-06-13. Muestra el estado del repo en esa fecha (12 EFs untracked, `ticket-internal-reply` modificado). Referencia histórica, no el estado actual. | ✓ |
| `DB/functions_descargadas_2026_06_13.txt` | Lista de las 12 Edge Functions descargadas del proyecto Supabase. | ✓ |
| `docs/audit/supabase-public-schema.sql` | Schema público de Supabase (snapshot 2026-06-13). 23+ tablas con columnas, tipos, constraints y FKs. Fuente de verdad de estructura de BD para esta auditoría. | ✓ |
| `DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts` | Copia del `index.ts` de `ticket-internal-reply` antes del fix de idempotencia. No modificar. | ✓ |
| `supabase/functions/ticket-internal-reply/index.ts` | Versión post-fix de la función. Cambio de 4 líneas commiteado en `f54e22b`. | ✓ |

---

## 3. Matriz de Auditoría por Carriles

---

### CARRIL A — Edge Functions: seguridad y acceso

| # | función / ruta | evidencia | riesgo | prioridad | acción recomendada | tipo | estado |
|---|---|---|---|---|---|---|---|
| A1 | `supabase/functions/quick-function/index.ts` | Env vars son hashes SHA256 hardcodeados como nombre de variable (`Deno.env.get("6fb8db5c...")`). `createClient(undefined!, undefined!)` en Deno. Cada llamada devuelve 500. Ningún frontend activo la invoca. | **CRÍTICO** | Alta | Retirar del deploy en Supabase Dashboard. Verificar primero que ningún frontend activo la llama (alta.js llama a `submit-alta`, no a ésta). | Dashboard | **PENDIENTE** |
| A2 | `supabase/functions/super-service/index.ts` | Duplicado funcional de `submit-alta` pero sin matchCliente. Endpoint público con service_role activo. Ningún frontend activo la invoca. Surface de ataque innecesaria. | **ALTO** | Alta | Retirar del deploy después de confirmar que `submit-alta` cubre toda la funcionalidad. | Dashboard | **PENDIENTE** |
| A3 | `supabase/functions/match-cliente/index.ts` | POST público sin JWT. Usa `SUPABASE_SERVICE_ROLE_KEY` internamente. Devuelve candidatos de clientes con nombre, correo, teléfono y score. Full scan hasta 250 clientes + 800 aliases por request. Sin rate limit. Debounce de 500ms en `soporte.js` genera múltiples scans al escribir. | **ALTO** | Alta | (1) Agregar header `x-service-key` validado internamente. (2) Reducir payload de respuesta (solo `cliente_id`, no datos de contacto completos). (3) Agregar rate limit por IP. | Código + deploy | **PENDIENTE** |
| A4 | `supabase/functions/support-submit-secure/index.ts` | `REQUIRE_TURNSTILE=false` en EF. `TURNSTILE_ENABLED=false` en `soporte.js:11`. Solo el rate limit de 5 req/10min por IP protege contra spam de tickets. | **MEDIO** | Media | Decisión humana: activar `REQUIRE_TURNSTILE=true` en Supabase Secrets y `TURNSTILE_ENABLED=true` en `soporte.js`. | Código + Dashboard (Secrets) | **PENDIENTE (decisión humana)** |
| A5 | `supabase/functions/estado-ticket-responder-ts/index.ts` | Sin rate limit por IP. Anti-spam de "≤2 mensajes seguidos del cliente" opera sobre la BD, no sobre frecuencia HTTP. Un actor con token válido puede hacer spam ilimitado de POSTs. | **MEDIO** | Media | Agregar check de `rate_limit_events` por IP antes de procesar el formData (10 req/5min sugerido). | Código + deploy | **PENDIENTE** |
| A6 | `supabase/functions/submit-alta/index.ts` + `submit-registro/index.ts` | Sin rate limit ni CAPTCHA. `submit-alta` admite hasta 80MB por request al bucket `altas_tmp`. `submit-registro` sin archivos pero también sin protección de frecuencia. | **MEDIO** | Media | Agregar rate limit por IP igual al de `support-submit-secure` (5 req/10min, tabla `rate_limit_events`). | Código + deploy | **PENDIENTE** |
| A7 | `supabase/functions/ticket-internal-reply/index.ts` | JWT verificado, rol verificado (admin/soporte), idempotencia completa con SHA256 del payload, timeouts en operaciones críticas. Cambio de 4 líneas (`2++ 2--`) commiteado en `f54e22b`. Backup pre-fix disponible en `DB/backups/`. | **BAJO** | Baja | Verificar que la versión desplegada en producción coincide con el código del commit actual. Si fue desplegada antes del fix, redesplegar. | Dashboard (verificar versión) | **PENDIENTE verificar** |
| A8 | `supabase/functions/estado-ticket-ts/index.ts` | JWT no requerido (acceso por folio + token_publico). Token y expiración verificados. Throttle en logs (10min portal_logs, 60min bitácora). Signed URLs con 8h de vigencia. Fallback correcto `ticket_eventos` → `tickets.timeline_publica`. | **BAJO** | Baja | Mantener. | — | **CUBIERTO** |
| A9 | `supabase/functions/crear-ticket-interno/index.ts` | JWT + rol verificados. RPC `next_ticket_folio(p_prefix:"IN")` atómico. Tabla `ticket_match_decisiones` referenciada en código — **confirmada existente en schema**. | **BAJO** | Baja | Mantener. Riesgo de `ticket_match_decisiones` RESUELTO. | — | **CUBIERTO** |
| A10 | `supabase/functions/alta-aprobar/index.ts` + `registro-aprobar/index.ts` | JWT + rol verificados (admin/soporte/superadmin). Upsert idempotente de clientes y contactos. INSERT en `clientes_contacto_historial`. | **BAJO** | Baja | Mantener. | — | **CUBIERTO** |

---

### CARRIL B — RLS / Policies

| # | scope | evidencia | riesgo | prioridad | acción recomendada | tipo | estado |
|---|---|---|---|---|---|---|---|
| B1 | Policies dev anon (6) | `DB/rls_dev_closed_2026_06_13.txt` confirma cierre explícito. `SELECT pg_policies` devolvió 0 filas. Incluye `qr_dev_anon_select` (cerrada después del fix de `tickets.js:111` en `e455f6e`). Rollback disponible en `DB/rollback_policies_dev_B1_2026_06_13.sql`. | **RESUELTO** | — | Ninguna acción. Rollback disponible si se necesita restaurar. | — | **CUBIERTO** |
| B2 | Policies `authenticated` para `tickets`, `clientes`, `bitacora`, `cliente_accesos` | NO aparecen en `docs/audit/supabase-public-schema.sql`. El schema snapshot solo contiene `CREATE TABLE`, no `CREATE POLICY`. Si alguna tiene `qual = true`, cualquier usuario autenticado ve todos los tickets/clientes de todos los clientes. | **ALTO** | Alta | Ejecutar SQL diagnóstico (sección 6A de `DB/auditoria_edges_rls_2026_06_13.md`) en Dashboard. Registrar resultado. | Dashboard + SQL read-only | **PENDIENTE (requiere Dashboard)** |
| B3 | Storage policies — bucket `soporte_adjuntos` | Bucket existe (5 EFs lo usan con éxito). Policies de acceso no visibles en schema SQL. Riesgo: usuario con anon key podría leer archivos directamente sin pasar por EF si la policy de bucket es `(true)`. | **ALTO** | Alta | Revisar en Dashboard → Storage → Policies. Confirmar que solo service_role puede hacer INSERT; lecturas requieren signed URL o token válido. | Dashboard | **PENDIENTE (requiere Dashboard)** |
| B4 | Storage policies — bucket `altas_tmp` | Mismo problema que B3. Usado por `submit-alta` y legacy `quick-function`/`super-service`. | **MEDIO** | Media | Revisar policies en Dashboard. | Dashboard | **PENDIENTE (requiere Dashboard)** |
| B5 | Rollback SQL (5 de 6) | `DB/rollback_policies_dev_B1_2026_06_13.sql` contiene rollback para `tickets_dev_anon_update`, `tickets_dev_anon_select`, `clientes_dev_anon_select`, `qr_dev_anon_insert`, `qr_dev_anon_update`. NO incluye `qr_dev_anon_select` (fue omitida intencionalmente porque el fix de `tickets.js:111` no estaba aplicado al momento de escribir el SQL; ese fix ya está en prod). | **BAJO** | Baja | Si se necesita rollback completo de las 6, el SQL debe actualizarse para incluir `qr_dev_anon_select ON ticket_respuestas_rapidas FOR SELECT TO anon USING (true)`. | SQL | **CUBIERTO (con nota)** |

---

### CARRIL C — Tablas críticas: schema confirmado

| # | tabla | en schema | columnas clave confirmadas | hallazgo / riesgo | prioridad | pendiente |
|---|---|---|---|---|---|---|
| C1 | `tickets` | ✓ | id, cliente_id, folio, token_publico, token_publico_expira, timeline_publica (JSONB default `[]`), adjuntos (JSONB default `[]`), estado (CHECK enum), sla_*, requiere_consolidacion, contacto_id, primera_respuesta_en, fecha_cierre | `folio` es nullable sin UNIQUE constraint visible en schema. Confirmar índice en Dashboard. | MEDIO | Verificar UNIQUE index en `folio` |
| C2 | `ticket_eventos` | ✓ | id, ticket_id, autor_tipo (cliente/soporte/sistema), visibilidad (publica/interna), kind (mensaje/estado/nota/archivo/sistema/asignacion/sla), texto, meta (JSONB), created_at, created_by | `moveTicket` y `closeTicket` en `tickets.js` actualizan `tickets.estado` directo vía SDK sin INSERT en `ticket_eventos`. Historial canónico incompleto. | **ALTO** | Agregar INSERT ticket_evento en moveTicket/closeTicket |
| C3 | `archivos_ticket` | ✓ | id, ticket_id, solicitud_id (FK → solicitudes_soporte), origen (solicitud/ticket/portal/interno), visibilidad (publica/interna), storage_path, url_firma, meta (JSONB), creado_en | Tabla canónica de archivos. `visibilidad` correctamente filtrada en `estado-ticket-ts`. | BAJO | — |
| C4 | `ticket_archivos` | ✓ | id, ticket_id, nombre_archivo, url_archivo (almacena storage_path, no URL), mime_type, fecha_subida | Tabla legacy activa. `url_archivo` nombre engañoso — es storage_path. No eliminar hasta migración planificada. | MEDIO | No tocar hasta sprint de migración |
| C5 | `solicitudes_soporte` | ✓ | id, folio (UNIQUE), cliente_id, ticket_id, match_*, requiere_consolidacion, estatus, empresa_capturada, nombre_capturado, correo_capturado | Schema completo y coherente con el código. | BAJO | — |
| C6 | `solicitud_archivos` | ✓ — **con BUG** | `CONSTRAINT solicitud_archivos_solicitud_id_fkey FOREIGN KEY (solicitud_id) REFERENCES public.solicitudes_soporte(id)` ÚNICAMENTE | **HALLAZGO CRÍTICO NUEVO:** La FK apunta solo a `solicitudes_soporte`. `submit-alta` inserta en esta tabla usando `solicitudes_alta.id` como `solicitud_id`. Si el schema de producción coincide con el snapshot, cada insert de archivo en un alta viola la FK. Ver Sección 6. | **CRÍTICO** | **Verificar en Dashboard inmediatamente (SQL read-only)** |
| C7 | `clientes` | ✓ | id, nombre, correo, telefono, estatus, calidad_datos, nombre_norm, razon_social_norm, activo, requiere_revision | Schema completo. | BAJO | — |
| C8 | `cliente_aliases` | ✓ | cliente_id, alias, alias_norm, tipo, confianza, activo, creado_en | Schema completo. | BAJO | — |
| C9 | `clientes_contactos` | ✓ | id, cliente_id, nombre, correo, telefono, es_principal, activo, datos_verificacion_estatus, datos_confirmados_en, ultima_interaccion_en | Schema completo y coherente con `alta-aprobar` y `registro-aprobar`. | BAJO | — |
| C10 | `cliente_sistemas` | ✓ | id, cliente_id, sistema, version_*, entorno (escritorio/nube/mixto/servidor), activo, respaldo_*, ultimo_mantenimiento | Escrita directamente desde `ticket.js` vía SDK. RLS no auditada (no en schema snapshot). | MEDIO | Verificar RLS en Dashboard |
| C11 | `cliente_accesos` | ✓ | id, cliente_id, contacto_id, tipo (anydesk), valor, etiqueta, activo, actualizado_por | Contiene IDs AnyDesk y credenciales de acceso remoto. Leída directamente desde `ticket.js` con `s.from("cliente_accesos").select("*")`. RLS no auditada. | **ALTO** | Verificar que RLS limita a rol admin/soporte únicamente |
| C12 | `perfiles` | ✓ | id, nombre, rol (admin/ventas/soporte), tema, preferencias (JSONB), creado_en | FK a `auth.users(id)`. Roles verificados en EFs con JWT. | BAJO | — |
| C13 | `bitacora` | ✓ | id, usuario_id, accion, cliente_id, documento_id, detalle (JSONB), visibilidad, tipo | `altas.js` la lee con filtro `detalle->>solicitud_id`. Si policy `authenticated` es `qual=true`, cualquier usuario autenticado lee toda la bitácora incluyendo eventos de seguridad. | MEDIO | Verificar policy authenticated en Dashboard |
| C14 | `rate_limit_events` | ✓ | id (bigint seq), scope, key, created_at | Sin TTL ni cleanup visible en schema. Tabla crecerá indefinidamente si no hay pg_cron configurado externamente. | MEDIO | Crear limpieza periódica (>30 días) |
| C15 | `edge_idempotency` | ✓ | idempotency_key (PK text), action, resource_id, request_hash, status (processing/completed/failed), response (JSONB), error, created_at, updated_at | Sin TTL ni cleanup visible. Rows con status `completed` y `failed` se acumulan. Timeout de reset: 90s (rows en `processing` > 90s se consideran retry). | MEDIO | Crear pg_cron para limpiar completed/failed + >7 días |
| C16 | `ticket_portal_logs` | ✓ | id (bigint seq), ticket_id, folio, evento, ip, user_agent, detalle (JSONB), created_at | Sin TTL. El throttle de 10min en `estado-ticket-ts` limita frecuencia de inserts, no el volumen total histórico. | BAJO | Considerar limpieza periódica si el volumen crece |
| C17 | `ticket_match_decisiones` | ✓ — **CONFIRMADA** | id, ticket_id, solicitud_soporte_id, score, nivel (alto/medio/bajo/ninguno), decision (pendiente/aceptado/rechazado/creado_cliente/creado_contacto/merge/ignorado), decidido_por, decidido_en | Tabla confirmada existente. Auditoría previa la marcaba como "potencialmente inexistente". RESUELTO. | BAJO | — |
| C18 | `ticket_respuestas_rapidas` | ✓ | id, cliente_id, contacto_id, scope (global/cliente/contacto), modo (seguimiento/nota/solucion), titulo, texto, activo, variables (JSONB), categoria | Tiene FK dual/circular: `ticket_respuestas_rapidas_contacto_cliente_fkey FOREIGN KEY (contacto_id) REFERENCES public.clientes_contactos(id)` y `FOREIGN KEY (cliente_id) REFERENCES public.clientes_contactos(cliente_id)`. La segunda FK referencia una columna no PK — revisar si es intencional. | MEDIO | Verificar FK circular en Dashboard |
| C19 | `avisos_globales` | ✓ | id, titulo, mensaje, severidad (info/warn/danger), activo, mostrar_en_soporte, mostrar_en_dashboard, inicio_publicacion, fin_publicacion | Schema completo. Guard de aviso en `soporte.js` bien implementado. | BAJO | — |
| C20 | `ticket_folios` | ✓ | prefix (PK text), last_value (bigint), updated_at | Tabla que soporta el RPC `next_ticket_folio`. Confirma generación atómica de folios. | BAJO | — |
| C21 | `solicitudes_alta` | ✓ | id, nombre, correo, telefono, estatus, contacto_principal_*, contacto_alterno_*, archivos (JSONB), match_*, requiere_revision | Schema con campos legacy (nombre, telefono simples) + campos nuevos (contacto_principal_*). Filas de `quick-function`/`super-service` tendrán campos nuevos en NULL. | BAJO | — |
| C22 | `solicitudes_registro` | ✓ | id, empresa, contacto_nombre, contacto_*, contacto_alterno_*, match_*, requiere_revision, estatus | Schema completo y coherente con `submit-registro` + `registro-aprobar`. | BAJO | — |
| C23 | `clientes_contacto_historial` | ✓ | id, contacto_id, cliente_id, nombre, correo, accion (confirmacion/edicion/alta_aprobada/registro_aprobado/...), origen, creado_en | Auditado y coherente con `alta-aprobar`/`registro-aprobar`. | BAJO | — |

---

### CARRIL D — RPCs

| # | RPC | evidencia | estado |
|---|---|---|---|
| D1 | `next_ticket_folio(p_prefix text)` | Confirmada vía tabla `ticket_folios` en schema. `prefix` es PK, garantiza secuencias independientes por prefijo (EX para soporte público, IN para tickets internos). El RPC hace UPDATE atómico sobre `last_value`. | **CONFIRMADA EXISTENTE — atómica, sin colisión** |
| D2 | Colisión EX vs IN | Cada prefijo es una row independiente en `ticket_folios` (PK = prefix). No puede haber colisión entre folios EX y IN por diseño. | **RESUELTO** |

---

### CARRIL E — Edge Functions descargadas al repo (12 confirmadas)

Fuente: `DB/functions_descargadas_2026_06_13.txt`

| función | ruta en repo | auth requerida | riesgo | estado |
|---|---|---|---|---|
| `support-submit-secure` | `supabase/functions/support-submit-secure/index.ts` | Pública + rate_limit | BAJO-MEDIO | ACTIVA CRÍTICA — Turnstile apagado |
| `estado-ticket-ts` | `supabase/functions/estado-ticket-ts/index.ts` | Token público (folio+token) | BAJO | ACTIVA CRÍTICA — OK |
| `estado-ticket-responder-ts` | `supabase/functions/estado-ticket-responder-ts/index.ts` | Token público (folio+token) | MEDIO | ACTIVA — sin rate limit por IP |
| `ticket-internal-reply` | `supabase/functions/ticket-internal-reply/index.ts` | JWT sesión (admin/soporte) | BAJO | ACTIVA CRÍTICA — fix commiteado en f54e22b |
| `crear-ticket-interno` | `supabase/functions/crear-ticket-interno/index.ts` | JWT sesión (admin/soporte) | BAJO | ACTIVA — ticket_match_decisiones CONFIRMADA |
| `match-cliente` | `supabase/functions/match-cliente/index.ts` | **NINGUNA** | ALTO | ACTIVA — sin JWT, full scan clientes |
| `alta-aprobar` | `supabase/functions/alta-aprobar/index.ts` | JWT sesión (admin/soporte/superadmin) | BAJO | ACTIVA — OK |
| `registro-aprobar` | `supabase/functions/registro-aprobar/index.ts` | JWT sesión (admin/soporte/superadmin) | BAJO | ACTIVA — OK |
| `submit-alta` | `supabase/functions/submit-alta/index.ts` | Pública (sin auth, sin captcha) | MEDIO | ACTIVA — sin rate limit |
| `submit-registro` | `supabase/functions/submit-registro/index.ts` | Pública (sin auth, sin captcha) | MEDIO | ACTIVA — sin rate limit |
| `super-service` | `supabase/functions/super-service/index.ts` | Pública (sin auth) | ALTO | LEGACY — candidata a retirar |
| `quick-function` | `supabase/functions/quick-function/index.ts` | Pública (sin auth) | **CRÍTICO** | ROTA — env vars inválidas, cada llamada = 500 |

---

### CARRIL F — Ítems específicos auditados

| ítem | evidencia en repo | estado |
|---|---|---|
| INSERT en `ticket_eventos` al mover/cerrar ticket | `tickets.js` usa `UPDATE tickets SET estado` directo vía SDK en `moveTicket` y `closeTicket`. Sin INSERT en `ticket_eventos`. Documentado en `auditoria_flujo_tickets_crm_2026_06_14.md` §2.4 y §9-A3. | **NO IMPLEMENTADO — pendiente** |
| Rate limit para `estado-ticket-responder-ts` | Función descargada en repo. Audit §1.6 documenta ausencia de rate limit por IP. Anti-spam de "2 mensajes seguidos" opera en BD, no en HTTP. | **PENDIENTE** |
| `match-cliente` externo sin auth | EF descargada. POST público sin JWT. Documentado en audit §1.7. Cualquier actor externo puede hacer full scan de clientes. | **RIESGO ACTIVO — pendiente** |
| Turnstile | `TURNSTILE_ENABLED=false` en `soporte.js:11`. `REQUIRE_TURNSTILE=false` en `support-submit-secure`. Documentado en múltiples audits. | **PENDIENTE (decisión humana)** |
| RLS browser writes en `cliente_sistemas` / `cliente_accesos` | Ambas tablas escritas directamente desde `ticket.js` vía SDK. RLS no visible en schema snapshot. | **PENDIENTE (requiere Dashboard)** |
| RLS browser writes en `ticket_respuestas_rapidas` | 6 dev anon policies cerradas. Policy `authenticated` no visible en schema. Lógica QR duplicada entre `ticket.js` y `quick-replies.shared.js`. | **PARCIAL — dev cerrado; authenticated no auditada** |
| Policies `tickets` SELECT authenticated | No en schema. `tickets.js` hace `SELECT *` sin filtro de rol. Si policy es `qual=true`, cualquier usuario autenticado ve todos los tickets. | **PENDIENTE (requiere Dashboard)** |
| anon bloqueado en tablas internas | Confirmado por `DB/rls_dev_closed_2026_06_13.txt`. 6 policies dev anon cerradas + validación SQL + validación en navegador. | **CONFIRMADO BLOQUEADO** |
| Storage bucket `soporte_adjuntos` | Referenciado en 5 EFs (support-submit-secure, estado-ticket-ts, estado-ticket-responder-ts, ticket.js, ticket-internal-reply). Existe en producción. Policies de bucket no en schema SQL. | **EXISTENCIA CONFIRMADA — policies pendientes Dashboard** |
| TTL / cleanup de `edge_idempotency` | Tabla existe en schema. Sin TTL, sin pg_cron visible. Status `completed`/`failed` acumulan indefinidamente. | **PENDIENTE — no implementado** |
| TTL / cleanup de `rate_limit_events` | Tabla existe en schema. Sin TTL visible. Crecimiento indefinido. | **PENDIENTE — no implementado** |

---

## 4. Confirmaciones Importantes

Las siguientes incógnitas de auditorías previas quedan **confirmadas como resueltas** a partir de la revisión del schema y los archivos de este repo:

| ítem | confirmación | fuente |
|---|---|---|
| **6 policies dev anon cerradas** | `SELECT pg_policies` devolvió 0 filas. Incluye `qr_dev_anon_select`. Validación en navegador exitosa. | `DB/rls_dev_closed_2026_06_13.txt` |
| **`ticket_match_decisiones` existe** | Tabla en schema con columnas completas: ticket_id, solicitud_soporte_id, score, nivel, decision, decidido_por. FK a tickets, solicitudes_soporte, clientes, clientes_contactos. | `docs/audit/supabase-public-schema.sql` |
| **`edge_idempotency` existe** | Tabla con idempotency_key (PK), action, request_hash, status (processing/completed/failed), response (JSONB), created_at, updated_at. | `docs/audit/supabase-public-schema.sql` |
| **`rate_limit_events` existe** | Tabla con scope, key, created_at. Usada por `support-submit-secure` para rate limit de 5/10min por IP. | `docs/audit/supabase-public-schema.sql` |
| **`ticket_folios` + `next_ticket_folio` confirmados** | Tabla `ticket_folios` (prefix PK, last_value bigint, updated_at) soporta el RPC. Secuencias independientes por prefijo garantizadas. | `docs/audit/supabase-public-schema.sql` |
| **`ticket-internal-reply` fix commiteado** | Cambio de 4 líneas (`2++ 2--`) commiteado en `f54e22b`. Backup pre-fix en `DB/backups/`. Repo limpio. | `DB/diff_stat_2026_06_13.txt` + `git log` |
| **Repo sin untracked peligrosos** | `git status --short` sin salida. Todo commiteado. Los archivos untracked históricos (12 EFs, docs/, supabase/.temp/) fueron commiteados o ignorados. | `git status` actual |
| **`avisos_globales` existe** | Tabla con titulo, mensaje, severidad, activo, mostrar_en_soporte, mostrar_en_dashboard, inicio/fin_publicacion. | `docs/audit/supabase-public-schema.sql` |
| **Colisión de folios EX vs IN resuelta** | `ticket_folios` usa prefix como PK; EX e IN son rows independientes. Sin posibilidad de colisión. | `docs/audit/supabase-public-schema.sql` |

---

## 5. Pendientes Críticos

Ordenados por severidad:

### P0 — Acción inmediata

| ítem | riesgo | bloquea | tipo |
|---|---|---|---|
| `quick-function` rota en producción | CRÍTICO — cada llamada devuelve 500 por env vars inválidas. Si sigue deployada, los usuarios que la invoquen ven error silencioso. | Funcionalidad de alta si algún cliente la usa | Dashboard: retirar |
| `solicitud_archivos` FK bug (ver Sección 6) | CRÍTICO — posible FK violation al subir archivos en alta pública. Verificar antes de cualquier otro cambio. | Funcionalidad de `submit-alta` | Dashboard: SQL read-only verificación |

### P1 — Alta prioridad

| ítem | riesgo | tipo |
|---|---|---|
| `super-service` legacy con service_role público | ALTO — endpoint activo sin uso, superficie de ataque | Dashboard: retirar |
| `match-cliente` sin JWT | ALTO — enumera clientes con datos de contacto vía POST público sin límite | Código + deploy |
| Policies `authenticated` no auditadas (`tickets`, `clientes`, `bitacora`, `cliente_accesos`) | ALTO — sin Dashboard no se puede confirmar si hay restricción por rol | Dashboard: SQL diagnóstico |
| Storage policies de `soporte_adjuntos` no auditadas | ALTO — archivos de tickets podrían ser accesibles sin firma | Dashboard |
| `cliente_accesos` RLS no auditada | ALTO — tabla contiene IDs AnyDesk y credenciales. Se lee directo desde `ticket.js` vía SDK. | Dashboard |

### P2 — Media prioridad

| ítem | riesgo | tipo |
|---|---|---|
| `estado-ticket-responder-ts` sin rate limit por IP | MEDIO — spam posible con token válido | Código + deploy |
| `submit-alta` y `submit-registro` sin rate limit | MEDIO — spam de solicitudes y archivos sin límite | Código + deploy |
| Turnstile apagado globalmente | MEDIO — sin CAPTCHA; solo rate limit por IP como protección. Decisión humana pendiente. | Código + Dashboard Secrets |
| INSERT `ticket_eventos` al mover/cerrar ticket desde board | MEDIO — historial canónico incompleto. `moveTicket` y `closeTicket` no generan evento. | Código |
| TTL/cleanup de `edge_idempotency` | MEDIO — crecimiento indefinido sin pg_cron | Dashboard: pg_cron o trigger |
| TTL/cleanup de `rate_limit_events` | MEDIO — crecimiento indefinido sin pg_cron | Dashboard: pg_cron o trigger |

### P3 — Baja prioridad

| ítem | riesgo | tipo |
|---|---|---|
| `ticket_archivos.url_archivo` almacena storage_path, no URL | BAJO — nombre engañoso. Lectores nuevos pueden confundirse. | Docs/migración planificada |
| Doble escritura `ticket_eventos` vs `tickets.timeline_publica` sin garantía transaccional | MEDIO — puede divergir si un UPDATE falla. Requiere sprint de migración. | Refactor planificado |
| Doble escritura `archivos_ticket` vs `ticket_archivos` | MEDIO — archivos huérfanos posibles en storage si INSERT falla después del upload | Refactor planificado |
| Lógica quick replies duplicada entre `ticket.js` y `quick-replies.shared.js` | BAJO — puede divergir con el tiempo | Refactor menor |
| Versión de `ticket-internal-reply` desplegada en prod vs commit actual | BAJO — confirmar coincidencia en Dashboard | Dashboard |
| FK circular en `ticket_respuestas_rapidas` (`contacto_id` → `clientes_contactos(cliente_id)`) | MEDIO — FK no PK como referencia; verificar si es intencional | Dashboard |

---

## 6. Hallazgo Nuevo Crítico — FK de `solicitud_archivos`

### Descripción

El schema snapshot `docs/audit/supabase-public-schema.sql` define la siguiente constraint:

```sql
CREATE TABLE public.solicitud_archivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL,
  nombre_archivo text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  tamano_bytes bigint,
  tipo_detectado text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT solicitud_archivos_pkey PRIMARY KEY (id),
  CONSTRAINT solicitud_archivos_solicitud_id_fkey
    FOREIGN KEY (solicitud_id) REFERENCES public.solicitudes_soporte(id)
);
```

La FK apunta **únicamente a `solicitudes_soporte(id)`**.

### Conflicto con el código de `submit-alta`

La Edge Function `submit-alta/index.ts` inserta en `solicitud_archivos` usando el `id` de la `solicitud_alta` recién creada como `solicitud_id`:

```
INSERT INTO solicitud_archivos (solicitud_id, ...)
VALUES (solicitudes_alta.id, ...)
```

Un `solicitudes_alta.id` **no existe** en la tabla `solicitudes_soporte`, por lo que la FK rechazaría el INSERT con un error de violación de clave foránea.

### Escenarios posibles

1. **La FK en producción difiere del schema snapshot** — es posible que en producción la constraint haya sido modificada para aceptar también `solicitudes_alta.id`, o que la FK haya sido eliminada. El schema es un snapshot del 2026-06-13; cambios posteriores no estarían reflejados.

2. **El INSERT está fallando silenciosamente en producción** — si `submit-alta` usa service_role y el error se captura con `console.error` (soft-fail), los archivos de altas estarían subidos a storage pero sin metadata en `solicitud_archivos`.

3. **`submit-alta` no usa `solicitud_archivos`** — posible que en la versión actual de `submit-alta` los archivos de alta se guarden solo en el campo `archivos` (JSONB) de `solicitudes_alta`, no en `solicitud_archivos`. La auditoría previa (`auditoria_flujo_tickets_crm_2026_06_14.md` §7) indica esto: "Los archivos se guardan en `archivos` JSONB del row (no en tabla separada)".

### Verificación SQL recomendada (read-only, Dashboard)

```sql
-- Verificar la FK real en producción
SELECT conname, confrelid::regclass AS tabla_referenciada
FROM pg_constraint
WHERE conrelid = 'public.solicitud_archivos'::regclass
  AND contype = 'f';

-- Verificar si solicitud_archivos tiene filas con solicitud_id que son de solicitudes_alta
SELECT COUNT(*) FROM solicitud_archivos sa
WHERE NOT EXISTS (
  SELECT 1 FROM solicitudes_soporte ss WHERE ss.id = sa.solicitud_id
);
```

### Acción requerida

**Verificar en Supabase Dashboard → SQL Editor (solo lectura) antes de cualquier acción.** Este hallazgo no puede resolverse sin acceso a la BD real.

---

## 7. Qué NO Se Puede Confirmar Sin Dashboard

| ítem | por qué no se puede confirmar | qué se necesita |
|---|---|---|
| Policies RLS `authenticated` | El schema snapshot solo contiene `CREATE TABLE`, no `CREATE POLICY`. No hay forma de inferir las políticas de seguridad desde el SQL de estructura. | Dashboard → Authentication → Policies, o `SELECT * FROM pg_policies` |
| Storage policies de `soporte_adjuntos` y `altas_tmp` | Los buckets de Storage no aparecen en el schema SQL. Sus políticas son configuración de Supabase Storage, no tablas PostgreSQL. | Dashboard → Storage → Policies |
| Edge Functions realmente desplegadas | El repo tiene el código descargado, pero si una función fue deployada antes de un cambio o si `quick-function`/`super-service` ya fueron retiradas, no hay forma de saberlo desde el repo. | Dashboard → Edge Functions |
| Versión de `ticket-internal-reply` en producción | El repo tiene el código post-fix (`f54e22b`), pero si la función no fue re-deployada, producción corre la versión anterior. | Dashboard → Edge Functions → ver fecha/versión del último deploy |
| FK real de `solicitud_archivos` en producción | El schema es un snapshot; la FK puede haber sido modificada o eliminada después del 2026-06-13. | `SELECT pg_constraint` en Dashboard SQL Editor |
| pg_cron para TTL | No aparece en schema SQL. Puede estar configurado en `pg_cron.job` como extensión. | Dashboard → Database → Extensions o `SELECT * FROM cron.job` |
| Índice UNIQUE en `tickets.folio` | El schema solo muestra la definición de la tabla, no los índices separados. | `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tickets'` |
| Volumen actual de `edge_idempotency` / `rate_limit_events` | No se puede inferir desde el código si hay crecimiento descontrolado. | `SELECT COUNT(*), MIN(created_at) FROM edge_idempotency` |

---

## 8. Próximos 5 Pasos Sin Modificar Nada

Ejecutar en orden, **solo lectura**, en Supabase Dashboard o SQL Editor:

### Paso 1 — Auditar policies authenticated en Dashboard

Abrir Dashboard → Authentication → Policies, o ejecutar en SQL Editor:

```sql
-- Ver todas las policies en tablas críticas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN (
  'tickets', 'clientes', 'clientes_contactos', 'bitacora',
  'cliente_accesos', 'cliente_sistemas', 'ticket_respuestas_rapidas',
  'ticket_eventos', 'archivos_ticket', 'ticket_archivos',
  'solicitudes_soporte', 'solicitudes_alta', 'solicitudes_registro'
)
ORDER BY tablename, policyname;

-- Detectar policies con acceso total (qual = 'true')
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE qual = 'true' OR with_check = 'true'
ORDER BY tablename;
```

Registrar el resultado en `DB/audit_dashboard_2026_06_15.md`.

### Paso 2 — Verificar FK real de `solicitud_archivos` (hallazgo crítico)

En Dashboard SQL Editor:

```sql
-- FK real de solicitud_archivos
SELECT conname, confrelid::regclass AS tabla_referenciada
FROM pg_constraint
WHERE conrelid = 'public.solicitud_archivos'::regclass
  AND contype = 'f';

-- ¿Hay filas con solicitud_id no referenciable desde solicitudes_soporte?
SELECT COUNT(*) AS filas_huerfanas
FROM solicitud_archivos sa
WHERE NOT EXISTS (
  SELECT 1 FROM solicitudes_soporte ss WHERE ss.id = sa.solicitud_id
);
```

Si hay filas huérfanas: el INSERT de `submit-alta` puede estar fallando la FK, y los archivos de alta tienen metadata solo en el JSONB de `solicitudes_alta.archivos`.

### Paso 3 — Verificar Edge Functions actualmente deployadas

En Dashboard → Edge Functions (o vía Supabase CLI `supabase functions list`):

- Confirmar si `quick-function` y `super-service` siguen activas.
- Verificar fecha del último deploy de `ticket-internal-reply` (debe ser posterior al commit `f54e22b`).

### Paso 4 — Verificar Storage policies

En Dashboard → Storage → `soporte_adjuntos` → Policies:

- ¿Quién puede hacer SELECT? (debe ser service_role o autenticado con signed URL, no `anon` directo)
- ¿Quién puede hacer INSERT? (debe ser solo service_role)
- Repetir para `altas_tmp`.

### Paso 5 — Medir volumen de tablas de eventos

En Dashboard SQL Editor:

```sql
-- Volumen de edge_idempotency
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completados,
  COUNT(*) FILTER (WHERE status = 'failed') AS fallidos,
  COUNT(*) FILTER (WHERE status = 'processing') AS en_proceso,
  MIN(created_at) AS mas_antigua,
  MAX(created_at) AS mas_reciente
FROM edge_idempotency;

-- Volumen de rate_limit_events
SELECT
  scope,
  COUNT(*) AS hits,
  MIN(created_at) AS primera,
  MAX(created_at) AS ultima
FROM rate_limit_events
GROUP BY scope
ORDER BY hits DESC;

-- ¿Hay pg_cron configurado?
SELECT jobname, schedule, command, active
FROM cron.job;
```

---

## 9. Conclusión

### Lo que este repo sí confirma

- **Estructura de BD:** 23+ tablas con schema completo, tipos, constraints y FKs documentados. Todas las tablas críticas existen.
- **Evidencia histórica de auditoría:** Tres documentos de auditoría previos (760+ líneas combinadas) cubren Edge Functions, flujos funcionales, RLS y CRM.
- **Cierre de RLS dev anon:** Las 6 políticas dev anon están cerradas y validadas. El rollback SQL está disponible.
- **Fix de `tickets.js:111`:** Publicado en `panel-expiriti/main` desde `e455f6e`. El Bearer token usa `tkSessionToken()`, no `supabaseKey`.
- **Fix de `ticket-internal-reply`:** Commiteado en `f54e22b`. Backup pre-fix disponible.
- **RPC `next_ticket_folio`:** Confirmado atómico e independiente por prefijo.
- **`ticket_match_decisiones`:** Tabla confirmada existente (resolución de incógnita anterior).

### Lo que el Dashboard sigue siendo la fuente de verdad

- **Policies RLS authenticated** — invisibles en schema SQL. Sin Dashboard no se puede confirmar si cualquier usuario autenticado tiene acceso irrestricto a tickets, clientes y bitácora.
- **Storage policies** — no son tablas PostgreSQL; requieren Dashboard.
- **Edge Functions deployadas** — el repo tiene el código; el Dashboard tiene el estado real del deploy.
- **FK real de `solicitud_archivos`** — puede diferir del snapshot (hallazgo crítico, Sección 6).
- **TTL/cron** — si hay pg_cron activo, solo es visible en Dashboard.

### Restricciones vigentes

- **No aplicar fixes todavía.** Los pasos 1-5 son prerequisito para priorizar correctamente las correcciones.
- **No tocar** `tickets.timeline_publica`, `ticket_archivos`, `super-service` ni el schema de BD hasta completar la auditoría de Dashboard.
- **No commitear** este documento hasta que el usuario lo decida.
- **No deployar** ni ejecutar SQL write de ningún tipo.

---

*Auditoría generada: 2026-06-15 · Solo lectura · Sin remediación · Sin SQL write · Sin deploy*  
*Fuentes: 12 archivos de auditoría en este repo + schema público de Supabase (snapshot 2026-06-13)*  
*Siguiente acción recomendada: ejecutar los 5 pasos del Dashboard y crear `DB/audit_dashboard_2026_06_15.md` con los resultados*
