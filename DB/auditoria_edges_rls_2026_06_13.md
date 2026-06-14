# AUDITORÍA DE EDGE FUNCTIONS Y RLS — 2026-06-13
> Rama: `audit/supabase-flows` · Proyecto: panel-expiriti-audit-bd  
> Funciones auditadas: 12 · Archivos JS de panel auditados: 12  
> Estado de políticas dev analizadas: 6

---

## 1. INVENTARIO DE EDGE FUNCTIONS

---

### 1.1 `quick-function`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT |
| **service_role** | SÍ — pero con nombres de env var **ofuscados** (SHA256 hash como nombre de variable) |
| **Env vars** | `Deno.env.get("6fb8db5c658ab3abb5c898c2d90c9d17a5f3a30a19f006c8415fb9632180f418")` y `"39b1e4c81535440d9f9f3ea4bb1dccb0fd4a58e4e3db821a902d41e287eda056"` |
| **Tablas lee** | `clientes` (matchCliente inline no existe — solo hace insert directo) |
| **Tablas escribe** | `solicitudes_alta`, `solicitud_archivos` |
| **Bucket Storage** | `altas_tmp` |
| **JS que la llama** | **Ninguno activo** — `alta.js` llama a `submit-alta`, no a ésta |
| **Riesgo** | **CRÍTICO** |
| **Veredicto** | **RETIRAR** |

**Análisis:** Los nombres de variables de entorno son strings SHA256 usados como claves de variable. Para que funcionen en producción alguien tendría que haber configurado `supabase secrets set "6fb8db5c..." <valor>`. Si no fue así, la función falla en runtime con `is required`. La lógica es idéntica a `super-service` (versión sin match-cliente). Ningún frontend activo la llama. Es una función duplicada y posiblemente nunca funcional tal como está.

---

### 1.2 `super-service`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT |
| **service_role** | SÍ — `SUPABASE_SERVICE_ROLE_KEY` |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `solicitudes_alta` (solo para id devuelto) |
| **Tablas escribe** | `solicitudes_alta`, `solicitud_archivos` |
| **Bucket Storage** | `altas_tmp` |
| **JS que la llama** | **Ninguno activo** — `alta.js` llama a `submit-alta` |
| **Riesgo** | **ALTO** — surface pública con service_role no usada |
| **Veredicto** | **RETIRAR** |

**Análisis:** Lógica idéntica a `submit-alta` sin match-cliente. No tiene rate limit. Ningún frontend activo la invoca. Al ser pública con service_role representa una superficie de ataque innecesaria: cualquiera puede crear solicitudes_alta y subir archivos a `altas_tmp` sin límite.

---

### 1.3 `submit-alta`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT |
| **service_role** | SÍ — `SUPABASE_SERVICE_ROLE_KEY` |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `clientes` (hasta 300), `cliente_aliases` (hasta 900), `clientes_contactos` (hasta 60) |
| **Tablas escribe** | `solicitudes_alta` (insert + update), `bitacora` |
| **Bucket Storage** | `altas_tmp` — upload de archivos del solicitante |
| **JS que la llama** | `alta.js` (público, página alta.html) |
| **Riesgo** | **MEDIO** |
| **Veredicto** | **CORREGIR** |

**Análisis:** Función bien implementada: valida tipos de archivo, mimes, tamaños individuales y totales, sanitiza nombres de archivo, hace match-cliente antes de insertar. Guarda archivos en `archivos` JSONB del row (no en tabla separada — diferencia respecto a `support-submit-secure`). Sin embargo **no tiene rate limit**: cualquier IP puede hacer POST ilimitado, creando solicitudes y subiendo hasta 80MB por request. Tampoco tiene CAPTCHA activo.

**Corrección:** Agregar tabla `rate_limit_events` check igual al de `support-submit-secure` (5 req/10min por IP).

---

### 1.4 `submit-registro`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT |
| **service_role** | SÍ — `SUPABASE_SERVICE_ROLE_KEY` |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `clientes` (hasta 400), `cliente_aliases` (hasta 1000), `clientes_contactos` (hasta 80) |
| **Tablas escribe** | `solicitudes_registro`, `bitacora` |
| **Bucket Storage** | Ninguno |
| **JS que la llama** | `registro.js` (público, página registro.html) |
| **Riesgo** | **MEDIO** |
| **Veredicto** | **CORREGIR** |

**Análisis:** Bien estructurado, sin archivos adjuntos, pero sin rate limit ni CAPTCHA. El match-cliente hace full-table-scan de hasta 400 clientes + 1000 aliases en cada request. Bajo carga alta o ataque de enumeración, puede saturar la BD.

---

### 1.5 `estado-ticket-ts`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT — autenticación por `folio` + `token_publico` |
| **service_role** | SÍ — necesario para leer tickets sin saber cliente_id a priori |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `tickets`, `ticket_eventos`, `archivos_ticket`, `ticket_archivos` (fallback legacy), `ticket_portal_logs`, `bitacora` |
| **Tablas escribe** | `ticket_portal_logs`, `bitacora` (throttled: portal_logs 10min, bitacora 60min) |
| **Bucket Storage** | `soporte_adjuntos` — genera signed URLs de 8h para archivos |
| **JS que la llama** | `estado.js` (público, página estado.html) |
| **Riesgo** | **BAJO** |
| **Veredicto** | **MANTENER** |

**Análisis:** Bien implementado. Verifica expiración de `token_publico_expira`. Throttle en logs evita spam. Signed URLs con 8h expira adecuado. El service_role está justificado porque el lookup es por token opaco, no por `auth.uid()`. Lee `ticket_archivos` (legacy) como fallback cuando `archivos_ticket` no tiene resultados — correcto dado el dual-write.

---

### 1.6 `estado-ticket-responder-ts`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT — autenticación por `folio` + `token_publico` |
| **service_role** | SÍ — escribe eventos, archivos y actualiza ticket |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `tickets`, `ticket_eventos` |
| **Tablas escribe** | `ticket_eventos`, `archivos_ticket`, `ticket_archivos` (legacy), `tickets` (update estado), `ticket_portal_logs`, `bitacora` |
| **Bucket Storage** | `soporte_adjuntos` |
| **JS que la llama** | `estado.js` (público, página estado.html) |
| **Riesgo** | **MEDIO** |
| **Veredicto** | **CORREGIR** |

**Análisis:** Verifica token y expiración. Anti-spam básico: bloquea si el cliente envió ≥2 mensajes seguidos. **No tiene rate limit por IP**: un mismo usuario anónimo puede hacer spam de requests con token válido. Dual-write correcto (`archivos_ticket` + `ticket_archivos` como legacy). Reabre ticket cerrado-como-resuelto automáticamente.

**Corrección:** Agregar check de rate limit por IP (e.g., 10 req/5min) antes de procesar el formData.

---

### 1.7 `match-cliente`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT |
| **service_role** | SÍ — full table scan de clientes |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `clientes` (hasta 250), `cliente_aliases` (hasta 800), `clientes_contactos` (hasta 30 por candidato) |
| **Tablas escribe** | Ninguna |
| **Bucket Storage** | Ninguno |
| **JS que la llama** | `soporte.js` (debounce 500ms en campos empresa/correo/teléfono) |
| **Riesgo** | **ALTO** |
| **Veredicto** | **REVISAR** |

**Análisis:** Esta función carga hasta 250 clientes + 800 aliases en **cada llamada**. Con el debounce de 500ms en soporte.js, un usuario que escribe rápido puede disparar múltiples scans. Sin rate limit ni JWT, cualquier actor externo puede hacer scraping fuzzy de toda la base de clientes (nombres, correos, teléfonos) simplemente variando inputs. El servicio devuelve nombres de empresa y datos de contacto en la respuesta (`candidates` array).

**Correcciones:** (1) Agregar rate limit por IP. (2) Evaluar si la respuesta debe omitir datos sensibles del candidato (exponer solo `cliente_id`, no `cliente_nombre` + `contacto.correo` + `contacto.telefono` completos).

---

### 1.8 `support-submit-secure`

| Campo | Valor |
|---|---|
| **Acceso** | Pública sin JWT |
| **service_role** | SÍ — crea ticket, solicitud, archivos, eventos |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET`, `REQUIRE_TURNSTILE`, `PUBLIC_APP_URL`, `RESEND_API_KEY`, `MAIL_FROM` |
| **Tablas lee** | `rate_limit_events`, `clientes`, `cliente_aliases`, `clientes_contactos` |
| **Tablas escribe** | `solicitudes_soporte`, `tickets`, `ticket_eventos`, `solicitud_archivos`, `ticket_archivos` (legacy), `archivos_ticket`, `tickets` (update), `solicitudes_soporte` (update), `bitacora` |
| **Bucket Storage** | `soporte_adjuntos` |
| **JS que la llama** | `soporte.js` (formulario público) |
| **Riesgo** | **BAJO** (con caveats) |
| **Veredicto** | **MANTENER** |

**Análisis:** La función más completa del sistema. Tiene rate limit por IP (5/10min), soporte de Turnstile CAPTCHA (actualmente deshabilitado con `REQUIRE_TURNSTILE=false`), folio por RPC (atómico), SLA policies, match-cliente inline, idempotencia implícita vía folio único, triple-write de archivos (correcto para compatibilidad). El riesgo residual es que **Turnstile está deshabilitado**: si se habilita en producción reduce el riesgo a casi nulo.

**Recomendación:** Activar `REQUIRE_TURNSTILE=true` en producción.

---

### 1.9 `ticket-internal-reply`

| Campo | Valor |
|---|---|
| **Acceso** | **Requiere JWT Bearer** — verificado con `sb.auth.getUser()` |
| **service_role** | SÍ — necesario para escribir eventos sin restricciones RLS |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_URL`, `RESEND_API_KEY`, `MAIL_FROM` |
| **Tablas lee** | `perfiles`, `tickets`, `edge_idempotency` |
| **Tablas escribe** | `ticket_eventos`, `tickets` (update estado + timeline), `edge_idempotency`, `bitacora` |
| **Bucket Storage** | Ninguno (solo texto) |
| **JS que la llama** | `tickets.js` (panel autenticado, función `sendQuickReply`) |
| **Riesgo** | **BAJO** |
| **Veredicto** | **MANTENER** |

**Análisis:** Bien protegido. JWT verificado, rol verificado (`admin`/`soporte`), idempotencia full con tabla `edge_idempotency` y SHA256 del payload, timeouts en todas las operaciones críticas. Envía email al cliente con magic link. El service_role está justificado: necesita escribir eventos internos y externos sin que el usuario tenga permisos RLS directos sobre `ticket_eventos`.

---

### 1.10 `crear-ticket-interno`

| Campo | Valor |
|---|---|
| **Acceso** | **Requiere JWT Bearer** |
| **service_role** | SÍ |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_URL`, `RESEND_API_KEY`, `MAIL_FROM` |
| **Tablas lee** | `perfiles`, `clientes`, `clientes_contactos` |
| **Tablas escribe** | `tickets`, `ticket_eventos`, `ticket_match_decisiones`, `bitacora` |
| **Bucket Storage** | Ninguno |
| **JS que la llama** | `tickets.js` (panel autenticado — flujo de nuevo ticket interno) |
| **Riesgo** | **BAJO** |
| **Veredicto** | **MANTENER** |

**Análisis:** JWT verificado, rol verificado. Genera folio `IN-` vía RPC atómico. Crea `ticket_match_decisiones` cuando requiere consolidación. Envía email opcional al cliente. Sin archivos en esta función (los archivos se agregan post-creación desde el panel).

---

### 1.11 `alta-aprobar`

| Campo | Valor |
|---|---|
| **Acceso** | **Requiere JWT Bearer** |
| **service_role** | SÍ — crea/actualiza clientes y contactos bypasseando RLS |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `perfiles`, `solicitudes_alta`, `clientes`, `clientes_contactos` |
| **Tablas escribe** | `solicitudes_alta`, `clientes`, `clientes_contactos`, `clientes_contacto_historial`, `bitacora` |
| **Bucket Storage** | Ninguno |
| **JS que la llama** | `altas.js` (panel autenticado) |
| **Riesgo** | **BAJO** |
| **Veredicto** | **MANTENER** |

**Análisis:** JWT + rol (`admin`/`soporte`/`superadmin`) verificados. Lógica idempotente: `ensureCliente` y `ensureContacto` buscan antes de crear. `allow_auto_suggested` permite usar la sugerencia del match sin confirmación manual cuando `match_nivel=alto`. El service_role está justificado: necesita crear clientes aunque la sesión sea de soporte (que normalmente no tiene `INSERT` directo a `clientes`).

---

### 1.12 `registro-aprobar`

| Campo | Valor |
|---|---|
| **Acceso** | **Requiere JWT Bearer** |
| **service_role** | SÍ — idéntico a alta-aprobar |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas lee** | `perfiles`, `solicitudes_registro`, `clientes`, `clientes_contactos` |
| **Tablas escribe** | `solicitudes_registro`, `clientes`, `clientes_contactos`, `clientes_contacto_historial`, `bitacora` |
| **Bucket Storage** | Ninguno |
| **JS que la llama** | `registros.js` (panel autenticado) |
| **Riesgo** | **BAJO** |
| **Veredicto** | **MANTENER** |

**Análisis:** Idéntico en estructura a `alta-aprobar`. Diferencias: usa campos de registro (empresa, correo_empresa, etc.), actualiza datos del cliente si ya existe (`ensureCliente` hace UPDATE en registro-aprobar vs solo lectura en alta-aprobar). Correcto.

---

## 2. MAPA DE FLUJOS

### 2.1 Soporte público (`soporte.html`)
```
soporte.js → [debounce] → match-cliente (Edge, public, service_role)
           → [on submit] → support-submit-secure (Edge, public, rate_limit, service_role)
                         → tickets INSERT + solicitudes_soporte INSERT
                         → next_ticket_folio RPC (atómico)
                         → soporte_adjuntos Storage
                         → Resend email al cliente con magic_link
```
El cliente recibe `estado.html?folio=X&token=Y` por correo.

### 2.2 Estado público de ticket (`estado.html?folio=X&token=Y`)
```
estado.js → estado-ticket-ts (Edge, public GET, token-based auth, service_role)
          → tickets SELECT (folio + token_publico)
          → ticket_eventos SELECT (visibilidad=publica)
          → archivos_ticket SELECT → fallback ticket_archivos
          → soporte_adjuntos createSignedUrl (8h)
```

### 2.3 Respuesta pública del cliente (`estado.html`)
```
estado.js → estado-ticket-responder-ts (Edge, public POST, token-based auth)
          → tickets SELECT (folio + token_publico)
          → verifica estado ≠ cerrado
          → anti-spam: verifica ≤2 msgs seguidos del cliente
          → ticket_eventos INSERT (mensaje/archivo)
          → archivos_ticket INSERT + ticket_archivos INSERT (legacy dual-write)
          → soporte_adjuntos Storage upload
          → tickets UPDATE (estado, timeline_publica, adjuntos)
```

### 2.4 Creación interna de ticket (`tickets.html`)
```
tickets.js → [panel autenticado] → crear-ticket-interno (Edge, JWT required)
           → perfiles CHECK (admin/soporte)
           → next_ticket_folio RPC (prefijo IN-)
           → tickets INSERT
           → ticket_eventos INSERT
           → Resend email al cliente (si notificar=true)
```

### 2.5 Respuesta interna de soporte (`ticket.html` / `tickets.html`)
```
ticket.js / tickets.js → ticket-internal-reply (Edge, JWT required)
                       → perfiles CHECK (admin/soporte)
                       → edge_idempotency START
                       → tickets SELECT
                       → ticket_eventos INSERT (visibilidad=publica)
                       → tickets UPDATE (estado, timeline_publica, primera_respuesta_en)
                       → Resend email al cliente con magic_link
                       → edge_idempotency DONE
```

### 2.6 Alta pública (`alta.html`)
```
alta.js → submit-alta (Edge, public POST, NO rate_limit)
        → matchCliente inline (full table scan)
        → solicitudes_alta INSERT + UPDATE (archivos JSONB)
        → altas_tmp Storage upload
        → bitacora INSERT
```

### 2.7 Aprobación de alta (`altas.html`)
```
altas.js → [panel autenticado] → alta-aprobar (Edge, JWT required)
         → perfiles CHECK
         → solicitudes_alta SELECT
         → ensureCliente (busca o crea en clientes)
         → ensureContactoPrincipal + ensureContactoAlterno
         → clientes_contacto_historial INSERT
         → solicitudes_alta UPDATE (estatus=aprobada)
```

### 2.8 Registro público (`registro.html`)
```
registro.js → submit-registro (Edge, public POST, NO rate_limit)
            → matchCliente inline (full table scan)
            → solicitudes_registro INSERT
            → bitacora INSERT
```

### 2.9 Aprobación de registro (`registros.html`)
```
registros.js → [panel autenticado] → registro-aprobar (Edge, JWT required)
             → perfiles CHECK
             → solicitudes_registro SELECT
             → ensureCliente (busca, actualiza datos o crea)
             → ensurePrincipal + ensureAlterno
             → clientes_contacto_historial INSERT
             → solicitudes_registro UPDATE (estatus=aprobada)
```

---

## 3. RLS / POLICIES DEV — ANÁLISIS

Las seis políticas dev bajo análisis, con contexto de cada una:

### 3.1 `tickets_dev_anon_select`

**¿Puede cerrarse ya?** SÍ.  
**Razón:** `estado-ticket-ts` usa service_role (bypass RLS total). `estado.js` no hace queries directas a `tickets`. El panel interno usa sesión autenticada. Ningún código activo depende de acceso anónimo directo a `tickets`.  
**Qué podría romperse:** Nada si se cierra. Verificar que no exista ningún `supabase.from("tickets")` en páginas públicas sin sesión (estado.html no lo hace).  
**Prueba manual:** Abrir `estado.html?folio=EX-001&token=TOKEN_VALIDO` → debe seguir funcionando.

### 3.2 `tickets_dev_anon_update`

**¿Puede cerrarse ya?** SÍ, de inmediato.  
**Razón:** Ningún flujo legítimo actualiza `tickets` como rol anónimo. Las actualizaciones van por Edge Functions con service_role. Esta policy es el riesgo más grave de los seis: cualquier anon podría hacer `UPDATE tickets SET estado='cerrado'` sin autenticación.  
**Qué podría romperse:** Nada legítimo.  
**Prueba manual:** Intentar un UPDATE directo con anon key → debe devolver `401/403`.

### 3.3 `clientes_dev_anon_select`

**¿Puede cerrarse ya?** SÍ.  
**Razón:** `soporte.js` y `alta.js` no hacen queries directas a `clientes`. El match-cliente va por Edge Function (service_role). El panel usa sesión autenticada.  
**Qué podría romperse:** `soporte.js` hace una consulta directa a `avisos_globales` con anon key (línea 70), pero esa tabla no es `clientes`. Si hay algún código futuro que consulte `clientes` con anon key fuera de Edge Function, fallaría.  
**Prueba manual:** Llenar y enviar `soporte.html` → match-cliente debe funcionar (va por Edge Function).

### 3.4 `qr_dev_anon_insert`

**¿Puede cerrarse ya?** SÍ.  
**Razón:** Ningún flujo legítimo inserta `ticket_respuestas_rapidas` como anon. Las inserciones van desde `ticket.js` y `quick-replies.shared.js` con sesión autenticada.  
**Qué podría romperse:** Nada.

### 3.5 `qr_dev_anon_select`

**¿Puede cerrarse ya?** **NO todavía — requiere corrección previa.**  
**Razón:** `tickets.js:111` tiene un fallback REST que usa explícitamente `s.supabaseKey` como Bearer token en lugar del token de sesión:
```js
const h = {apikey: s.supabaseKey, Authorization: `Bearer ${s.supabaseKey}`, ...}
```
Esto hace que la petición llegue como rol `anon` en lugar de `authenticated`. Si se cierra `qr_dev_anon_select`, el fallback en el board de tickets (`qrBoardRestRows`) devolverá vacío y se caerá a los defaults hardcodeados (que no son las respuestas personalizadas de la BD).  
**Corrección necesaria:** En `tickets.js:111`, reemplazar `s.supabaseKey` como Bearer por el token de sesión actual (`await tkSessionToken()`).  
**Prueba manual después de corregir:** Abrir `tickets.html` → panel de respuestas rápidas debe mostrar las respuestas de BD, no los defaults.

### 3.6 `qr_dev_anon_update`

**¿Puede cerrarse ya?** SÍ (ningún flujo hace UPDATE de `ticket_respuestas_rapidas` como anon).  
**Qué podría romperse:** Nada.

---

## 4. POLICIES AUTHENTICATED DEMASIADO ABIERTAS

Sin acceso al SQL de políticas actuales (`DB/rls_policies_actuales.sql` no existe en el repo), las siguientes son observaciones derivadas del código:

### 4.1 `tickets`
El panel (`tickets.js`, `ticket.js`) hace `SELECT *` sin filtros de `WITH CHECK`:
```js
s.from("tickets").select("*,clientes(nombre,correo,telefono)").order(...).limit(...)
```
Si la policy `authenticated` tiene `qual = true` (todas las filas), cualquier usuario autenticado puede leer todos los tickets de todos los clientes. **Revisar si hay policy `tickets_authenticated_select` con restricción por rol o equipo.**

### 4.2 `clientes`
`altas.js` y `registros.js` hacen `s.from("clientes").select(...)` directamente con sesión autenticada. Si la policy de SELECT para `authenticated` es `qual=true`, todos los usuarios autenticados ven todos los clientes.

### 4.3 `bitacora`
`altas.js` lee `bitacora` con filtro `detalle->>solicitud_id`. Si la policy authenticated es abierta, cualquier usuario del panel puede leer toda la bitácora, incluyendo eventos de seguridad.

### 4.4 `ticket_respuestas_rapidas`
Ver hallazgo 3.5. Acceso anon actual en fallback es un bug de código, no de policy.

### 4.5 `cliente_accesos`
`ticket.js` lee `cliente_accesos` directamente (`s.from("cliente_accesos").select("*")`). Esta tabla contiene IDs de AnyDesk y credenciales de acceso remoto. Requiere verificar que la policy limite a usuarios con rol `admin` o `soporte`, no a todo `authenticated`.

### 4.6 Tablas sin verificación de rol visible en código
- `documentos` — leída en `cliente.js` y `dashboard.js`  
- `solicitudes_alta`, `solicitudes_registro` — leídas en `altas.js`, `registros.js`  
- `archivos_ticket`, `ticket_archivos` — leídas en `ticket.js`  

Todas requieren policy review manual en Supabase Dashboard.

---

## 5. RIESGOS DE CÓDIGO

### 5.1 CRÍTICO — `quick-function`: env vars ofuscadas con SHA256
Las claves de ambiente usan hashes SHA256 como nombres. La función solo funcionaría si esos nombres exactos están configurados en Supabase Secrets. No hay evidencia de que lo estén. Resultado probable: runtime error en producción. **Retirar.**

### 5.2 ALTO — `match-cliente`: full table scan sin rate limit, responde datos de contacto
Cada llamada carga hasta 250 clientes + 800 aliases. Sin rate limit. La respuesta incluye `contacto_sugerido.correo` y `contacto.telefono` en texto claro. Un atacante puede enumerar clientes variando empresa/correo inputs.

### 5.3 ALTO — `super-service`: función duplicada con surface pública activa
Misma lógica que `submit-alta` pero sin match-cliente. No hay frontend que la llame pero existe en el deploy. Endpoint activo = superficie de ataque.

### 5.4 ALTO — `tickets.js:111`: anon key como Bearer token en fallback REST
```js
const h = {apikey: s.supabaseKey, Authorization: `Bearer ${s.supabaseKey}`}
```
Hace requests a `ticket_respuestas_rapidas` como rol anon en lugar de como el usuario autenticado. Bug de seguridad: bypassa las políticas de `authenticated` para ese path.

### 5.5 MEDIO — CAPTCHA deshabilitado en soporte público
`REQUIRE_TURNSTILE=false` en Edge Function y `TURNSTILE_ENABLED=false` en `soporte.js`. Solo el rate limit de 5/10min por IP protege el formulario público. Un atacante con múltiples IPs puede crear tickets masivamente.

### 5.6 MEDIO — `estado-ticket-responder-ts`: sin rate limit por IP
Cualquier actor con un token válido puede hacer POST ilimitados. El anti-spam de "2 mensajes seguidos" solo verifica la BD, no la frecuencia de requests HTTP.

### 5.7 MEDIO — `submit-alta` y `submit-registro`: sin rate limit
Funciones públicas sin CAPTCHA ni rate limit. Permiten crear solicitudes ilimitadas y en `submit-alta` también subir archivos (80MB por request) a `altas_tmp`.

### 5.8 MEDIO — `token_publico`: exposición en respuesta de support-submit-secure
```js
return json({..., token_publico, magic_link, ...})
```
El token completo y el magic link se devuelven en el JSON de respuesta. Si el frontend los persiste en `localStorage` (lo hace en `IDENTITY_KEY`) junto con `folio`, está bien controlado. Pero cualquier código intermedio (proxy, log) que capture la respuesta obtiene el token.

### 5.9 MEDIO — Dual-write `ticket_archivos` / `archivos_ticket`
Tres funciones (`support-submit-secure`, `estado-ticket-responder-ts`, `ticket.js:uploadPublicLogFiles`) escriben en ambas tablas. Si una falla (el error en `ticket_archivos` es `console.error`, no falla la request), la tabla legacy queda desincronizada. `estado-ticket-ts` implementa el fallback correctamente: lee `archivos_ticket` primero, luego `ticket_archivos`.

### 5.10 BAJO — Race condition de folios en `dashboard.js`
```js
const nextFolioSimple = async () => {
  const {count} = await s.from("tickets").select("*", {count: "exact", head: true})
  return `SP-${Number(count||0)+1}`
}
```
Este generador de folio naive tiene race condition evidente. Sin embargo, solo se usa en `dashboard.js` para el flujo de nuevo ticket desde el dashboard — y la creación real del ticket va por `crear-ticket-interno` que usa el RPC atómico `next_ticket_folio`. Riesgo real: bajo (solo el folio de preview podría ser incorrecto en el UI).

### 5.11 BAJO — `token_publico` expira en 30 días (hardcoded)
```js
const token_publico_expira = new Date(Date.now() + 1000*60*60*24*30).toISOString()
```
30 días es razonable para un caso de soporte activo. No es configurable por tipo de caso. Considerar reducir para casos de baja prioridad.

### 5.12 BAJO — Storage signed URLs sin verificación de `visibilidad`
`estado-ticket-ts` genera signed URLs para cualquier `storage_path` encontrado en `archivos_ticket WHERE visibilidad='publica'`. Correcto. Pero el campo `url_firma` puede ser null o un URL previo ya expirado — el código maneja esto con fallback.

---

## 6. SQL PROPUESTO

### A) Diagnóstico no destructivo

```sql
-- Ver policies activas en tablas críticas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN (
  'tickets','clientes','documentos','cliente_accesos',
  'ticket_respuestas_rapidas','ticket_eventos','archivos_ticket',
  'ticket_archivos','solicitudes_alta','solicitudes_registro',
  'solicitudes_soporte','bitacora','cliente_accesos'
)
ORDER BY tablename, policyname;

-- Cuántas filas tienen token_publico activo (expiración futura)
SELECT COUNT(*) AS tokens_activos,
       COUNT(*) FILTER (WHERE token_publico_expira < NOW()) AS tokens_expirados
FROM tickets
WHERE token_publico IS NOT NULL;

-- Ver qué policies tienen qual = 'true' (acceso total)
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE qual = 'true' OR with_check = 'true'
ORDER BY tablename;

-- Detectar tickets sin cliente_id que aún están abiertos
SELECT COUNT(*) AS tickets_sin_cliente
FROM tickets
WHERE cliente_id IS NULL
  AND estado NOT IN ('cerrado','resuelto');

-- Ver solicitudes pendientes acumuladas
SELECT
  'alta' AS tipo, COUNT(*) FILTER (WHERE estatus='pendiente') AS pendientes
FROM solicitudes_alta
UNION ALL
SELECT
  'registro', COUNT(*) FILTER (WHERE estatus='pendiente')
FROM solicitudes_registro
UNION ALL
SELECT
  'soporte', COUNT(*) FILTER (WHERE estatus='nuevo')
FROM solicitudes_soporte;

-- Verificar rate_limit_events recientes (detectar abuso)
SELECT scope, COUNT(*) as hits, MIN(created_at) as primera, MAX(created_at) as ultima
FROM rate_limit_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY scope
ORDER BY hits DESC;
```

### B) Migración segura para cerrar policies dev

```sql
BEGIN;

-- 1. Cerrar tickets_dev_anon_update (más urgente — nunca debe ser anon)
DROP POLICY IF EXISTS tickets_dev_anon_update ON tickets;

-- 2. Cerrar tickets_dev_anon_select
DROP POLICY IF EXISTS tickets_dev_anon_select ON tickets;

-- 3. Cerrar clientes_dev_anon_select
DROP POLICY IF EXISTS clientes_dev_anon_select ON clientes;

-- 4. Cerrar qr_dev_anon_insert
DROP POLICY IF EXISTS qr_dev_anon_insert ON ticket_respuestas_rapidas;

-- 5. Cerrar qr_dev_anon_update
DROP POLICY IF EXISTS qr_dev_anon_update ON ticket_respuestas_rapidas;

-- 6. qr_dev_anon_select: NO incluir aquí hasta corregir tickets.js:111
-- DROP POLICY IF EXISTS qr_dev_anon_select ON ticket_respuestas_rapidas;

COMMIT;
```

> **IMPORTANTE:** Ejecutar el punto 6 (`qr_dev_anon_select`) SOLO después de corregir `tickets.js:111` para usar el token de sesión en lugar de `s.supabaseKey`.

### C) Rollback limpio

```sql
BEGIN;

-- Restaurar en caso de regresión tras cerrar policies

-- tickets_dev_anon_select
CREATE POLICY tickets_dev_anon_select ON tickets
  FOR SELECT TO anon USING (true);

-- tickets_dev_anon_update
CREATE POLICY tickets_dev_anon_update ON tickets
  FOR UPDATE TO anon USING (true);

-- clientes_dev_anon_select
CREATE POLICY clientes_dev_anon_select ON clientes
  FOR SELECT TO anon USING (true);

-- qr_dev_anon_insert
CREATE POLICY qr_dev_anon_insert ON ticket_respuestas_rapidas
  FOR INSERT TO anon WITH CHECK (true);

-- qr_dev_anon_select
CREATE POLICY qr_dev_anon_select ON ticket_respuestas_rapidas
  FOR SELECT TO anon USING (true);

-- qr_dev_anon_update
CREATE POLICY qr_dev_anon_update ON ticket_respuestas_rapidas
  FOR UPDATE TO anon USING (true);

COMMIT;
```

---

## 7. PLAN DE VALIDACIÓN MANUAL

Ejecutar **en orden** después de cerrar las 5 policies (excluyendo `qr_dev_anon_select` hasta fix de tickets.js):

### 7.1 `soporte.html` (flujo completo)
1. Abrir `soporte.html` en ventana sin sesión.
2. Llenar nombre, empresa, correo, teléfono → esperar 500ms → debe aparecer resultado de match-cliente (via Edge Function, no afectada por policies).
3. Completar formulario y enviar → debe recibir folio en pantalla.
4. Verificar que llegó correo con magic link.
5. ✓ si folio generado, ✗ si error 403/500.

### 7.2 `alta.html` (formulario público)
1. Abrir sin sesión.
2. Llenar datos de empresa, contacto principal, adjuntar 1-2 archivos.
3. Enviar → debe mostrar confirmación con solicitud_id.
4. ✓ si `ok: true` en respuesta, ✗ si error RLS.

### 7.3 `registro.html` (formulario público)
1. Abrir sin sesión.
2. Llenar empresa, contacto, aceptar datos y enviar.
3. ✓ si `ok: true` con solicitud_id.

### 7.4 `estado.html?folio=X&token=Y` (portal cliente)
1. Usar folio y token de un ticket creado en 7.1.
2. Debe cargar estado del ticket con timeline.
3. Escribir una respuesta corta y enviar.
4. ✓ si se muestra el nuevo evento en el chat. ✗ si aparece error de permisos.

### 7.5 `dashboard.html` (panel interno)
1. Iniciar sesión como usuario con rol `soporte`.
2. Verificar que métricas cargan (tickets urgentes, pendientes de cliente, etc.).
3. ✓ si el dashboard muestra datos. ✗ si queries fallan por policy cambiada.

### 7.6 `tickets.html` (board de tickets)
1. Iniciar sesión.
2. Abrir panel de respuestas rápidas en algún ticket.
3. Verificar que carga respuestas de BD (no solo los defaults hardcodeados).
4. **Nota:** Este test fallará si `qr_dev_anon_select` fue cerrada antes de corregir `tickets.js:111`. En ese caso, el fallback REST cae a defaults — aceptable temporalmente.
5. ✓ si las respuestas rápidas de la BD son visibles.

### 7.7 `ticket.html?id=X` (vista de ticket individual)
1. Iniciar sesión como soporte.
2. Abrir un ticket existente.
3. Escribir una respuesta interna y enviar → debe ir por `ticket-internal-reply` (JWT).
4. Verificar que el cliente recibe correo (si tiene correo válido).
5. ✓ si se muestra en el chat del panel y en `estado.html`.

### 7.8 `altas.html` (revisión de solicitudes de alta)
1. Iniciar sesión como admin/soporte.
2. Listar solicitudes de alta → deben aparecer las creadas en 7.2.
3. Abrir una solicitud y hacer click en "Aprobar".
4. ✓ si se crea/vincula el cliente y el estatus cambia a `aprobada`.

### 7.9 `registros.html` (revisión de solicitudes de registro)
1. Iniciar sesión.
2. Listar registros → deben aparecer los de 7.3.
3. Consolidar uno → ✓ si contacto queda vinculado.

### 7.10 `cliente.html` (ficha de cliente)
1. Iniciar sesión.
2. Abrir la ficha de un cliente conocido.
3. Verificar que cargan: datos básicos, tickets, contactos, documentos, bitácora.
4. ✓ si todo carga. ✗ si alguna query falla por policy.

---

## 8. VEREDICTO FINAL

### ¿Podemos cerrar las 6 policies dev ya?

**5 de 6: SÍ.** Las siguientes se pueden cerrar ahora mismo:
- `tickets_dev_anon_update` ✅ (cerrar inmediatamente — es el riesgo más grave)
- `tickets_dev_anon_select` ✅
- `clientes_dev_anon_select` ✅
- `qr_dev_anon_insert` ✅
- `qr_dev_anon_update` ✅

**1 de 6: NO todavía:**
- `qr_dev_anon_select` ⏸ — bloqueada por bug en `tickets.js:111`

### Antes de cerrar `qr_dev_anon_select`, corregir:
```js
// tickets.js línea ~111 — función qrBoardRestRows
// ACTUAL (usa anon key como auth):
const h = {apikey: s.supabaseKey, Authorization: `Bearer ${s.supabaseKey}`, ...}

// CORRECCIÓN (usar token de sesión activo):
const sessionToken = await tkSessionToken();
const h = {apikey: s.supabaseKey, Authorization: `Bearer ${sessionToken}`, ...}
```

### Acciones paralelas recomendadas:

| Prioridad | Acción |
|---|---|
| P0 | Cerrar `tickets_dev_anon_update` — cualquiera puede cerrar/reabrir tickets sin auth |
| P0 | Retirar `quick-function` y `super-service` del deploy |
| P1 | Corregir `tickets.js:111` para usar token de sesión |
| P1 | Cerrar `qr_dev_anon_select` después del fix anterior |
| P2 | Agregar rate limit a `submit-alta`, `submit-registro`, `estado-ticket-responder-ts` |
| P2 | Agregar rate limit a `match-cliente` y considerar reducir datos en respuesta |
| P3 | Activar Turnstile (`REQUIRE_TURNSTILE=true`) en producción |
| P3 | Auditar policies `authenticated` en `tickets`, `clientes`, `bitacora`, `cliente_accesos` |

---

*Reporte generado: 2026-06-13 · Auditor: Claude Sonnet 4.6 vía claude-code*
