# Checklist Previo a Ejecución — Panel Expiriti / Supabase
**Fecha:** 2026-06-15  
**Rama fuente:** `audit/supabase-flows`  
**Propósito:** Validar que se cumplen todas las condiciones antes de ejecutar cualquier script de remediación real (P0-bis, P0, P1, P2).  
**Modo:** Solo documentación. Sin SQL ejecutable. Sin deploy. Sin commit. Sin push.

> **Regla de oro:** Ningún script de remediación se ejecuta sin haber completado el bloque correspondiente de este checklist. Si un ítem está en ❌ o ❓, la ejecución no puede comenzar.

---

## Índice

1. [Checklist antes de cualquier SQL](#1-checklist-antes-de-cualquier-sql)
2. [Checklist Dashboard](#2-checklist-dashboard)
3. [Checklist por rol](#3-checklist-por-rol)
4. [Checklist UI antes / después](#4-checklist-ui-antes--después)
5. [Checklist de rollback](#5-checklist-de-rollback)
6. [Semáforo de ejecución](#6-semáforo-de-ejecución)
7. [Tabla final consolidada](#7-tabla-final-consolidada)

---

## 1. Checklist antes de cualquier SQL

> Completar este bloque ANTES de abrir el SQL Editor del Dashboard.  
> Marcar cada ítem con ✅ (listo), ⚠️ (advertencia conocida y aceptada), o ❌ (bloqueante — no ejecutar).

---

### 1.1 Control de rama y estado del repositorio

| # | Ítem | Cómo verificar | Estado esperado |
|---|------|---------------|-----------------|
| R01 | Rama activa es `audit/supabase-flows` | `git branch --show-current` | `audit/supabase-flows` |
| R02 | Working tree limpio o solo archivos de documentación en `DB/` | `git status --short` | `??` solo en `DB/` — ningún archivo JS/TS/SQL modificado |
| R03 | Último commit corresponde al estado auditado | `git log --oneline -3` | `43f131f` o posterior dentro de la rama de auditoría |
| R04 | Ningún cambio staged pendiente de commit | `git diff --cached --name-only` | Vacío |
| R05 | El repo `panel-expiriti` (código fuente) está en rama `main` y limpio | Verificar en el repo de código | Sin cambios locales no commiteados |

**Resultado bloque R:** ☐ Todos ✅ → continuar | ☐ Algún ❌ → detener

---

### 1.2 Backup de policies antes del fix

> Ejecutar en Dashboard → SQL Editor como **solo lectura** antes de cualquier cambio. Copiar el resultado y guardarlo localmente.

| # | Ítem | Query de verificación | Resultado esperado |
|---|------|-----------------------|-------------------|
| B01 | Exportar estado actual de policies de `clientes_contactos` | `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='clientes_contactos' ORDER BY policyname` | Solo `deny_all_clientes_contactos` — sin otras policies |
| B02 | Exportar estado actual de policies de `tickets` | Idem con `tablename='tickets'` | `tickets_select_auth` + `tickets_select_authenticated` (las dos abiertas) + policies de INSERT/UPDATE si existen |
| B03 | Exportar estado actual de policies de `clientes` | Idem con `tablename='clientes'` | `clientes_select_auth` abierta |
| B04 | Exportar estado actual de policies de `cliente_accesos` | Idem con `tablename='cliente_accesos'` | `cliente_accesos_select_auth` abierta |
| B05 | Exportar estado actual de policies de `ticket_respuestas_rapidas` | Idem con `tablename='ticket_respuestas_rapidas'` | 6 policies abiertas + policies correctas si existen |
| B06 | Resultado guardado en archivo local o en nota del Dashboard | Archivar antes de ejecutar cualquier DROP | Texto completo del resultado de cada query |
| B07 | El SQL de rollback P0-bis está redactado y disponible | Ver `DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md §4.3` — **documento fuente externo al paquete Fable; no incluido en los 10 archivos adjuntos. Fable no puede verificarlo directamente.** | Script de rollback listo — recrear `deny_all` |
| B08 | El SQL de rollback P0 está redactado y disponible | Ver `DB/rls_p0_preflight_remediation_2026_06_15.md §7` — **documento fuente externo al paquete Fable; no incluido en los 10 archivos adjuntos. Fable no puede verificarlo directamente.** | Scripts de rollback por tabla listos |

**Resultado bloque B:** ☐ Todos ✅ → continuar | ☐ Algún ❌ → detener

---

### 1.3 Confirmación de tablas objetivo y policies actuales

| # | Ítem | Cómo confirmar | Estado esperado |
|---|------|---------------|-----------------|
| C01 | RLS habilitado en `clientes_contactos` | `SELECT rowsecurity FROM pg_tables WHERE tablename='clientes_contactos'` | `true` |
| C02 | RLS habilitado en `tickets` | Idem con `tickets` | `true` |
| C03 | RLS habilitado en `clientes` | Idem | `true` |
| C04 | RLS habilitado en `cliente_accesos` | Idem | `true` |
| C05 | RLS habilitado en `ticket_respuestas_rapidas` | Idem | `true` |
| C06 | `clientes_contactos` tiene exactamente 1 policy (`deny_all`) y ninguna positiva | Query B01 del bloque anterior | 1 policy, `qual=false` |
| C07 | `tickets` tiene exactamente 2 policies SELECT abiertas (duplicadas) | Query B02 | 2 policies SELECT `qual=true` |
| C08 | La tabla `perfiles` tiene la policy `perfiles_self_select` activa | `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='perfiles'` | Policy SELECT con `qual=(id = auth.uid())` |
| C09 | Las policies de `ticket_respuestas_rapidas` "correctas" (por rol admin/soporte) existen antes de hacer DROP de las 6 abiertas | `SELECT policyname FROM pg_policies WHERE tablename='ticket_respuestas_rapidas'` | Deben existir policies con nombres distintos a las 6 abiertas — verificar que el DROP no deja la tabla sin acceso |

**Resultado bloque C:** ☐ Todos ✅ → continuar | ☐ Algún ❌ → detener

---

### 1.4 Confirmación de decisiones humanas

> Cada decisión bloqueante debe estar tomada y documentada antes de ejecutar el SQL correspondiente.

| # | Decisión | Pregunta | Opciones | ¿Bloquea qué? | Estado |
|---|----------|---------|---------|--------------|--------|
| D01 | **D3** — ¿`ventas` ve `clientes_contactos`? | ¿El rol ventas necesita ver contactos de clientes? | SÍ (recomendado) / NO | Array de roles en `cc_select_staff` del P0-bis | ☐ Tomada |
| D02 | **D4** — ¿`registros.js:approve()` migra a EF? | ¿Mantener SDK directo (policy INSERT para authenticated) o migrar a EF `registro-aprobar`? | Mantener SDK (recomendado) / Migrar a EF | Diseño de `cc_insert_staff` — si migra a EF, el INSERT policy no es necesario | ☐ Tomada |
| D03 | **D1** — ¿`ventas` ve todos los tickets? | ¿El rol ventas puede ver el board completo de tickets o solo los asignados? | Todos (Opción A, recomendado) / Solo asignados (Opción B) | `qual` de `tickets_select_staff` en P0 | ☐ Tomada |
| D04 | **D2** — ¿`ventas` ve `cliente_accesos`? | ¿Vendedores necesitan ver credenciales AnyDesk de clientes? | NO (recomendado) / SÍ | Array de roles en `cliente_accesos_select_staff` en P0 | ☐ Tomada |
| D05 | **D5** — ¿Activar Turnstile? | ¿El formulario de soporte.html recibe spam de bots actualmente? | Activar (si hay spam) / Mantener apagado | Deploy de `support-submit-secure` + `soporte.js` | ☐ Tomada (puede esperar a P2) |
| D06 | **D6** — ¿`match-cliente` usa header `x-service-key`? | ¿El secreto en JS del frontend es aceptable para proteger `match-cliente`? | Header x-service-key (recomendado) / Rediseño JWT | Diseño del fix P1-4 | ☐ Tomada (puede esperar a P1) |

> **Mínimo para ejecutar P0-bis:** D01 (D3) y D02 (D4) tomadas.  
> **Mínimo para ejecutar P0:** D01, D02, D03 (D1), D04 (D2) tomadas.

**Resultado bloque D:** ☐ Mínimo tomado → continuar | ☐ Alguna decisión mínima pendiente → detener

---

### 1.5 Confirmación de que el SQL NO será ejecutado por Claude ni por herramientas automáticas

| # | Ítem | Descripción |
|---|------|-------------|
| E01 | El SQL de remediación **solo lo ejecuta un humano** en el Dashboard → SQL Editor de Supabase | Claude Code está en modo estricto: no ejecuta SQL, no hace deploy, no hace push |
| E02 | El Dashboard SQL Editor está abierto en el **proyecto correcto** de Supabase (no en local ni en staging si los hay) | Verificar el nombre del proyecto en la barra superior del Dashboard |
| E03 | El Script se ejecuta **tabla por tabla**, con verificación de resultado antes de pasar a la siguiente | No ejecutar todo el P0 en una sola transacción sin validar cada paso |
| E04 | Hay un segundo par de ojos disponible durante la ejecución (si es posible) | Al menos un revisor que pueda corregir si hay regresión |
| E05 | El horario de ejecución es **fuera del horario de uso intensivo del panel** | Ventana de mantenimiento preferida: madrugada o fin de semana |

**Resultado bloque E:** ☐ Todos confirmados → continuar | ☐ Alguno no confirmado → evaluar riesgo

---

## 2. Checklist Dashboard

> Verificar cada uno de estos ítems directamente en el Supabase Dashboard antes de ejecutar cualquier SQL o deploy. Ninguno de estos checks requiere ejecutar queries — son verificaciones visuales o de lectura.

---

### 2.1 Storage — Buckets y policies

| # | Bucket | Dónde verificar | Qué buscar | Estado esperado | ¿Bloquea? |
|---|--------|----------------|-----------|-----------------|-----------|
| ST01 | `soporte_adjuntos` | Dashboard → Storage → soporte_adjuntos → Policies | Policy INSERT para `authenticated` (admin/soporte) | INSERT authenticated presente | Sí — si falta, el upload de staff fallará post-P0 |
| ST02 | `soporte_adjuntos` | Idem | Policy SELECT directa para `anon` | SELECT anon: **BLOQUEADO** | Sí — si está abierto, adjuntos públicos accesibles sin firma |
| ST03 | `soporte_adjuntos` | Idem | Policy SELECT directa para `authenticated` | SELECT authenticated: bloqueado o solo via signed URL | No bloquea P0-bis, sí P1-6 |
| ST04 | `altas_tmp` | Dashboard → Storage → altas_tmp → Policies | Policy INSERT | Solo `service_role` | No bloquea P0-bis/P0 |
| ST05 | `altas_tmp` | Idem | Policy SELECT para `anon` | BLOQUEADO | No bloquea P0-bis/P0 |
| ST06 | `certificados` | Dashboard → Storage → certificados → Policies | Policy INSERT para `authenticated` | INSERT authenticated presente (3 puntos de upload) | Sí — si falta, upload desde cliente.html y dashboard.js fallan |
| ST07 | `certificados` | Idem | Policy SELECT directa para `anon` | BLOQUEADO | Sí — PDFs de licencias y contratos |
| ST08 | `certificados` | Idem | Bucket es privado (no público) | `Private` | Sí — si es público, todos los archivos son accesibles sin firma |

---

### 2.2 Edge Functions — Versiones deployadas reales

| # | EF | Dónde verificar | Qué verificar | Estado esperado | ¿Bloquea? |
|---|----|--------------  |--------------|-----------------|-----------|
| EF01 | `quick-function` | Dashboard → Edge Functions → lista | ¿Aparece en la lista? | Si aparece: verificar logs antes de retirar | Sí para P0 (retirar) |
| EF02 | `quick-function` | Dashboard → EF → quick-function → Logs | ¿Hay invocaciones en los últimos 7 días? | 0 invocaciones exitosas (se esperan solo 500s) | Sí — si hay invocaciones externas no documentadas |
| EF03 | `super-service` | Dashboard → Edge Functions → lista | ¿Aparece en la lista? | Si aparece: verificar logs | Sí para P1-3 (retirar) |
| EF04 | `super-service` | Dashboard → EF → super-service → Logs | ¿Hay invocaciones recientes? | 0 invocaciones | Sí — si hay integraciones externas no documentadas |
| EF05 | `ticket-internal-reply` | Dashboard → EF → ticket-internal-reply | Fecha de último deploy | Posterior a 2026-06-13 — fix commit es `567ef9a` (`fix: harden ticket internal reply idempotency`); `f54e22b` es el backup pre-fix documental, no el fix | No bloquea P0-bis/P0 directamente, sí P1-7 |
| EF06 | `support-submit-secure` | Dashboard → EF → lista | Aparece y fecha de deploy | Cualquier fecha — confirmar que no hay versión no commiteada activa | No bloquea |
| EF07 | `estado-ticket-ts` | Idem | Aparece y fecha de deploy | Confirmar activa | No bloquea |
| EF08 | `match-cliente` | Dashboard → EF → match-cliente → Logs | Volumen de invocaciones por IP | Sin patrones de abuso masivo antes de aplicar rate limit | No bloquea P0-bis/P0, sí P1-4 |
| EF09 | `estado-ticket-ts` (GET) | Dashboard → EF → estado-ticket-ts → Logs | ¿Hay patrones de bruteforce (muchos requests con tokens inválidos)? — **sin rate limit HTTP confirmado en el endpoint de consulta (gap P2 nuevo)** | Ausencia de patrones anómalos | No bloquea P0-bis/P0, sí P2 |

---

### 2.3 Constraints pendientes de confirmación

| # | Tabla | Constraint a confirmar | Dónde verificar | ¿Bloquea ejecución? |
|---|-------|----------------------|----------------|---------------------|
| CN01 | `cliente_aliases` | ¿Tiene PRIMARY KEY explícita sobre `id`? | Dashboard → Table Editor → cliente_aliases → Primary Key | No bloquea P0-bis/P0 — es P2 |
| CN02 | `clientes_contactos` | ¿Tiene UNIQUE constraint sobre `(id, cliente_id)`? | Dashboard → Table Editor → clientes_contactos → Constraints | No bloquea P0-bis directamente, pero es prerrequisito para que la FK compuesta de `ticket_respuestas_rapidas` sea válida |
| CN03 | `ticket_respuestas_rapidas` | FK compuesta `(contacto_id, cliente_id) → clientes_contactos(id, cliente_id)` — ¿está activa? | Dashboard → Table Editor → ticket_respuestas_rapidas → Foreign Keys | No bloquea P0-bis — solo confirmar que el Dashboard muestra la FK |
| CN04 | `tickets` | `tickets_folio_uidx` y `tickets_token_publico_uidx` presentes | Dashboard → Table Editor → tickets → Indexes | No bloquea — ya confirmados en auditoría, solo verificar |
| CN05 | `ticket_eventos` | ¿RLS habilitado? ¿Policies SELECT/INSERT/UPDATE/DELETE? — **gap: tabla no auditada explícitamente** | Dashboard → SQL Editor (read-only): `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='ticket_eventos'` | Sin evidencia en el paquete | Sí — tabla leída por `estado-ticket-ts` sin JWT; su RLS afecta la superficie pública |
| CN06 | `clientes` + `cliente_accesos` | Policies INSERT/UPDATE/DELETE — **la auditoría P0 solo confirmó SELECT; INSERT/UPDATE/DELETE no auditadas** | Dashboard → SQL Editor: `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('clientes','cliente_accesos') AND cmd IN ('INSERT','UPDATE','DELETE')` | Sin evidencia de su estado | Sí — bloquea aprobación completa de SQL-04/SQL-05 (`dashboard.js:84` INSERT clientes; `ticket.js:168` INSERT/UPDATE en `cliente_accesos`) |
| CN07 | `clientes_contacto_historial` | ¿RLS? ¿Policies? ¿Quién escribe/lee? ¿PII? — **tabla detectada en inventario pero no auditada** | Dashboard → Table Editor → clientes_contacto_historial + `SELECT policyname FROM pg_policies WHERE tablename='clientes_contacto_historial'` | Sin ninguna evidencia | Recomendable antes de P0; no bloquea P0-bis directamente |

---

### 2.4 Logs y tablas operacionales

| # | Tabla / Log | Dónde verificar | Qué verificar | Umbral de alerta |
|---|-------------|----------------|--------------|------------------|
| LG01 | `rate_limit_events` | Dashboard → SQL Editor: `SELECT scope, COUNT(*) FROM rate_limit_events GROUP BY scope` | Scopes activos y volúmenes | Si hay scope distinto a `support_submit` → indica rate limit nuevo activo (no esperado) |
| LG02 | `rate_limit_events` — antigüedad | `SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM rate_limit_events` | Evento más antiguo y más reciente | Evento más antiguo ≥ 2026-04-20; total ≈ 41 filas según auditoría |
| LG03 | `edge_idempotency` | `SELECT status, COUNT(*) FROM edge_idempotency GROUP BY status` | Estados y volúmenes | ≈ 9 completed, 1 failed — si hay `pending` sin expirar, hay una EF colgada |
| LG04 | `edge_idempotency` — edad | `SELECT idempotency_key, status, created_at FROM edge_idempotency ORDER BY created_at DESC LIMIT 5` | Registros más recientes | Si hay registros nuevos (post-auditoría), confirmar que son de `ticket-internal-reply` en uso normal |
| LG05 | `ticket_portal_logs` | `SELECT evento, COUNT(*) FROM ticket_portal_logs GROUP BY evento` | Eventos y volúmenes | Sin patrones anómalos (miles de views en pocos minutos = posible scraping) |
| LG06 | EF Logs en Dashboard | Dashboard → Edge Functions → [EF] → Logs | Errores recientes en EFs críticas | `support-submit-secure`, `estado-ticket-ts`, `ticket-internal-reply`: sin errores nuevos no explicados |

**Resultado bloque Dashboard:** ☐ Todos ✅ → continuar | ☐ Algún ❌ bloqueante → no ejecutar SQL hasta resolver

---

## 3. Checklist por Rol

> Estos tests deben ejecutarse POST-fix para validar que la remediación no rompió ningún flujo. Para cada rol, se necesita una sesión activa con ese rol en el panel.  
> **Antes del fix:** Documentar el estado actual (qué funciona, qué no) para comparar después.

---

### 3.1 Rol `admin`

| # | Test | Acción | Resultado esperado post-fix | Resultado real | ¿OK? |
|---|------|--------|-----------------------------|----------------|------|
| AD01 | Board de tickets | Abrir `tickets.html` | Todos los tickets visibles, sin error | | ☐ |
| AD02 | Detalle de ticket | Abrir `ticket.html` de un ticket existente | Carga completa: datos, contacto, historial, adjuntos | | ☐ |
| AD03 | Lista de clientes | `dashboard.js:142` — lista de clientes en selector | Todos los clientes visibles | | ☐ |
| AD04 | Quick replies en ticket | Abrir editor de QR en `ticket.html` | QRs cargados, se pueden crear y editar | | ☐ |
| AD05 | Sección de contactos en `cliente.html` | Abrir ficha de un cliente con contactos | Contactos visibles (post-P0-bis) | | ☐ |
| AD06 | Aprobación de registro en `registros.html` | Aprobar un registro de prueba | Sin error de RLS — contacto creado o reutilizado | | ☐ |
| AD07 | Sección AnyDesk en `ticket.html` | Abrir sección de accesos remotos | IDs de AnyDesk visibles | | ☐ |
| AD08 | Upload de adjunto en ticket | Subir un archivo desde `ticket.html` | Archivo aparece en historial | | ☐ |
| AD09 | Aprobación de alta en `altas.html` | Aprobar una solicitud de alta de prueba | Sin error — alta aprobada correctamente | | ☐ |
| AD10 | Cierre masivo de tickets | `batchClose` desde `dashboard.html` | Tickets cambian a estado `cerrado` sin error | | ☐ |

---

### 3.2 Rol `soporte`

| # | Test | Acción | Resultado esperado post-fix | Resultado real | ¿OK? |
|---|------|--------|-----------------------------|----------------|------|
| SO01 | Board de tickets | Abrir `tickets.html` | Mismo resultado que admin | | ☐ |
| SO02 | Responder ticket interno | `ticket-internal-reply` desde `ticket.html` | Respuesta registrada, sin duplicados | | ☐ |
| SO03 | Mover ticket de estado | `moveTicket` en `tickets.html` | Estado cambia — sin error (nota: `ticket_eventos` aún no se inserta en este flujo) | | ☐ |
| SO04 | Cerrar ticket | `closeTicket` | Estado `cerrado` — sin error | | ☐ |
| SO05 | Dropdown de contactos | En `ticket.html`, selector de contacto | Contactos del cliente visibles | | ☐ |
| SO06 | Ver contactos de cliente | `cliente.html` → sección contactos | No vacío post-P0-bis | | ☐ |
| SO07 | Sugerencias en altas | `altas.html` — nombres de contactos sugeridos | Nombres visibles (no vacío) | | ☐ |
| SO08 | Sección AnyDesk | `ticket.html` — accesos remotos | IDs de AnyDesk visibles (misma policy que admin) | | ☐ |

---

### 3.3 Rol `ventas`

> Los resultados esperados varían según las decisiones D1 (tickets) y D3 (contactos).

| # | Test | Acción | Si D1=Opción A | Si D1=Opción B | Si D3=SÍ | Si D3=NO |
|---|------|--------|---------------|---------------|---------|---------|
| VE01 | Board de tickets | `tickets.html` | Todos visibles | Solo asignados | — | — |
| VE02 | Dropdown de contactos en ticket | `ticket.html` | — | — | Visible | Vacío |
| VE03 | Sección AnyDesk | `ticket.html` | **Bloqueado** (D2=NO) | **Bloqueado** | — | — |
| VE04 | Lista de clientes | `dashboard.js` selector | Todos visibles | Todos visibles | — | — |
| VE05 | Sección contactos en cliente.html | `cliente.html` | — | — | Visible | Vacío |
| VE06 | Aprobar registro | `registros.html` | — | — | — | — |
| VE07 | Board vacío (Opción B sin asignados) | `tickets.html` con Opción B | — | Vacío si sin asignados | — | — |

---

### 3.4 `authenticated` sin perfil

| # | Test | Acción | Resultado esperado | ¿OK? |
|---|------|--------|--------------------|------|
| AP01 | Acceso al panel con cuenta sin perfil | Iniciar sesión con cuenta de prueba sin fila en `perfiles` | Sesión válida pero todas las queries devuelven vacío o error de RLS | ☐ |
| AP02 | SELECT tickets | SDK: `supabase.from('tickets').select()` | `[]` — vacío, sin error 500 | ☐ |
| AP03 | SELECT clientes | SDK: `supabase.from('clientes').select()` | `[]` — vacío | ☐ |
| AP04 | INSERT en clientes_contactos | SDK: `supabase.from('clientes_contactos').insert(...)` | Error de RLS — no puede insertar | ☐ |
| AP05 | SELECT clientes_contactos | SDK: `supabase.from('clientes_contactos').select()` | `[]` — vacío | ☐ |

---

### 3.5 `anon` (sin sesión)

| # | Test | Acción | Resultado esperado | ¿OK? |
|---|------|--------|--------------------|------|
| AN01 | Acceso directo al panel sin sesión | Abrir `tickets.html` sin login | Redirigido a login (lógica JS del panel) | ☐ |
| AN02 | SDK directo sin sesión | `supabase.from('tickets').select()` desde consola sin sesión | `[]` o error de permisos | ☐ |
| AN03 | POST a `support-submit-secure` | Envío de formulario de soporte | Éxito (endpoint público) | ☐ |
| AN04 | POST a `match-cliente` | Búsqueda de cliente desde `soporte.html` | Resultado con candidatos (endpoint público sin auth) | ☐ |
| AN05 | GET a `estado-ticket-ts` con token válido | URL con folio+token reales | Portal del cliente visible | ☐ |
| AN06 | GET a `estado-ticket-ts` sin token | URL sin token o con token incorrecto | Error 401/404 de la EF | ☐ |

---

### 3.6 Cliente con token válido (portal público)

| # | Test | Acción | Resultado esperado | ¿OK? |
|---|------|--------|--------------------|------|
| PT01 | Abrir portal | `estado.html?folio=X&token=Y` con datos válidos | Carga historial del ticket, sin error | ☐ |
| PT02 | Ver adjuntos del ticket | Click en archivo adjunto del ticket | Signed URL válida, descarga correcta | ☐ |
| PT03 | Enviar respuesta desde portal | Formulario de respuesta en `estado.html` | Respuesta registrada, aparece en historial | ☐ |
| PT04 | Historial visible | Sección de eventos del ticket en portal | Solo eventos con `visibilidad='publica'` | ☐ |

---

### 3.7 Cliente con token inválido

| # | Test | Acción | Resultado esperado | ¿OK? |
|---|------|--------|--------------------|------|
| TI01 | URL con token incorrecto | `estado.html?folio=X&token=INCORRECTO` | La EF devuelve error — portal no carga | ☐ |
| TI02 | URL con folio incorrecto | `estado.html?folio=99999&token=Y` | La EF devuelve error — portal no carga | ☐ |
| TI03 | URL sin parámetros | `estado.html` sin folio ni token | Error o pantalla de "folio requerido" | ☐ |

---

### 3.8 Cliente con token expirado

| # | Test | Acción | Resultado esperado | ¿OK? |
|---|------|--------|--------------------|------|
| TE01 | URL con token expirado | `estado.html?folio=X&token=Y` con `token_publico_expira < now()` | La EF rechaza el acceso — portal no carga | ☐ |
| TE02 | Renovación de token | El staff regenera el token desde el panel | Nuevo `token_publico` generado con nueva expiración de 30 días | ☐ |

---

## 4. Checklist UI antes / después

> Completar la columna "Estado ANTES" con el estado actual (antes del fix). Completar "Estado DESPUÉS" inmediatamente tras aplicar cada script. Si el estado después es peor que antes, es criterio de rollback.

| # | Pantalla / Flujo | Acción de prueba | Estado ANTES del fix | Estado DESPUÉS del fix | ¿Regresión? |
|---|-----------------|-----------------|----------------------|------------------------|-------------|
| UI01 | `soporte.html` — crear ticket | Completar y enviar formulario de soporte | Funciona ✅ / Falla ❌ | | ☐ |
| UI02 | `soporte.html` — match de cliente | Campo de empresa autocompleta candidatos | Funciona ✅ | | ☐ |
| UI03 | `tickets.html` — listar tickets | Board kanban carga con datos | Funciona ✅ | | ☐ |
| UI04 | `tickets.html` — mover ticket | Drag & drop o botón de cambio de estado | Funciona ✅ | | ☐ |
| UI05 | `tickets.html` — cerrar ticket | Botón de cierre individual | Funciona ✅ | | ☐ |
| UI06 | `tickets.html` — cierre masivo | Seleccionar varios y cerrar | Funciona ✅ | | ☐ |
| UI07 | `ticket.html` — abrir detalle | Click en ticket del board | Carga completa ✅ | | ☐ |
| UI08 | `ticket.html` — cargar contacto vinculado | Header del ticket muestra contacto | **Vacío ❌** (P0-bis roto) | Visible ✅ esperado | ☐ |
| UI09 | `ticket.html` — dropdown de contactos | Selector de contacto del cliente | **Vacío ❌** (P0-bis roto) | Visible ✅ esperado | ☐ |
| UI10 | `ticket.html` — quick replies | Panel de respuestas rápidas | Funciona ✅ | | ☐ |
| UI11 | `ticket.html` — subir adjunto | Upload de archivo a ticket | Funciona ✅ | | ☐ |
| UI12 | `ticket.html` — sección AnyDesk | Accesos remotos del cliente | Funciona para admin/soporte ✅ | | ☐ |
| UI13 | `ticket.html` — respuesta interna | `ticket-internal-reply` EF | Funciona ✅ | | ☐ |
| UI14 | `estado.html` — portal del cliente | Abrir con folio+token válido | Funciona ✅ | | ☐ |
| UI15 | `estado.html` — responder desde portal | Formulario de respuesta del cliente | Funciona ✅ | | ☐ |
| UI16 | `cliente.html` — cargar contactos | Sección de contactos de la ficha | **Vacío ❌** (P0-bis roto) | Visible ✅ esperado | ☐ |
| UI17 | `registros.html` — aprobar registro | Botón de aprobación | **Error visible ❌** (P0-bis roto) | Sin error ✅ esperado | ☐ |
| UI18 | `altas.html` — sugerencias de contacto | Columna de contacto sugerido en tabla | **Vacío ❌** (P0-bis roto) | Nombre visible ✅ esperado | ☐ |
| UI19 | `altas.html` — aprobar alta | EF `alta-aprobar` — funciona por EF | Funciona ✅ (usa EF, no RLS) | Sigue funcionando ✅ | ☐ |
| UI20 | Filtros y KPIs en dashboard | Contadores de tickets por estado | Funciona ✅ | | ☐ |
| UI21 | Kanban sin duplicados | Tickets no aparecen duplicados en board | Funciona ✅ | | ☐ |
| UI22 | Búsqueda de clientes | ILIKE en `tickets.js:255` | Funciona ✅ | | ☐ |

**Regla de regresión:** Si cualquier ítem que era ✅ antes pasa a ❌ después → rollback inmediato del script correspondiente.

---

## 5. Checklist de Rollback

### 5.1 Qué revertir si RLS rompe la UI

| Síntoma | Causa probable | SQL de rollback |
|---------|---------------|-----------------|
| Board de tickets vacío para TODOS los roles | Policy `tickets_select_staff` con error en EXISTS | `DROP POLICY tickets_select_staff ON tickets; CREATE POLICY "tickets_select_auth" ON tickets FOR SELECT TO authenticated USING (true);` |
| Board vacío solo para `ventas` (con Opción B) | `qual` de la policy ventas no captura los tickets | Cambiar a Opción A o corregir el `qual` de ventas |
| Quick replies desaparecen para admin/soporte | DROP de policies de `ticket_respuestas_rapidas` eliminó también las correctas | Re-crear las policies correctas con nombres originales |
| Aprobación de registros sigue fallando post-P0-bis | Policy `cc_insert_staff` no se creó correctamente | Verificar con `SELECT * FROM pg_policies WHERE tablename='clientes_contactos'` y re-ejecutar la creación |
| Sección AnyDesk vacía para admin/soporte | Error en `cliente_accesos_select_staff` | DROP + CREATE con roles `('admin','soporte')` |
| Carga de clientes falla para todos | Error en `clientes_select_staff` | DROP + `CREATE POLICY clientes_select_auth ON clientes FOR SELECT TO authenticated USING (true)` |

### 5.2 Qué revertir si Edge Function falla

| Síntoma | Causa probable | Acción de rollback |
|---------|---------------|-------------------|
| `support-submit-secure` devuelve 500 | Deploy nuevo con error de código | Redesplegar versión anterior desde repo (`git stash` o branch previo) |
| `ticket-internal-reply` devuelve 500 | Deploy post-fix con error | Redesplegar desde backup pre-fix: `DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts` |
| `match-cliente` devuelve 401 inesperado | Fix de header x-service-key no coordinado con `soporte.js` | Redesplegar versión anterior de la EF + revertir cambio en `soporte.js` |
| `estado-ticket-ts` devuelve 500 | Cambio de código o variable de entorno | Verificar Logs en Dashboard → redesplegar versión anterior |
| EF recién deployada devuelve 429 a todos | Rate limit demasiado restrictivo | Ajustar límite en código y redesplegar |

### 5.3 Qué revertir si Storage falla

| Síntoma | Causa probable | Acción de rollback |
|---------|---------------|-------------------|
| Upload de adjuntos en ticket.html falla para staff | Policy INSERT de `soporte_adjuntos` demasiado restrictiva | Dashboard → Storage → soporte_adjuntos → Policies → editar policy INSERT para incluir `authenticated` |
| Signed URLs no generan o dan 403 | Bucket cambiado a público y policy SELECT bloqueada accidentalmente | Verificar bucket tipo (debe ser Private) → corregir policy |
| Upload en `cliente.html` falla | Policy INSERT de `certificados` no cubre `authenticated` | Dashboard → Storage → certificados → Policies → agregar INSERT para authenticated |
| `altas_tmp` rechaza upload de EF | Policy INSERT solo permite authenticated pero la EF usa service_role | Agregar service_role a la policy INSERT |

### 5.4 Criterio definitivo para detener remediación

**Detener y hacer rollback inmediato si:**

| # | Condición | Por qué detener |
|---|-----------|-----------------|
| STOP-01 | El board de `tickets.html` está completamente vacío para admin/soporte | El sistema de soporte es inutilizable para el equipo |
| STOP-02 | No se pueden crear tickets nuevos | Flujo core de negocio roto |
| STOP-03 | Los quick replies desaparecen para admin/soporte | Herramienta crítica de velocidad de soporte rota |
| STOP-04 | El formulario público `soporte.html` devuelve error | El canal de ingreso de tickets de clientes está caído |
| STOP-05 | El portal `estado.html` con token válido devuelve error | Los clientes no pueden consultar sus tickets |
| STOP-06 | `ticket-internal-reply` devuelve error consistente | El equipo no puede responder tickets internamente |
| STOP-07 | Cualquier query devuelve error 500 (no 403/empty) | Indica error de servidor, no de permisos esperados |

### 5.5 Criterio para continuar si los errores son esperados por seguridad

**Continuar (estos NO son criterios de rollback):**

| # | Error observado | Interpretación correcta |
|---|----------------|------------------------|
| CONT-01 | Sección AnyDesk vacía para `ventas` | Correcto — D2=NO excluye ventas de `cliente_accesos` |
| CONT-02 | Board de tickets muestra menos tickets para `ventas` | Correcto — Opción B filtra por asignados |
| CONT-03 | `INSERT INTO clientes_contactos` da error para `ventas` | Correcto — ventas no tiene INSERT policy |
| CONT-04 | `SELECT clientes_contactos` devuelve `[]` para un usuario sin perfil | Correcto — EXISTS(perfiles) devuelve false |
| CONT-05 | Un usuario con `activo=false` en perfiles no puede acceder a datos | Correcto — la condición `p.activo = true` en el EXISTS lo excluye |
| CONT-06 | Políticas de `ticket_match_decisiones` eliminadas — la tabla devuelve vacío en SELECT JS | Correcto — no hay referencias en PANEL JS; la EF usa service_role |
| CONT-07 | `altas.js` sugerencias de contacto aparecen vacías si el cliente no tiene contactos en BD | Correcto — no es error de RLS, es que no hay datos |

---

## 6. Semáforo de Ejecución

### 🟢 Verde — Condiciones mínimas para ejecutar P0-bis (clientes_contactos)

Se puede ejecutar P0-bis cuando SE CUMPLAN TODAS las siguientes condiciones:

| # | Condición | Verificación |
|---|-----------|-------------|
| V01 | Decisión D3 tomada (¿ventas ve clientes_contactos?) | Documento con la decisión firmada o registrada |
| V02 | Decisión D4 tomada (¿registros.js migra a EF?) | Idem |
| V03 | Backup de policies de `clientes_contactos` exportado y guardado | Resultado de query B01 copiado |
| V04 | SQL de rollback P0-bis disponible y validado sintácticamente | `DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md §4.3` revisado — *externo al paquete Fable* |
| V05 | Sesión de admin disponible para prueba inmediata post-fix | Al menos una cuenta admin con sesión activa para testear |
| V06 | Tests UI01–UI22 tienen estado ANTES documentado | Al menos UI08, UI09, UI16, UI17, UI18 documentados como `❌` (roto) |
| V07 | El SQL Editor del Dashboard está en el proyecto correcto | Nombre del proyecto visible y confirmado |
| V08 | No hay cambios de EF en curso simultáneamente | Ningún deploy en progreso en el momento de ejecutar el SQL |

**Semáforo:** Si los 8 ítems son ✅ → 🟢 Ejecutar P0-bis

---

### 🟡 Amarillo — Condiciones para ejecutar solo en ventana controlada

Ejecutar P0 (tickets, clientes, cliente_accesos, ticket_respuestas_rapidas) solo cuando:

| # | Condición | Verificación |
|---|-----------|-------------|
| A01 | P0-bis ya aplicado y validado (UI17 pasa de ❌ a ✅) | Tests post-P0-bis completados |
| A02 | Decisión D1 tomada (Opción A o B para ventas en tickets) | Documento con la decisión |
| A03 | Decisión D2 tomada (ventas en cliente_accesos) | Idem |
| A04 | Backup de policies de las 4 tablas P0 exportado | Resultado de queries B02–B05 copiados |
| A05 | SQL de rollback P0 disponible por tabla | `DB/rls_p0_preflight_remediation_2026_06_15.md §7` revisado — *externo al paquete Fable* |
| A06 | Ventana de mantenimiento acordada (fuera de horario pico) | Horario definido y comunicado al equipo |
| A07 | Verificación visual de Storage completada (GA-1, GA-2, GA-3) | Las 3 políticas de buckets verificadas en Dashboard |
| A08 | Verificación visual de EF deploy completada (GV-4, GV-5, GV-6) | quick-function, super-service y ticket-internal-reply verificados |

**Semáforo:** Si los 8 ítems son ✅ → 🟡 Ejecutar P0 en ventana controlada con monitoreo

---

### 🔴 Rojo — Condiciones para NO ejecutar

Suspender toda ejecución si se cumple CUALQUIERA de las siguientes condiciones:

| # | Condición de bloqueo | Razón |
|---|---------------------|-------|
| R01 | Hay usuarios activos en el sistema en el momento de ejecutar | Riesgo de que un usuario vea error durante la ventana de cambio |
| R02 | El backup de policies no pudo exportarse (error en Dashboard SQL) | Sin backup no hay rollback documentado |
| R03 | Alguna decisión humana mínima (D1, D2, D3, D4) no está tomada | El SQL no puede finalizarse sin la decisión — ejecutarlo en borrador puede ser incorrecto |
| R04 | Las policies "correctas" de `ticket_respuestas_rapidas` no pueden confirmarse antes del DROP | Riesgo de dejar la tabla sin acceso para admin/soporte |
| R05 | Se detectan invocaciones externas no documentadas en `quick-function` o `super-service` | Retirarlas puede romper una integración externa desconocida |
| R06 | El Dashboard muestra un Storage bucket como `Public` donde se esperaba `Private` | Indica que las Storage policies pueden estar en un estado muy diferente al esperado — auditar antes de tocar RLS |
| R07 | Hay un deploy de EF en curso o reciente no documentado | El estado de producción puede diferir del repo — no ejecutar SQL hasta entender el cambio |
| R08 | El sistema de soporte tiene un incidente activo (tickets urgentes en proceso) | No ejecutar cambios de RLS durante un incidente — priorizar resolución |

**Semáforo:** Si CUALQUIER ítem R0x se activa → 🔴 No ejecutar. Resolver el bloqueo primero.

---

## 7. Tabla Final Consolidada

| # | Área | Validación | Estado esperado | Evidencia requerida | Responsable | ¿Bloquea ejecución? |
|---|------|-----------|-----------------|---------------------|-------------|---------------------|
| 01 | Repositorio | Rama `audit/supabase-flows` activa | Confirmado | `git branch --show-current` | Dev / Líder técnico | **Sí** |
| 02 | Repositorio | Working tree limpio (solo docs) | Sin JS/TS modificados | `git status --short` | Dev | **Sí** |
| 03 | BD — Backup | Policies de `clientes_contactos` exportadas | 1 policy: `deny_all_clientes_contactos` | Texto copiado del Dashboard SQL | Dev / DBA | **Sí — P0-bis** |
| 04 | BD — Backup | Policies de `tickets` exportadas | 2 policies SELECT `qual=true` duplicadas | Texto copiado del Dashboard SQL | Dev / DBA | **Sí — P0** |
| 05 | BD — Backup | Policies de `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas` exportadas | Según auditoría (1, 1, 6 abiertas) | Texto copiado | Dev / DBA | **Sí — P0** |
| 06 | BD — Rollback | SQL de rollback P0-bis disponible | Script listo en documento de plan | `plan_rls_p0_bis §4.3` — *externo al paquete Fable* | Dev | **Sí — P0-bis** |
| 07 | BD — Rollback | SQL de rollback P0 disponible por tabla | Scripts listos en preflight | `rls_p0_preflight §7` — *externo al paquete Fable* | Dev | **Sí — P0** |
| 08 | BD — Estado | `perfiles` tiene policy `self_select` activa | Policy SELECT con `id = auth.uid()` | `SELECT * FROM pg_policies WHERE tablename='perfiles'` | Dev / DBA | **Sí** |
| 09 | BD — Estado | Policies positivas de `ticket_respuestas_rapidas` verificadas antes de DROP — **su existencia no fue confirmada en auditoría** | Al menos 2 policies positivas (admin/soporte) con nombres distintos a los 6 abiertos — o crearlas antes del DROP | `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='ticket_respuestas_rapidas'` | Dev / DBA | **Sí — P0** |
| 10 | Decisiones | D3: ¿ventas ve clientes_contactos? | Decisión registrada | Documento / email / nota | Dueño del negocio | **Sí — P0-bis** |
| 11 | Decisiones | D4: ¿registros.js migra a EF? | Decisión registrada | Idem | Líder técnico / arquitecto | **Sí — P0-bis** |
| 12 | Decisiones | D1: ¿ventas ve todos los tickets? | Decisión registrada | Idem | Dueño del negocio | **Sí — P0** |
| 13 | Decisiones | D2: ¿ventas ve cliente_accesos? | Decisión registrada | Idem | Seguridad / negocio | **Sí — P0** |
| 14 | Decisiones | D5: ¿activar Turnstile? | Decisión registrada | Idem | Negocio | No (P2) |
| 15 | Decisiones | D6: ¿match-cliente usa x-service-key? | Decisión registrada | Idem | Arquitecto / seguridad | No (P1) |
| 16 | Storage | Bucket `soporte_adjuntos` — policies auditadas | INSERT authenticated + SELECT sin acceso anon | Dashboard visual | Dev | **Sí — P1-6** |
| 17 | Storage | Bucket `altas_tmp` — policies auditadas | INSERT solo service_role | Dashboard visual | Dev | No (P1-6) |
| 18 | Storage | Bucket `certificados` — policies auditadas | INSERT authenticated + SELECT sin anon | Dashboard visual | Dev | **Sí — P1-6** |
| 19 | Storage | Ningún bucket activo es `Public` | Todos `Private` | Dashboard → Storage → tipo de bucket | Dev | **Sí** |
| 20 | EF Deploy | `quick-function` — verificar logs | 0 invocaciones externas en 7 días | Dashboard → EF → Logs | Dev | **Sí — P0** |
| 21 | EF Deploy | `super-service` — verificar logs | 0 invocaciones en 7 días | Dashboard → EF → Logs | Dev | **Sí — P1-3** |
| 22 | EF Deploy | `ticket-internal-reply` — fecha deploy | Posterior a 2026-06-13 | Dashboard → EF → fecha | Dev | No (P1-7) |
| 23 | Operacional | `edge_idempotency` — sin pending colgados | Solo `completed` y `failed` | `SELECT status, COUNT(*) FROM edge_idempotency GROUP BY status` | Dev / DBA | No |
| 24 | Operacional | `rate_limit_events` — scopes esperados | Solo `support_submit` activo | `SELECT scope, COUNT(*) FROM rate_limit_events GROUP BY scope` | Dev | No |
| 25 | Operacional | No hay incidente activo en el sistema | Sin tickets urgentes abiertos en proceso | Estado del board de tickets | Soporte | **Sí** |
| 26 | Operacional | Ventana de mantenimiento acordada | Horario fuera de pico definido | Comunicación al equipo | Líder / manager | **Sí — P0** |
| 27 | UI — Pre-fix | Estado "ANTES" documentado para UI08, UI09, UI16, UI17, UI18 | Todos ❌ (rotos por P0-bis) | Este mismo checklist completado | Dev / QA | **Sí — P0-bis** |
| 28 | UI — Post-fix | Tests AD01–AD10 (admin) ejecutados | Todos ✅ | Este mismo checklist completado | Dev / QA | Sí (post-ejecución) |
| 29 | UI — Post-fix | Tests SO01–SO08 (soporte) ejecutados | Todos ✅ | Este mismo checklist completado | Dev / QA | Sí (post-ejecución) |
| 30 | UI — Post-fix | Tests VE01–VE07 (ventas) ejecutados | Según D1 y D3 | Este mismo checklist completado | Dev / QA | Sí (post-ejecución) |
| 31 | Rollback | Script de rollback P0-bis ejecutable en <2 min | Probado en lectura — no ejecutar todavía | Lectura del script `plan_rls_p0_bis §4.3` — *externo al paquete Fable* | Dev / DBA | **Sí — P0-bis** |
| 32 | Rollback | Script de rollback P0 ejecutable por tabla | Probado en lectura | Lectura del script `rls_p0_preflight §7` — *externo al paquete Fable* | Dev / DBA | **Sí — P0** |
| 33 | Seguridad | `SUPABASE_SERVICE_ROLE_KEY` ausente en PANEL/*.js | 0 resultados en grep | `grep -r "service_role" PANEL/` | Dev | **Sí** |
| 34 | Seguridad | Ninguna EF nueva fue desplegada sin código commiteado | EF deployadas coinciden con el repo | Dashboard EF vs repo | Dev | **Sí** |

---

*Documento generado: 2026-06-15 | Rama: audit/supabase-flows | Modo estricto: solo documentación*  
*Complementa: `06_prompt_final_para_fable.md` y `08_scope_ampliado_para_fable.md`*
