# Plan Maestro de Auditoría — Panel Expiriti / Supabase
**Fecha:** 2026-06-14  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo lectura. Sin remediación. Sin cambios de código.  
**Commits de referencia:**
- `567ef9a` fix: harden ticket internal reply idempotency
- `5f650eb` docs: auditoría funcional panel Expiriti 2026-06-14
- `e455f6e` fix: use session token for quick replies REST fallback

**Documentos previos incorporados:**
- `DB/auditoria_edges_rls_2026_06_13.md`
- `DB/auditoria_flujo_tickets_crm_2026_06_14.md`
- `DB/estado_actual_panel_expiriti_2026_06_14.md`

---

## MATRIZ MAESTRA DE AUDITORÍA

> Columnas: Área · Qué incluye · Archivos/tablas/functions · Auditado · Cobertura · Riesgo actual · Dificultad remediación · Próximo paso · Decisión humana

---

### 1. tickets.html / tickets.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Board kanban, moveTicket, closeTicket, sendQuickReply, fetchTicketsRest, batch close, creación de ticket interno |
| **Archivos / tablas / functions** | `tickets.js`, `tickets`, `ticket_respuestas_rapidas`, `ticket-internal-reply` (EF), `crear-ticket-interno` (EF) |
| **Auditado** | SÍ |
| **Cobertura** | 90% |
| **Riesgo actual** | ALTO — `moveTicket` y `closeTicket` actualizan `tickets.estado` directamente vía SDK sin insertar `ticket_evento`; el historial canónico queda incompleto para cambios de estado desde el board |
| **Dificultad remediación** | MEDIA — agregar INSERT a `ticket_eventos` en cada acción de estado; riesgo de regresión si el INSERT falla y no hay manejo de error |
| **Próximo paso** | Agregar INSERT `ticket_eventos` en `moveTicket` y `closeTicket` en `tickets.js` |
| **Decisión humana** | No |

**Notas:**
- Fix de `qrBoardRestRows` (Bearer token con sesión) ya aplicado en commit `e455f6e`.
- Batch close desde el board tampoco genera `ticket_eventos`.
- El fallback REST de carga de tickets ya usa `tkSessionToken()` correctamente.

---

### 2. ticket.html / ticket.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Vista individual de ticket, `saveLog`, `uploadPublicLogFiles`, accesos AnyDesk, sistemas cliente, quick replies inline, signedUrl de archivos |
| **Archivos / tablas / functions** | `ticket.js`, `tickets`, `ticket_eventos`, `archivos_ticket`, `ticket_archivos` (legacy), `cliente_accesos`, `cliente_sistemas`, `ticket_respuestas_rapidas`, `bitacora`, `soporte_adjuntos` |
| **Auditado** | SÍ |
| **Cobertura** | 85% |
| **Riesgo actual** | MEDIO — doble write de archivos (`archivos_ticket` fallo duro + `ticket_archivos` soft-fail) correcto en prioridad pero puede producir huérfanos en storage; lógica QR duplicada entre `ticket.js` y `quick-replies.shared.js` |
| **Dificultad remediación** | MEDIA — unificar QR es refactor de dos módulos; doble write requiere sprint de migración |
| **Próximo paso** | Confirmar que `uploadPublicLogFiles` usa el orden correcto de fallo duro/suave; planificar unificación QR |
| **Decisión humana** | No |

**Notas:**
- `saveLog` no usa Edge Function: INSERT directo desde el navegador a `ticket_eventos`, `archivos_ticket`, `bitacora`.
- `cliente_accesos` contiene IDs de AnyDesk y credenciales — su RLS no ha sido auditada.
- Signed URLs de archivos se generan al abrir el ticket con 8h de vigencia; no se renuevan sin recargar.

---

### 3. soporte.html / soporte.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Formulario público de ticket, debounce match-cliente (500ms), validaciones frontend, Turnstile deshabilitado, guard de aviso global |
| **Archivos / tablas / functions** | `soporte.js`, `match-cliente` (EF), `support-submit-secure` (EF), `avisos_globales` |
| **Auditado** | SÍ |
| **Cobertura** | 88% |
| **Riesgo actual** | ALTO — `match-cliente` sin autenticación permite enumerar clientes; Turnstile deshabilitado deja solo rate limit de 5/10min por IP como protección |
| **Dificultad remediación** | BAJA (Turnstile: 2 flags) / MEDIA (match-cliente: cambio coordinado EF + JS + deploy) |
| **Próximo paso** | Decidir si se activa Turnstile; proteger `match-cliente` con header interno `x-service-key` |
| **Decisión humana** | SÍ — ¿activar Turnstile en producción? |

**Notas:**
- `TURNSTILE_ENABLED=false` en `soporte.js:11`
- `REQUIRE_TURNSTILE=false` en `support-submit-secure/index.ts:6`
- El debounce dispara múltiples full-table-scans de clientes si el usuario escribe rápido.
- `avisos_globales`: el guard de timbrado/SAT está bien implementado.

---

### 4. estado.html / estado.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Portal público del cliente, polling de estado, envío de respuesta con archivos, reapertura automática de tickets resueltos, notificaciones del navegador |
| **Archivos / tablas / functions** | `estado.js`, `estado-ticket-ts` (EF), `estado-ticket-responder-ts` (EF), `ticket_portal_logs`, `bitacora` |
| **Auditado** | SÍ |
| **Cobertura** | 88% |
| **Riesgo actual** | BAJO — signed URLs expiran a las 8h; polling a intervalo fijo (15/25/40s) sin backoff; `estado-ticket-responder-ts` sin rate limit por IP |
| **Dificultad remediación** | BAJA — agregar backoff exponencial en `estado.js`; agregar rate limit por IP en la EF |
| **Próximo paso** | Implementar backoff y rate limit en `estado-ticket-responder-ts` |
| **Decisión humana** | No |

**Notas:**
- La autenticación por `folio` + `token_publico` es correcta y segura para el scope del portal.
- El fallback de timeline (`ticket_eventos` → `tickets.timeline_publica`) está correctamente implementado en `estado-ticket-ts`.
- Reapertura automática al responder un ticket resuelto funciona; el agente no recibe notificación activa (solo en el siguiente refresh del board).

---

### 5. alta.html / alta.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Formulario público de solicitud de alta, upload de archivos (hasta 80MB por request), envío a `submit-alta` |
| **Archivos / tablas / functions** | `alta.js`, `submit-alta` (EF), `solicitudes_alta`, `solicitud_archivos`, `altas_tmp` (bucket) |
| **Auditado** | SÍ |
| **Cobertura** | 82% |
| **Riesgo actual** | MEDIO — sin rate limit ni CAPTCHA; cualquier actor puede crear solicitudes y subir 80MB por request ilimitadamente |
| **Dificultad remediación** | MEDIA — adaptar patrón `rate_limit_events` de `support-submit-secure` |
| **Próximo paso** | Agregar rate limit (5/10min por IP) en `submit-alta`; evaluar CAPTCHA |
| **Decisión humana** | No |

**Notas:**
- `submit-alta` es la versión nueva correcta: tiene matchCliente inline, validaciones de archivos, sanitización.
- Los archivos van a bucket `altas_tmp`, no a `soporte_adjuntos`.
- `solicitudes_alta` tiene esquema diferente según la versión que creó el row (legacy vs nuevo). Los campos legacy son NULL en rows nuevos.

---

### 6. altas.html / altas.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Panel autenticado de revisión y aprobación de solicitudes de alta, vinculación a CRM |
| **Archivos / tablas / functions** | `altas.js`, `alta-aprobar` (EF), `clientes`, `clientes_contactos`, `clientes_contacto_historial`, `solicitudes_alta` |
| **Auditado** | SÍ |
| **Cobertura** | 78% |
| **Riesgo actual** | MEDIO — código de aprobación JS directo (sin EF) sigue presente en el archivo; si hay bug en `alta-aprobar` y el path JS se activa, las operaciones CRM ocurren sin validación server-side ni auditoría |
| **Dificultad remediación** | BAJA — confirmar si las funciones JS directas (`createClientFromRequest`, etc.) son dead code o callable; eliminar si son dead code |
| **Próximo paso** | Grep de las funciones directas para confirmar si están en el path de ejecución activo |
| **Decisión humana** | SÍ — ¿eliminar código JS de aprobación directa? |

---

### 7. registro.html / registro.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Formulario público de solicitud de registro de nuevo cliente/contacto |
| **Archivos / tablas / functions** | `registro.js`, `submit-registro` (EF), `solicitudes_registro`, `bitacora` |
| **Auditado** | SÍ |
| **Cobertura** | 82% |
| **Riesgo actual** | MEDIO — sin rate limit ni CAPTCHA; matchCliente hace full-table-scan de hasta 400 clientes + 1000 aliases por request |
| **Dificultad remediación** | MEDIA — agregar rate limit; el full-scan puede optimizarse con índices en BD |
| **Próximo paso** | Agregar rate limit en `submit-registro`; auditar índices en `clientes` y `cliente_aliases` |
| **Decisión humana** | No |

---

### 8. registros.html / registros.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Panel autenticado de revisión y aprobación de registros, actualización de datos CRM |
| **Archivos / tablas / functions** | `registros.js`, `registro-aprobar` (EF), `clientes`, `clientes_contactos`, `clientes_contacto_historial`, `solicitudes_registro` |
| **Auditado** | SÍ |
| **Cobertura** | 80% |
| **Riesgo actual** | MEDIO — mismo patrón que `altas.js`; código de aprobación JS directo puede estar presente |
| **Dificultad remediación** | BAJA |
| **Próximo paso** | Confirmar dead code de aprobación directa en `registros.js:45-56` |
| **Decisión humana** | SÍ — ¿eliminar código JS de aprobación directa? |

**Notas:**
- `registro-aprobar` es más completo que `alta-aprobar`: actualiza datos del contacto existente si ya existe, no solo lo activa.
- Escribe en `clientes_contacto_historial` correctamente.

---

### 9. cliente.html / cliente.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Ficha de cliente: edición CRM, contactos, sistemas instalados, documentos, bitácora, historial de tickets |
| **Archivos / tablas / functions** | `cliente.js`, `cliente.core.js`, `cliente.ui.js`, `clientes`, `clientes_contactos`, `cliente_sistemas`, `documentos`, `bitacora`, `tickets` |
| **Auditado** | PARCIAL |
| **Cobertura** | 40% |
| **Riesgo actual** | MEDIO — queries directas desde el navegador a `clientes`, `clientes_contactos`, `cliente_sistemas`; la seguridad depende exclusivamente de RLS `authenticated` (no auditada) |
| **Dificultad remediación** | MEDIA — requiere auditar RLS antes de poder evaluar el riesgo real |
| **Próximo paso** | Leer `cliente.js` completo; mapear todas las tablas con INSERT/UPDATE directo desde el navegador |
| **Decisión humana** | No |

---

### 10. dashboard.html / dashboard.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | KPIs operativos, upload de certificados PDF, creación rápida de tickets, batch close de tickets, aviso global admin, realtime Supabase |
| **Archivos / tablas / functions** | `dashboard.js`, `clientes`, `documentos`, `tickets`, `bitacora`/`bitacora_view`, `avisos_globales`, `certificados` (bucket) |
| **Auditado** | PARCIAL |
| **Cobertura** | 50% |
| **Riesgo actual** | MEDIO — `nextFolioSimple()` usa COUNT(*) naive con race condition (solo para preview de folio); batch close no genera `ticket_eventos`; upload directo a `certificados` sin auditoría de policies del bucket |
| **Dificultad remediación** | MEDIA — `nextFolioSimple` solo es preview pero puede confundir; el bucket `certificados` necesita verificación de políticas |
| **Próximo paso** | Auditar policies del bucket `certificados` en Supabase Dashboard; confirmar quién puede leer los PDFs |
| **Decisión humana** | No |

**Notas:**
- `dashboard.js` carga hasta 1200 documentos + 1200 tickets en el arranque. Sin paginación. Puede ser lento a escala.
- `bitacora_view` referenciada en `loadActivity()` — si la VIEW no existe, hace fallback a `bitacora` directamente. Correcto.
- Creación de tickets desde el dashboard usa `s.from("tickets").insert(...)` directamente, no via EF. No genera `ticket_evento`.
- El INSERT de `clientes` desde el dashboard (función de nuevo cliente) es directo también.

---

### 11. index.html / index.js + supabase.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Login, `guardSession`, `markLoginNow`, timeout de sesión (8h hardcoded en S=288e5 ms), `onAuthStateChange`, auto-logout en TOKEN_REFRESHED si > 8h |
| **Archivos / tablas / functions** | `index.js`, `supabase.js`, `auth.users` (Supabase Auth), `perfiles` |
| **Auditado** | SÍ |
| **Cobertura** | 85% |
| **Riesgo actual** | BAJO — timeout 8h hardcoded (no configurable por rol); `getProfile` hace INSERT si no existe fila en `perfiles` (riesgo de crear perfiles fantasma con rol `soporte` por defecto); sin 2FA |
| **Dificultad remediación** | BAJA — documentar política de sesión; 2FA requiere configuración en Supabase Auth |
| **Próximo paso** | Evaluar 2FA para usuarios con rol `admin`; verificar que `perfiles` tiene constraint de rol válido |
| **Decisión humana** | SÍ — ¿requieren 2FA los usuarios admin? |

**Notas:**
- La `anon key` (`sb_publishable_2ftu336Kc06w2I2iTwoIpQ_usfSTNG9`) está expuesta en `supabase.js`. Esto es esperado para frontend; la seguridad recae en RLS, no en ocultar la anon key.
- **CRÍTICO:** Verificar que nunca exista `service_role key` en ningún archivo de frontend. No se encontró en la auditoría actual.
- `guardSession` hace doble verificación: `getSession()` + `getUser()` — robusto contra session spoofing.

---

### 12. global.js / theme.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | UI helpers, DOM utils, toast notifications, `localStorage` para tema y clientes recientes, `appShell`, `initRayito` |
| **Archivos / tablas / functions** | `global.js`, `theme.js`, `localStorage` |
| **Auditado** | PARCIAL |
| **Cobertura** | 60% |
| **Riesgo actual** | BAJO — `localStorage` guarda `expiriti_recent_clients` (IDs y nombres, no sensible) y `expiriti_theme`; no se encontraron tokens o secrets en localStorage en este módulo |
| **Dificultad remediación** | BAJA |
| **Próximo paso** | Revisar todas las claves de `localStorage` usadas en el proyecto; confirmar que `IDENTITY_KEY` (donde se guardan folio+token del portal) es el único dato sensible en localStorage |
| **Decisión humana** | No |

---

### 13. sw.js (Service Worker)

| Campo | Detalle |
|---|---|
| **Qué incluye** | Caché offline de assets estáticos, fallback a `estado.html` si no hay red, versionado manual `expiriti-v1.4.1` |
| **Archivos / tablas / functions** | `sw.js`, assets estáticos en `PANEL/` |
| **Auditado** | SÍ |
| **Cobertura** | 95% |
| **Riesgo actual** | BAJO — si se despliegan cambios sin incrementar la versión (`expiriti-v1.4.1`), los usuarios verán la versión cacheada hasta que limpien el caché manualmente o el SW se actualice |
| **Dificultad remediación** | BAJA — automatizar el bump de versión en el proceso de deploy |
| **Próximo paso** | Agregar incremento de versión de SW en el proceso de deploy (GitHub Actions o script) |
| **Decisión humana** | No |

**Notas:**
- El fallback de navegación cae a `estado.html` → `soporte.html` → `dashboard.html` → `index.html` en ese orden. Correcto para el caso de uso (portal cliente como primera página de fallback offline).
- El SW intercepta solo requests GET del mismo origen; no afecta llamadas a Supabase o EF.

---

### 14. quick-replies.shared.js

| Campo | Detalle |
|---|---|
| **Qué incluye** | Módulo compartido de quick replies: `qrList`, `qrLoadScope`, `qrSaveScope`, `qrSoftDelete` |
| **Archivos / tablas / functions** | `quick-replies.shared.js`, `ticket_respuestas_rapidas` |
| **Auditado** | SÍ |
| **Cobertura** | 75% |
| **Riesgo actual** | BAJO — lógica parcialmente duplicada en `ticket.js` (`qrSaveAll`, `qrLoadEditor`); si se actualiza uno, el otro puede quedar desincronizado |
| **Dificultad remediación** | BAJA — unificar módulos |
| **Próximo paso** | Eliminar lógica duplicada de `ticket.js` y delegar a `quick-replies.shared.js` |
| **Decisión humana** | No |

---

### 15. buscador.html / calculadora.html / musica-relax.html

| Campo | Detalle |
|---|---|
| **Qué incluye** | Páginas internas secundarias de uso utilitario |
| **Archivos / tablas / functions** | Archivos HTML standalone, posiblemente sin conexión a Supabase |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | BAJO (asumido) — si no tienen acceso a BD, el riesgo es mínimo |
| **Dificultad remediación** | BAJA |
| **Próximo paso** | Verificar si contienen llamadas a Supabase o acceso a localStorage sensible |
| **Decisión humana** | No |

---

### 16. Edge Functions — críticas (5 EF)

| Campo | Detalle |
|---|---|
| **Qué incluye** | `support-submit-secure`, `estado-ticket-ts`, `estado-ticket-responder-ts`, `ticket-internal-reply`, `crear-ticket-interno` |
| **Archivos / tablas / functions** | 5 EF + sus tablas respectivas (ver auditoría_flujo_tickets_crm_2026_06_14.md §8) |
| **Auditado** | SÍ |
| **Cobertura** | 92% |
| **Riesgo actual** | BAJO-MEDIO — `ticket-internal-reply` tiene diff sin commitear (4 líneas, 2 inserciones + 2 eliminaciones); `crear-ticket-interno` referencia `ticket_match_decisiones` (tabla confirmada en schema) |
| **Dificultad remediación** | BAJA — commitear o revertir el diff |
| **Próximo paso** | Resolver el diff sin commit de `ticket-internal-reply` antes de cualquier otro deploy |
| **Decisión humana** | No |

**Notas:**
- `ticket_match_decisiones` SÍ existe en el schema exportado (`docs/audit/supabase-public-schema.sql:608`). El riesgo de "tabla inexistente" está descartado.
- `support-submit-secure`: sin transacción atómica — es el riesgo más estructural de las EF críticas.
- `estado-ticket-ts`: fallback correcto entre `ticket_eventos` y `tickets.timeline_publica`.

---

### 17. Edge Functions — secundarias activas (5 EF)

| Campo | Detalle |
|---|---|
| **Qué incluye** | `match-cliente`, `alta-aprobar`, `registro-aprobar`, `submit-alta`, `submit-registro` |
| **Archivos / tablas / functions** | 5 EF + tablas CRM |
| **Auditado** | SÍ |
| **Cobertura** | 85% |
| **Riesgo actual** | MEDIO-ALTO — `match-cliente` sin autenticación del llamante; responde candidatos de clientes con datos de contacto; `submit-alta` y `submit-registro` sin rate limit |
| **Dificultad remediación** | MEDIA — `match-cliente` requiere cambio coordinado en EF + frontend; rate limit es patrón ya existente |
| **Próximo paso** | Proteger `match-cliente` con header `x-service-key`; agregar rate limit a `submit-alta` y `submit-registro` |
| **Decisión humana** | No |

---

### 18. Edge Functions — legacy / peligrosas (2 EF)

| Campo | Detalle |
|---|---|
| **Qué incluye** | `quick-function` (env vars inválidas, falla con 500), `super-service` (duplicado de submit-alta sin matchCliente, surface abierta) |
| **Archivos / tablas / functions** | `quick-function/index.ts`, `super-service/index.ts`, `solicitudes_alta`, `solicitud_archivos`, `altas_tmp` |
| **Auditado** | SÍ |
| **Cobertura** | 100% |
| **Riesgo actual** | CRÍTICO (`quick-function`) / ALTO (`super-service`) |
| **Dificultad remediación** | BAJA — solo retirar del deploy en Supabase Dashboard; no requiere cambios de código |
| **Próximo paso** | Confirmar que ningún frontend activo las llama; autorizar baja en Supabase Dashboard |
| **Decisión humana** | SÍ — ¿autorizar baja de `quick-function` y `super-service` del deploy? |

---

### 19. RLS — policies anon (dev)

| Campo | Detalle |
|---|---|
| **Qué incluye** | 6 policies `*_dev_anon_*`: `tickets_dev_anon_update`, `tickets_dev_anon_select`, `clientes_dev_anon_select`, `qr_dev_anon_insert`, `qr_dev_anon_select`, `qr_dev_anon_update` |
| **Archivos / tablas / functions** | `tickets`, `clientes`, `ticket_respuestas_rapidas`; SQL en `DB/rollback_policies_dev_B1_2026_06_13.sql` |
| **Auditado** | SÍ |
| **Cobertura** | 95% |
| **Riesgo actual** | ALTO — las 5 cerrables están identificadas con SQL listo y rollback listo; `tickets_dev_anon_update` es la más grave (cualquiera puede cerrar/reabrir tickets sin sesión) |
| **Dificultad remediación** | BAJA — SQL de cierre ya escrito; rollback ya escrito |
| **Próximo paso** | Ejecutar SQL de cierre de las 5 policies (excluyendo `qr_dev_anon_select` que requiere prueba manual del board de QR) |
| **Decisión humana** | SÍ — ¿autorizar ejecución del SQL de cierre de las 5 policies? |

**Estado de las 6 policies:**
- `tickets_dev_anon_update` → cerrar YA (P0)
- `tickets_dev_anon_select` → cerrar (P0)
- `clientes_dev_anon_select` → cerrar (P0)
- `qr_dev_anon_insert` → cerrar (P1)
- `qr_dev_anon_update` → cerrar (P1)
- `qr_dev_anon_select` → cerrar DESPUÉS de prueba manual del board en tickets.html (P1 — pero fix de Bearer ya aplicado)

---

### 20. RLS — policies authenticated

| Campo | Detalle |
|---|---|
| **Qué incluye** | Alcance de SELECT/INSERT/UPDATE/DELETE para usuarios con sesión activa en todas las tablas críticas |
| **Archivos / tablas / functions** | `tickets`, `clientes`, `bitacora`, `cliente_accesos`, `documentos`, `archivos_ticket`, `ticket_eventos`, `solicitudes_soporte`, `solicitudes_alta`, `solicitudes_registro`, `ticket_respuestas_rapidas` |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | DESCONOCIDO — si `qual=true` en `authenticated`, cualquier usuario del panel puede leer/escribir todos los datos de todos los clientes sin restricción por rol o equipo |
| **Dificultad remediación** | BAJA para auditar (solo leer en Dashboard); ALTA para corregir si hay sobreexposición |
| **Próximo paso** | Ver policies en Supabase Dashboard → Authentication → Policies; ejecutar query diagnóstica del §6-A de `auditoria_edges_rls_2026_06_13.md` |
| **Decisión humana** | No (solo leer) / SÍ si se detectan policies sobreexpuestas |

---

### 21. Tablas Supabase — inventario y schema

| Campo | Detalle |
|---|---|
| **Qué incluye** | 29 tablas en `docs/audit/supabase-public-schema.sql`; estructura de columnas, constraints, FKs |
| **Archivos / tablas / functions** | `supabase-public-schema.sql` (632 líneas), todas las tablas del schema `public` |
| **Auditado** | PARCIAL |
| **Cobertura** | 70% |
| **Riesgo actual** | BAJO — schema conocido; constraints y FKs verificados; pero el export actual NO incluye RLS, índices, triggers ni funciones SQL |
| **Dificultad remediación** | BAJA — exportar schema completo con `supabase db dump` o desde Dashboard |
| **Próximo paso** | Obtener schema completo que incluya `CREATE POLICY`, `CREATE INDEX`, `CREATE FUNCTION`, `CREATE TRIGGER` |
| **Decisión humana** | No |

**Tablas identificadas (29 total):**
`clientes`, `documentos`, `bitacora`, `perfiles`, `tickets`, `ticket_archivos`, `clientes_usuarios`, `documentos_borrado_vdi_backup`, `auditoria_storage_manual`, `auditoria_borrado_storage`, `cliente_aliases`, `solicitudes_alta`, `solicitud_archivos`, `solicitudes_soporte`, `clientes_contactos`, `clientes_contacto_historial`, `solicitudes_registro`, `avisos_globales`, `ticket_portal_logs`, `rate_limit_events`, `cliente_sistemas`, `ticket_folios`, `archivos_ticket`, `ticket_eventos`, `ticket_respuestas_rapidas`, `cliente_accesos`, `edge_idempotency`, `ticket_match_decisiones`

**Tablas sin referencias en código auditado:** `clientes_usuarios`, `documentos_borrado_vdi_backup`, `auditoria_storage_manual`, `auditoria_borrado_storage`, `ticket_folios`

---

### 22. RPC / Functions SQL

| Campo | Detalle |
|---|---|
| **Qué incluye** | `next_ticket_folio(p_prefix)` (crítica para unicidad de folios EX/IN), `bitacora_view` (VIEW referenciada en dashboard.js) |
| **Archivos / tablas / functions** | No presentes en el schema exportado actual; en Supabase Dashboard → Database → Functions |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | MEDIO — `next_ticket_folio` es crítica para el sistema; si tiene race condition, puede generar folios duplicados; si usa `SERIAL` sin lock correcto, habrá colisiones bajo carga |
| **Dificultad remediación** | BAJA (auditar) / MEDIA (corregir si tiene bug de concurrencia) |
| **Próximo paso** | Ver definición de `next_ticket_folio` en Dashboard → Database → Functions; confirmar que usa `FOR UPDATE` o secuencia atómica |
| **Decisión humana** | No |

---

### 23. Triggers SQL

| Campo | Detalle |
|---|---|
| **Qué incluye** | Posibles triggers de `updated_at`, auditoría automática, cascadas de FK, triggers de `ticket_folios` |
| **Archivos / tablas / functions** | No en schema exportado; en Dashboard → Database → Triggers |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | DESCONOCIDO — si hay triggers que escriben en tablas legacy (`ticket_archivos`, `timeline_publica`), pueden interferir con la migración; si hay triggers de auditoría, pueden duplicar filas en `bitacora` |
| **Dificultad remediación** | BAJA (auditar) |
| **Próximo paso** | Ver Triggers en Supabase Dashboard → Database → Triggers |
| **Decisión humana** | No |

---

### 24. Storage / Buckets

| Campo | Detalle |
|---|---|
| **Qué incluye** | `soporte_adjuntos` (tickets públicos e internos), `altas_tmp` (solicitudes de alta), `certificados` (documentos PDF de clientes); policies de acceso de cada bucket |
| **Archivos / tablas / functions** | 3 buckets; `archivos_ticket`, `ticket_archivos`, `solicitud_archivos`, `documentos` |
| **Auditado** | PARCIAL |
| **Cobertura** | 45% |
| **Riesgo actual** | MEDIO — no se auditaron policies de bucket (¿público? ¿privado? ¿requiere JWT?); posibles archivos huérfanos en `soporte_adjuntos` y `altas_tmp` si los INSERTs de metadata fallaron |
| **Dificultad remediación** | BAJA (auditar) / MEDIA (limpiar huérfanos) |
| **Próximo paso** | Ver Storage → Policies en Dashboard para cada bucket; verificar si `certificados` es bucket privado (debería serlo) |
| **Decisión humana** | No |

---

### 25. Adjuntos — integridad de escritura

| Campo | Detalle |
|---|---|
| **Qué incluye** | Matriz de escritura por flujo: 4 flujos que escriben en storage + tablas de metadata; doble write; soft-fail vs fallo duro; archivos huérfanos |
| **Archivos / tablas / functions** | `archivos_ticket` (canónico), `ticket_archivos` (legacy), `solicitud_archivos`, `soporte_adjuntos`, `altas_tmp` |
| **Auditado** | SÍ |
| **Cobertura** | 78% |
| **Riesgo actual** | MEDIO — divergencia posible entre `archivos_ticket` y `ticket_archivos`; no hay proceso de limpieza de huérfanos; `ticket_archivos.url_archivo` almacena storage_path no URL (nombre engañoso) |
| **Dificultad remediación** | ALTA — requiere sprint de migración dedicado |
| **Próximo paso** | Planificar sprint de migración: deprecar escritura en `ticket_archivos`; mantener lectura como fallback hasta migrar datos históricos |
| **Decisión humana** | SÍ — ¿cuándo deprecar `ticket_archivos` y `tickets.timeline_publica`? |

**Matriz de escritura por flujo:**

| Flujo | Storage | `solicitud_archivos` | `ticket_archivos` | `archivos_ticket` | `tickets.adjuntos` | `ticket_eventos` |
|---|---|---|---|---|---|---|
| Soporte público (`support-submit-secure`) | `soporte_adjuntos` | ✓ duro | ✓ soft | ✓ duro | ✓ update | ✓ |
| Portal cliente (`estado-ticket-responder-ts`) | `soporte_adjuntos` | — | ✓ soft | ✓ duro | ✓ update | ✓ |
| Soporte interno (`ticket.js`) | `soporte_adjuntos` | — | ✓ soft | ✓ duro | ✓ update | vía saveLog |
| Alta pública (`submit-alta`) | `altas_tmp` | ✓ duro | — | — | — | — |

---

### 26. Bitácora / Logs / Auditoría

| Campo | Detalle |
|---|---|
| **Qué incluye** | `bitacora` (acciones del panel), `bitacora_view` (VIEW, fallback en dashboard.js), `ticket_portal_logs` (accesos del portal cliente), `edge_idempotency` (log de idempotencia), `rate_limit_events` (control de abuso) |
| **Archivos / tablas / functions** | 5 tablas/views de auditoría |
| **Auditado** | PARCIAL |
| **Cobertura** | 60% |
| **Riesgo actual** | BAJO — `bitacora_view` referenciada pero no definida en el schema exportado (puede ser VIEW no capturada por el dump); `bitacora` tiene fallback correcto; no hay alertas si `rate_limit_events` supera un umbral |
| **Dificultad remediación** | BAJA (verificar `bitacora_view`) / MEDIA (configurar alertas) |
| **Próximo paso** | Verificar definición de `bitacora_view` en Dashboard → Database → Views |
| **Decisión humana** | No |

---

### 27. Emails / Resend

| Campo | Detalle |
|---|---|
| **Qué incluye** | Envío de correos en 3 EF: `support-submit-secure` (nuevo ticket), `ticket-internal-reply` (respuesta del agente), `crear-ticket-interno` (notificación si `notificar=true`); `RESEND_API_KEY` como Supabase Secret |
| **Archivos / tablas / functions** | 3 EF, Resend API externa |
| **Auditado** | SÍ |
| **Cobertura** | 80% |
| **Riesgo actual** | BAJO — si `RESEND_API_KEY` no está en Secrets, el envío falla silenciosamente sin error visible al usuario ni alerta al equipo |
| **Dificultad remediación** | BAJA — verificar que el secret está configurado |
| **Próximo paso** | Verificar en Supabase Dashboard → Edge Functions → Secrets que `RESEND_API_KEY`, `MAIL_FROM`, `PUBLIC_APP_URL` están configurados |
| **Decisión humana** | No |

---

### 28. Tokens públicos (`token_publico`)

| Campo | Detalle |
|---|---|
| **Qué incluye** | Generación (64-char hex = 2× UUID sin guiones), TTL 30 días hardcoded, exposición en response HTTP + magic_link, almacenamiento en `localStorage` como `IDENTITY_KEY`, sin mecanismo de revocación |
| **Archivos / tablas / functions** | `tickets.token_publico`, `tickets.token_publico_expira`, `support-submit-secure`, `crear-ticket-interno` |
| **Auditado** | SÍ |
| **Cobertura** | 85% |
| **Riesgo actual** | MEDIO — token devuelto en respuesta HTTP (capturable en proxy/log de red); sin revocación explícita disponible para el agente; 30 días puede ser excesivo para tickets de baja prioridad |
| **Dificultad remediación** | MEDIA — agregar endpoint de revocación o reducir TTL configurable por tipo/prioridad |
| **Próximo paso** | Decidir TTL aceptable; evaluar agregar botón de "Cerrar portal" que invalide el token |
| **Decisión humana** | SÍ — ¿30 días es el TTL aceptable para token_publico? ¿Se necesita revocación? |

---

### 29. Rate Limits

| Campo | Detalle |
|---|---|
| **Qué incluye** | `rate_limit_events` implementado en `support-submit-secure` (5/10min por IP, scope `support_submit`); ausente en `submit-alta`, `submit-registro`, `estado-ticket-responder-ts`, `match-cliente` |
| **Archivos / tablas / functions** | `rate_limit_events`, 4 EF sin rate limit |
| **Auditado** | SÍ |
| **Cobertura** | 80% |
| **Riesgo actual** | MEDIO — 4 endpoints públicos sin límite; `submit-alta` permite subir hasta 80MB ilimitadamente; `match-cliente` permite enumeración de clientes sin freno |
| **Dificultad remediación** | MEDIA — el patrón ya existe en `support-submit-secure`; adaptar a las otras 4 EF |
| **Próximo paso** | Copiar y adaptar el bloque de rate limit de `support-submit-secure` a las 4 EF restantes |
| **Decisión humana** | No |

---

### 30. Turnstile / CAPTCHA

| Campo | Detalle |
|---|---|
| **Qué incluye** | Cloudflare Turnstile integrado en `soporte.js` y `support-submit-secure`; deshabilitado en ambos lados |
| **Archivos / tablas / functions** | `soporte.js:11` (`TURNSTILE_ENABLED=false`), `support-submit-secure/index.ts:6` (`REQUIRE_TURNSTILE=false`) |
| **Auditado** | SÍ |
| **Cobertura** | 100% |
| **Riesgo actual** | MEDIO — la infraestructura existe pero está apagada; única protección actual es rate limit de 5/10min por IP |
| **Dificultad remediación** | BAJA — cambiar 2 flags + confirmar que el Turnstile site key está en Supabase Secrets como `TURNSTILE_SECRET` |
| **Próximo paso** | Confirmar que `TURNSTILE_SECRET` está configurado en Secrets; cambiar los 2 flags |
| **Decisión humana** | SÍ — ¿activar Turnstile en producción ahora? |

---

### 31. Performance

| Campo | Detalle |
|---|---|
| **Qué incluye** | Polling sin backoff exponencial, full-table-scan de clientes en `matchCliente`, carga masiva en dashboard (1200 docs + 1200 tickets), falta de índices visibles en el schema exportado |
| **Archivos / tablas / functions** | `estado.js`, `match-cliente`, `submit-alta`, `submit-registro`, `support-submit-secure`, `dashboard.js`, `clientes`, `cliente_aliases` |
| **Auditado** | PARCIAL |
| **Cobertura** | 55% |
| **Riesgo actual** | MEDIO — bajo carga alta puede ser lento; el full-scan de clientes en cada request de match es el cuello de botella más grave |
| **Dificultad remediación** | MEDIA — agregar índices en `clientes` y `cliente_aliases`; agregar backoff; limitar carga inicial del dashboard con paginación |
| **Próximo paso** | Auditar índices en Supabase Dashboard → Database → Indexes; confirmar que `clientes.nombre_norm` y `cliente_aliases.alias` tienen índices |
| **Decisión humana** | No |

---

### 32. Deploy / GitHub Pages

| Campo | Detalle |
|---|---|
| **Qué incluye** | `panel-expiriti` publicado en GitHub Pages rama `main`; `sw.js` con versión `expiriti-v1.4.1` versionada manualmente; proceso de deploy manual |
| **Archivos / tablas / functions** | `.github/workflows/` (no auditado), `sw.js`, `PANEL/` |
| **Auditado** | PARCIAL |
| **Cobertura** | 50% |
| **Riesgo actual** | BAJO — sin CI que bumpe la versión del SW; posibles usuarios viendo versión cacheada si el SW no se incrementa en cada deploy |
| **Dificultad remediación** | BAJA |
| **Próximo paso** | Revisar si existe workflow de GitHub Actions; si no, crear script de deploy que incremente la versión del SW automáticamente |
| **Decisión humana** | No |

---

### 33. Ramas Git y archivos sin commitear

| Campo | Detalle |
|---|---|
| **Qué incluye** | Rama `audit/supabase-flows` con 15 archivos untracked; `ticket-internal-reply` con diff sin commitear; `main` limpio y publicado |
| **Archivos / tablas / functions** | `DB/backups/`, `DB/rollback_policies_dev_B1_2026_06_13.sql`, `docs/audit/`, `supabase/.temp/`, 9 EF descargadas |
| **Auditado** | SÍ |
| **Cobertura** | 85% |
| **Riesgo actual** | BAJO — deuda de commit; archivos de auditoría valiosos pueden perderse si la rama se descarta; `supabase/.temp/` contiene `project-ref` y `organization_id` que no deben ir a git |
| **Dificultad remediación** | BAJA — commitear en ramas separadas según tipo de contenido |
| **Próximo paso** | Ver sección §6 del reporte de auditoría previo para estrategia de ramas; agregar `supabase/.temp/` a `.gitignore` |
| **Decisión humana** | SÍ — ¿en qué orden commitear los 15 archivos untracked? |

**Estrategia de ramas recomendada:**
- `audit/supabase-flows` ← `DB/rollback_*.sql`, `docs/audit/supabase-public-schema.sql`, este archivo
- `feat/ef-snapshot-20260613` ← las 9 EF descargadas (`supabase/functions/*/index.ts`)
- `feat/ef-backups-20260613` ← `DB/backups/` con backup de `ticket-internal-reply` pre-fix
- `.gitignore` ← agregar `supabase/.temp/`

---

### 34. Datos legacy

| Campo | Detalle |
|---|---|
| **Qué incluye** | `ticket_archivos` (tabla legacy activa), `tickets.timeline_publica` (JSON en columna), `documentos_borrado_vdi_backup`, filas de `solicitudes_alta` creadas por `quick-function`/`super-service` con schema reducido |
| **Archivos / tablas / functions** | `ticket_archivos`, `tickets.timeline_publica`, `documentos_borrado_vdi_backup`, `solicitudes_alta` (filas legacy) |
| **Auditado** | SÍ |
| **Cobertura** | 75% |
| **Riesgo actual** | BAJO-MEDIO — fallbacks correctos implementados; pero la coexistencia indefinida de dos fuentes de verdad genera deuda técnica acumulada y riesgo de divergencia en edge cases |
| **Dificultad remediación** | ALTA — migración de datos históricos + deprecar escritura legacy + mantener fallback de lectura |
| **Próximo paso** | Planificar sprint dedicado de migración; no iniciar sin el schema completo de RLS y los datos migrados validados en staging |
| **Decisión humana** | SÍ — ¿cuándo y con qué recursos se ataca la migración de datos legacy? |

---

### 35. Migraciones SQL

| Campo | Detalle |
|---|---|
| **Qué incluye** | Estado actual: NO existe carpeta `supabase/migrations/`; el schema es un snapshot manual exportado; los cambios de BD son manuales sin historial versionado |
| **Archivos / tablas / functions** | `supabase/migrations/` (ausente), `docs/audit/supabase-public-schema.sql` (snapshot) |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | MEDIO — sin migraciones versionadas, los cambios de schema son irreproducibles; si se necesita recrear el entorno (staging, nuevo proyecto) no hay camino automatizado |
| **Dificultad remediación** | ALTA — crear estructura de migraciones desde cero en un proyecto existente requiere comparar el schema actual contra un baseline |
| **Próximo paso** | Decidir si adoptar `supabase db pull` para generar migrations desde el estado actual; o documentar explícitamente que los cambios de schema son manuales y controlados por el DBA |
| **Decisión humana** | SÍ — ¿adoptar migraciones Supabase CLI como práctica estándar? |

---

### 36. Rollback

| Campo | Detalle |
|---|---|
| **Qué incluye** | `DB/rollback_policies_dev_B1_2026_06_13.sql` — cubre rollback de las 6 policies anon; no hay rollback documentado para cambios de EF, cambios de código frontend, ni cambios de schema |
| **Archivos / tablas / functions** | `DB/rollback_policies_dev_B1_2026_06_13.sql` (35 líneas, 6 `CREATE POLICY` en `BEGIN/COMMIT`) |
| **Auditado** | PARCIAL |
| **Cobertura** | 30% |
| **Riesgo actual** | MEDIO — sin rollback para los cambios pendientes más importantes: cierre de policies, retiro de EF legacy, correcciones de rate limit |
| **Dificultad remediación** | MEDIA — escribir rollback documentado antes de cada remediación |
| **Próximo paso** | Antes de ejecutar cualquier corrección, escribir el rollback correspondiente en `DB/` |
| **Decisión humana** | No |

**Rollback disponible:**
- ✅ `DB/rollback_policies_dev_B1_2026_06_13.sql` — restaura las 6 policies dev anon si se cierran y algo rompe

**Rollback pendiente de escribir:**
- `DB/rollback_ef_quick_function_super_service.md` — pasos para re-habilitar EF retiradas
- `DB/rollback_rate_limit_efs.md` — revertir rate limit si genera falsos positivos
- `DB/rollback_turnstile.md` — volver a `REQUIRE_TURNSTILE=false` si hay problemas

---

### 37. Observabilidad

| Campo | Detalle |
|---|---|
| **Qué incluye** | `bitacora`, `ticket_portal_logs`, `edge_idempotency`, `rate_limit_events`; Supabase Logs (Dashboard); sin alertas configuradas; sin Sentry/Datadog/similar en EF |
| **Archivos / tablas / functions** | Tablas de log + Supabase Dashboard Logs |
| **Auditado** | PARCIAL |
| **Cobertura** | 35% |
| **Riesgo actual** | MEDIO — sin alerta si `rate_limit_events` supera un umbral (posible abuso en curso invisible); sin monitoreo de errores 500 en EF en tiempo real; problemas se detectan tarde o por reporte del usuario |
| **Dificultad remediación** | ALTA — configurar alertas requiere decidir herramienta (pg_cron, Supabase Webhooks, Sentry, Slack webhook) y mantenerla |
| **Próximo paso** | Decidir nivel de inversión en observabilidad; mínimo viable: query semanal manual a `rate_limit_events` + revisar Supabase Logs de EF |
| **Decisión humana** | SÍ — ¿invertir en observabilidad activa ahora o dejarlo para segunda fase? |

---

### 38. clientes_usuarios (tabla)

| Campo | Detalle |
|---|---|
| **Qué incluye** | Tabla de relación usuario_id ↔ cliente_id; presente en schema; cero referencias encontradas en código JS auditado |
| **Archivos / tablas / functions** | `clientes_usuarios` |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | DESCONOCIDO — si tiene RLS incorrecta y hay datos, puede exponer relaciones cliente-usuario; si es dead code, es deuda técnica |
| **Dificultad remediación** | BAJA (auditar) |
| **Próximo paso** | Buscar referencias en todo el código; verificar en Dashboard si tiene datos |
| **Decisión humana** | No |

---

### 39. auditoria_storage_manual / auditoria_borrado_storage

| Campo | Detalle |
|---|---|
| **Qué incluye** | Tablas de auditoría de operaciones de storage; presentes en schema; escritor desconocido (no aparece en código JS auditado) |
| **Archivos / tablas / functions** | `auditoria_storage_manual`, `auditoria_borrado_storage` |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | BAJO (asumido) — probablemente escritas por procesos manuales o triggers; sin RLS auditada |
| **Dificultad remediación** | BAJA |
| **Próximo paso** | Verificar quién escribe en estas tablas; confirmar si están activas |
| **Decisión humana** | No |

---

### 40. ticket_folios (tabla)

| Campo | Detalle |
|---|---|
| **Qué incluye** | Tabla de soporte para generación de folios; referenciada indirectamente por `next_ticket_folio` RPC |
| **Archivos / tablas / functions** | `ticket_folios` |
| **Auditado** | NO |
| **Cobertura** | 0% |
| **Riesgo actual** | MEDIO — si la tabla tiene un mecanismo de lock incorrecto para concurrencia, puede generar folios duplicados bajo alta carga |
| **Dificultad remediación** | BAJA (auditar) / MEDIA (corregir si hay bug) |
| **Próximo paso** | Ver definición de la tabla y del RPC `next_ticket_folio` en Dashboard |
| **Decisión humana** | No |

---

## RESÚMENES

---

### A) Auditado al 100%

- Edge Functions (12 total): inventario completo, acceso, riesgo, veredicto de cada una
- RLS policies anon (6 total): análisis, SQL de cierre, rollback documentado
- Flujo de tickets punta a punta (9 flujos): desde formulario público hasta respuesta interna
- `tickets.js` / `ticket.js` / `soporte.js` / `estado.js`
- `alta.js` / `altas.js` / `registro.js` / `registros.js`
- `supabase.js` (auth, sesión, guardSession, onAuthStateChange)
- `sw.js` (service worker: caché, fallback, versionado)
- Adjuntos: mapa de escritura por flujo, fuentes de verdad, lógica de fallo duro/suave
- Correos Resend: cuándo se envían, cuándo fallan silenciosamente
- Tokens públicos: generación, TTL, exposición en respuesta HTTP
- `quick-function` + `super-service`: diagnóstico completo, veredicto de retiro
- `ticket_match_decisiones`: confirmada existencia en schema exportado

---

### B) Auditado parcial

- `dashboard.js` (50%) — upload a `certificados` y batch close sin `ticket_evento` detectados pero no profundizados
- `cliente.js` / `cliente.core.js` / `cliente.ui.js` (40%) — flujo CRM mapeado; queries directas no mapeadas completamente
- Storage / buckets (45%) — 3 buckets identificados; policies no auditadas
- Bitácora (60%) — tablas conocidas; `bitacora_view` sin definición confirmada
- Schema de tablas (70%) — 29 tablas conocidas; sin RLS, índices ni triggers en el export
- Performance (55%) — problemas identificados sin métricas reales de producción
- Rollback (30%) — solo cubre policies anon dev; faltan rollbacks para EF y código
- Observabilidad (35%) — infraestructura de logs existe; sin alertas configuradas
- `global.js` (60%) — helpers verificados; localStorage no completamente mapeado

---

### C) No auditado

- **RLS policies `authenticated`** — el gap de seguridad más crítico pendiente; puede ser `qual=true` en todo
- **RPC / Functions SQL** (`next_ticket_folio`, otras) — no en el schema exportado
- **Triggers SQL** — podrían interferir con migraciones futuras
- **Migraciones SQL** — no existe carpeta; schema es snapshot manual
- Políticas de bucket en Storage (public vs private vs autenticado)
- `clientes_usuarios` — tabla en schema sin referencias en código
- `auditoria_storage_manual` / `auditoria_borrado_storage` — escritor desconocido
- `ticket_folios` — mecanismo de concurrencia no verificado
- `buscador.html`, `calculadora.html`, `musica-relax.html`
- `bitacora_view` — puede ser VIEW de BD no capturada en el dump

---

### D) Top 10 riesgos

| # | Riesgo | Severidad |
|---|---|---|
| R1 | RLS `authenticated` no auditada — puede ser `qual=true` en `tickets`, `clientes`, `bitacora`, `cliente_accesos` | CRÍTICO |
| R2 | `quick-function` activa en deploy con env vars inválidas — 500 en cada llamada, falla silenciosa | CRÍTICO |
| R3 | `tickets_dev_anon_update` activa — cualquiera puede UPDATE `tickets` sin sesión | ALTO |
| R4 | `match-cliente` sin autenticación — cualquier POST externo enumera clientes y contactos con scores | ALTO |
| R5 | `moveTicket`/`closeTicket` sin `ticket_evento` — historial canónico incompleto; el cliente no sabe por qué cambió el estado | ALTO |
| R6 | Sin transacción atómica en `support-submit-secure` — solicitudes o tickets pueden quedar en estado inconsistente si falla a mitad | ALTO |
| R7 | `ticket-internal-reply` con diff sin commitear — versión auditada puede diferir de la deployada | MEDIO |
| R8 | Turnstile deshabilitado — único freno al spam es rate limit de 5/10min por IP; con múltiples IPs el freno no aplica | MEDIO |
| R9 | `submit-alta`, `submit-registro`, `estado-ticket-responder-ts` sin rate limit — abuso posible incluyendo upload masivo | MEDIO |
| R10 | Doble escritura de archivos y timeline sin garantía transaccional — divergencia silenciosa posible en producción | MEDIO |

---

### E) Top 10 correcciones fáciles (bajo esfuerzo, alto impacto)

| # | Corrección | Esfuerzo estimado |
|---|---|---|
| E1 | **Commitear o revertir diff de `ticket-internal-reply`** — 4 líneas pendientes | 5 min |
| E2 | **Ver RLS `authenticated`** en Supabase Dashboard → Auth → Policies y documentar | 15 min |
| E3 | **Ejecutar SQL de cierre de las 5 policies anon** (SQL listo en `DB/rollback_policies_dev_B1_2026_06_13.sql`, sección inversa ya documentada) | 5 min |
| E4 | **Retirar `quick-function` del deploy** en Supabase Dashboard → Edge Functions | 5 min |
| E5 | **Retirar `super-service` del deploy** en Supabase Dashboard → Edge Functions | 5 min |
| E6 | **Verificar Secrets** (`RESEND_API_KEY`, `MAIL_FROM`, `PUBLIC_APP_URL`, `TURNSTILE_SECRET`) en Dashboard → Edge Functions → Secrets | 10 min |
| E7 | **Activar Turnstile** — cambiar `REQUIRE_TURNSTILE=true` + `TURNSTILE_ENABLED=true` (si `TURNSTILE_SECRET` está configurado) | 10 min |
| E8 | **Commitear archivos de auditoría untracked** (`DB/rollback*.sql`, `docs/audit/`, este archivo) en `audit/supabase-flows` | 5 min |
| E9 | **Verificar policies del bucket `certificados`** en Storage → Policies (¿privado? ¿autenticado?) | 10 min |
| E10 | **Agregar `supabase/.temp/` a `.gitignore`** — evita commitear `project-ref` y `organization_id` | 2 min |

---

### F) Top 10 correcciones delicadas (requieren planificación)

| # | Corrección | Por qué es delicada |
|---|---|---|
| D1 | **Proteger `match-cliente` con header interno** | Cambio coordinado en EF + `soporte.js` + deploy; riesgo de romper el debounce si el header no llega |
| D2 | **Agregar `ticket_eventos` en `moveTicket`/`closeTicket`** | Si el INSERT falla sin manejo de error, puede romper el board; requiere probar todos los flujos de cambio de estado |
| D3 | **Agregar rate limit a `submit-alta`, `submit-registro`, `estado-ticket-responder-ts`** | 3 EF a modificar; riesgo de falsos positivos (usuarios legítimos bloqueados) si el umbral es muy bajo |
| D4 | **Migrar `ticket_archivos` → solo `archivos_ticket`** | Requiere auditar todos los lectores + migrar datos históricos + mantener fallback hasta confirmar integridad |
| D5 | **Migrar `tickets.timeline_publica` → solo `ticket_eventos`** | Mayor complejidad; afecta portal cliente en tiempo real; tickets históricos pueden no tener `ticket_eventos` |
| D6 | **Adoptar `supabase/migrations/` para gestión de schema** | Requiere alinear el schema actual (potencialmente con drift) contra archivos de migración sin romper el deploy activo |
| D7 | **Agregar transacción atómica en `support-submit-secure`** | Requiere mover lógica a un RPC PostgreSQL o reestructurar la EF completa; no hay forma simple con el cliente JS actual |
| D8 | **Configurar observabilidad activa** (alertas de rate limit, Sentry en EF) | Requiere decidir herramienta, integrarla, mantenerla; puede tener costo adicional |
| D9 | **Unificar lógica de quick replies entre `ticket.js` y `quick-replies.shared.js`** | Riesgo de regresión en ambas páginas (`ticket.html` y `tickets.html`) si no se prueba exhaustivamente |
| D10 | **Corregir RLS `authenticated` si está sobreexpuesta** | Alto riesgo de romper el panel si se restringe sin mapear exactamente qué queries usa cada página |

---

### G) Decisiones que debe tomar el dueño del proyecto

| # | Decisión | Impacto si no se decide |
|---|---|---|
| G1 | **¿Autorizas cerrar las 5 policies anon ahora?** SQL listo, rollback listo | `tickets_dev_anon_update` sigue activa; cualquiera puede modificar tickets sin sesión |
| G2 | **¿Autorizas retirar `quick-function` y `super-service` del deploy?** Confirmar que ningún frontend activo las llama | `quick-function` falla silenciosamente; `super-service` es superficie de ataque sin dueño activo |
| G3 | **¿Activas Turnstile en producción?** Verificar que `TURNSTILE_SECRET` está en Secrets | Solo rate limit protege los formularios públicos contra bots con múltiples IPs |
| G4 | **¿El TTL de 30 días para `token_publico` es aceptable?** | Si un magic link es interceptado, da acceso al portal del ticket por 30 días |
| G5 | **¿Cuándo deprecas `ticket_archivos` y `tickets.timeline_publica`?** | Doble verdad acumulada; divergencias silenciosas posibles; deuda técnica creciente |
| G6 | **¿Adoptas `supabase/migrations/` para control de schema?** | Sin trazabilidad de cambios de BD; imposible recrear el entorno de forma reproducible |
| G7 | **¿Inviertes en observabilidad activa ahora?** | Sin visibilidad de errores en producción; los problemas se detectan por reporte del usuario |
| G8 | **¿Eliminas el código JS de aprobación directa en `altas.js`/`registros.js`?** | Si hay bug en la EF y el path JS se activa, operaciones CRM ocurren sin validación server-side |
| G9 | **¿Requieres 2FA para usuarios con rol `admin`?** | Si una cuenta admin es comprometida, el atacante tiene acceso total al panel, CRM y bitácora |
| G10 | **¿En qué orden commiteas los 15 archivos untracked?** | Si el repo de audit no los tiene versionados, se pierde el historial de qué EF existía en producción en qué fecha |

---

### H) Recomendación para mañana

**Secuencia sugerida (2-3 horas de trabajo):**

1. **Primero (15 min) — resolver la deuda del diff:**
   - Resolver el diff sin commit de `ticket-internal-reply` (commitear o revertir).
   - Confirmar cuál versión está deployada en Supabase.

2. **Segundo (30 min) — auditar lo más crítico que falta:**
   - Abrir Supabase Dashboard → Auth → Policies.
   - Ejecutar la query de diagnóstico (`SELECT ... FROM pg_policies WHERE qual='true'`) del §6-A de `auditoria_edges_rls_2026_06_13.md`.
   - Documentar resultado en `DB/rls_authenticated_audit_2026_06_15.md`.

3. **Tercero (10 min) — verificar Secrets de EF:**
   - Dashboard → Edge Functions → Secrets.
   - Confirmar: `RESEND_API_KEY`, `MAIL_FROM`, `PUBLIC_APP_URL`, `TURNSTILE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

4. **Cuarto (30 min) — auditar RPC y triggers:**
   - Dashboard → Database → Functions: ver `next_ticket_folio`.
   - Dashboard → Database → Triggers: listar todos.
   - Dashboard → Database → Views: confirmar `bitacora_view`.

5. **Quinto (15 min) — verificar Storage:**
   - Dashboard → Storage → Policies: policies de `soporte_adjuntos`, `altas_tmp`, `certificados`.

6. **Sexto (15 min) — decidir sobre G1 y G2:**
   - Autorizar o diferir el cierre de las 5 policies anon.
   - Autorizar o diferir el retiro de `quick-function` y `super-service`.

7. **Séptimo (si hay tiempo) — commitear archivos de auditoría:**
   - `DB/rollback_policies_dev_B1_2026_06_13.sql`
   - `docs/audit/supabase-public-schema.sql`
   - Este archivo (`DB/plan_maestro_ticket_core_comercial_2026_06_14.md`)

---

### I) Qué NO ejecutar hoy

> Estas acciones requieren decisión humana explícita o preparación adicional antes de ejecutarse.

- **NO cerrar las policies anon** sin haber hecho prueba manual de los flujos clave post-cierre.
- **NO retirar `quick-function` ni `super-service`** sin confirmar primero que ningún frontend activo las llama (grep en panel-expiriti).
- **NO modificar RLS `authenticated`** sin haber auditado primero qué queries usa cada página del panel.
- **NO activar Turnstile** sin verificar que `TURNSTILE_SECRET` está correctamente configurado en Secrets.
- **NO migrar `ticket_archivos` ni `tickets.timeline_publica`** sin un plan de migración de datos y pruebas en staging.
- **NO adoptar migraciones Supabase CLI** sin un baseline limpio del schema actual.
- **NO hacer `git push` de las EF untracked** a `main` o `audit/supabase-flows` sin revisión manual de cada una.
- **NO ejecutar `supabase db push`** o cualquier comando que modifique el schema de producción sin backup verificado.
- **NO agregar transacciones atómicas en `support-submit-secure`** sin diseñar el RPC PostgreSQL y probarlo en staging.

---

*Reporte generado en modo solo-lectura. Sin cambios de código. Sin ejecución SQL. Sin deploy.*  
*Documentos fuente: `auditoria_edges_rls_2026_06_13.md` · `auditoria_flujo_tickets_crm_2026_06_14.md` · `estado_actual_panel_expiriti_2026_06_14.md`*  
*Archivos auditados: 32 JS/TS/HTML + 12 Edge Functions + 29 tablas de schema*  
*Cobertura global estimada del proyecto: 68%*  
*Siguiente fase recomendada: auditoría de RLS `authenticated` + RPCs/Triggers + Storage policies*
