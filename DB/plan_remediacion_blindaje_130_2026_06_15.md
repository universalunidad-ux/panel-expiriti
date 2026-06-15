# Plan Maestro de Remediación — Blindaje al 130%
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo documentación. Sin SQL write. Sin código. Sin deploy.  
**Fuentes:**  
- `DB/auditoria_edges_rls_2026_06_13.md`  
- `DB/auditoria_flujo_tickets_crm_2026_06_14.md`  
- `DB/auditoria_repo_audit_bd_2026_06_15.md`  
- `DB/audit_dashboard_2026_06_15.md`  

---

## 1. Resumen Ejecutivo

El sistema Panel Expiriti tiene una arquitectura bien diseñada: RLS activado globalmente, constraints sólidos, Edge Functions con JWT en flujos internos, idempotencia en `ticket-internal-reply`, y doble-write de archivos con prioridad correcta. La base está bien construida.

Sin embargo, **cuatro categorías de riesgo activo impiden la comercialización segura:**

1. **RLS policies abiertas** — `tickets`, `clientes`, `cliente_accesos` y `ticket_respuestas_rapidas` tienen SELECT/INSERT/UPDATE con `qual = true` para cualquier usuario `authenticated`, sin filtro de rol ni propiedad.
2. **Endpoints públicos sin rate limit** — `match-cliente`, `estado-ticket-responder-ts`, `submit-alta` y `submit-registro` pueden ser abusados sin control de frecuencia.
3. **Edge Functions legacy activas** — `quick-function` (rota, env vars SHA256) y `super-service` (duplicado) siguen deployadas como superficie de ataque.
4. **Visibilidad incompleta** — Storage policies y versiones de EF deployadas aún no confirmadas visualmente.

Este plan organiza la remediación en 7 fases ordenadas por impacto y dependencia, llevando el sistema del estado actual (~79% global) al 130%: sistema seguro, auditable, con historial completo y listo para crecimiento de clientes.

---

## 2. Estado Actual por Área

| área | % actual | descripción del estado | blocker activo |
|---|---|---|---|
| Auditoría repos | **95%** | Tres documentos completos, schema capturado, diff commiteado, backup disponible | Ninguno — auditoría completa |
| Auditoría Dashboard SQL | **90%** | RLS, constraints, índices e integridad verificados read-only | Storage y EF deploy pendientes visual |
| RLS | **55%** | RLS encendido ✓, 6 dev anon cerradas ✓, pero 4 tablas con policies `qual=true` abiertas | P0 no ejecutado |
| Storage | **30%** | Buckets existen y funcionan. Policies no auditadas visualmente | Sin verificación Dashboard visual |
| Edge Functions | **65%** | 8 EFs correctas, 2 legacy activas (`quick-function` rota, `super-service` expuesta), `ticket-internal-reply` fix commiteado pero deploy no confirmado | `quick-function`/`super-service` activas |
| Rate limits | **35%** | Solo `support_submit` tiene rate limit. 4 endpoints sin protección. Turnstile apagado. | 4 EFs sin rate limit |
| Integridad de datos | **75%** | `solicitud_archivos` FK verificada sin huérfanas. Doble-write con prioridad correcta. Sin `ticket_eventos` en moveTicket/closeTicket. | Historial incompleto en board |
| Pruebas | **40%** | Plan de pruebas documentado. Sin ejecución sistemática post-remediación. | Requiere ejecutar post-fix |
| Preparación comercial | **60%** | Flujos funcionales, UI correcta, folios atómicos, SLA calculados, email con magic link | RLS P0 + rate limits + storage pendientes |

**Confianza global del ciclo de tickets (punta a punta): 79%**  
**Objetivo post-remediación: 100% funcional, 130% en seguridad y operación**

---

## 3. Matriz P0 / P1 / P2 / P3

---

### P0 — Acción inmediata (antes de escalar usuarios)

| # | riesgo | evidencia | tabla/archivo | impacto si no se corrige | dificultad | dependencia | validación posterior |
|---|---|---|---|---|---|---|---|
| P0-1 | `tickets` SELECT authenticated `qual=true` (dos policies duplicadas) | `audit_dashboard_2026_06_15.md` §2.1 | `tickets` | Cualquier usuario autenticado (incluso ventas) lee todos los tickets de todos los clientes | BAJA — cambiar qual a filtro de rol | Ninguna | SELECT desde sesión con rol `ventas` debe devolver solo sus tickets asignados |
| P0-2 | `clientes_select_auth` `qual=true` | `audit_dashboard_2026_06_15.md` §2.1 | `clientes` | Cualquier usuario autenticado lee nombre, correo, RNC, razón social de todos los clientes | BAJA | Ninguna | SELECT desde sesión `ventas` debe devolver vacío o solo clientes asignados |
| P0-3 | `cliente_accesos_select_auth` `qual=true` | `audit_dashboard_2026_06_15.md` §2.1 | `cliente_accesos` | Cualquier usuario autenticado lee IDs AnyDesk y credenciales de acceso remoto de todos los clientes | BAJA | Ninguna | SELECT desde sesión `ventas` debe devolver 0 filas |
| P0-4 | 6 policies abiertas en `ticket_respuestas_rapidas` (dos grupos duplicados de SELECT/INSERT/UPDATE `qual=true`) | `audit_dashboard_2026_06_15.md` §2.1 | `ticket_respuestas_rapidas` | Cualquier usuario autenticado lee, crea y modifica respuestas rápidas de cualquier cliente/contacto | MEDIA — hay constraints correctos, solo RLS a corregir | Ninguna | SELECT/INSERT/UPDATE desde sesión `ventas` debe estar restringido |
| P0-5 | `quick-function` deployada con env vars SHA256 inválidas | `auditoria_edges_rls_2026_06_13.md` §1.1 | EF `quick-function` | Cada llamada = 500. Si algún frontend la invoca, el usuario ve error silencioso. Surface activa sin uso legítimo. | BAJA — solo retirar del deploy | Confirmar que ningún frontend la llama | Endpoint debe devolver 404 tras retirarla |

**Rollback conceptual P0:** Si cerrar policies rompe algún flujo, el rollback SQL está documentado en `DB/rollback_policies_dev_B1_2026_06_13.sql` como referencia de patrón. Para cada policy nueva que se cree, guardar el CREATE POLICY del estado anterior antes de ejecutar DROP.

---

### P1 — Alta prioridad (antes del siguiente ciclo de soporte)

| # | riesgo | evidencia | tabla/archivo | impacto | dificultad | dependencia | validación posterior |
|---|---|---|---|---|---|---|---|
| P1-1 | `ticket_archivos_select_auth` `qual=true` (tabla legacy) | `audit_dashboard_2026_06_15.md` §2.1 | `ticket_archivos` | storage_paths de archivos de tickets accesibles a cualquier usuario autenticado | BAJA | P0 completado, ya que cambios de RLS deben ir en secuencia | SELECT desde sesión `ventas` debe devolver solo archivos de sus tickets |
| P1-2 | `ticket_match_decisiones` SELECT/INSERT/UPDATE authenticated abiertos | `audit_dashboard_2026_06_15.md` §2.1 | `ticket_match_decisiones` | Cualquier usuario autenticado modifica decisiones de consolidación CRM | BAJA | Ninguna | Usuario `ventas` no debe poder UPDATE decisiones |
| P1-3 | `super-service` deployada sin uso, con service_role público | `auditoria_edges_rls_2026_06_13.md` §1.2 | EF `super-service` | Endpoint activo sin frontend → superficie de ataque. Acepta POST sin auth. | BAJA — solo retirar del deploy | Confirmar que `submit-alta` reemplaza completamente su funcionalidad | Endpoint debe devolver 404 |
| P1-4 | `match-cliente` sin autenticación — expone datos de clientes | `auditoria_edges_rls_2026_06_13.md` §1.7 | EF `match-cliente` | Full scan de clientes vía POST público. Devuelve candidatos con nombre, correo, teléfono y score. | MEDIA — cambio coordinado EF + JS + deploy | Ninguna | POST sin header `x-service-key` debe devolver 401; con header correcto debe funcionar |
| P1-5 | `clientes_contactos` sin policy positiva para `authenticated` | `audit_dashboard_2026_06_15.md` §2.3 | `clientes_contactos` | Flujos JS que hacen select directo pueden estar devolviendo 0 filas silenciosamente | MEDIA — auditar código antes de crear policy | Auditoría de código de `alta.js`, `registros.js`, `ticket.js`, `cliente.js` | SELECT directo con sesión debe funcionar para admin/soporte |
| P1-6 | Storage policies `soporte_adjuntos` y `altas_tmp` sin verificar | `audit_dashboard_2026_06_15.md` §7 | Storage buckets | Si policy es SELECT `true` para anon o authenticated, archivos accesibles sin firma | BAJA — solo verificar en Dashboard visual | Dashboard visual disponible | Confirmar que only-service-role puede INSERT y que SELECT requiere signed URL |
| P1-7 | `ticket-internal-reply` versión deploy no confirmada | `audit_dashboard_2026_06_15.md` §7 | EF `ticket-internal-reply` | Si versión deployada es anterior al fix de idempotencia (`f54e22b`), producción corre código sin hardening | BAJA — solo redesplegar si fecha es anterior al fix | Verificación visual en Dashboard | Verificar fecha/versión en Dashboard → Edge Functions |

**Rollback conceptual P1:** Para EF retiradas, el código fuente está en el repo. Si hay que restaurar, el deploy se puede hacer desde `supabase/functions/`. Para policies de `clientes_contactos`, definir policy temporal permisiva para staff antes de acotar.

---

### P2 — Media prioridad

| # | riesgo | evidencia | tabla/EF | impacto | dificultad | dependencia | validación posterior |
|---|---|---|---|---|---|---|---|
| P2-1 | `estado-ticket-responder-ts` sin rate limit por IP | `auditoria_edges_rls_2026_06_13.md` §1.6 | EF `estado-ticket-responder-ts` | Spam de respuestas de portal con token válido sin límite HTTP | MEDIA — agregar check rate_limit_events | Ninguna | POST repetido desde misma IP en <5min debe devolver 429 |
| P2-2 | `submit-alta` sin rate limit | `auditoria_edges_rls_2026_06_13.md` §1.3 | EF `submit-alta` | Spam de solicitudes + subida de hasta 80MB por request a `altas_tmp` | MEDIA | Ninguna | >5 requests/10min desde misma IP debe devolver 429 |
| P2-3 | `submit-registro` sin rate limit | `auditoria_edges_rls_2026_06_13.md` §1.4 | EF `submit-registro` | Spam de solicitudes de registro sin límite | MEDIA | Ninguna | >5 requests/10min debe devolver 429 |
| P2-4 | Turnstile apagado globalmente | `auditoria_flujo_tickets_crm_2026_06_14.md` §9-A2 | `soporte.js` + EF `support-submit-secure` | Sin CAPTCHA, solo rate limit por IP como protección ante bots | BAJA — dos flags (`REQUIRE_TURNSTILE=true` en Secrets + `TURNSTILE_ENABLED=true` en JS) | Decisión humana requerida | Formulario debe mostrar widget Turnstile; envío sin token debe devolver 403 |
| P2-5 | Sin `ticket_eventos` en `moveTicket` / `closeTicket` desde el board | `auditoria_flujo_tickets_crm_2026_06_14.md` §9-A3 | `tickets.js`, `ticket_eventos` | Historial canónico incompleto: cambios de estado desde el board no aparecen en portal del cliente | MEDIA — INSERT adicional en cada acción | Ninguna | Cambiar estado desde board → abrir portal del cliente → debe aparecer evento de estado |
| P2-6 | Sin pg_cron para limpieza de `edge_idempotency` | `audit_dashboard_2026_06_15.md` §5.1 | `edge_idempotency` | 10 filas actuales (bajo volumen), pero crecerán indefinidamente sin limpieza | MEDIA — instalar extensión pg_cron en Dashboard | Dashboard → Extensions | `SELECT COUNT(*) FROM edge_idempotency WHERE updated_at < NOW() - INTERVAL '7 days'` debe bajar a 0 tras primer ciclo |
| P2-7 | Sin pg_cron para limpieza de `rate_limit_events` | `audit_dashboard_2026_06_15.md` §5.2 | `rate_limit_events` | 41 filas actuales (bajo), creceran proporcionalmente al tráfico | MEDIA | Misma extensión que P2-6 | `SELECT COUNT(*) FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '30 days'` debe bajar a 0 |

**Rollback conceptual P2:** Para rate limits, si el check genera falsos positivos (429 a usuarios legítimos), se puede ajustar la ventana de tiempo o el límite en el código sin tocar la BD. Para pg_cron, si el job falla, solo afecta la limpieza — no la operación.

---

### P3 — Puede esperar (mejoras de calidad)

| # | mejora | evidencia | impacto | dificultad |
|---|---|---|---|---|
| P3-1 | Eliminar 7 índices duplicados en `tickets`, `ticket_eventos`, `archivos_ticket` | `audit_dashboard_2026_06_15.md` §4 | Overhead de escritura mínimo, sin impacto funcional | BAJA — DROP INDEX CONCURRENTLY en ventana de mantenimiento |
| P3-2 | FK compuesta `tickets(contacto_id, cliente_id)` → `clientes_contactos(id, cliente_id)` | `audit_dashboard_2026_06_15.md` §3.3 | Previene asignación de contacto de cliente A a ticket de cliente B | MEDIA — ALTER TABLE en tabla de producción activa |
| P3-3 | Migrar `tickets.timeline_publica` a solo `ticket_eventos` | `auditoria_flujo_tickets_crm_2026_06_14.md` §3 | Eliminar doble verdad en historial | ALTA — sprint dedicado con migración de datos históricos |
| P3-4 | Migrar `ticket_archivos` (legacy) a solo `archivos_ticket` | `auditoria_flujo_tickets_crm_2026_06_14.md` §3 | Eliminar tabla legacy activa | ALTA — sprint dedicado |
| P3-5 | Unificar lógica de quick replies entre `ticket.js` y `quick-replies.shared.js` | `auditoria_flujo_tickets_crm_2026_06_14.md` §9-B2 | Previene divergencia futura entre módulos | MEDIA — refactor de dos módulos JS |
| P3-6 | Backoff exponencial en polling de `estado.js` | `auditoria_flujo_tickets_crm_2026_06_14.md` §9-B1 | Reduce carga en picos de portales abiertos | BAJA — cambio de constantes en JS |
| P3-7 | `pg_stat_statements` para diagnóstico de queries lentas | `audit_dashboard_2026_06_15.md` §5.4 | Visibilidad de queries lentas en producción | BAJA — extensión ya instalada, solo activar monitoreo |

---

## 4. Plan RLS

> Para cada tabla, el objetivo es reemplazar la policy abierta por una policy con `qual` restrictivo basado en rol (`auth.jwt() ->> 'role'` via `perfiles`) o propiedad del registro.

---

### 4.1 `tickets`

**Estado actual:** Dos policies SELECT duplicadas con `qual = true` para `authenticated`.

**Objetivo:** Un usuario con rol `ventas` solo debe ver tickets asignados a él (`asignado_a = auth.uid()`) o tickets de clientes que gestiona. Un usuario con rol `admin` o `soporte` debe ver todos los tickets.

**Diseño de policy propuesto (conceptual, sin SQL ejecutable):**
- Eliminar `tickets_select_auth` y `tickets_select_authenticated` (duplicadas).
- Crear una sola policy SELECT que permita:
  - A `admin` y `soporte`: acceso total (`qual = true` dentro del rol).
  - A `ventas`: solo tickets donde `asignado_a = auth.uid()` O `creado_por = auth.uid()`.
- Evaluar si INSERT/UPDATE de `tickets` desde el navegador debe estar permitido para `authenticated` o debe ir exclusivamente por Edge Function.

**Riesgo de regresión:** `tickets.js` hace `SELECT * FROM tickets` directo con sesión. Si la nueva policy es demasiado restrictiva para admin/soporte, el board quedará vacío. Validar primero en ambiente de prueba.

**Rollback conceptual:** Guardar el CREATE POLICY actual (copiar desde pg_policies) antes de ejecutar cualquier DROP.

---

### 4.2 `clientes`

**Estado actual:** `clientes_select_auth` SELECT `qual=true` para `authenticated`.

**Objetivo:** Solo `admin` y `soporte` deben poder leer todos los clientes. `ventas` debería ver solo clientes asignados (si existe tabla `clientes_usuarios`) o ninguno si no aplica a su rol.

**Diseño de policy propuesto (conceptual):**
- Eliminar `clientes_select_auth`.
- Crear policy SELECT restringida a roles `admin` y `soporte` con `qual = true`.
- Evaluar si `ventas` necesita acceso a `clientes` directo o si sus flujos van por Edge Function.

**Dependencia:** `altas.js` y `registros.js` pueden hacer SELECT directo a `clientes` con sesión. Auditar antes de cerrar.

---

### 4.3 `cliente_accesos`

**Estado actual:** `cliente_accesos_select_auth` SELECT `qual=true` para `authenticated`. Tabla contiene credenciales AnyDesk.

**Objetivo:** Solo `admin` y `soporte` pueden leer accesos. `ventas` nunca debe ver credenciales.

**Diseño de policy propuesto (conceptual):**
- Eliminar `cliente_accesos_select_auth`.
- Crear policy SELECT para roles `admin` y `soporte` únicamente.
- Crear policy INSERT/UPDATE para roles `admin` y `soporte` únicamente (verificar si existe actualmente).

**Riesgo de regresión:** `ticket.js` lee `cliente_accesos` directo con `s.from("cliente_accesos").select("*")`. Con la nueva policy, solo usuarios con rol `admin`/`soporte` podrán ver esta sección del ticket. Verificar que el rol `ventas` no necesite acceso a esta tabla.

---

### 4.4 `ticket_respuestas_rapidas`

**Estado actual:** 6 policies abiertas (SELECT/INSERT/UPDATE `qual=true` en dos grupos duplicados) más policies correctas por rol.

**Objetivo:** Eliminar los dos grupos de policies abiertas y mantener solo las policies específicas por rol. Un usuario solo debe poder gestionar respuestas rápidas de su scope (global visible para todos, cliente/contacto solo si es el agente asignado o admin).

**Diseño de policy propuesto (conceptual):**
- Eliminar los 6 duplicados abiertos: `ticket_qr_*` y `ticket_respuestas_rapidas_auth_*`.
- Mantener o reforzar las policies específicas existentes por rol admin/soporte.
- Para SELECT: admin/soporte ven todas; ventas solo las globales.
- Para INSERT/UPDATE: solo admin/soporte con filtro de propiedad.

**Riesgo de regresión:** `tickets.js` (fallback REST `qrBoardRestRows`) y `ticket.js` (`loadQuickReplies`) hacen SELECT a esta tabla con sesión. Verificar que las policies correctas existentes cubran estos patrones antes de eliminar los abiertos.

---

### 4.5 `ticket_archivos` (legacy)

**Estado actual:** `ticket_archivos_select_auth` SELECT `qual=true` para `authenticated`.

**Objetivo:** Solo admin/soporte pueden leer archivos de tickets (esta tabla es legacy pero activa).

**Diseño de policy propuesto (conceptual):**
- Reemplazar `ticket_archivos_select_auth` por policy con filtro de rol admin/soporte.
- No eliminar la tabla: sigue siendo escrita por varios flujos como soft-fail.

**Dependencia:** Verificar primero que no haya lectura de esta tabla desde código de `ventas` antes de restringir.

---

### 4.6 `ticket_match_decisiones`

**Estado actual:** SELECT/INSERT/UPDATE `qual=true` para `authenticated`.

**Objetivo:** Solo admin y soporte deben poder leer/modificar decisiones de consolidación CRM. `ventas` no debe tener acceso.

**Diseño de policy propuesto (conceptual):**
- Reemplazar las 3 policies abiertas por versions con filtro de rol `admin`/`soporte`.
- INSERT solo por Edge Function `crear-ticket-interno` (service_role) — evaluar si la policy de INSERT para authenticated es necesaria.

---

### 4.7 `clientes_contactos`

**Estado actual:** `deny_all public` sin policy positiva visible para `authenticated`.

**Situación:** Los flujos de CRM (altas, registros, ticket.js, cliente.js) pueden estar usando acceso directo SDK a esta tabla. Si la policy es solo `deny_all`, esas queries devuelven 0 filas silenciosamente.

**Objetivo:** Definir explícitamente qué roles pueden SELECT/INSERT/UPDATE a `clientes_contactos` desde el navegador, vs qué accesos deben ir por Edge Function.

**Acción previa requerida:** Auditar cada instancia de `supabase.from("clientes_contactos")` en el código JS frontend para saber cuáles son directas vs cuáles van por EF. Esto determina si se necesita policy positiva o si el `deny_all` actual es correcto (porque todo va por EF).

---

## 5. Plan Edge Functions

---

### 5.1 `match-cliente` — RETIRAR o PROTEGER

**Estado actual:** POST público sin JWT, sin rate limit. Full scan de hasta 250 clientes + 800 aliases. Devuelve candidatos con datos de contacto.

**Plan:**
1. Agregar header de autenticación interna: `x-service-key` con valor secreto configurado en Supabase Secrets. La EF verifica el header antes de procesar.
2. Agregar rate limit por IP usando `rate_limit_events` con scope `match_cliente` (10 req/min).
3. Reducir payload de respuesta: devolver solo `cliente_id`, `score`, `nivel`, sin exponer nombre de empresa ni correo de contacto completo en la respuesta pública.
4. Actualizar `soporte.js` para incluir el header `x-service-key` en cada llamada al endpoint.
5. Deploy coordinado: actualizar EF y JS en el mismo ciclo para evitar ruptura.

**Rollback conceptual:** Si el header falla, revertir la EF a la versión sin verificación (código disponible en repo). El JS también se puede revertir.

---

### 5.2 `estado-ticket-responder-ts` — AÑADIR RATE LIMIT

**Estado actual:** Sin rate limit por IP. Anti-spam de "2 mensajes seguidos" opera sobre BD, no sobre HTTP.

**Plan:**
1. Al inicio de la función, antes de procesar el formData, verificar `rate_limit_events` para la IP con scope `portal_responder`: máximo 10 requests en 5 minutos.
2. Si supera el límite: devolver 429 con mensaje genérico.
3. Si pasa: continuar con el flujo actual.

**Rollback conceptual:** Eliminar el bloque de rate limit check. Sin efecto secundario en la BD (la tabla `rate_limit_events` solo acumula filas).

---

### 5.3 `submit-alta` — AÑADIR RATE LIMIT

**Estado actual:** Sin rate limit. Acepta hasta 80MB por request (múltiples archivos al bucket `altas_tmp`).

**Plan:**
1. Agregar check de `rate_limit_events` con scope `submit_alta`: máximo 5 requests en 10 minutos por IP.
2. Patrón idéntico al de `support-submit-secure`.

**Rollback conceptual:** Eliminar el bloque de rate limit check.

---

### 5.4 `submit-registro` — AÑADIR RATE LIMIT

**Estado actual:** Sin rate limit. Sin archivos adjuntos.

**Plan:**
1. Agregar check de `rate_limit_events` con scope `submit_registro`: máximo 5 requests en 10 minutos por IP.

**Rollback conceptual:** Eliminar el bloque de rate limit check.

---

### 5.5 `support-submit-secure` — ACTIVAR TURNSTILE

**Estado actual:** `REQUIRE_TURNSTILE=false`. Rate limit activo (5/10min). La función está bien implementada; solo falta activar el CAPTCHA.

**Plan (decisión humana requerida):**
1. Configurar en Supabase Secrets: `REQUIRE_TURNSTILE=true`.
2. Actualizar `soporte.js`: `TURNSTILE_ENABLED=true`.
3. Asegurar que el widget de Cloudflare Turnstile esté correctamente renderizado en `soporte.html`.
4. Deploy coordinado EF Secrets + JS.

**Rollback conceptual:** Revertir `REQUIRE_TURNSTILE=false` en Secrets. Revertir `TURNSTILE_ENABLED=false` en JS.

---

### 5.6 `quick-function` — RETIRAR INMEDIATAMENTE

**Estado actual:** Deployada pero rota. Env vars son hashes SHA256 hardcodeados. Cada llamada devuelve 500. Ningún frontend activo la invoca.

**Plan:**
1. Verificar en Dashboard → Edge Functions que ningún cliente la usa (ver logs de invocación).
2. Retirar del deploy: Dashboard → Edge Functions → `quick-function` → Delete (o usar CLI `supabase functions delete quick-function`).
3. El código fuente permanece en el repo como referencia histórica — no eliminar el archivo.

**Rollback conceptual:** Si por error se retira y algún frontend la necesitaba (poco probable), el código está en `supabase/functions/quick-function/index.ts`. Se puede redesplegar desde el repo.

---

### 5.7 `super-service` — RETIRAR

**Estado actual:** Deployada, sin uso de frontend activo. Duplicado funcional de `submit-alta` (versión sin matchCliente). Tiene service_role sin autenticación.

**Plan:**
1. Confirmar que `submit-alta` cubre todos los casos de `super-service` (matchCliente incluido).
2. Verificar logs en Dashboard: si no hay invocaciones recientes, retirar.
3. Retirar del deploy. El código permanece en repo.

**Rollback conceptual:** Redesplegar desde `supabase/functions/super-service/index.ts` si necesario.

---

### 5.8 `ticket-internal-reply` — VERIFICAR Y REDESPLEGAR SI NECESARIO

**Estado actual:** Fix de 4 líneas commiteado en `f54e22b`. Se desconoce si la versión deployada en producción incluye el fix.

**Plan:**
1. Verificar en Dashboard → Edge Functions → `ticket-internal-reply`: comparar fecha del último deploy con la fecha del commit `f54e22b` (2026-06-13).
2. Si la versión deployada es anterior al fix: redesplegar desde el repo (`supabase functions deploy ticket-internal-reply`).
3. Si ya está actualizada: ninguna acción requerida.

**Rollback conceptual:** Redesplegar desde `DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts` si la versión con fix genera regresión.

---

## 6. Plan Storage

---

### 6.1 Bucket `soporte_adjuntos`

**Estado actual:** Existe y funciona. Policies no auditadas visualmente.

**Objetivo:**
- INSERT: solo `service_role` (Edge Functions). Nunca desde el SDK del navegador directamente.
- SELECT directo: bloqueado para `anon` y `authenticated`. Los archivos son accesibles únicamente mediante signed URLs de 8 horas generadas por `estado-ticket-ts` o el panel interno.
- UPDATE/DELETE: solo `service_role`.

**Plan:**
1. Dashboard → Storage → `soporte_adjuntos` → Policies.
2. Verificar que no existe policy `SELECT` para `anon` ni `authenticated` con `using = true`.
3. Si existe policy pública: eliminar y reemplazar por `FOR SELECT TO authenticated USING (bucket_id = 'soporte_adjuntos' AND auth.role() IN ('admin','soporte'))` o mantener solo acceso via signed URL (sin policy SELECT directa).
4. Confirmar que INSERT solo permite `service_role`.

**Rollback conceptual:** Si cerrar el SELECT directo rompe algún panel (que actualmente genera signed URL), la EF ya maneja esto — no debería haber impacto. Si lo hay, añadir temporalmente policy SELECT para authenticated con filtro de rol mientras se investiga.

---

### 6.2 Bucket `altas_tmp`

**Estado actual:** Existe y funciona. Usado por `submit-alta` para archivos de solicitudes de alta. Policies no auditadas visualmente.

**Objetivo:**
- INSERT: solo `service_role` (EF `submit-alta`).
- SELECT: solo `service_role` o usuarios con rol `admin`/`soporte` (para revisar adjuntos en el panel de altas).
- `anon`: sin acceso.

**Plan:**
1. Dashboard → Storage → `altas_tmp` → Policies.
2. Verificar y ajustar según mismo patrón que `soporte_adjuntos`.
3. Si `altas.js` genera signed URLs para mostrar archivos en el panel: confirmar que el flujo de signed URL funciona post-restricción.

---

### 6.3 Signed URLs — política de vigencia

**Estado actual:** 8 horas de vigencia en `estado-ticket-ts` y `ticket.js`. URLs no se renuevan automáticamente.

**Evaluación:**
- 8 horas es razonable para soporte activo. No requiere cambio inmediato.
- Problema de UX: si el usuario tiene el portal abierto más de 8 horas, los links de archivos expiran sin recarga.
- Mejora P3: implementar renovación automática de signed URLs al detectar expiración (verificar `url_firma` en `archivos_ticket` y regenerar si está próxima a vencer).

---

### 6.4 Lectura pública prohibida

**Regla arquitectural confirmada:** Ningún bucket debe tener policy `SELECT TO anon USING (true)`. Los archivos de soporte contienen información sensible de clientes y nunca deben ser públicamente accesibles.

**Plan:** Verificar en Dashboard que ambos buckets tienen esta regla. Si alguno tiene acceso anon: eliminar la policy inmediatamente (P0 de Storage).

---

### 6.5 Escritura solo por Edge Functions o staff

**Regla arquitectural confirmada:** INSERT a Storage solo vía `service_role` (Edge Functions). Ningún navegador debe poder subir archivos directamente con `supabase.storage.from(...).upload(...)` usando la publishable key.

**Plan:** Confirmar en políticas de bucket que no existe policy INSERT para `authenticated` ni `anon`. Todo upload debe pasar por EF.

---

## 7. Plan de Integridad de Datos

---

### 7.1 `solicitud_archivos` vs `solicitudes_soporte` — RESUELTO

**Hallazgo previo:** La FK apunta solo a `solicitudes_soporte`. Se temía que `submit-alta` usara esta tabla con IDs de `solicitudes_alta`.

**Confirmación:** `submit-alta` NO inserta en `solicitud_archivos`. Los archivos de alta van al JSONB `solicitudes_alta.archivos`. Las 31 filas de `solicitud_archivos` apuntan a `solicitudes_soporte` sin huérfanas.

**Acción:** Ninguna. Documentado y cerrado.

---

### 7.2 `submit-alta` — archivos en JSONB

**Estado:** `solicitudes_alta.archivos` es JSONB con array de objetos `{nombre, tipo, peso, storage_path}`. No hay tabla relacional de archivos para altas.

**Riesgo operativo:** Si se necesita buscar, filtrar o auditar archivos de altas específicos, el JSONB no permite queries eficientes. Es un diseño funcional pero menos escalable.

**Plan P3:** Evaluar si en el futuro conviene crear tabla `solicitud_alta_archivos` equivalente a `solicitud_archivos` pero con FK a `solicitudes_alta`. No urgente mientras el volumen sea bajo.

---

### 7.3 `ticket_eventos` en `moveTicket` / `closeTicket`

**Estado:** `tickets.js` actualiza `tickets.estado` directamente vía SDK sin insertar `ticket_eventos`. El historial canónico queda incompleto.

**Impacto concreto:** Si un agente cierra un ticket desde el board, el cliente no ve ningún evento de "estado: cerrado" en el portal. Solo ve el ticket desaparecer de la vista activa al recargar.

**Plan P2:**
1. En `tickets.js`, función `moveTicket(id, next)`: después del UPDATE de `tickets`, hacer INSERT en `ticket_eventos` con `autor_tipo: "soporte"`, `visibilidad: "publica"`, `kind: "estado"`, `texto: "Estado actualizado a X"`.
2. En `closeTicket(id)`: idem con `kind: "estado"`, `texto: "Ticket cerrado"`.
3. Si el INSERT falla: loguear error pero no bloquear el cambio de estado (soft-fail consistente con el patrón del sistema).

**Validación:** Cambiar estado desde el board → abrir portal del cliente → debe aparecer evento de estado en la timeline.

---

### 7.4 `ticket_respuestas_rapidas` — constraints vs RLS

**Estado:** Constraints correctos (`scope_ids_check`, FK compuesta `(contacto_id, cliente_id)`). El problema es RLS, no la estructura.

**Plan:** Sin cambios en constraints. Aplicar plan RLS (sección 4.4). Los constraints existentes protegen la integridad estructural incluso si la RLS falla.

---

### 7.5 `tickets` — `contacto_id` vs `cliente_id` (FK compuesta faltante)

**Estado:** No existe FK compuesta que obligue a que `contacto_id` pertenezca al mismo `cliente_id`. Un bug en el código podría asignar contacto de cliente A a ticket de cliente B.

**Plan P3:** Evaluar agregar FK compuesta `FOREIGN KEY (contacto_id, cliente_id) REFERENCES clientes_contactos(id, cliente_id)`. Requiere que `clientes_contactos(id, cliente_id)` tenga índice UNIQUE compuesto. No urgente — la validación actual es lógica en Edge Functions.

---

## 8. Plan de Limpieza y Operación

---

### 8.1 `edge_idempotency` — limpieza automática

**Estado actual:** 10 filas (9 completed, 1 failed), todas con más de 7 días. Sin pg_cron.

**Plan:**
1. Instalar extensión `pg_cron` en Dashboard → Database → Extensions.
2. Crear job: cada día a las 03:00 UTC, eliminar filas con `status IN ('completed', 'failed') AND updated_at < NOW() - INTERVAL '7 days'`.
3. Mantener filas `processing` intactas (son intentos activos o colgados — el reset de 90s los maneja en runtime).

**Alternativa manual si no se instala pg_cron:** Script programado externo (cron de servidor, GitHub Actions schedulado) que ejecute la query de limpieza via Supabase REST API con service_role. Menos elegante pero funcional.

**Rollback conceptual:** Si el job de pg_cron elimina filas que aún se necesitan: ajustar el intervalo de retención de 7 a 30 días.

---

### 8.2 `rate_limit_events` — limpieza automática

**Estado actual:** 41 filas, evento más antiguo de 2026-04-20 (~55 días). Sin pg_cron.

**Plan:**
1. Con la misma instalación de pg_cron del paso anterior, agregar segundo job: cada semana, eliminar filas con `created_at < NOW() - INTERVAL '30 days'`.
2. Los eventos de rate limit relevantes para auditoría de abuso son los recientes (últimas 24-72h). Los de 30+ días no tienen valor operativo.

**Ventana de retención sugerida:** 30 días balancean entre auditoría y crecimiento de tabla.

---

### 8.3 `ticket_portal_logs` — limpieza opcional

**Estado actual:** Tabla con throttle de inserción (10min por IP+evento en la EF). Volumen no auditado.

**Plan:**
1. Medir volumen real: `SELECT COUNT(*), MIN(created_at) FROM ticket_portal_logs`.
2. Si supera 10k filas: planificar limpieza de logs con más de 90 días (son logs de diagnóstico, no de negocio).
3. Si el volumen es bajo: sin acción urgente.

---

### 8.4 Alternativa a pg_cron — GitHub Actions

Si instalar pg_cron en el proyecto Supabase no es posible o deseable:

- Crear workflow de GitHub Actions con schedule `cron: '0 3 * * *'`.
- El workflow llama a la Supabase REST API con `service_role` para ejecutar las queries de limpieza.
- Ventaja: sin dependencia de extensión BD; trazable en git; cancelable fácilmente.
- Desventaja: depende de que GitHub Actions esté disponible y el repo tenga el secret de `service_role` configurado.

---

## 9. Matriz de Pruebas

Para cada ítem: ejecutar después de aplicar remediación, en orden, con roles distintos.

---

### 9.1 Soporte público (`soporte.html`)

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Match cliente funciona | Llenar empresa/correo → esperar 500ms | Sugerencia de cliente aparece | anon (sin sesión) |
| Formulario completo con archivo | Llenar todos los campos + 1 archivo, enviar | Folio en pantalla, correo con magic link | anon |
| Rate limit activo | Enviar >5 formularios en 10min desde misma IP | 429 en el 6° intento | anon |
| Turnstile (si activado) | Enviar formulario sin completar captcha | 403 rechazado | anon |
| Aviso global activo | Activar aviso en Dashboard → abrir soporte.html | Banner de aviso visible | anon |

---

### 9.2 Portal de estado (`estado.html?folio=X&token=Y`)

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Carga correcta | Abrir magic link válido | Timeline del ticket visible con evento inicial | anon |
| Token expirado | Usar token con fecha pasada | 410 Gone o mensaje de expiración | anon |
| Archivos con signed URL | Ticket con archivo adjunto → click en link | Archivo descargable (vigencia 8h) | anon |
| Polling activo | Dejar portal abierto, responder desde panel | Nuevo mensaje aparece sin recargar | anon |

---

### 9.3 Respuesta del cliente (`estado.html` → enviar reply)

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Respuesta de texto | Escribir texto, enviar | Evento "mensaje: cliente" en timeline | anon con token |
| Anti-spam 2 mensajes | Enviar 2 mensajes seguidos sin respuesta de soporte | 3° intento bloqueado con mensaje de aviso | anon con token |
| Rate limit IP (P2) | Enviar >10 POSTs en 5min | 429 en el 11° intento | anon con token |
| Reapertura automática | Ticket en estado "resuelto" → enviar reply | Estado cambia a "en_proceso", evento "caso reabierto" visible | anon con token |
| Adjunto | Enviar archivo válido | Archivo aparece en portal y en panel | anon con token |

---

### 9.4 Tickets internos — board (`tickets.html`)

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Board carga todos los tickets | Abrir tickets.html | Solo tickets según rol (post-RLS fix) | admin, soporte, ventas |
| `ventas` no ve todos los tickets | Iniciar sesión como `ventas` | Solo sus tickets asignados | ventas |
| Cambio de estado genera `ticket_evento` (P2) | Arrastrar ticket a "en_proceso" | Evento de estado visible en portal del cliente | admin, soporte |
| Quick replies carga desde BD | Abrir panel de respuestas rápidas | Respuestas de BD visibles (no solo defaults) | admin, soporte |
| Creación de ticket interno | Llenar modal nuevo ticket, guardar | Ticket creado con folio IN-XXXX | admin, soporte |

---

### 9.5 Quick replies

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Leer respuestas globales | Abrir selector de respuestas | Respuestas de scope global visibles | admin, soporte |
| Leer respuestas de cliente | Abrir ticket de cliente con QR | Respuestas de scope cliente visibles | admin, soporte |
| `ventas` no puede INSERT (post-RLS) | Intentar guardar respuesta rápida desde rol ventas | Error de RLS o UI sin opción de edición | ventas |
| Guardar respuesta nueva | Crear respuesta rápida, guardar | Aparece en la lista tras guardar | admin, soporte |

---

### 9.6 Adjuntos

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Upload desde panel interno | Abrir ticket → adjuntar archivo | Archivo en `archivos_ticket` y en storage `soporte_adjuntos` | admin, soporte |
| Signed URL funciona | Click en archivo del panel | Archivo descargable | admin, soporte |
| Signed URL 8h expira | Usar URL > 8h después | Error de URL expirada (Storage rechaza) | cualquiera |
| Archivo interno NO visible en portal | Subir archivo como `visibilidad: "interna"` | Archivo NO aparece en `estado.html` | — |

---

### 9.7 Alta de cliente (`alta.html`)

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Formulario completo con archivos | Llenar campos, adjuntar 2 archivos, enviar | Confirmación con solicitud_id | anon |
| Match cliente sugerido | Ingresar empresa existente | Sugerencia de match aparece | anon |
| Aprobación de alta en panel | Admin abre solicitud → aprobar | Cliente creado/vinculado en `clientes`, estado `aprobada` | admin, soporte |

---

### 9.8 Registro de cliente (`registro.html`)

| test | pasos | resultado esperado | roles |
|---|---|---|---|
| Formulario completo | Llenar datos empresa + contacto, enviar | Confirmación con solicitud_id | anon |
| Aprobación en panel | Admin abre solicitud → aprobar | Contacto vinculado/actualizado en `clientes_contactos` | admin, soporte |

---

### 9.9 Roles: admin / soporte / ventas

| test | resultado esperado post-RLS |
|---|---|
| `admin` SELECT `tickets` | Todos los tickets |
| `soporte` SELECT `tickets` | Todos los tickets |
| `ventas` SELECT `tickets` | Solo tickets asignados a él |
| `admin` SELECT `clientes` | Todos los clientes |
| `soporte` SELECT `clientes` | Todos los clientes |
| `ventas` SELECT `clientes` | 0 filas o solo clientes asignados |
| `admin` SELECT `cliente_accesos` | Todos los accesos |
| `soporte` SELECT `cliente_accesos` | Todos los accesos |
| `ventas` SELECT `cliente_accesos` | 0 filas |
| Cualquier rol SELECT `bitacora` | Solo admin/soporte |
| Cualquier rol SELECT `perfiles` | Solo su propio perfil |

---

### 9.10 Usuario autenticado sin rol / `anon`

| test | resultado esperado |
|---|---|
| `anon` SELECT `tickets` | 0 filas (RLS dev anon cerradas) |
| `anon` SELECT `clientes` | 0 filas |
| `anon` SELECT `ticket_respuestas_rapidas` | 0 filas |
| `anon` UPDATE `tickets` | Error de RLS |
| Usuario `authenticated` sin perfil en `perfiles` | SELECT `perfiles` devuelve 0 filas |
| Usuario `authenticated` sin rol SELECT `cliente_accesos` (post-fix) | 0 filas |

---

## 10. Roadmap de Ejecución — 7 Fases

---

### Fase 1 — Documentación (COMPLETADA)

**Objetivo:** Capturar el estado real del sistema antes de cualquier cambio.

| entregable | estado |
|---|---|
| `DB/auditoria_edges_rls_2026_06_13.md` | ✅ Commiteado |
| `DB/auditoria_flujo_tickets_crm_2026_06_14.md` | ✅ Commiteado |
| `DB/estado_actual_panel_expiriti_2026_06_14.md` | ✅ Commiteado |
| `DB/plan_maestro_ticket_core_comercial_2026_06_14.md` | ✅ Commiteado |
| `DB/auditoria_repo_audit_bd_2026_06_15.md` | ✅ Commiteado |
| `DB/audit_dashboard_2026_06_15.md` | ✅ Commiteado |
| `DB/plan_remediacion_blindaje_130_2026_06_15.md` | ⏳ Este documento |
| Schema público capturado | ✅ `docs/audit/supabase-public-schema.sql` |
| Rollback SQL disponible | ✅ `DB/rollback_policies_dev_B1_2026_06_13.sql` |

**Tiempo estimado:** Completado.

---

### Fase 2 — RLS P0 (próxima acción)

**Objetivo:** Cerrar las 4 tables con policies abiertas que permiten acceso total a cualquier usuario autenticado.

**Secuencia recomendada:**
1. Preparar SQL de remediación para revisión humana (no ejecutar todavía).
2. Revisar el SQL con el equipo técnico.
3. Ejecutar en orden: primero `tickets` y `clientes` (mayor riesgo), luego `cliente_accesos`, luego `ticket_respuestas_rapidas`.
4. Tras cada tabla: ejecutar el subconjunto de pruebas de la sección 9.9 para esa tabla.
5. Si regresión: ejecutar rollback de esa tabla específica antes de continuar.

**ETA sugerida:** 1-2 días de ejecución + validación.  
**Dependencia:** Ninguna — puede ejecutarse en paralelo con Fase 3.

---

### Fase 3 — Storage y Edge Functions visual (próxima acción, paralela)

**Objetivo:** Confirmar y corregir lo que no es confirmable via SQL.

**Secuencia:**
1. Dashboard → Edge Functions: verificar si `quick-function` y `super-service` están activas. Retirar.
2. Dashboard → Edge Functions → `ticket-internal-reply`: verificar fecha del último deploy. Redesplegar si es anterior al commit `f54e22b`.
3. Dashboard → Storage → `soporte_adjuntos`: verificar y corregir policies.
4. Dashboard → Storage → `altas_tmp`: idem.
5. Documentar todo en un nuevo archivo `DB/audit_dashboard_fase3_2026_06_XX.md`.

**ETA sugerida:** 1 día.  
**Dependencia:** Ninguna — paralela a Fase 2.

---

### Fase 4 — Rate Limits (requiere código)

**Objetivo:** Proteger los 4 endpoints públicos sin rate limit.

**Secuencia:**
1. `match-cliente`: agregar header `x-service-key` + rate limit + reducir payload de respuesta. Deploy coordinado con `soporte.js`.
2. `estado-ticket-responder-ts`: agregar rate limit por IP.
3. `submit-alta`: agregar rate limit por IP.
4. `submit-registro`: agregar rate limit por IP.
5. Decisión humana: activar Turnstile en `support-submit-secure`.

**ETA sugerida:** 2-3 días (incluye code review y testing de cada EF).  
**Dependencia:** Fase 3 completada (para confirmar que deploy de EFs funciona correctamente).

---

### Fase 5 — Integridad e Historial (requiere código)

**Objetivo:** Completar el historial canónico y resolver gaps de integridad.

**Secuencia:**
1. Agregar INSERT `ticket_eventos` en `moveTicket` y `closeTicket` en `tickets.js`.
2. Agregar INSERT `ticket_eventos` en batch close si existe.
3. Evaluar y definir policy para `clientes_contactos` (post-auditoría de código en Fase 2).

**ETA sugerida:** 1-2 días.  
**Dependencia:** Fase 2 (RLS) completada, para saber qué acceso directo SDK existe y si necesita policy.

---

### Fase 6 — Limpieza y Optimización (requiere Dashboard + opcional código)

**Objetivo:** Estabilizar la operación a largo plazo.

**Secuencia:**
1. Instalar `pg_cron` o configurar GitHub Actions schedulado.
2. Configurar job de limpieza para `edge_idempotency` (7 días, completed/failed).
3. Configurar job de limpieza para `rate_limit_events` (30 días).
4. Medir volumen de `ticket_portal_logs` y decidir si necesita limpieza.
5. Eliminar índices duplicados (P3, en ventana de mantenimiento de baja carga).

**ETA sugerida:** 1 día.  
**Dependencia:** Fases 4 y 5 completadas (para que los rate limits nuevos ya estén generando eventos y el cron los limpie correctamente).

---

### Fase 7 — Pruebas y Cierre Comercial

**Objetivo:** Validar el sistema completo post-remediación y declarar listo para escalar.

**Secuencia:**
1. Ejecutar la matriz de pruebas completa (Sección 9) en orden.
2. Documentar resultados de cada test.
3. Verificar que no hay regresiones en flujos existentes.
4. Confirmar métricas: 0 policies `qual=true` para authenticated en tablas críticas, 0 EFs legacy activas, 4 endpoints con rate limit, pg_cron activo.
5. Crear documento de cierre: `DB/cierre_blindaje_130_FECHA.md`.

**Criterio de éxito (130%):**
- [ ] 0 policies `qual=true` sin filtro de rol en tablas críticas
- [ ] `tickets`, `clientes`, `cliente_accesos` con acceso restringido por rol
- [ ] `quick-function` y `super-service` retiradas del deploy
- [ ] `ticket-internal-reply` en versión con fix de idempotencia
- [ ] `match-cliente` con autenticación de header
- [ ] 4 endpoints con rate limit activo
- [ ] Storage buckets sin acceso público directo
- [ ] `ticket_eventos` generado en moveTicket/closeTicket
- [ ] pg_cron (o equivalente) limpiando `edge_idempotency` y `rate_limit_events`
- [ ] Matriz de pruebas ejecutada y sin regresiones documentadas

**ETA sugerida:** 1-2 días de testing documentado.

---

## Resumen de Tiempos Estimados

| fase | descripción | ETA | dependencia |
|---|---|---|---|
| Fase 1 | Documentación | COMPLETADA | — |
| Fase 2 | RLS P0 | 1-2 días | Ninguna |
| Fase 3 | Storage + EF visual | 1 día | Ninguna (paralela) |
| Fase 4 | Rate limits | 2-3 días | Fase 3 |
| Fase 5 | Integridad/historial | 1-2 días | Fase 2 |
| Fase 6 | Limpieza/optimización | 1 día | Fases 4-5 |
| Fase 7 | Pruebas y cierre | 1-2 días | Todas |
| **Total** | **Blindaje 130%** | **~8-11 días hábiles** | — |

---

*Plan generado: 2026-06-15 · Solo documentación · Sin SQL write · Sin remediación · Sin deploy*  
*Basado en: auditoría de repo (2026-06-13/14) + auditoría Dashboard SQL (2026-06-15)*  
*Siguiente acción: preparar SQL de remediación P0 para revisión humana, paralelo a verificación visual de Dashboard (Fases 2 y 3)*
