# Hallazgos Críticos — Panel Expiriti / Supabase
**Fecha:** 2026-06-15  
**Fuente:** Auditoría completa de 8 documentos + SQL read-only en Dashboard + grep PANEL/*.js

---

## RESUMEN DE SEMÁFORO

| Prioridad | Items | Estado |
|-----------|-------|--------|
| P0-bis | 1 tabla | ROTO EN PRODUCCIÓN AHORA |
| P0 | 4 tablas + 1 EF | ABIERTO — riesgo alto activo |
| P1 | 2 tablas + 3 EFs + 3 buckets | PENDIENTE — riesgo medio |
| P2 | 4 EFs + 2 tablas operacionales | PENDIENTE — riesgo medio |
| P3 | Deuda técnica normalización | SIN URGENCIA |

---

## P0-bis — CRÍTICO (Rompe producción)

### H01 — `clientes_contactos`: deny_all activo, 5 flujos de UI rotos

**Tabla:** `clientes_contactos`  
**Policy activa:** `deny_all_clientes_contactos` — `PERMISSIVE`, `roles={public}`, `cmd=ALL`, `qual=false`  
**Efecto:** Toda query desde SDK browser devuelve 0 filas en SELECT o error en INSERT.  
**No hay ninguna policy positiva** para el rol `authenticated`.

**Flujos rotos en producción:**

| Archivo | Línea(s) | Operación | Efecto visible |
|---------|----------|-----------|----------------|
| `registros.js` | 40, 47, 48, 49 | SELECT + INSERT (aprobación de registro) | **ERROR visible: toast "No se pudo aprobar"** — flujo completamente roto |
| `cliente.js` | 35 | SELECT (loadContacts) | Sección "Contactos" vacía — sin error visible |
| `ticket.js` | 138 | SELECT (loadLinkedContact) | Nombre del contacto no aparece en header del ticket |
| `ticket.js` | 202 | SELECT (loadClientContacts) | Dropdown de contactos vacío — no se puede cambiar contacto |
| `altas.js` | 44 | SELECT (hydrateAltaSuggestions) | Nombres de contactos sugeridos vacíos — UI degradada |

**Asimetría crítica:** `altas.js` usa la Edge Function `alta-aprobar` (service_role, bypass RLS) → funciona. `registros.js` usa SDK directo (authenticated) → roto. Dos flujos equivalentes con arquitecturas distintas.

**Dead code confirmado:** Las funciones `createPrimaryContactFromRequest`, `findExistingContact` en `altas.js:34,35,37,38` NUNCA son invocadas. Solo `altas.js:44` es activo.

**Decisiones bloqueantes:**
- D3: ¿`ventas` ve `clientes_contactos`? → Recomendación técnica: SÍ (ticket.js:202 lo necesita)
- D4: ¿`registros.js:approve()` se migra a EF o mantiene con SDK directo? → Recomendación: mantener SDK, crear policy INSERT para authenticated

---

## P0 — ALTO (Datos expuestos a todos los roles)

### H02 — `tickets`: 2 policies SELECT duplicadas con `qual=true`

**Policies activas (ambas abiertas):**
- `tickets_select_auth` — SELECT, authenticated, `qual=true`
- `tickets_select_authenticated` — SELECT, authenticated, `qual=true`

**Riesgo:** Cualquier usuario authenticated (incluyendo `ventas`) lee todos los tickets de todos los clientes sin restricción. Con `dashboard.js:142` haciendo `SELECT * ORDER nombre` sin LIMIT, una sesión de ventas descarga la base completa de tickets.

**Decisión bloqueante D1:** ¿`ventas` ve todos los tickets o solo los asignados a él?  
- Opción A (recomendada para inicio): `ventas` ve todos — más simple, menor riesgo de board vacío  
- Opción B (restrictiva): `ventas` ve solo `WHERE asignado_a = auth.uid()` — requiere tickets correctamente asignados

### H03 — `clientes`: SELECT `qual=true`, PII expuesto

**Policy activa:** `clientes_select_auth` — SELECT, authenticated, `qual=true`  
**Riesgo:** Cualquier autenticado exporta la base completa de clientes: nombre, correo, RFC, teléfono, estado, plan.  
`dashboard.js:142` hace `SELECT * FROM clientes` sin `.limit()`.

### H04 — `cliente_accesos`: credenciales AnyDesk expuestas a todos

**Policy activa:** `cliente_accesos_select_auth` — SELECT, authenticated, `qual=true`  
**Contenido de la tabla:** IDs de AnyDesk, URLs de acceso remoto, usuarios y claves cifradas por cliente.  
**Riesgo:** Un vendedor (o cualquier autenticado) puede leer las credenciales de acceso remoto de todos los clientes.  
**Decisión bloqueante D2:** ¿`ventas` ve `cliente_accesos`? → Recomendación técnica: NO.

### H05 — `ticket_respuestas_rapidas`: 6 policies abiertas duplicadas

**Policies activas:** 6 policies en 2 grupos duplicados — SELECT/INSERT/UPDATE con `qual=true` para `authenticated`.  
**Riesgo:** Cualquier autenticado puede leer, crear y modificar respuestas rápidas de cualquier cliente o contacto (scope=global/cliente/contacto sin restricción).

### H06 — `quick-function`: Edge Function rota, deployada, surface de ataque activa

**Problema:** La EF usa `Deno.env.get("6fb8db5c...")` — el nombre de la variable ES un hash SHA256. Siempre devuelve `undefined`. Cada llamada genera un error 500. La EF tiene `service_role` expuesto en un endpoint público sin autenticación.  
**Ningún frontend la invoca.** Es dead code en producción pero surface de ataque activa.  
**Acción:** Verificar logs en Dashboard → si sin invocaciones → retirar del deploy.

---

## P1 — MEDIO (Riesgo activo pero no rompe producción)

### H07 — `ticket_archivos` (legacy): SELECT `qual=true`

**Policy activa:** `ticket_archivos_select_auth` — SELECT, authenticated, `qual=true`  
**Riesgo:** Cualquier autenticado lee `url_archivo` (que almacena storage_path) de los archivos de todos los tickets.  
**Nota naming:** La columna `url_archivo` almacena un storage path, no una URL — nombre engañoso confirmado.

### H08 — `ticket_match_decisiones`: 3 policies abiertas, sin uso en JS

**Policies:** SELECT/INSERT/UPDATE, authenticated, `qual=true`  
**Importante:** Cero referencias en PANEL/*.js. Solo la EF `crear-ticket-interno` accede (service_role).  
Cerrar estas policies no rompe ningún flujo de UI. Puede adelantarse al P0 sin costo.

### H09 — `super-service`: EF legacy con service_role público, sin uso

**Estado:** Acepta POST sin autenticación, tiene service_role, es un duplicado funcional de `submit-alta`.  
**Riesgo:** Endpoint activo con bypass RLS completo y sin autenticación.  
**Acción:** Verificar logs → si sin invocaciones recientes → retirar del deploy.

### H10 — `match-cliente`: POST público sin JWT ni rate limit, full scan de clientes

**Estado:** Endpoint público, sin autenticación, sin rate limit, usa service_role para scan completo de clientes.  
**Riesgo:** Cualquier sitio web puede hacer POST y obtener candidatos con nombre/correo/teléfono/score de la base de clientes.  
**Fix propuesto:** Header `x-service-key` (secret en Supabase Secrets) + rate limit (10/min) + reducir payload de respuesta.  
**Decisión bloqueante D6:** ¿Header `x-service-key` (valor en JS del frontend, visible en código) o rediseño con JWT?

### H11 — Storage: 3 buckets sin verificación visual de policies

**Buckets:** `soporte_adjuntos`, `altas_tmp`, `certificados`  
**Problema:** Las Storage policies NO son consultables via SQL de schema. Requieren verificación manual en Dashboard → Storage → [bucket] → Policies.  
**Riesgo si bucket es público:** Archivos de tickets de clientes, documentos de solicitudes de alta, certificados y licencias accesibles sin firma.

| Bucket | Fuente de upload | Riesgo si público |
|--------|-----------------|------------------|
| `soporte_adjuntos` | `ticket.js:160` (browser direct) + EFs | Adjuntos de tickets de soporte — información sensible de clientes |
| `altas_tmp` | Solo EF `submit-alta` (service_role) | Documentos de solicitudes de alta — INE, RFC, contratos |
| `certificados` | `cliente.core.js:32,33` + `dashboard.js:137` (browser direct) | Licencias, certificados, documentación empresarial |

### H12 — `ticket-internal-reply`: versión de deploy no confirmada

**Fix en repositorio:** Commit `567ef9a` (2026-06-13) — `fix: harden ticket internal reply idempotency`. El commit `f54e22b` es el backup documental pre-fix, no el fix.

**Deploy confirmado: PENDIENTE.** No se puede confirmar vía SQL si la versión deployada corresponde al fix.

**Acción:** Verificar fecha de deploy en Dashboard → Edge Functions (debe ser posterior a 2026-06-13).

---

## P2 — MEDIO OPERACIONAL (No rompe funcionalidad, pero escala el riesgo)

### H13 — `estado-ticket-responder-ts` (POST) y `estado-ticket-ts` (GET): sin rate limit HTTP

**`estado-ticket-responder-ts` (POST):** Endpoint público (solo folio+token). Sin rate limit HTTP.

**Riesgo POST:** Spam de respuestas al portal sin límite de frecuencia.

**[inferencia]:** El mecanismo anti-spam "por porcentaje en BD" no está confirmado — el código de esta EF no está disponible en el repositorio local. Comportamiento inferido, no auditado.

**`estado-ticket-ts` (GET) — gap adicional P2:** El endpoint de consulta del portal tampoco tiene rate limit HTTP confirmado. Folio secuencial + `token_publico` en plaintext = bruteforce sin barrera de red. No hay fix propuesto en el plan P2 actual. Este gap es independiente de H23 (token en plaintext).

### H14 — `submit-alta`: sin rate limit (acepta hasta 80MB por request)

**Estado:** Endpoint público sin autenticación ni rate limit. Acepta archivos de hasta 80MB.  
**Riesgo:** Flood de solicitudes de alta + subida masiva a bucket `altas_tmp`.

### H15 — `submit-registro`: sin rate limit

**Estado:** Endpoint público sin autenticación ni rate limit.  
**Riesgo:** Spam de solicitudes de registro sin control de frecuencia.

### H16 — `support-submit-secure`: Turnstile implementado pero apagado

**Estado:** Código de verificación Turnstile presente. Flag `REQUIRE_TURNSTILE=false` en Supabase Secrets.  
**Única protección actual:** Rate limit de 5 requests/10min por IP.  
**Decisión bloqueante D5:** ¿Activar Turnstile? Depende de si hay spam activo.

### H17 — `ticket_eventos`: 3 flujos JS no insertan eventos (historial incompleto)

**Flujos sin INSERT:**
- `tickets.js:260` — `moveTicket()` — cambio de estado desde el board
- `tickets.js:263` — `closeTicket()` — cierre desde el board
- `dashboard.js:150` — `batchClose()` — cierre masivo

**Impacto:** El portal del cliente (`estado.html`) no muestra los cambios de estado realizados desde el board. El historial canónico en `ticket_eventos` está incompleto.  
La EF `crear-ticket-interno` sí inserta `ticket_eventos` (correcto).

### H18 — pg_cron no instalado, tablas operacionales sin cleanup automático

**Tablas afectadas:**
- `edge_idempotency`: 10 filas actuales, 9 `completed` + 1 `failed`, todas >7 días
- `rate_limit_events`: 41 filas, evento más antiguo 2026-04-20 (~55 días)

**Riesgo:** Bajo ahora (volumen pequeño). Riesgo operativo si escala.

### H19 — Deploy drift: versiones de EFs en producción no confirmadas

**Problema:** No se puede determinar via SQL qué versión de cada EF está deployada en producción.  
**Items pendientes:**
- Confirmar si `quick-function` y `super-service` siguen activas (pueden haber sido retiradas manualmente)
- Confirmar si `ticket-internal-reply` post-fix (`567ef9a`) está en producción — el commit `f54e22b` es el backup pre-fix documental, no el fix
- Confirmar versiones de EFs críticas: `support-submit-secure`, `estado-ticket-ts`, etc.

---

## GAPS DE COBERTURA (identificados post-cierre — pendientes de auditoría)

> Estos items no tienen hallazgo H-numerado porque no fueron auditados en el ciclo principal. No se les asigna prioridad hasta confirmar su estado en Dashboard. No afirmar riesgo sin evidencia.

### G01 — `ticket_eventos`: RLS no auditado explícitamente

**Estado:** La tabla canónica de eventos nunca fue objeto de una query `pg_policies` directa en la auditoría.

**Por qué importa:** `ticket_eventos` es leída por la EF pública `estado-ticket-ts` (sin JWT) para mostrar el historial al cliente. Si sus policies de SELECT son abiertas o incorrectas, el historial podría estar más expuesto de lo esperado.

**Verificación requerida:** Dashboard → SQL Editor: `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='ticket_eventos'`

**No inferir su estado actual.** Puede ser correcto o incorrecto — requiere comprobación.

### G02 — `clientes_contacto_historial`: tabla detectada, sin auditoría

**Estado:** Referenciada en el inventario de tablas de `00_contexto_ejecutivo.md` como "RLS no auditado". Ausente del resto del análisis.

**Por qué importa:** Su nombre sugiere historial de contacto — posiblemente PII. Lectors, writers, grants y policies son completamente desconocidos.

**Verificación requerida:** Dashboard → Table Editor + `SELECT policyname FROM pg_policies WHERE tablename='clientes_contacto_historial'` + revisar si hay referencias en PANEL/*.js o EFs.

**No clasificar como vulnerable sin evidencia.** Solo auditar.

### G03 — INSERT/UPDATE/DELETE de `clientes` y `cliente_accesos`: no auditadas en P0

**Estado:** La auditoría P0 verificó policies SELECT. Las operaciones de escritura no fueron auditadas.

**Flujos que escriben:**
- `dashboard.js:84` — INSERT en `clientes` (cliente rápido)
- `cliente.core.js:34` — UPDATE en `clientes`
- `ticket.js:168` — INSERT/UPDATE en `cliente_accesos` (accesos AnyDesk)

**Por qué importa:** Si las policies INSERT/UPDATE son abiertas (`qual=true`), cualquier `authenticated` puede crear/modificar clientes y credenciales AnyDesk incluso después de aplicar P0 SELECT.

**Verificación requerida:** Dashboard → SQL Editor: `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('clientes','cliente_accesos') AND cmd IN ('INSERT','UPDATE','DELETE')`

**Bloquea aprobación final de SQL-04 y SQL-05** hasta confirmar.

---

## P3 — DEUDA TÉCNICA (Sin urgencia de seguridad)

### H20 — `tickets` como God Table (60+ columnas, viola 3NF)

La tabla `tickets` mezcla datos de soporte, matching de clientes, SLA, contacto, archivos (JSONB) y timeline (JSONB). Ver `04_bd_arquitectura_a_revisar.md` para detalle.

### H21 — Doble fuente de verdad: ticket_archivos vs archivos_ticket

Doble escritura activa. `ticket.js:160` escribe en ambas tablas. La legacy (`ticket_archivos`) se ignora en fallos silenciosos; la canónica (`archivos_ticket`) aborta si falla.

### H22 — Doble fuente de verdad: timeline_publica vs ticket_eventos

`tickets.timeline_publica` (JSONB) y `ticket_eventos` (tabla) existen en paralelo. `ticket.js:240` prefiere `ticket_eventos` si hay filas, si no cae a `timeline_publica`.

### H23 — Tokens públicos en plaintext sin rate limit en consulta

`token_publico` se almacena sin hash en `tickets`. Sin rate limit en `estado-ticket-ts`, es posible enumeración por fuerza bruta de tokens (folio es secuencial, token aleatorio pero en plaintext).

### H24 — 7 índices duplicados confirmados en Dashboard

4 índices superfluos: 2 extra en `tickets`, 1 extra en `ticket_eventos`, 1 extra en `archivos_ticket`. Overhead de escritura sin beneficio de lectura.

### H25 — `clientes_usuarios`: tabla preparada para multi-tenant sin uso activo

0 referencias en PANEL/*.js. La tabla existe (owner/editor/viewer por cliente) pero el frontend carga todos los clientes sin filtro. Activarla requeriría rediseño completo de RLS.

---

## Tabla de Prioridades Consolidada

| # | Item | Tabla/EF | Riesgo | Acción | Estado |
|---|------|----------|--------|--------|--------|
| H01 | clientes_contactos deny_all | `clientes_contactos` | CRÍTICO | SQL P0-bis | ❌ PENDIENTE |
| H02 | tickets SELECT qual=true | `tickets` | ALTO | SQL P0 | ❌ Bloqueado D1 |
| H03 | clientes SELECT qual=true | `clientes` | ALTO | SQL P0 | ❌ PENDIENTE |
| H04 | cliente_accesos SELECT qual=true | `cliente_accesos` | ALTO | SQL P0 | ❌ Bloqueado D2 |
| H05 | ticket_respuestas_rapidas 6 abiertas | `ticket_respuestas_rapidas` | ALTO | SQL P0 | ❌ PENDIENTE |
| H06 | quick-function rota deployada | EF | ALTO | Retirar deploy | ❌ Requiere verificar logs |
| H07 | ticket_archivos SELECT abierto | `ticket_archivos` | MEDIO | SQL P1 | ❌ PENDIENTE |
| H08 | ticket_match_decisiones abierto | `ticket_match_decisiones` | MEDIO | SQL P1 (adelantable P0) | ❌ PENDIENTE |
| H09 | super-service legacy pública | EF | ALTO | Retirar deploy | ❌ Requiere verificar logs |
| H10 | match-cliente sin auth/RL | EF | ALTO | Código + deploy | ❌ Bloqueado D6 |
| H11 | Storage 3 buckets sin verificar | Buckets | DESCONOCIDO | Dashboard visual | ❌ No verificado |
| H12 | ticket-internal-reply deploy incierto | EF | MEDIO | Verificar + redesplegar | ❌ No verificado |
| H13 | estado-ticket-responder-ts sin RL | EF | MEDIO | Código + deploy | ❌ PENDIENTE |
| H14 | submit-alta sin RL | EF | MEDIO | Código + deploy | ❌ PENDIENTE |
| H15 | submit-registro sin RL | EF | MEDIO | Código + deploy | ❌ PENDIENTE |
| H16 | Turnstile apagado | EF + JS | MEDIO | Flags + deploy | ❌ Bloqueado D5 |
| H17 | ticket_eventos incompleto | JS | MEDIO | Código JS | ❌ PENDIENTE |
| H18 | pg_cron no instalado | BD | BAJO | Dashboard | ❌ PENDIENTE |
| H19 | Deploy drift EFs | Dashboard | MEDIO | Verificación visual | ❌ No verificado |
| H20-H25 | Deuda técnica P3 | BD | BAJO | Sprint dedicado | ❌ Sin urgencia |
