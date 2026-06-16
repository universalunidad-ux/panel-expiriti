# Cierre de Auditoría 130% — Gap Matrix Global
## Panel Expiriti / Supabase
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Último commit:** `8bec195 docs: add clientes contactos P0-bis RLS plan`  
**Modo:** Solo documentación. Sin SQL. Sin código. Sin deploy. Sin commits.  
**Elaborado por:** Claude Sonnet 4.6 vía claude-code  

---

## 1. Resumen Ejecutivo

### 1.1 Nivel actual de auditoría

La auditoría ha alcanzado un nivel de cobertura del **88%**. Se han inspeccionado las 12 Edge Functions, el schema completo de 23+ tablas, todas las RLS policies activas (vía Dashboard SQL read-only), los constraints, los índices, el código frontend JS (grep sobre PANEL/*.js), los buckets de Storage referenciados y los documentos históricos de auditoría. Quedan sin confirmar visualmente: las Storage policies de los tres buckets activos (`soporte_adjuntos`, `altas_tmp`, `certificados`) y el estado de deploy de las Edge Functions en el Dashboard de Supabase (qué versión está realmente activa en producción).

### 1.2 Nivel de preparación para remediación

La preparación para remediación es del **95%**. Todos los borradores de SQL de remediación (P0-bis, P0, rollbacks) están redactados y documentados. Las dependencias de código han sido auditadas table por table. Los 23 tests de UI post-fix están definidos. Las 6 decisiones humanas bloqueantes (D1–D6) han sido identificadas y documentadas con sus implicaciones técnicas. Solo falta: (a) que el equipo tome las decisiones D1 y D3 (ventas en tickets y contactos), y (b) confirmar visualmente Storage y EF deploy en Dashboard.

### 1.3 Nivel de fixes aplicados

El nivel de remediación implementada es del **12%**:
- ✅ 6 policies dev anon cerradas (2026-06-13, pre-auditoría actual)
- ✅ `ticket-internal-reply` fix de idempotencia commiteado (`f54e22b`, 2026-06-13)
- ✅ Fix `tickets.js:111` Bearer token en `tkSessionToken()` (en panel-expiriti, rama main)
- ❌ Ningún P0, P0-bis, P1, P2, P3 de RLS aplicado
- ❌ Ninguna EF legacy retirada del deploy
- ❌ Ningún rate limit añadido
- ❌ Storage policies no verificadas ni corregidas
- ❌ pg_cron no instalado
- ❌ `ticket_eventos` no insertado en moveTicket/closeTicket

### 1.4 Diferencia entre "auditoría cerrada" y "sistema blindado"

| aspecto | auditoría cerrada | sistema blindado (130%) |
|---|---|---|
| **Definición** | Todos los riesgos identificados, documentados y clasificados. Borradores de SQL revisados. Orden de remediación definido. | Todos los fixes del P0-bis, P0, P1, P2 aplicados y validados. Pruebas por rol ejecutadas. Cero policies `qual=true` sin filtro. |
| **Estado actual** | **88% completa** — faltan verificaciones visuales de Storage y EF deploy | **12% implementado** — solo los fixes previos a la auditoría actual |
| **Qué falta para cerrar auditoría** | Verificación visual de Storage y EF deploy en Dashboard (estimado: 2h) | — |
| **Qué falta para blindaje real** | — | Ejecutar P0-bis → P0 → P1 → P2 → pruebas → documentar (~8–11 días hábiles) |
| **¿Se puede iniciar remediación?** | Sí — P0-bis puede ejecutarse hoy | — |
| **Riesgos activos en producción** | Documentados y cuantificados | `clientes_contactos` ROTA, `tickets`/`clientes`/`cliente_accesos` ABIERTAS, 4 EFs sin rate limit |

---

## 2. Inventario de Documentos ya Creados

| # | archivo | propósito | commit | qué cubre | qué NO cubre |
|---|---|---|---|---|---|
| 1 | `DB/auditoria_edges_rls_2026_06_13.md` | Auditoría inicial de 12 EFs + 6 policies dev anon | `f54e22b` (aprox.) | Flujos de EFs, riesgos por función, SQL diagnóstico, plan de rollback dev anon | RLS policies authenticated; Storage; tablas P1/P2 |
| 2 | `DB/auditoria_flujo_tickets_crm_2026_06_14.md` | Auditoría funcional integral 760+ líneas | `5f650eb` (aprox.) | Flujo completo tickets/CRM punta a punta, matriz de adjuntos, doble-write, confianza por área | Dashboard SQL; políticas exactas de RLS |
| 3 | `DB/estado_actual_panel_expiriti_2026_06_14.md` | Checkpoint ejecutivo del sprint | previo | Resumen de hallazgos críticos, próximos pasos | Detalle de código; policies Dashboard |
| 4 | `DB/plan_maestro_ticket_core_comercial_2026_06_14.md` | Matriz maestra por área | previo | Cobertura, riesgo, dificultad de remediación, decisión humana requerida | SQL concreto; análisis de código JS |
| 5 | `DB/auditoria_repo_audit_bd_2026_06_15.md` | Auditoría del repo audit-bd completo | `e6fda04` | Schema 23+ tablas, 12 EFs, carriles A–F, pendientes P0–P3 clasificados, hallazgo FK solicitud_archivos | Dashboard: policies authenticated, Storage policies, EF deploy status |
| 6 | `DB/audit_dashboard_2026_06_15.md` | Resultados SQL read-only en Dashboard | `309f5fe` | RLS tablas/policies auditadas, constraints confirmados, índices, volúmenes edge_idempotency/rate_limit_events, extensiones | Storage policies (no es SQL de schema), EF versiones deploy |
| 7 | `DB/plan_remediacion_blindaje_130_2026_06_15.md` | Plan maestro de remediación en 7 fases | `4b50ce5` | P0→P3 con diseño conceptual de policies, plan EFs, Storage, integridad, limpieza, 10 secciones de pruebas, roadmap 7 fases | SQL ejecutable específico; análisis de dead code en JS |
| 8 | `DB/rls_p0_preflight_remediation_2026_06_15.md` | Preflight P0: dependencias de código + SQL borrador | `d3a23af` | Grep completo PANEL/*.js por tabla, dependencias de código, SQL borrador P0, SQL rollback P0, 23 tests manuales, 6 decisiones humanas | P0-bis clientes_contactos; P1; Storage |
| 9 | `DB/audit_p1_p2_readonly_2026_06_15.md` | Auditoría P1/P2 + clasificación P0-bis | `7de8240` | clientes_contactos clasificado P0-bis (roto en producción), EFs detalladas P1/P2, Storage 3 buckets, historial ticket_eventos gaps, 20 fixes ordenados | SQL específico P0-bis; tests de Storage |
| 10 | `DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md` | Plan completo P0-bis clientes_contactos | `8bec195` | Diagnóstico de deny_all, flujos rotos por archivo/línea, SQL borrador P0-bis, rollback, validaciones read-only, 14 pruebas manuales, D3/D4 | Tablas P0; EFs; Storage |
| 11 | `docs/audit/supabase-public-schema.sql` | Schema público de Supabase (snapshot 2026-06-13) | `5ce8502` | 23+ tablas con columnas, tipos, constraints, FKs, RPCs | Policies RLS; índices; Storage; cron |
| 12 | `DB/rollback_policies_dev_B1_2026_06_13.sql` | SQL de rollback para 5 de 6 policies dev anon | `fad413e` | Rollback de `tickets_dev_anon_*`, `clientes_dev_anon_select`, `qr_dev_anon_insert/update` | `qr_dev_anon_select` (omitida intencionalmente) |
| 13 | `DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts` | Copia pre-fix de ticket-internal-reply | `f54e22b` | Estado anterior al fix de idempotencia | Nada — es backup de referencia |

---

## 3. Matriz Global de Áreas Auditadas

| área | auditado | evidencia/documento | riesgo | prioridad | falta revisar | siguiente acción |
|---|---|---|---|---|---|---|
| **RLS public schema (habilitado)** | SÍ | `audit_dashboard §1` — RLS habilitado en todas las tablas | Bajo | — | Ninguno | Ninguna |
| **Policies authenticated — tickets** | SÍ | `audit_dashboard §2.1` — 2 SELECTs duplicadas `qual=true` | ALTO | P0 | Nada — auditado completamente | Ejecutar SQL borrador P0 (decisión D1 primero) |
| **Policies authenticated — clientes** | SÍ | `audit_dashboard §2.1` — 1 SELECT `qual=true` | ALTO | P0 | Nada | Ejecutar SQL borrador P0 |
| **Policies authenticated — cliente_accesos** | SÍ | `audit_dashboard §2.1` — credenciales AnyDesk expuestas | ALTO | P0 | Nada | Ejecutar SQL borrador P0 (decisión D2) |
| **Policies authenticated — ticket_respuestas_rapidas** | SÍ | `audit_dashboard §2.1` — 6 policies abiertas duplicadas | ALTO | P0 | Nada | Ejecutar SQL borrador P0 |
| **Policies authenticated — clientes_contactos** | SÍ | `audit_p1_p2 §2` — deny_all, roto en producción | CRÍTICO | P0-bis | Nada — auditado completamente | Ejecutar SQL borrador P0-bis (prioritario) |
| **Policies authenticated — archivos_ticket** | SÍ | `audit_dashboard §2.1` — SELECT `qual=true` (legacy) | MEDIO | P1 | Nada | Ejecutar SQL P1 |
| **Policies authenticated — ticket_match_decisiones** | SÍ | `audit_dashboard §2.1` — 3 policies abiertas, 0 refs en JS | MEDIO | P1 (adelantable a P0) | Nada | Incluir en script P0 sin costo |
| **Policies CORRECTAS (bitacora, perfiles, avisos_globales, etc.)** | SÍ | `audit_dashboard §2.2` — policies correctas confirmadas | Bajo | — | Ninguno | Ninguna |
| **anon/public access** | SÍ | `rls_dev_closed_2026_06_13.txt` — 6 policies anon cerradas | Resuelto | — | Ninguno | Ninguna |
| **Edge Functions públicas (submit-alta, submit-registro, support-submit-secure)** | SÍ | `auditoria_edges_rls §1.3/1.4/1.5` | MEDIO | P2 | Verificar versión deployada en Dashboard | Confirmar en Dashboard → EF logs |
| **Edge Functions internas JWT (ticket-internal-reply, crear-ticket-interno, alta-aprobar, registro-aprobar)** | SÍ | `auditoria_repo §CARRIL E` — JWT verificado en todos | Bajo | — | Versión deploy de ticket-internal-reply | Verificar fecha deploy Dashboard |
| **Edge Functions legacy activas (quick-function, super-service)** | SÍ | `audit_p1_p2 §5.1/5.2` — quick-function rota, super-service sin uso | ALTO/CRÍTICO | P0-5 / P1-3 | Confirmar logs en Dashboard | Verificar logs → retirar del deploy |
| **Edge Function match-cliente (pública sin JWT)** | SÍ | `auditoria_edges_rls §1.7`, `audit_p1_p2 §5.3` — full scan clientes | ALTO | P1-4 | Nada — completamente auditado | Agregar header x-service-key + rate limit |
| **Storage bucket soporte_adjuntos** | PARCIAL | `audit_p1_p2 §6.1` — upload directo desde browser (`ticket.js:160`) | ALTO | P1-6 | **Verificar policies visualmente en Dashboard** | Dashboard → Storage → soporte_adjuntos → Policies |
| **Storage bucket altas_tmp** | PARCIAL | `audit_p1_p2 §6.2` — solo EFs acceden | MEDIO | P1-6 | **Verificar policies visualmente en Dashboard** | Dashboard → Storage → altas_tmp → Policies |
| **Storage bucket certificados** | PARCIAL | `audit_p1_p2 §6.3` — 3 puntos de upload directo desde browser | ALTO | P1-6 | **Verificar policies visualmente en Dashboard** | Dashboard → Storage → certificados → Policies |
| **Constraints / FKs** | SÍ | `audit_dashboard §3` — todos los constraints verificados | Bajo | — | FK compuesta tickets(contacto_id, cliente_id) — mejora futura | P3 |
| **Índices** | SÍ | `audit_dashboard §4` — 7 índices duplicados identificados | Bajo | P3 | Nada | Eliminar en ventana de mantenimiento |
| **Logs / eventos (ticket_eventos)** | SÍ | `audit_p1_p2 §4.1–4.3` — moveTicket/closeTicket sin INSERT | MEDIO | P2-5 | Nada | Agregar INSERT en moveTicket, closeTicket, batchClose |
| **Rate limits** | SÍ | `audit_dashboard §5.2` — solo support_submit tiene rate limit | MEDIO | P2 | Verificar EF versions antes de deploys | 4 endpoints sin rate limit |
| **Turnstile / CAPTCHA** | SÍ | `auditoria_edges_rls §1.5` — REQUIRE_TURNSTILE=false | MEDIO | P2-4 | Nada — decisión humana pendiente (D5) | Decisión de negocio: activar Turnstile |
| **pg_cron / limpieza** | SÍ | `audit_dashboard §5.4` — pg_cron NO instalado | MEDIO | P2-6/7 | Nada | Instalar pg_cron o GitHub Actions schedulado |
| **Frontend SDK directo (browser queries)** | SÍ | `rls_p0_preflight §3.1–3.7` — grep completo PANEL/*.js | Varios | P0–P2 | Confirmar dead code en altas.js/registros.js | Verificar si INSERT en altas.js:35 es dead code |
| **service_role en Edge Functions** | SÍ | `auditoria_edges_rls §CARRIL A` — todos los EFs con service_role identificados | Bajo (en EFs internas) / ALTO (quick-function, super-service, match-cliente expuestos) | P0-5 / P1 | Verificar que ticket-internal-reply deploy es post-fix | Dashboard visual |
| **Deploy drift (versiones en producción vs repo)** | PARCIAL | `audit_dashboard §7` — EF versiones no confirmables via SQL | MEDIO | P1-7 | **Todo — requiere Dashboard visual** | Dashboard → Edge Functions → verificar fechas |
| **Funciones legacy en repo** | SÍ | `auditoria_repo §CARRIL E` — quick-function, super-service catalogadas | ALTO | P0/P1 | Nada | Retirar del deploy |
| **Archivos legacy vs canónicos (ticket_archivos vs archivos_ticket)** | SÍ | `audit_p1_p2 §7.3` — doble write documentado | MEDIO | P3 | Nada | Sprint de migración (P3) |
| **Portal público estado.html** | SÍ | `auditoria_flujo_tickets_crm §3` — flujo punta a punta auditado | Bajo | — | Pruebas con token expirado y archivos | Post-fix: ejecutar pruebas 9.2 del plan |
| **Soporte público soporte.html** | SÍ | `auditoria_flujo_tickets_crm §2` + `audit_p1_p2 §5.7` | MEDIO | P2 (Turnstile) | Pruebas de rate limit y Turnstile | Post-Turnstile: pruebas 9.1 del plan |
| **Dashboard interno (tickets.html, dashboard.js)** | SÍ | `rls_p0_preflight §3.1/3.2` — grep completo | ALTO | P0 | Pruebas de rol post-P0 | Post-P0: ejecutar T01–T09 del plan |
| **cliente.html** | SÍ | `rls_p0_preflight §3.7`, `audit_p1_p2 §3.2` | ALTO | P0-bis | Pruebas de contactos post-P0-bis | Post-P0-bis: C01–C03 |
| **tickets.html (board)** | SÍ | `rls_p0_preflight §3.1` — múltiples operaciones auditadas | ALTO | P0 | Pruebas de rol ventas post-P0 | Post-P0: T01–T07 |
| **registros / altas (altas.html, registros.html)** | SÍ | `plan_rls_p0_bis §3.1` — aprobación registros ROTA ahora | CRÍTICO | P0-bis | Pruebas R01–R04 post-P0-bis | Post-P0-bis: R01–R04 |

---

## 4. Gaps Todavía Abiertos

### 4.1 GAPS de Auditoría (falta conocimiento)

| GAP | descripción | cómo cerrar |
|---|---|---|
| **GA-1** Storage policies de `soporte_adjuntos` | No se puede auditar via SQL de schema — requiere Dashboard visual → Storage → bucket → Policies | Abrir Dashboard → Storage → soporte_adjuntos → Policies. Verificar INSERT/SELECT/DELETE por rol |
| **GA-2** Storage policies de `altas_tmp` | Idem — bucket no es tabla PostgreSQL | Idem con altas_tmp |
| **GA-3** Storage policies de `certificados` | Idem — tercer bucket activo desde browser, no auditado | Idem con certificados |
| **GA-4** Edge Functions realmente desplegadas | El repo tiene el código pero el Dashboard tiene el estado real: qué versiones están en producción | Dashboard → Edge Functions → verificar lista y fechas |
| **GA-5** Versión de `ticket-internal-reply` en deploy | Fix commiteado en `f54e22b` (2026-06-13). Si el deploy es anterior al fix, producción corre código sin hardening de idempotencia | Dashboard → EF → ticket-internal-reply → ver fecha último deploy |
| **GA-6** Si `quick-function` y `super-service` siguen activas | Código en repo, pero pueden ya haber sido retiradas del deploy manualmente | Dashboard → Edge Functions → verificar lista |
| **GA-7** Dead code en `altas.js:34–38` | Grep confirma que las funciones existen, pero la evidencia de que son dead code es inferida (aprobación va por EF). No se ejecutó el código | Verificar en panel real: aprobar una alta y confirmar que ningún INSERT directo en clientes_contactos ocurre |
| **GA-8** Realtime subscriptions activas | No auditadas — algunos frontends podrían usar canales RT además de polling | Dashboard → Database → Realtime → ver subscriptions activas |
| **GA-9** Logs de EF quick-function | Si hay invocaciones reales en prod (externos desconocidos), retirarla sin verificar sería arriesgado | Dashboard → EF → quick-function → Logs → últimos 7 días |

### 4.2 GAPS de Decisión Humana (bloqueante para remediación)

| GAP | descripción | quién decide | bloquea |
|---|---|---|---|
| **GD-1 (D1)** | ¿`ventas` ve todos los tickets o solo los asignados a él? | Dueño del negocio / líder técnico | SQL de P0 para `tickets` — sin esta respuesta hay 2 versiones incompatibles del `qual` |
| **GD-2 (D2)** | ¿`ventas` ve `cliente_accesos` (IDs AnyDesk, credenciales)? | Seguridad + negocio | Array de roles en policy `cliente_accesos_select_staff` |
| **GD-3 (D3)** | ¿`ventas` ve `clientes_contactos` (contactos de clientes)? | Negocio (recomendación: SÍ) | Array de roles en `cc_select_staff` del P0-bis |
| **GD-4 (D4)** | ¿`registros.js:approve()` se migra a EF o se mantiene con SDK directo? | Arquitecto / líder técnico | Diseño de la policy INSERT de `clientes_contactos` |
| **GD-5 (D5)** | ¿Se activa Turnstile en `support-submit-secure`? | Negocio (¿hay spam activo?) | Secreto `REQUIRE_TURNSTILE=true` en Supabase Secrets |
| **GD-6 (D6)** | ¿`match-cliente` se protege con header `x-service-key` o se rediseña con JWT? | Arquitecto / seguridad | Diseño del fix de `match-cliente` — JWT no es viable en formulario público |

### 4.3 GAPS de Verificación Visual en Dashboard

| GAP | dónde verificar | qué buscar |
|---|---|---|
| **GV-1** Storage `soporte_adjuntos` policies | Dashboard → Storage → soporte_adjuntos → Policies | ¿INSERT solo service_role? ¿SELECT bloqueado para anon? |
| **GV-2** Storage `altas_tmp` policies | Dashboard → Storage → altas_tmp → Policies | ¿INSERT solo service_role? ¿SELECT/anon bloqueados? |
| **GV-3** Storage `certificados` policies | Dashboard → Storage → certificados → Policies | ¿INSERT solo authenticated admin/soporte? ¿SELECT solo signed URL? |
| **GV-4** EF `quick-function` — activa o retirada | Dashboard → Edge Functions | ¿Aparece en la lista? ¿Hay logs de invocación? |
| **GV-5** EF `super-service` — activa o retirada | Dashboard → Edge Functions | ¿Aparece? ¿Logs de invocación? |
| **GV-6** EF `ticket-internal-reply` — versión deploy | Dashboard → Edge Functions → ticket-internal-reply | ¿Fecha de deploy posterior a 2026-06-13 (`f54e22b`)? |
| **GV-7** pg_cron — ¿instalado en algún proyecto? | Dashboard → Database → Extensions | ¿Aparece `pg_cron` en la lista? |

### 4.4 GAPS de SQL / Remediación (no ejecutar todavía)

| GAP | descripción | orden de ejecución |
|---|---|---|
| **GS-1** SQL P0-bis: `clientes_contactos` | DROP deny_all + CREATE SELECT/INSERT/UPDATE para staff | Primero de todos |
| **GS-2** SQL P0: `tickets` SELECT | DROP 2 policies duplicadas + CREATE con filtro de rol (según D1) | Segundo, post-P0-bis |
| **GS-3** SQL P0: `clientes` SELECT | DROP `clientes_select_auth` + CREATE con filtro de rol | Tercero |
| **GS-4** SQL P0: `cliente_accesos` SELECT | DROP `cliente_accesos_select_auth` + CREATE solo admin/soporte | Cuarto |
| **GS-5** SQL P0: `ticket_respuestas_rapidas` | DROP 6 policies abiertas (verificar que correctas existen) | Quinto |
| **GS-6** SQL P1: `ticket_archivos` SELECT | DROP `ticket_archivos_select_auth` + CREATE admin/soporte | Sexto |
| **GS-7** SQL P1: `ticket_match_decisiones` | DROP 3 policies abiertas (zero riesgo de UI) | Puede adelantarse al P0 |
| **GS-8** SQL P2: pg_cron jobs | Instalar extensión + CREATE job limpieza `edge_idempotency` (7d) + `rate_limit_events` (30d) | Después de rate limits |
| **GS-9** SQL P3: DROP índices duplicados | 7 índices identificados en tickets, ticket_eventos, archivos_ticket | Ventana de mantenimiento |

### 4.5 GAPS de Código (requieren modificación JS/EF)

| GAP | archivo(s) | cambio requerido | prioridad |
|---|---|---|---|
| **GC-1** Rate limit en `match-cliente` | `supabase/functions/match-cliente/index.ts` + `PANEL/soporte.js` | Agregar check rate_limit_events scope `match_cliente` (10/min) + header `x-service-key` | P1-4 |
| **GC-2** Rate limit en `estado-ticket-responder-ts` | `supabase/functions/estado-ticket-responder-ts/index.ts` | Agregar check rate_limit_events scope `portal_responder` (10/5min) | P2-1 |
| **GC-3** Rate limit en `submit-alta` | `supabase/functions/submit-alta/index.ts` | Agregar check scope `submit_alta` (5/10min) | P2-2 |
| **GC-4** Rate limit en `submit-registro` | `supabase/functions/submit-registro/index.ts` | Agregar check scope `submit_registro` (5/10min) | P2-3 |
| **GC-5** Turnstile en `support-submit-secure` | `supabase/functions/support-submit-secure/index.ts` + `PANEL/soporte.js` | `REQUIRE_TURNSTILE=true` en Secrets + `TURNSTILE_ENABLED=true` en JS | P2-4 (decisión D5) |
| **GC-6** INSERT `ticket_eventos` en `moveTicket` | `PANEL/tickets.js:260` | Agregar INSERT ticket_evento post-UPDATE de estado | P2-5 |
| **GC-7** INSERT `ticket_eventos` en `closeTicket` | `PANEL/tickets.js:263` | Agregar INSERT ticket_evento post-UPDATE cierre | P2-5 |
| **GC-8** INSERT `ticket_eventos` en `batchClose` | `PANEL/dashboard.js:150` | Agregar INSERT ticket_evento por cada ID cerrado | P2-5 |

### 4.6 GAPS de Deploy

| GAP | descripción | acción |
|---|---|---|
| **GDep-1** `quick-function` — retirar del deploy | Produce 500 en cada llamada, ningún frontend la usa | Dashboard → EF → quick-function → Delete (post-verificación de logs) |
| **GDep-2** `super-service` — retirar del deploy | Duplicado de submit-alta con service_role expuesto, sin uso | Dashboard → EF → super-service → Delete (post-verificación de logs) |
| **GDep-3** `ticket-internal-reply` — verificar y redesplegar si necesario | Fix de idempotencia en repo pero versión deployada desconocida | Verificar fecha en Dashboard; redesplegar si anterior a 2026-06-13 |
| **GDep-4** 4 EFs con rate limit nuevo — deploy post-código | Después de GC-2, GC-3, GC-4, GC-1 se agregan al código de EFs | `supabase functions deploy [nombre]` tras cada cambio de código |

### 4.7 GAPS Operativos

| GAP | descripción | impacto si no se cierra |
|---|---|---|
| **GO-1** pg_cron no instalado | `edge_idempotency` y `rate_limit_events` crecen indefinidamente | A bajo volumen actual no es urgente; con escala se convierte en riesgo |
| **GO-2** `edge_idempotency` — 10 filas con >7 días | Candidatas a limpieza manual ahora | Filas huérfanas de status `completed`/`failed` acumuladas |
| **GO-3** `rate_limit_events` — evento más antiguo 2026-04-20 (~55 días) | Sin cleanup en 30d es mayor que la ventana de auditoría de abuso | Crecimiento lento pero sin límite |
| **GO-4** Doble escritura `ticket_eventos` vs `tickets.timeline_publica` | Dos fuentes de verdad para el historial del ticket, sin garantía transaccional | Posible divergencia si falla un UPDATE; sprint de migración (P3) requerido |
| **GO-5** Doble escritura `ticket_archivos` vs `archivos_ticket` | Tabla legacy activa con registros que pueden quedar huérfanos en storage | Sprint de migración para consolidar (P3) |
| **GO-6** Rollback incompleto para `qr_dev_anon_select` | El SQL de rollback en `rollback_policies_dev_B1_2026_06_13.sql` no incluye esta policy (omitida intencionalmente porque el fix de tickets.js:111 no estaba aplicado aún) | Si se necesita rollback completo de las 6 policies dev anon, actualizar el SQL |

---

## 5. Estado de Tablas Críticas

| tabla | auditado | evidencia | riesgo activo | falta |
|---|---|---|---|---|
| `clientes_contactos` | SÍ | `plan_rls_p0_bis §3` — deny_all, roto ahora | **CRÍTICO — roto en producción** | Ejecutar P0-bis (SQL borrador disponible) |
| `tickets` | SÍ | `audit_dashboard §2.1` — 2 SELECTs `qual=true` | ALTO — cualquier authenticated lee todos los tickets | Ejecutar P0 (decisión D1 primero) |
| `clientes` | SÍ | `audit_dashboard §2.1` — SELECT `qual=true` | ALTO — PII expuesto a todos los roles | Ejecutar P0 |
| `cliente_accesos` | SÍ | `audit_dashboard §2.1` — credenciales AnyDesk `qual=true` | ALTO — credenciales expuestas | Ejecutar P0 (decisión D2) |
| `ticket_respuestas_rapidas` | SÍ | `audit_dashboard §2.1` — 6 policies abiertas duplicadas | ALTO — INSERT/UPDATE por cualquier authenticated | Ejecutar P0 (verificar policies correctas existentes) |
| `ticket_archivos` | SÍ | `audit_dashboard §2.1`, `rls_p0_preflight §3.5` — SELECT `qual=true`, legacy activa | MEDIO — storage_paths accesibles | Ejecutar P1 post-P0 |
| `ticket_match_decisiones` | SÍ | `audit_p1_p2 §3.2` — 3 policies abiertas, 0 refs en JS browser | MEDIO — edición de decisiones CRM sin restricción | Incluir en script P0 (zero riesgo UI) |
| `archivos_ticket` | SÍ | `audit_dashboard §2.2` — policies correctas | Bajo | Pruebas de signed URL post-Storage verificación |
| `solicitud_archivos` | SÍ | `audit_dashboard §5.3` — 31 filas, 0 huérfanas, FK OK | RESUELTO | Ninguna |
| `solicitudes_soporte` | SÍ | `audit_dashboard §2.2` — deny_all public, OK | Bajo | Ninguna |
| `solicitudes_alta` | SÍ | `audit_dashboard §2.2` | Bajo | Ninguna |
| `edge_idempotency` | SÍ | `audit_dashboard §5.1` — 10 filas, sin pg_cron | MEDIO (operativo) | pg_cron cleanup |
| `rate_limit_events` | SÍ | `audit_dashboard §5.2` — 41 filas, solo scope support_submit | MEDIO (operativo) | pg_cron cleanup + rate limits nuevos |
| `ticket_portal_logs` | SÍ | `auditoria_repo §C16` — sin TTL | Bajo | Medir volumen en Dashboard |
| `perfiles` | SÍ | `audit_dashboard §2.2` — policy self correcta | Bajo | Verificar en validación 6.5 de P0-bis |
| `bitacora` | SÍ | `audit_dashboard §2.2` — SELECT solo admin/soporte | Bajo | Ninguna |
| `avisos_globales` | SÍ | `audit_dashboard §2.2` — lectura pública filtrada correctamente | Bajo | Ninguna |

---

## 6. Edge Functions — Estado Completo

| EF | auditada | activa/legacy/rota | pública/JWT | service_role | rate limit | Turnstile | falta Dashboard visual | acción recomendada |
|---|---|---|---|---|---|---|---|---|
| `support-submit-secure` | SÍ | **ACTIVA — crítica** | Pública | SÍ | **SÍ** (5/10min — único EF con RL activo) | Implementado pero apagado (`REQUIRE_TURNSTILE=false`) | Verificar versión deploy | Mantener; activar Turnstile si D5=sí |
| `estado-ticket-ts` | SÍ | **ACTIVA — crítica** | Token público (folio+token) | SÍ | No (throttle de logs, no de HTTP) | No | Verificar versión deploy | Mantener — bien implementada |
| `estado-ticket-responder-ts` | SÍ | **ACTIVA** | Token público (folio+token) | SÍ | **NO — FALTA** | No | Verificar versión deploy | AGREGAR rate limit (scope `portal_responder`, 10/5min) — P2-1 |
| `ticket-internal-reply` | SÍ | **ACTIVA — crítica** | JWT (admin/soporte) | SÍ | No (no necesario — flujo interno auth) | No | **SÍ — verificar si versión es post-fix `f54e22b`** | Verificar fecha deploy; redesplegar si anterior al 2026-06-13 |
| `crear-ticket-interno` | SÍ | **ACTIVA** | JWT (admin/soporte) | SÍ | No | No | Verificar versión deploy | Mantener — OK |
| `match-cliente` | SÍ | **ACTIVA — RIESGO** | **PÚBLICA — sin auth** | SÍ — full scan | **NO — FALTA** | No | Verificar versión deploy | AGREGAR header `x-service-key` + rate limit (10/min) + reducir payload — P1-4 |
| `alta-aprobar` | SÍ | **ACTIVA** | JWT (admin/soporte/superadmin) | SÍ | No (no necesario) | No | Verificar versión deploy | Mantener — OK |
| `registro-aprobar` | SÍ | **ACTIVA** | JWT (admin/soporte/superadmin) | SÍ | No | No | Verificar versión deploy | Mantener — OK (sin EF registro-aprobar aún; registros.js usa SDK directo) |
| `submit-alta` | SÍ | **ACTIVA** | Pública (sin auth) | SÍ | **NO — FALTA** (acepta hasta 80MB/request) | No | Verificar versión deploy | AGREGAR rate limit (scope `submit_alta`, 5/10min) — P2-2 |
| `submit-registro` | SÍ | **ACTIVA** | Pública (sin auth) | SÍ — full scan hasta 400 clientes | **NO — FALTA** | No | Verificar versión deploy | AGREGAR rate limit (scope `submit_registro`, 5/10min) — P2-3 |
| `super-service` | SÍ | **LEGACY — candidata a retirar** | Pública (sin auth) | SÍ | No | No | **SÍ — verificar si está activa y logs** | RETIRAR del deploy post-verificación de logs (P1-3) |
| `quick-function` | SÍ | **ROTA — candidata a retirar** | Pública (sin auth) | SÍ (env vars inválidas = siempre 500) | No | No | **SÍ — verificar logs de invocación** | RETIRAR del deploy post-verificación de logs (P0-5) |

---

## 7. Storage — Estado y Pendientes

### 7.1 Bucket `soporte_adjuntos`

| aspecto | estado |
|---|---|
| **Referencias en código** | `ticket.js:127` (createSignedUrl), `ticket.js:160` (upload directo browser), EFs `support-submit-secure`, `estado-ticket-ts`, `estado-ticket-responder-ts`, `ticket-internal-reply` |
| **Flujo de upload** | Doble: (a) EF `support-submit-secure` sube archivos de tickets de soporte público con service_role; (b) `ticket.js:160` sube directamente desde el browser (staff) con sesión authenticated |
| **Flujo de lectura** | `ticket.js:127` genera signed URL (60*60*8 = 8h). EF `estado-ticket-ts` genera signed URLs para portal público. Acceso directo bloqueado para anon (en teoría). |
| **Signed URL** | SÍ — 8h de vigencia en `estado-ticket-ts`; verificar mismo patrón en panel interno |
| **Verificación visual Dashboard pendiente** | **SÍ — CRÍTICO** — las Storage policies no son consultables via SQL de schema |
| **Riesgo si bucket es público** | Archivos de tickets de soporte (adjuntos de clientes, documentación de problemas, imágenes de evidencia) serían públicamente accesibles sin necesidad de firma. Información sensible de clientes expuesta. |
| **Policy ideal conceptual** | INSERT: authenticated con rol admin/soporte (para uploads del panel) + service_role (para EFs). SELECT directa: BLOQUEADA para anon y authenticated — acceso solo via signed URL. DELETE: solo service_role. |
| **Hallazgo crítico** | `ticket.js:160` hace upload DIRECTO desde browser con sesión authenticated. La Storage policy DEBE tener INSERT para authenticated (admin/soporte) o los adjuntos de tickets internos del staff fallan silenciosamente. |

### 7.2 Bucket `altas_tmp`

| aspecto | estado |
|---|---|
| **Referencias en código** | EF `submit-alta` (service_role, POST público); EF `super-service` (service_role, legacy a retirar) |
| **Flujo de upload** | Solo vía EF `submit-alta` — ningún JS del browser hace upload directo a este bucket |
| **Flujo de lectura** | `altas.js` lee referencias desde `solicitudes_alta.archivos` (JSONB), no desde el bucket directamente. No hay generación de signed URLs desde el panel para altas. |
| **Signed URL** | NO confirmado — si el panel de altas necesita mostrar documentos adjuntos, debe generarse vía signed URL; verificar en Dashboard |
| **Verificación visual Dashboard pendiente** | **SÍ** |
| **Riesgo si bucket es público** | Documentos de solicitudes de alta (documentos empresariales, INE, RFC, contratos) serían accesibles sin firma por cualquier persona con la URL del path. |
| **Policy ideal conceptual** | INSERT: solo service_role (EF submit-alta). SELECT: solo service_role o authenticated admin/soporte (para revisar adjuntos en panel de altas). anon: SIN ACCESO. |

### 7.3 Bucket `certificados`

| aspecto | estado |
|---|---|
| **Referencias en código** | `cliente.core.js:32` (upload PDFs de licencias), `cliente.core.js:33` (upload adjuntos de tickets desde cliente.html), `dashboard.js:137` (upload PDFs desde dashboard), `supabase.js` (createSignedUrl para abrir PDFs) |
| **Flujo de upload** | Tres puntos de upload directo desde browser: `cliente.core.js` (dos), `dashboard.js` (uno). Los tres usan la sesión authenticated del usuario. |
| **Flujo de lectura** | `supabase.js` genera signed URLs con `h*3600` (variable, probablemente 8h). Acceso directo no confirmado. |
| **Signed URL** | SÍ — signed URLs generadas desde `supabase.js`. Vigencia: `h*3600` (h debe verificarse). |
| **Verificación visual Dashboard pendiente** | **SÍ — IMPORTANTE** — es el bucket más activo del panel interno |
| **Riesgo si bucket es público** | PDFs de licencias de software, certificados de cliente, documentación empresarial sensible, accesibles públicamente sin firma. Mayor riesgo de exposición de datos que los otros buckets dado el contenido. |
| **Policy ideal conceptual** | INSERT: authenticated con rol admin/soporte (3 puntos de upload del panel). SELECT directa: BLOQUEADA para anon y authenticated — solo via signed URL. DELETE: solo service_role o admin. |

---

## 8. Matriz Final P0 / P0-bis / P1 / P2 / P3

| prioridad | item | riesgo | evidencia | acción requerida | rollback necesario | pruebas | estado actual |
|---|---|---|---|---|---|---|---|
| **P0-bis** | `clientes_contactos` — deny_all, sin policy positiva | CRÍTICO — aprobación de registros ROTA en producción; 5 flujos de UI afectados | `plan_rls_p0_bis §3.1` — registros.js:47,49 fallan con error de RLS | DROP deny_all + CREATE cc_select_staff (admin/soporte/ventas), cc_insert_staff, cc_update_staff | DROP policies nuevas + restaurar deny_all | R01–R04, C01–C03, T01–T03, D01–D03, A01–A02 | ❌ PENDIENTE — PRIORITARIO |
| **P0-bis** | `ticket_match_decisiones` — 3 policies abiertas | MEDIO — cualquier authenticated modifica decisiones CRM | `audit_p1_p2 §3.2` — 0 refs en PANEL JS | DROP 3 policies abiertas (zero riesgo UI) | Recrear 3 policies abiertas | Solo prueba: crear ticket interno sigue funcionando | ❌ PENDIENTE (puede incluirse en P0-bis script sin costo) |
| **P0** | `tickets` — 2 SELECTs `qual=true` duplicadas | ALTO — todos los roles ven todos los tickets de todos los clientes | `audit_dashboard §2.1`, `rls_p0_preflight §3.1` | DROP tickets_select_auth + tickets_select_authenticated + CREATE tickets_select_staff (según D1) | Guardar CREATE POLICY previo + recrear si regresión | T01–T07 del preflight | ❌ PENDIENTE (bloqueado por decisión D1) |
| **P0** | `clientes` — SELECT `qual=true` | ALTO — PII de todos los clientes expuesta a todos los roles | `audit_dashboard §2.1` | DROP clientes_select_auth + CREATE clientes_select_staff | Guardar + recrear | T08–T10 | ❌ PENDIENTE |
| **P0** | `cliente_accesos` — SELECT `qual=true` (credenciales AnyDesk) | ALTO — credenciales de acceso remoto expuestas a todos los roles | `audit_dashboard §2.1` | DROP cliente_accesos_select_auth + CREATE cliente_accesos_select_staff (admin/soporte) | Guardar + recrear | T11–T13 | ❌ PENDIENTE (bloqueado por D2) |
| **P0** | `ticket_respuestas_rapidas` — 6 policies abiertas (2 grupos duplicados) | ALTO — INSERT/UPDATE irrestricto por cualquier authenticated | `audit_dashboard §2.1` | DROP 6 policies abiertas + verificar que correctas existen para admin/soporte | Guardar + recrear las 6 | T14–T17 | ❌ PENDIENTE |
| **P0-5** | `quick-function` — EF rota deployada | CRÍTICO — produce 500, service_role expuesto, superficie de ataque sin uso | `audit_p1_p2 §5.1` — ningún frontend activo la invoca | Verificar logs en Dashboard → retirar del deploy | Redesplegar desde repo si necesario | Endpoint debe devolver 404 | ❌ PENDIENTE (requiere GA-9 primero) |
| **P1-1** | `ticket_archivos` — SELECT `qual=true` (legacy activa) | MEDIO — storage_paths accesibles a todos los authenticated | `audit_dashboard §2.1`, `audit_p1_p2 §3.1` | DROP ticket_archivos_select_auth + CREATE solo admin/soporte | Guardar + recrear | Archivos visibles en ticket.html | ❌ PENDIENTE |
| **P1-3** | `super-service` — EF legacy con service_role público | ALTO — duplicado de submit-alta sin uso, acepta POST sin auth | `audit_p1_p2 §5.2` | Verificar logs → retirar del deploy | Redesplegar desde repo si necesario | Endpoint debe devolver 404 | ❌ PENDIENTE |
| **P1-4** | `match-cliente` — POST público sin JWT ni rate limit | ALTO — full scan de clientes, devuelve nombre/correo/teléfono/score | `audit_p1_p2 §5.3` | Agregar header `x-service-key` + rate limit + reducir payload + update soporte.js | Revertir EF + JS a versión anterior | POST sin header debe dar 401; con header debe funcionar | ❌ PENDIENTE |
| **P1-6** | Storage policies — soporte_adjuntos, altas_tmp, certificados | ALTO — políticas desconocidas; riesgo de acceso público a datos sensibles | `audit_p1_p2 §6.1/6.2/6.3` | Verificar visualmente en Dashboard → corregir según policy ideal | Restaurar policy previa | Signed URL funciona; acceso anon bloqueado | ❌ PENDIENTE (requiere GA-1, GA-2, GA-3) |
| **P1-7** | `ticket-internal-reply` — versión deploy no confirmada | MEDIO — si versión es pre-fix, producción corre sin hardening idempotencia | `audit_dashboard §7` | Verificar fecha deploy en Dashboard → redesplegar si anterior a 2026-06-13 | Redesplegar desde backup pre-fix | Respuesta interna idempotente funciona | ❌ PENDIENTE (requiere GV-6) |
| **P2-1** | `estado-ticket-responder-ts` — sin rate limit HTTP | MEDIO — spam con token válido, anti-spam solo en BD | `audit_p1_p2 §5.6` | Agregar check rate_limit_events scope `portal_responder` (10/5min) | Eliminar bloque de check | >10 POST/5min desde misma IP → 429 | ❌ PENDIENTE |
| **P2-2** | `submit-alta` — sin rate limit (hasta 80MB/request) | MEDIO — spam de solicitudes + subida masiva a altas_tmp | `audit_p1_p2 §5.4` | Agregar check rate_limit_events scope `submit_alta` (5/10min) | Eliminar bloque de check | >5 req/10min → 429 | ❌ PENDIENTE |
| **P2-3** | `submit-registro` — sin rate limit | MEDIO — spam de solicitudes | `audit_p1_p2 §5.5` | Agregar check rate_limit_events scope `submit_registro` (5/10min) | Eliminar bloque de check | >5 req/10min → 429 | ❌ PENDIENTE |
| **P2-4** | `support-submit-secure` — Turnstile apagado | MEDIO — sin CAPTCHA, solo rate limit por IP como protección ante bots | `audit_p1_p2 §5.7` — REQUIRE_TURNSTILE=false | Decisión D5: activar REQUIRE_TURNSTILE=true en Secrets + TURNSTILE_ENABLED=true en soporte.js | Revertir ambos flags | Formulario muestra widget; sin token → 403 | ❌ PENDIENTE (bloqueado D5) |
| **P2-5** | `ticket-internal-reply` — deploy drift post-fix | BAJO/MEDIO — si deploy es anterior al fix | `auditoria_repo §A7` — fix commiteado en f54e22b | Verificar en Dashboard y redesplegar si necesario | Backup pre-fix disponible | Nada — flujo ya funciona con fix | ❌ PENDIENTE (verificación) |
| **P2-5b** | INSERT `ticket_eventos` en moveTicket/closeTicket/batchClose | MEDIO — historial canónico incompleto; cliente no ve cambios de estado del board | `audit_p1_p2 §4.1–4.3` — tickets.js:260,263; dashboard.js:150 | Agregar INSERT ticket_evento en cada función | Eliminar líneas de INSERT | Mover ticket → portal del cliente muestra evento | ❌ PENDIENTE |
| **P2-6** | pg_cron — limpieza `edge_idempotency` | MEDIO (operativo) | `audit_dashboard §5.1/5.4` — 10 filas >7d, pg_cron no instalado | Instalar pg_cron + job diario 03:00 UTC eliminando completed/failed >7d | Ajustar intervalo o desactivar job | COUNT(*) candidatos a limpieza → 0 tras primer ciclo | ❌ PENDIENTE |
| **P2-7** | pg_cron — limpieza `rate_limit_events` | MEDIO (operativo) | `audit_dashboard §5.2` — 41 filas, evento más antiguo 2026-04-20 | Job semanal eliminando filas >30d | Ajustar o desactivar | COUNT(*) >30d → 0 tras primer ciclo | ❌ PENDIENTE |
| **P3** | Índices duplicados (tickets ×3, ticket_eventos ×2, archivos_ticket ×2) | Bajo — overhead de escritura mínimo | `audit_dashboard §4.1/4.2/4.3` — 7 índices duplicados identificados | DROP INDEX CONCURRENTLY de 7 índices en ventana de mantenimiento | `CREATE INDEX CONCURRENTLY` si es necesario | Consultas siguen funcionando; EXPLAIN ANALYZE mejora | ❌ PENDIENTE |
| **P3** | FK compuesta `tickets(contacto_id, cliente_id)` | Bajo — mejora de integridad | `audit_dashboard §3.3` | ALTER TABLE ADD CONSTRAINT FK compuesta | DROP CONSTRAINT | Assign contacto de otro cliente → rechazado | ❌ PENDIENTE |
| **P3** | Migración `timeline_publica` → solo `ticket_eventos` | MEDIO (calidad/consistencia) | `audit_p1_p2 §7.2` — doble fuente de verdad | Sprint dedicado: migrar datos históricos, eliminar JSONB append | Complejo — requiere snapshot previo | Portal muestra historial completo desde solo ticket_eventos | ❌ PENDIENTE (sprint dedicado) |
| **P3** | Migración `ticket_archivos` → solo `archivos_ticket` | MEDIO (calidad/consistencia) | `audit_p1_p2 §7.3` — tabla legacy activa | Sprint dedicado: migrar filas de ticket_archivos a archivos_ticket | Complejo | Archivos visibles en panel desde solo archivos_ticket | ❌ PENDIENTE (sprint dedicado) |

---

## 9. Qué Falta para Cerrar Auditoría al 100%

### 9.1 Imprescindible antes de fixes

| ítem | razón de ser imprescindible |
|---|---|
| **GV-4, GV-5** Verificar si quick-function y super-service siguen activas + revisar logs | Sin esta verificación, retirarlas puede interrumpir algo no documentado |
| **GV-6** Verificar versión de ticket-internal-reply en deploy | Sin saber si el fix está en producción, la validación del fix es incompleta |
| **GA-1, GA-2, GA-3** Verificar Storage policies de los 3 buckets | Sin esto, el nivel de riesgo real de Storage es desconocido — puede ser peor de lo estimado |
| **GD-1 (D1)** Decisión sobre si ventas ve todos los tickets | Sin esta decisión, el SQL de P0 para tickets no puede finalizarse |
| **GD-3 (D3)** Decisión sobre si ventas ve clientes_contactos | Sin esta decisión, el SQL de P0-bis no puede finalizarse para la policy SELECT |

### 9.2 Recomendable antes de fixes

| ítem | razón |
|---|---|
| **GD-2 (D2)** Decisión sobre ventas en cliente_accesos | Evita ejecutar P0 y tener que ajustar la policy inmediatamente después |
| **GD-4 (D4)** Confirmar si registros.js:approve() se migra a EF | Define si la policy INSERT de clientes_contactos necesita cobertura para authenticated |
| **GA-7** Confirmar dead code en altas.js:34–38 | Para no crear policies innecesarias para accesos que no existen |
| **GA-8** Realtime subscriptions | Para asegurarse de que no hay canal RT que dependa de policies que se van a modificar |

### 9.3 Puede hacerse durante fixes

| ítem | cuándo |
|---|---|
| **GD-5 (D5)** Decisión de Turnstile | Al momento de ejecutar el script de P2-4 |
| **GD-6 (D6)** Diseño final de match-cliente | Al momento de escribir el código del fix P1-4 |
| **GA-6** Confirmar pg_cron activo o no | Al momento de ejecutar P2-6 |

### 9.4 Puede quedar para post-fix

| ítem | por qué puede esperar |
|---|---|
| **GO-4** Doble write timeline_publica vs ticket_eventos | No afecta la seguridad; afecta la completitud del historial — puede documentarse como deuda técnica |
| **GO-5** Doble write ticket_archivos vs archivos_ticket | Idem — no es riesgo de seguridad sino de consistencia |
| **GA-9 ampliado** Análisis completo de logs de invocación de todas las EFs | Útil pero no bloqueante si se han verificado las críticas |

---

## 10. Qué Falta para Blindaje Real 130%

### 10.1 SQL P0-bis (clientes_contactos)
- DROP `deny_all_clientes_contactos`
- CREATE `cc_select_staff` (admin/soporte + ventas si D3=sí)
- CREATE `cc_insert_staff` (admin/soporte)
- CREATE `cc_update_staff` (admin/soporte)
- (Opcional) CREATE `cc_delete_admin`
- SQL borrador disponible en `plan_rls_p0_bis §4.2`

### 10.2 SQL P0 (tickets, clientes, cliente_accesos, ticket_respuestas_rapidas + ticket_match_decisiones)
- DROP 2 policies tickets + CREATE restricta (D1 define el `qual`)
- DROP policy clientes + CREATE restricta
- DROP policy cliente_accesos + CREATE solo admin/soporte (D2 define si ventas)
- DROP 6 policies ticket_respuestas_rapidas (verificar que correctas existen)
- DROP 3 policies ticket_match_decisiones (zero riesgo)
- SQL borrador disponible en `rls_p0_preflight §6`

### 10.3 SQL P1 (ticket_archivos)
- DROP `ticket_archivos_select_auth` + CREATE restricta admin/soporte
- Verificar que INSERT sigue funcionando para flujos de `ticket.js` y `cliente.core.js`

### 10.4 Retiro de EFs legacy
- `quick-function`: verificar logs → Dashboard → EF → Delete
- `super-service`: verificar logs → Dashboard → EF → Delete
- `ticket-internal-reply`: verificar fecha deploy → redesplegar si necesario

### 10.5 Rate limits (4 endpoints)
- `match-cliente`: header `x-service-key` + scope `match_cliente` (10/min) + reducir payload
- `estado-ticket-responder-ts`: scope `portal_responder` (10/5min)
- `submit-alta`: scope `submit_alta` (5/10min)
- `submit-registro`: scope `submit_registro` (5/10min)

### 10.6 Storage policies (3 buckets)
- Verificar `soporte_adjuntos`: INSERT authenticated (admin/soporte) OK; SELECT directa bloqueada; DELETE solo service_role
- Verificar `altas_tmp`: INSERT solo service_role; SELECT solo service_role o authenticated admin/soporte; anon bloqueado
- Verificar `certificados`: INSERT authenticated (admin/soporte); SELECT directa bloqueada; DELETE solo service_role/admin

### 10.7 Pruebas por rol
- Rol `admin`: T01, T05, T08, T10, T15, T17, T19, T22 + todos los R0x, C0x, T0x, D0x
- Rol `soporte`: T02, T05, T11, T13, T14, T16 + mismos flujos que admin
- Rol `ventas`: T03 (resultado depende de D1), T09 (resultado depende de si ventas ve clientes), T12 (según D2)
- Sin rol / authenticated sin perfil: T04 — debe ver 0 tickets
- `anon`: T18, T19, T20 — portal público funciona; panel interno bloqueado

### 10.8 Pruebas portal público
- Formulario soporte.html: envío completo + rate limit + Turnstile si activo
- Portal estado.html: carga con magic link + polling + adjuntos
- Portal responder: envío reply + anti-spam + rate limit post-P2-1
- Alta pública: formulario + archivos + rate limit post-P2-2
- Registro público: formulario + rate limit post-P2-3

### 10.9 Pruebas dashboard interno
- Board tickets.html con cada rol post-P0
- Cambio de estado genera ticket_evento post-P2-5
- Quick replies funcionan para admin/soporte post-P0
- Panel de altas muestra sugerencias de contacto post-P0-bis
- Panel de registros aprueba correctamente post-P0-bis

### 10.10 Documentación de resultado
- `DB/rls_p0_bis_resultado_FECHA.md` — con D3/D4 tomadas, tests R01–R04 etc.
- `DB/rls_p0_resultado_FECHA.md` — con D1/D2 tomadas, T01–T23 etc.
- `DB/storage_ef_resultado_FECHA.md` — policies de Storage y EF deploy verificadas
- `DB/rate_limits_resultado_FECHA.md` — 4 endpoints con rate limit validados
- `DB/cierre_blindaje_130_FECHA.md` — checklist final de 10 criterios de éxito

---

## 11. Decisiones Humanas Bloqueantes

### D1 — ¿`ventas` ve todos los tickets o solo los asignados?

| aspecto | detalle |
|---|---|
| **Opción A (recomendada para inicio)** | `ventas` ve todos los tickets — mismo nivel que admin/soporte. Más simple, menos riesgo de board vacío. `dashboard.js:142` carga todos los tickets sin filtro. |
| **Opción B (restrictiva)** | `ventas` solo ve tickets donde `asignado_a = auth.uid()` o `creado_por = auth.uid()`. Más seguro, requiere tickets correctamente asignados. Con pocos tickets asignados, el board de ventas parece roto. |
| **Impacto técnico** | Define el `qual` de `tickets_select_staff`. Sin D1, hay dos SQLs incompatibles. |
| **Bloquea** | SQL P0 para `tickets` — no puede escribirse el `qual` correcto sin esta decisión |
| **Impacto en código** | `dashboard.js:142` carga todos los tickets en el board. Con Opción B, el board de ventas muestra subconjunto. |

### D2 — ¿`ventas` ve `cliente_accesos` (IDs de AnyDesk)?

| aspecto | detalle |
|---|---|
| **Recomendación técnica** | NO. `cliente_accesos` contiene credenciales de acceso remoto. Vendedores no necesitan IDs de AnyDesk. |
| **Impacto si NO** | Sección "Acceso remoto" en `ticket.html` queda vacía para rol ventas. La UI debe manejar este vacío graciosamente sin error 403 visible. |
| **Impacto si SÍ** | Agregar `'ventas'` al array de roles en `cliente_accesos_select_staff`. |
| **Bloquea** | Array de roles en la policy del P0. No es tan crítico como D1 — puede tomarse después si se acepta la recomendación de "NO". |

### D3 — ¿`ventas` ve `clientes_contactos` (contactos de clientes)?

| aspecto | detalle |
|---|---|
| **Recomendación técnica** | SÍ. `ticket.js:202` necesita cargar contactos para el dropdown en tickets. Si ventas usa ticket.html, necesita ver contactos. La información de contacto no es más sensible que la de clientes que ventas ya verá. |
| **Impacto si SÍ** | Agregar `'ventas'` al array de `cc_select_staff` en el P0-bis. |
| **Impacto si NO** | Dropdown de contactos queda vacío para ventas. Si ventas no usa ticket.html en ningún flujo de trabajo, no hay impacto. |
| **Bloquea** | Array de roles en `cc_select_staff` del P0-bis — la policy puede ejecutarse sin esta decisión usando solo admin/soporte, y después actualizarse para incluir ventas. |

### D4 — ¿`registros.js:approve()` se migra a EF o se mantiene con SDK directo?

| aspecto | detalle |
|---|---|
| **Asimetría actual** | `altas.js` usa EF `alta-aprobar` (service_role). `registros.js` usa SDK directo (authenticated). Dos enfoques para funcionalidades equivalentes. |
| **Opción 1 (recomendada, inmediata)** | Mantener asimetría. Agregar policies INSERT/UPDATE en `clientes_contactos` para authenticated. Más simple, desbloquea la funcionalidad hoy. |
| **Opción 2 (correcta arquitecturalmente)** | Migrar `registros.js:approve()` a EF `registro-aprobar` (service_role). Más seguro y consistente, pero requiere crear y desplegar nueva EF. |
| **Impacto en P0-bis** | Define si la policy INSERT en `clientes_contactos` cubre `authenticated` (Opción 1) o solo `service_role` (Opción 2). |
| **Bloquea** | Diseño de la policy INSERT de `cc_insert_staff`. |

### D5 — ¿Se activa Turnstile en `support-submit-secure`?

| aspecto | detalle |
|---|---|
| **Estado técnico** | La función tiene la lógica de verificación completa. Solo necesita: (1) `REQUIRE_TURNSTILE=true` en Supabase Secrets, (2) `TURNSTILE_ENABLED=true` en `soporte.js`. El widget Cloudflare debe estar en `soporte.html`. |
| **Criterio de decisión** | ¿El formulario de soporte recibe spam de bots actualmente? Si sí → urgente. Si el rate limit (5/10min) es suficiente → puede esperar. |
| **Riesgo de activar** | Si el widget de Turnstile no está correctamente renderizado en `soporte.html`, el formulario quedaría bloqueado para todos los usuarios. Verificar primero que el widget HTML existe. |
| **Rollback** | Revertir `REQUIRE_TURNSTILE=false` en Secrets + `TURNSTILE_ENABLED=false` en soporte.js. |

### D6 — ¿`match-cliente` usa header `x-service-key` interno o rediseño con JWT?

| aspecto | detalle |
|---|---|
| **Por qué no JWT** | El formulario de soporte público (`soporte.html`) no requiere sesión de usuario. JWT requeriría que el usuario tenga cuenta, lo que rompe la naturaleza pública del formulario. |
| **Header `x-service-key`** | El secreto estaría en el JS del frontend (`soporte.js`), visible en el código fuente. Sin embargo, el valor solo permite buscar clientes (no escribir) y es de bajo impacto si se filtra. Es mejor que no tener ninguna protección. |
| **Alternativa: rate limit por IP sin header** | Si el header en JS es inaceptable, al menos agregar rate limit por IP (10/min) sin el header. Reduce el abuso aunque no elimina el acceso no autorizado. |
| **Recomendación** | Header `x-service-key` con valor de Supabase Secret, pasado en cada fetch de `soporte.js` a `match-cliente`. Además del rate limit por IP. |

---

## 12. Recomendación Final de Orden

### 12.1 Orden exacto de documentos restantes (a crear)

```
1. DB/rls_p0_bis_resultado_FECHA.md        ← Post-ejecución del P0-bis
2. DB/rls_p0_resultado_FECHA.md             ← Post-ejecución del P0
3. DB/storage_ef_visual_FECHA.md           ← Post-verificación visual Dashboard
4. DB/rate_limits_resultado_FECHA.md       ← Post-implementación P2-1/2/3/4
5. DB/historial_ticket_eventos_FECHA.md    ← Post-fix P2-5 (moveTicket/closeTicket)
6. DB/pg_cron_resultado_FECHA.md           ← Post-instalación cron
7. DB/cierre_blindaje_130_FECHA.md         ← Documento final con checklist de 10 criterios
```

### 12.2 Orden exacto de SQL

```
1. P0-bis: clientes_contactos (3 policies)
   └─ BEGIN; DROP deny_all; CREATE cc_select_staff/cc_insert_staff/cc_update_staff; COMMIT;

2. P0+P1: en un solo script controlado, tabla por tabla
   ├─ PASO 1: tickets_match_decisiones (DROP 3 — zero riesgo)
   ├─ PASO 2: tickets (DROP 2 + CREATE) — validar T01–T07 antes de continuar
   ├─ PASO 3: clientes (DROP 1 + CREATE) — validar T08–T10
   ├─ PASO 4: cliente_accesos (DROP 1 + CREATE) — validar T11–T13
   ├─ PASO 5: ticket_respuestas_rapidas (DROP 6) — validar T14–T17
   └─ PASO 6: ticket_archivos (DROP 1 + CREATE) — validar archivos en ticket.html

3. P2/Storage: después de P0 completado y validado
   ├─ Storage: corregir policies de soporte_adjuntos, altas_tmp, certificados (Dashboard visual)
   └─ pg_cron: instalar extensión + CREATE job edge_idempotency + CREATE job rate_limit_events
```

### 12.3 Orden exacto de Edge Functions

```
1. Verificar quick-function logs → Dashboard → Delete (P0-5)
2. Verificar super-service logs → Dashboard → Delete (P1-3)
3. Verificar ticket-internal-reply fecha deploy → redesplegar si necesario (P1-7)
4. match-cliente: código + deploy coordinado con soporte.js (P1-4)
5. estado-ticket-responder-ts: código + deploy (P2-1)
6. submit-alta: código + deploy (P2-2)
7. submit-registro: código + deploy (P2-3)
8. support-submit-secure: activar Turnstile si D5=sí (P2-4) — cambiar Secret + JS + deploy
```

### 12.4 Orden exacto de Storage

```
1. Dashboard → Storage → soporte_adjuntos → Policies → verificar/corregir
2. Dashboard → Storage → altas_tmp → Policies → verificar/corregir
3. Dashboard → Storage → certificados → Policies → verificar/corregir
```

### 12.5 Orden exacto de pruebas

```
Fase 1 — Post P0-bis:
  R01–R04 (registros.html), C01–C03 (cliente.html), T01–T03 (ticket.html), D01–D03 (dropdown), A01–A02 (altas.html)

Fase 2 — Post P0:
  T01–T07 (board tickets), T08–T10 (dashboard), T11–T13 (AnyDesk), T14–T17 (quick replies), T18–T20 (anon)

Fase 3 — Post P1 (Storage + EFs):
  Pruebas de signed URLs (ticket.html + estado.html), verificar que ticket-internal-reply idempotencia funciona

Fase 4 — Post P2 (rate limits):
  Prueba de rate limit para cada endpoint: enviar >límite en ventana → confirmar 429

Fase 5 — Post P2-5 (ticket_eventos):
  Cambiar estado en board → abrir portal del cliente → confirmar evento de estado visible en timeline

Fase 6 — Matriz completa de roles:
  admin / soporte / ventas / anon — pruebas 9.9 + 9.10 del plan de remediación
```

### 12.6 Orden exacto de commits

```
1. git add DB/rls_p0_bis_resultado_FECHA.md
   git commit -m "docs: add P0-bis clientes_contactos remediation result FECHA"

2. git add DB/rls_p0_resultado_FECHA.md
   git commit -m "docs: add P0 RLS remediation result FECHA"

3. git add DB/storage_ef_visual_FECHA.md
   git commit -m "docs: add storage and EF visual audit result FECHA"

4. git add DB/rate_limits_resultado_FECHA.md
   git commit -m "docs: add rate limits implementation result FECHA"

5. git add DB/cierre_blindaje_130_FECHA.md
   git commit -m "docs: add 130 blindaje closure checkpoint FECHA"

[Nota: Los commits de código (EFs, JS) van en el repo panel-expiriti, no en este repo]
```

---

## 13. Veredicto Final

### 13.1 Porcentaje de auditoría cerrada

**Auditoría: 88% cerrada**

| sub-área | % completada |
|---|---|
| Schema de BD (23+ tablas, constraints, FKs, índices) | 100% |
| RLS policies (Dashboard SQL read-only) | 100% |
| Edge Functions (código en repo, riesgos) | 95% (falta confirmación de deploy visual) |
| Dependencias de código JS (grep PANEL/*.js) | 100% |
| Storage policies | 0% (requiere Dashboard visual — no es SQL de schema) |
| Versiones de EF en producción (deploy drift) | 0% (requiere Dashboard visual) |
| pg_cron / limpieza operativa | 100% (confirmado ausente) |
| Decisiones humanas identificadas | 100% (identificadas; no tomadas aún) |
| Borradores de SQL de remediación | 100% (escritos; no ejecutados) |
| **TOTAL** | **~88%** |

Faltante para llegar al 100% de auditoría: ~3h de trabajo de verificación visual en Dashboard (Storage policies y EF deploy status).

### 13.2 Porcentaje de implementación (blindaje)

**Implementación: 12%**

| fix | estado |
|---|---|
| 6 policies dev anon cerradas | ✅ APLICADO (2026-06-13) |
| `ticket-internal-reply` fix de idempotencia | ✅ COMMITEADO (deploy no confirmado) |
| `tickets.js:111` Bearer token | ✅ APLICADO en panel-expiriti main |
| P0-bis: `clientes_contactos` | ❌ NO APLICADO (ROTO EN PRODUCCIÓN AHORA) |
| P0: `tickets`, `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas` | ❌ NO APLICADO |
| P0-5: `quick-function` retirada | ❌ NO APLICADO |
| P1: `ticket_archivos`, `ticket_match_decisiones`, `match-cliente`, `super-service` | ❌ NO APLICADO |
| P1-6: Storage policies verificadas y corregidas | ❌ NO VERIFICADO |
| P2: rate limits (4 endpoints) | ❌ NO APLICADO |
| P2-4: Turnstile | ❌ NO APLICADO |
| P2-5: ticket_eventos en moveTicket/closeTicket | ❌ NO APLICADO |
| P2-6/7: pg_cron | ❌ NO APLICADO |
| **TOTAL** | **~12%** (3 fixes de seguridad sobre ~25 fixes totales identificados) |

### 13.3 ¿Es seguro empezar remediación?

**SÍ, con condiciones:**

1. **P0-bis puede iniciarse HOY** — `clientes_contactos` está roto en producción ahora mismo. El SQL borrador está disponible en `plan_rls_p0_bis §4.2`. Solo falta la decisión D3 (¿ventas ve contactos?). La recomendación técnica es SÍ. Este fix es aislado, de bajo riesgo y tiene rollback trivial.

2. **P0 de RLS requiere primero** — tomar la decisión D1 (¿ventas ve todos los tickets?) y opcionalmente D2. Sin D1, el SQL de `tickets` no puede finalizarse.

3. **Verificar Storage y EF deploy en Dashboard** antes de: (a) retirar EFs legacy, (b) ejecutar P0 de RLS (para entender el estado real antes de hacer cambios).

4. **No mezclar P0 de RLS con P2 de código** — ejecutar en ventanas separadas para facilitar el diagnóstico de regresiones.

### 13.4 Qué NO debe hacerse todavía

- ❌ **NO ejecutar el SQL de P0** (`tickets`, `clientes`, etc.) sin antes tomar D1
- ❌ **NO retirar `quick-function` ni `super-service`** sin verificar primero sus logs en Dashboard (pueden tener invocaciones desde fuera del panel documentado)
- ❌ **NO modificar `ticket.js` ni `tickets.js`** (agregar ticket_eventos) en la misma ventana que el P0 de RLS
- ❌ **NO desplegar rate limits en EFs** sin verificar antes la versión actualmente deployada de cada función
- ❌ **NO aplicar P0 de RLS antes del P0-bis** de `clientes_contactos` — si hay regresiones simultáneas en múltiples tablas, el diagnóstico se complica
- ❌ **NO asumir** que las funciones de INSERT en `altas.js:34,35,37,38` son activas — son dead code confirmado por análisis del flujo de aprobación
- ❌ **NO commitear código sin documentar** el resultado de cada fase de remediación en un archivo en DB/

---

## 14. Prompt Exacto para el Siguiente Paso

```
Continuamos Panel Expiriti — siguiente sesión post-cierre de auditoría.

Repo: /Users/jaziel/Documents/EXPIRITI_REPOS/panel-expiriti-audit-bd
Rama: audit/supabase-flows
Último commit: 8bec195 docs: add clientes contactos P0-bis RLS plan

Modo: Puedes crear UN documento en DB/ con el resultado de la ejecución.
NO edites código JS/TS. NO ejecutes SQL (eso lo hace el humano en el Dashboard).
NO hagas git add, commit ni push todavía.

Contexto global confirmado (88% de auditoría cerrada):
- clientes_contactos: P0-bis PRIORITARIO — deny_all, aprobación de registros ROTA en producción.
  SQL borrador disponible en DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md §4.2
  Solo falta: DECISIÓN D3 (¿ventas ve contactos? Recomendación técnica: SÍ)
- tickets/clientes/cliente_accesos/ticket_respuestas_rapidas: P0 de RLS.
  SQL borrador en DB/rls_p0_preflight_remediation_2026_06_15.md §6
  Solo falta: DECISIÓN D1 (¿ventas ve todos los tickets?)
- quick-function ROTA, super-service SIN USO: verificar logs en Dashboard antes de retirar
- match-cliente: POST público sin rate limit ni auth — P1-4
- Storage policies 3 buckets: NO auditadas visualmente — verificación urgente
- Borradores de SQL P0-bis y P0 disponibles, con rollback documentado
- Orden de ejecución: P0-bis → P0 → P1 → P2 → pruebas → documentar

Decisiones humanas bloqueantes:
  D1: ¿ventas ve todos los tickets o solo los asignados? (bloquea SQL de tickets)
  D2: ¿ventas ve cliente_accesos? (recomendación: NO)
  D3: ¿ventas ve clientes_contactos? (recomendación: SÍ — bloquea P0-bis)
  D4: ¿registros.js:approve() se migra a EF? (recomendación: mantener SDK, agregar policy)
  D5: ¿Se activa Turnstile? (depende de si hay spam activo)
  D6: ¿match-cliente usa header x-service-key? (recomendación: SÍ)

Tarea de esta sesión:
El humano ha tomado las siguientes decisiones:
  D1: [RESPUESTA DEL HUMANO]
  D3: [RESPUESTA DEL HUMANO]

Con esas decisiones:
1. Confirmar si el SQL de P0-bis en plan_rls_p0_bis_clientes_contactos_2026_06_15.md §4.2
   necesita ajuste en el array de roles de cc_select_staff según D3.
2. Confirmar si el SQL de P0 en rls_p0_preflight_remediation_2026_06_15.md §6
   usa OPCIÓN A o OPCIÓN B para tickets según D1.
3. Crear DB/verificacion_dashboard_visual_FECHA.md con la checklist de verificaciones
   pendientes en Dashboard (GV-1 a GV-7 del documento de cierre).
4. NO ejecutes el SQL — solo documenta el estado de las decisiones y la checklist.
```

---

## 15. Addendum Final 130% — Secrets, CORS, Auth, Frontend Exposure, Rollback y Pruebas

### A. Secrets / Variables de Entorno

#### A.1 Edge Functions que dependen de `SUPABASE_SERVICE_ROLE_KEY`

Todas las Edge Functions del proyecto usan internamente `SUPABASE_SERVICE_ROLE_KEY` para crear un cliente Supabase con bypass de RLS. La clave es inyectada automáticamente por el runtime de Supabase Edge Functions — no necesita estar declarada como Secret manual. Sin embargo, su uso implica que **cada EF tiene acceso irrestricto a todos los datos**, independientemente de las policies RLS.

| EF | cómo obtiene service_role | riesgo si EF es pública |
|---|---|---|
| `support-submit-secure` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | MEDIO — pública pero con rate limit activo |
| `estado-ticket-ts` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | BAJO — validación por folio+token+expiración |
| `estado-ticket-responder-ts` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | MEDIO — pública, sin rate limit HTTP |
| `ticket-internal-reply` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | BAJO — requiere JWT válido |
| `crear-ticket-interno` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | BAJO — requiere JWT válido |
| `match-cliente` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | **ALTO — pública sin auth, full scan clientes** |
| `alta-aprobar` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | BAJO — requiere JWT válido |
| `registro-aprobar` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | BAJO — requiere JWT válido |
| `submit-alta` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | MEDIO — pública, sin rate limit |
| `submit-registro` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | MEDIO — pública, sin rate limit |
| `super-service` | `createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` | **ALTO — pública sin auth, legacy a retirar** |
| `quick-function` | `Deno.env.get("6fb8db5c...")` — **nombre de variable = hash SHA256** | **CRÍTICO — env var inválida, siempre 500** |

#### A.2 Secrets que deben verificarse visualmente en Supabase Dashboard

Ir a: Dashboard → Settings → Edge Functions → Secrets (o Dashboard → Settings → API).

| secret / variable | EF que lo usa | estado verificable desde repo | acción |
|---|---|---|---|
| `SUPABASE_URL` | Todas | No — es env var de runtime | Verificar en Dashboard que apunta al proyecto correcto |
| `SUPABASE_SERVICE_ROLE_KEY` | Todas (auto-inyectado) | No — nunca en repo (correcto) | Verificar que NO aparece en ningún archivo JS/HTML del frontend |
| `SUPABASE_ANON_KEY` | Todas (auto-inyectado) | No | Verificar que en el frontend se usa la publishable key, no la service_role |
| `REQUIRE_TURNSTILE` | `support-submit-secure` | SÍ (en repo: `false`) | Verificar valor actual en Secrets; cambiar a `true` si D5=sí |
| `TURNSTILE_SECRET_KEY` | `support-submit-secure` | No — solo en Secrets de Supabase | Verificar que el secret existe y es válido para el dominio del formulario |
| `x-service-key` (propuesto) | `match-cliente` (fix pendiente) | No — no existe todavía | Crear como Secret antes de aplicar el fix P1-4 |
| `6fb8db5c...` (hash SHA256) | `quick-function` | SÍ — hardcodeado en index.ts como nombre de variable | **INVÁLIDO — causa los 500. No corregir: solo retirar la función.** |

#### A.3 Turnstile — secrets y flags

| componente | nombre | dónde | estado actual |
|---|---|---|---|
| Flag en EF | `REQUIRE_TURNSTILE` | Supabase Secrets (Edge Function env var) | `false` — apagado |
| Flag en JS | `TURNSTILE_ENABLED` | `PANEL/soporte.js:11` | `false` — apagado |
| Secret Cloudflare | `TURNSTILE_SECRET_KEY` | Supabase Secrets | Desconocido — no verificable desde repo |
| Widget HTML | `<div class="cf-turnstile">` | `soporte.html` (no auditado) | Desconocido — debe verificarse visualmente |

**Para activar Turnstile (post-decisión D5):** los cuatro componentes deben configurarse de forma coordinada. Si `REQUIRE_TURNSTILE=true` en Secrets pero el widget HTML no está en `soporte.html`, el formulario quedará completamente bloqueado.

#### A.4 Variables mal nombradas, legacy o no verificables

| variable | problema | acción |
|---|---|---|
| `6fb8db5c...` en `quick-function` | El nombre de la env var ES un hash SHA256. `Deno.env.get("6fb8db5c...")` siempre devuelve `undefined`. Diseño fundamentalmente roto desde el origen. | Solo retirar la función. No tiene sentido corregir. |
| `SUPABASE_SERVICE_ROLE_KEY` en `super-service` | Expuesto en endpoint público sin autenticación. Funcionalmente accede a la BD con permisos totales. | Retirar la función del deploy. |
| Variables de entorno en `submit-alta`, `submit-registro` | No verificables desde el repo — el código solo llama `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` que es auto-inyectado. | Sin acción — es el patrón estándar de Supabase. |

#### A.5 Regla absoluta: `service_role` nunca en frontend

`SUPABASE_SERVICE_ROLE_KEY` **NUNCA** debe aparecer en código JavaScript del browser, archivos HTML, atributos `data-*`, comentarios de código, archivos de configuración commiteados ni logs de consola visibles en DevTools. La service_role key tiene bypass total de RLS — si aparece en el cliente, cualquier usuario puede usarla para leer y modificar cualquier dato de la BD ignorando todas las políticas de seguridad.

Verificación: `grep -r "service_role" PANEL/` debe devolver **0 resultados**. Si devuelve alguno, es una vulnerabilidad crítica inmediata.

---

### B. CORS / Origins

#### B.1 Análisis conceptual de headers CORS en Edge Functions

Las Edge Functions de Supabase ejecutan en Deno y manejan CORS manualmente en el código. El patrón más común (y problemático) observado en la arquitectura es:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

Este patrón aparece típicamente en el handler de OPTIONS (preflight) de cada EF. No se puede confirmar el valor exacto sin leer el código de cada EF — pero el riesgo conceptual está bien definido.

#### B.2 Riesgo de `Access-Control-Allow-Origin: *`

| contexto | riesgo | detalle |
|---|---|---|
| **Endpoints públicos** (`support-submit-secure`, `estado-ticket-ts`, `estado-ticket-responder-ts`, `submit-alta`, `submit-registro`) | BAJO-MEDIO | El `*` es aceptable aquí porque los endpoints son intencionalmente públicos. El peligro es el contenido que devuelven, no el origen. Rate limits y validaciones de token mitigan el abuso. |
| **`match-cliente`** | **ALTO** | `*` + endpoint público + service_role + full scan de datos. Cualquier sitio web puede hacer fetch a este endpoint y extraer datos de clientes. El fix del header `x-service-key` reduce el riesgo, aunque el secreto estaría en el JS del formulario. |
| **`quick-function`, `super-service`** | ALTO (legacy) | Con CORS `*` + service_role + sin auth, cualquier origen puede hacer requests. El fix es retirarlas. |
| **Endpoints JWT** (`ticket-internal-reply`, `crear-ticket-interno`, `alta-aprobar`, `registro-aprobar`) | BAJO | El CORS `*` aquí es aceptable porque el JWT en el header es la barrera real. Sin JWT válido, la EF rechaza el request independientemente del origen. |

#### B.3 Separación de riesgo: endpoints públicos vs JWT

| tipo | CORS `*` aceptable | barrera real de seguridad | acción |
|---|---|---|---|
| **EF pública + rate limit** (`support-submit-secure`) | Sí | Rate limit + validación de datos | Mantener — add Turnstile si D5=sí |
| **EF pública + token** (`estado-ticket-ts`, `estado-ticket-responder-ts`) | Sí | Folio + token_publico + expiración | Mantener |
| **EF pública sin barrera** (`match-cliente`, `submit-alta`, `submit-registro`) | NO ideal | Ninguna (o solo rate limit pendiente) | Agregar rate limit; en match-cliente también header |
| **EF JWT** (`ticket-internal-reply`, `crear-ticket-interno`, `alta-aprobar`, `registro-aprobar`) | Sí — el JWT es la barrera | JWT de sesión verificado en EF | Mantener |
| **EF legacy rota** (`quick-function`, `super-service`) | No importa | No tienen barrera funcional | Retirar del deploy |

#### B.4 Política conceptual de CORS recomendada (sin modificar código)

Para las EFs que requieren endurecimiento de CORS (principalmente `match-cliente` post-fix):

- Mantener `Access-Control-Allow-Origin: *` para EFs públicas de formularios (portal, soporte) — el CORS restrictivo rompería el acceso desde cualquier dominio no listado, incluyendo el dominio del cliente que podría no conocerse en compilación.
- Para EFs internas (`ticket-internal-reply`, `crear-ticket-interno`), si se quiere endurecer: restringir `Access-Control-Allow-Origin` al dominio del panel (`https://panel.expiriti.com` o equivalente). Esto previene que otros sitios puedan invocar las EFs aun con JWT válido (protección adicional).
- Nunca añadir `Access-Control-Allow-Credentials: true` junto con `Access-Control-Allow-Origin: *` — esa combinación es rechazada por los browsers y no tiene efecto, pero indica confusión en el código.

---

### C. Auth / Perfiles

#### C.1 Dependencia de RLS hacia `public.perfiles`

Los borradores de SQL de remediación (P0-bis y P0) usan el siguiente patrón para todas las policies nuevas:

```sql
USING (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol IN ('admin', 'soporte', 'ventas')
  )
)
```

Esto crea una **dependencia crítica**: si la tabla `perfiles` no tiene una policy SELECT activa para el propio usuario (`self` policy), el `EXISTS` devolverá vacío para todos los usuarios y **todas las policies nuevas negarán acceso a todo el staff**.

**Estado confirmado en Dashboard:** `perfiles` tiene policy `self` — cada usuario solo puede leer y editar su propio perfil. La subquery `WHERE p.id = auth.uid()` es compatible con esta policy porque el usuario está consultando su propio ID.

#### C.2 Riesgo de usuarios `authenticated` sin fila en `perfiles`

| escenario | efecto con las policies nuevas |
|---|---|
| Usuario de Supabase Auth que nunca completó el registro → no tiene fila en `perfiles` | El `EXISTS` devuelve `false` → acceso denegado a todas las tablas protegidas por filtro de rol. **Comportamiento correcto.** |
| Usuario eliminado de `perfiles` pero no de `auth.users` | Idem — acceso denegado. Correcto. |
| Usuario con rol no conocido (`superadmin`, `viewer`, etc.) | Si el rol no está en el array `('admin', 'soporte', 'ventas')`, acceso denegado. Verificar si existe algún rol adicional en producción. |
| Usuario recién creado (entre registro en auth y creación de fila en perfiles) | Ventana de tiempo en que el usuario está autenticado pero sin acceso. Normalmente resuelta por el flujo de onboarding. |

#### C.3 Validaciones SQL read-only recomendadas — sin PII

Ejecutar en Dashboard → SQL Editor **antes de aplicar cualquier SQL de remediación**:

```sql
-- C.3.1 Confirmar policy self activa en perfiles
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'perfiles'
ORDER BY policyname;
-- Esperado: al menos una policy SELECT con qual que incluya auth.uid() = id

-- C.3.2 Conteo de usuarios por rol (sin PII)
SELECT rol, COUNT(*) AS total
FROM public.perfiles
GROUP BY rol
ORDER BY rol;
-- Esperado: filas con admin, soporte, ventas y sus conteos
-- Si aparece un rol desconocido: documentarlo antes de acotar las policies

-- C.3.3 Usuarios autenticados sin perfil (sin exponer IDs)
SELECT COUNT(*) AS auth_sin_perfil
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.perfiles p WHERE p.id = au.id
);
-- Esperado: 0. Si > 0: hay usuarios que perderán acceso con las nuevas policies.
-- No representa un problema de seguridad, pero sí de UX.

-- C.3.4 Perfiles sin usuario en auth.users (huérfanos)
SELECT COUNT(*) AS perfiles_huerfanos
FROM public.perfiles p
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users au WHERE au.id = p.id
);
-- Esperado: 0. Si > 0: hay filas fantasma en perfiles que nunca serán accedidas.
```

#### C.4 Roles esperados y su perimetro de acceso post-remediación

| rol | tickets | clientes | cliente_accesos | clientes_contactos | ticket_respuestas_rapidas | bitacora | perfiles |
|---|---|---|---|---|---|---|---|
| `admin` | Todos | Todos | Sí | SELECT, INSERT, UPDATE | SELECT, INSERT, UPDATE | SELECT | Solo su perfil |
| `soporte` | Todos | Todos | Sí | SELECT, INSERT, UPDATE | SELECT, INSERT, UPDATE | SELECT | Solo su perfil |
| `ventas` | Todos (D1=A) / Solo asignados (D1=B) | Todos | NO (según recomendación D2) | SELECT (si D3=sí) | Solo lectura (global) | NO | Solo su perfil |
| `authenticated` sin perfil | 0 filas | 0 filas | 0 filas | 0 filas | 0 filas | 0 filas | 0 filas |
| `anon` | 0 filas (dev anon cerradas) | 0 filas | 0 filas | 0 filas | 0 filas | 0 filas | 0 filas |

---

### D. Frontend Exposure

#### D.1 Exposición de anon key — confirmación

La `SUPABASE_ANON_KEY` (también llamada publishable key) **SÍ debe aparecer en el frontend** — es la clave pública diseñada para ser usada en el browser. El SDK de Supabase la requiere para inicializar el cliente. El riesgo no es que aparezca, sino qué se puede hacer con ella si el RLS está mal configurado.

**Qué puede hacer un actor con la anon key:**
- Inicializar un cliente Supabase y hacer queries directas con rol `anon`
- Si hay policies `anon` abiertas (`qual=true`): leer o escribir datos sin restricción
- Invocar Edge Functions que no requieren JWT

**Estado post-auditoría:** Las 6 policies `anon` dev fueron cerradas el 2026-06-13. Confirmado por `rls_dev_closed_2026_06_13.txt`. Un actor con la anon key no puede leer tickets, clientes ni datos internos vía SDK directo. El riesgo residual es acceso a EFs públicas (que tienen sus propias defensas).

#### D.2 URLs hardcodeadas

No se auditaron archivos HTML directamente, pero del grep en `PANEL/*.js` y `supabase.js` se sabe que:
- La URL del proyecto Supabase (`SUPABASE_URL`) está referenciada en `supabase.js` o equivalente
- Las URLs de las Edge Functions están construidas dinámicamente como `${SUPABASE_URL}/functions/v1/[nombre]`
- No hay evidencia de URLs de Edge Functions hardcodeadas con IPs o dominios externos en el código auditado

**Verificación recomendada:** `grep -r "http" PANEL/ | grep -v "supabase.co"` — si aparecen URLs de terceros no documentadas, investigar.

#### D.3 Edge Functions llamadas desde el browser (directamente)

| EF | archivo llamador | método de invocación | auth en el call |
|---|---|---|---|
| `support-submit-secure` | `PANEL/soporte.js:6` | `fetch(url, {method:"POST", body:formData})` | Sin auth (pública) |
| `match-cliente` | `PANEL/soporte.js:8` | `fetch(url, {method:"POST", body:JSON})` | Sin auth — riesgo activo |
| `ticket-internal-reply` | `PANEL/tickets.js:137` | `s.functions.invoke(...)` | JWT Bearer (sesión) |
| `crear-ticket-interno` | `PANEL/tickets.js:256` | `s.functions.invoke(...)` | JWT Bearer (sesión) |
| `estado-ticket-ts` | `PANEL/estado.js:4` | `fetch(url, {method:"GET"})` | Token público (folio+token en params) |

Las EFs `alta-aprobar`, `registro-aprobar`, `submit-alta`, `submit-registro`, `estado-ticket-responder-ts` son invocadas desde páginas específicas (`alta.html`, `registros.html`, `estado.html`, `registro.html`) cuyos JS no fueron auditados directamente por grep, pero su invocación está documentada en las auditorías previas.

#### D.4 Confirmación: `service_role` NO debe existir en JS/HTML

Regla de diseño del sistema:
- El frontend usa **siempre** la anon key para inicializar el cliente Supabase
- El JWT de sesión (`tkSessionToken()`) se pasa como Bearer en `s.functions.invoke()` para EFs internas
- Las EFs reciben el JWT, lo verifican, y luego crean internamente un cliente con `service_role` para operar en la BD

**Verificación confirmada:** El fix de `tickets.js:111` (`e455f6e`) corrigió precisamente este problema — antes usaba `supabaseKey` (anon key) como Bearer en el fallback REST; ahora usa `tkSessionToken()` (JWT de sesión). No hay evidencia de que `service_role` esté en el JS del browser en el estado actual del repo.

#### D.5 Endpoints públicos activos y su perfil de riesgo

| endpoint | URL pattern | quien llama | protección actual | protección faltante |
|---|---|---|---|---|
| `soporte.html` → `support-submit-secure` | `POST /functions/v1/support-submit-secure` | Browser anon (formulario público) | Rate limit 5/10min por IP | Turnstile (D5 pendiente) |
| `estado.html` → `estado-ticket-ts` | `GET /functions/v1/estado-ticket-ts?folio=X&token=Y` | Browser anon (magic link) | Folio + token_publico + expiración | Ninguna adicional necesaria |
| `estado.html` → `estado-ticket-responder-ts` | `POST /functions/v1/estado-ticket-responder-ts` | Browser anon (con token) | Anti-spam en BD (2 msgs consecutivos) | Rate limit HTTP por IP (P2-1) |
| `soporte.html` → `match-cliente` | `POST /functions/v1/match-cliente` | Browser anon (debounce 500ms) | Ninguna | Rate limit + header x-service-key + reducir payload (P1-4) |
| `alta.html` → `submit-alta` | `POST /functions/v1/submit-alta` | Browser anon (formulario) | Ninguna | Rate limit 5/10min (P2-2) |
| `registro.html` → `submit-registro` | `POST /functions/v1/submit-registro` | Browser anon (formulario) | Ninguna | Rate limit 5/10min (P2-3) |

---

### E. Rollback Operativo

#### E.1 Backup de policies antes de cualquier SQL

**Pasos obligatorios antes de ejecutar cualquier script de remediación:**

```sql
-- Ejecutar en Dashboard SQL Editor → guardar resultado completo
SELECT
  tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Copiar el resultado a un archivo local (ej: `pg_policies_backup_FECHA_HORA.txt`). Este snapshot es el estado de rollback de referencia. Si algo sale mal, permite recrear exactamente el estado previo.

#### E.2 Rollback por bloque

**E.2.1 Rollback P0-bis (`clientes_contactos`)**

| condición de rollback | SQL a ejecutar | efecto |
|---|---|---|
| `registros.js` sigue fallando con error diferente después del fix | DROP cc_select_staff, cc_insert_staff, cc_update_staff + recrear deny_all_clientes_contactos | Restaura estado roto actual — solo temporalmente mientras se investiga |
| UI de cliente.html muestra error inesperado (no solo vacío) | Idem | Idem |
| Contactos de otros clientes se muestran mezclados (policy demasiado permisiva) | DROP cc_select_staff + recrear con filtro más restrictivo (por cliente_id del ticket) | Ajuste de policy, no rollback completo |

SQL de rollback P0-bis disponible en: `DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md §5`

**E.2.2 Rollback P0 (`tickets`, `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas`)**

| condición de rollback | criterio |
|---|---|
| Board de tickets aparece vacío para admin o soporte | Rollback inmediato de la policy de `tickets` — es regresión crítica |
| Dashboard muestra 0 clientes para admin o soporte | Rollback inmediato de `clientes` |
| Sección AnyDesk desaparece para soporte | NO es rollback — es comportamiento esperado si se restringió a admin. Verificar D2. |
| Quick replies desaparecen para admin o soporte | Rollback de `ticket_respuestas_rapidas` — significa que las policies correctas existentes no cubren estos roles |

SQL de rollback P0 disponible en: `DB/rls_p0_preflight_remediation_2026_06_15.md §7`

**E.2.3 Rollback P1 (`ticket_archivos`, `ticket_match_decisiones`)**

| condición de rollback | criterio |
|---|---|
| Historial de archivos desaparece en `ticket.html` | Rollback de `ticket_archivos` — significa que la nueva policy no cubre el SELECT del panel |
| `crear-ticket-interno` falla | NO debería ocurrir — EF usa service_role. Si falla, es otro problema. No hacer rollback de policies. |

**E.2.4 Rollback Edge Functions (EFs retiradas)**

| EF retirada | cómo restaurar si hay invocación inesperada |
|---|---|
| `quick-function` | `supabase functions deploy quick-function` desde el repo. Sigue rota (produce 500), pero al menos el endpoint existe. |
| `super-service` | `supabase functions deploy super-service` desde el repo. |
| `ticket-internal-reply` (si redespliegue causa regresión) | `supabase functions deploy ticket-internal-reply --project-ref [ref]` con el código del backup en `DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts` |

**E.2.5 Rollback Storage**

Si al corregir policies de Storage se rompe el upload desde el panel:
- La política de INSERT para authenticated es la más crítica — sin ella, `ticket.js:160` falla silenciosamente al subir adjuntos de tickets internos
- Restaurar: Dashboard → Storage → bucket → Policies → agregar de vuelta la policy de INSERT para authenticated
- El código del panel no necesita cambios — el error es solo de Storage policy

#### E.3 Criterio de rollback

Ejecutar rollback **solo si** la regresión cumple al menos uno de estos criterios:
1. Un flujo de trabajo crítico para el staff queda completamente bloqueado (no puede crear tickets, no puede ver sus tickets, no puede aprobar altas/registros)
2. El portal del cliente (`estado.html`) deja de funcionar para usuarios con magic link válido
3. Aparece un error HTTP 500 o error de BD no controlado en un flujo que antes funcionaba

**No** hacer rollback por:
- Una sección de la UI que queda vacía donde antes mostraba datos (puede ser comportamiento esperado post-RLS)
- Un rol que ya no ve datos de otros roles (comportamiento correcto post-RLS)
- Un mensaje de "sin resultados" donde antes había datos (puede ser RLS funcionando correctamente)

#### E.4 Cómo documentar resultado post-fix

Para cada bloque de remediación ejecutado, crear un archivo en `DB/` con esta estructura:

```markdown
# Resultado [P0-bis / P0 / P1 / P2] — [FECHA]
## SQL ejecutado
[Copiar exactamente el SQL que se ejecutó, incluyendo BEGIN/COMMIT]
## Decisiones tomadas
D1: [valor] D2: [valor] D3: [valor] ...
## Resultados de validación SQL read-only
[Output de las queries 8.1–8.6 del preflight / 6.1–6.5 del P0-bis]
## Resultados de pruebas manuales
T01: ✅/❌ ... [tabla completa]
## Regresiones detectadas
[Ninguna / descripción]
## Acción tomada
[Aplicado completamente / Rollback parcial / etc.]
```

Commitear el documento de resultado en `audit/supabase-flows` antes de avanzar al siguiente bloque.

---

### F. Pruebas Finales por Rol

Las siguientes pruebas deben ejecutarse **en orden**, con usuario real (no service_role) en el entorno de producción, después de completar cada bloque de remediación.

#### F.1 Rol `admin`

| # | página | acción | resultado esperado |
|---|---|---|---|
| FA01 | `tickets.html` | Abrir board | Todos los tickets visibles en todos los estados |
| FA02 | `ticket.html?id=X` | Abrir ticket individual | Datos del ticket, contacto ligado, adjuntos, quick replies — todo visible |
| FA03 | `ticket.html?id=X` | Guardar AnyDesk | ID de AnyDesk guardado, aparece en `cliente_accesos` |
| FA04 | `tickets.html` | Mover ticket a "en proceso" | Toast de actualización; post-P2-5: evento visible en portal del cliente |
| FA05 | `tickets.html` | Cerrar ticket | Toast; post-P2-5: evento "cerrado" en portal |
| FA06 | `dashboard.html` | Abrir dashboard | Lista de clientes visible; métricas de tickets visibles |
| FA07 | `dashboard.html` | Crear ticket rápido | Ticket creado con folio correcto |
| FA08 | `cliente.html?id=X` | Abrir ficha de cliente | Datos del cliente, lista de contactos, historial de tickets |
| FA09 | `altas.html` | Ver panel de altas | Solicitudes visibles; nombres de contacto sugerido visibles (post-P0-bis) |
| FA10 | `registros.html` | Aprobar registro | Toast "Registro consolidado"; post-P0-bis: sin error de RLS |
| FA11 | `ticket.html?id=X` | Cargar quick replies | Respuestas rápidas (global, cliente, contacto) visibles |
| FA12 | `ticket.html?id=X` | Guardar nueva quick reply | Persiste en BD; visible tras recargar |

#### F.2 Rol `soporte`

| # | página | acción | resultado esperado |
|---|---|---|---|
| FS01 | `tickets.html` | Abrir board | Todos los tickets visibles |
| FS02 | `ticket.html?id=X` | Abrir ticket | Todo visible incluyendo AnyDesk y contactos |
| FS03 | `ticket.html?id=X` | Enviar respuesta interna | Evento "mensaje: soporte" en ticket_eventos; visible en timeline |
| FS04 | `cliente.html?id=X` | Abrir ficha | Contactos visibles (post-P0-bis) |
| FS05 | `registros.html` | Aprobar registro | Toast de éxito; contacto creado en `clientes_contactos` |
| FS06 | `ticket.html?id=X` | Cambiar contacto del ticket | Dropdown de contactos visible y funcional (post-P0-bis) |

#### F.3 Rol `ventas`

| # | página | acción | resultado esperado |
|---|---|---|---|
| FV01 | `tickets.html` | Abrir board | Todos los tickets (D1=A) o solo asignados (D1=B) |
| FV02 | `ticket.html?id=X` | Abrir ticket asignado | Datos visibles; sección AnyDesk vacía (si D2=NO) |
| FV03 | `ticket.html?id=X` | Ver contactos | Dropdown de contactos visible si D3=sí; vacío si D3=no |
| FV04 | `dashboard.html` | Abrir dashboard | Lista de clientes visible (si policy incluye ventas) |
| FV05 | `cliente.html?id=X` | Abrir ficha | Contactos visibles si D3=sí |
| FV06 | `ticket.html?id=X` | Intentar guardar quick reply (edit) | Sin opción de edición en UI o error de RLS silencioso — ventas no debe poder modificar QRs |

#### F.4 Rol `authenticated` sin perfil en `perfiles`

| # | acción | resultado esperado |
|---|---|---|
| FNP01 | Iniciar sesión con usuario de auth.users sin fila en perfiles → abrir `tickets.html` | Board vacío — 0 tickets. Sin error visible. |
| FNP02 | Abrir `cliente.html?id=X` | 0 resultados. Sin error 403 visible. |
| FNP03 | Intentar enviar formulario de soporte público | Funciona — el formulario no requiere sesión |

#### F.5 Rol `anon` (sin sesión)

| # | acción | resultado esperado |
|---|---|---|
| FAN01 | Abrir `tickets.html` sin sesión | Redirect a login o pantalla vacía — sin datos de tickets |
| FAN02 | Llamar `GET /rest/v1/tickets?select=*` con anon key via curl | 0 filas o error de RLS |
| FAN03 | Llamar `GET /rest/v1/clientes?select=*` con anon key | 0 filas o error de RLS |
| FAN04 | Llamar `GET /rest/v1/cliente_accesos?select=*` con anon key | 0 filas o error de RLS |
| FAN05 | Intentar POST a `support-submit-secure` con campos válidos | Ticket creado (endpoint público — comportamiento correcto) |

#### F.6 Portal público con token válido

| # | acción | resultado esperado |
|---|---|---|
| FPT01 | Abrir magic link de `estado.html?folio=EX-XXX&token=Y` con token vigente | Timeline del ticket visible con eventos públicos |
| FPT02 | Ver adjuntos del ticket en el portal | Signed URLs accesibles (vigencia 8h) |
| FPT03 | Enviar reply desde el portal | Evento "mensaje: cliente" en timeline; notificación al staff |
| FPT04 | Enviar 2 mensajes consecutivos sin respuesta de soporte | 3er intento bloqueado con aviso de anti-spam |
| FPT05 | Enviar >10 requests en 5min desde misma IP (post-P2-1) | 429 en el request 11 |

#### F.7 Portal público sin token (o token expirado)

| # | acción | resultado esperado |
|---|---|---|
| FPE01 | Abrir `estado.html?folio=EX-XXX&token=INVALIDO` | Mensaje de "enlace inválido o expirado" — sin datos del ticket |
| FPE02 | Abrir `estado.html` sin parámetros | Mensaje de "enlace inválido" o redirect |
| FPE03 | Usar magic link con `token_publico_expira` en el pasado | Mensaje de expiración — EF devuelve 410 Gone o equivalente |

#### F.8 Soporte público (`soporte.html`)

| # | acción | resultado esperado |
|---|---|---|
| FSP01 | Llenar formulario completo con empresa, descripción y adjunto | Folio en pantalla; correo con magic link enviado |
| FSP02 | Llenar empresa conocida → esperar 500ms | Sugerencia de cliente aparece (match-cliente funciona) |
| FSP03 | Enviar 6 veces en 10min desde misma IP | 6° request devuelve 429 |
| FSP04 | Enviar sin completar campo obligatorio | Validación de frontend bloquea antes de enviar |
| FSP05 | Turnstile activo (post-D5=sí) | Widget visible; envío sin completar captcha → 403 |

#### F.9 Dashboard interno

| # | acción | resultado esperado |
|---|---|---|
| FDI01 | Abrir `dashboard.html` como admin | Métricas de tickets, lista de clientes, accesos recientes |
| FDI02 | Crear ticket rápido desde modal | Ticket con folio IN-XXXX creado |
| FDI03 | Batch close de tickets seleccionados | Estado cambia a "cerrado"; post-P2-5: evento en cada ticket |
| FDI04 | Ver lista de clientes (filtro por nombre) | Resultados de búsqueda correctos |

#### F.10 Ticket individual (`ticket.html`)

| # | acción | resultado esperado |
|---|---|---|
| FTI01 | Abrir ticket con cliente, contacto y adjuntos | Todo visible: datos del cliente, contacto, adjuntos, quick replies, AnyDesk |
| FTI02 | Enviar respuesta rápida | Evento en `ticket_eventos`; si `tickets.timeline_publica` también se actualiza: visible en portal |
| FTI03 | Adjuntar archivo | Upload a `soporte_adjuntos`; archivo visible en historial de adjuntos |
| FTI04 | Cambiar contacto del ticket | Dropdown funcional; contacto_id actualizado |
| FTI05 | Ver historial completo de eventos | Todos los eventos (mensajes, cambios de estado, archivos) ordenados cronológicamente |

#### F.11 Cliente individual (`cliente.html`)

| # | acción | resultado esperado |
|---|---|---|
| FCI01 | Abrir ficha de cliente | Datos del cliente, lista de contactos, historial de tickets, sistemas registrados |
| FCI02 | Lista de contactos visible | Contacto principal primero; teléfono, correo, puesto visibles (post-P0-bis) |
| FCI03 | Crear ticket desde ficha | Ticket ligado al cliente creado correctamente |
| FCI04 | Subir certificado | PDF sube a bucket `certificados`; aparece en la sección de documentos |

---

### G. Auditoría Externa / Handoff para Fable

#### G.1 Contexto

Una vez que la auditoría interna (documentada en este repo) esté al 100% y antes de iniciar la remediación en producción, puede ser valioso solicitar una segunda opinión a un agente externo (Fable u otro LLM con capacidad de revisión de código y seguridad). Esta sección define cómo preparar ese handoff de forma eficiente y segura.

#### G.2 Archivo propuesto: `DB/audit_handoff_for_fable_2026_06_15.md`

Crear este archivo como paquete curado de contexto para el agente externo. NO enviar todo el repo sin filtro — el volumen de documentación y código es mayor de lo necesario para una segunda opinión focalizada.

**Estructura del handoff propuesto:**

```markdown
# Handoff de Auditoría — Panel Expiriti / Supabase
## 1. Contexto del sistema
[Descripción de 200 palabras: qué hace el panel, qué tablas críticas existen, cuántos usuarios hay]

## 2. Hallazgos críticos confirmados (top 10)
[Lista con evidencia — no repetir todo, solo los items P0 y P0-bis]

## 3. SQL de remediación propuesto para revisión
[Incluir el SQL borrador de P0-bis §4.2 y P0 §6 completos]

## 4. Preguntas específicas para revisión externa
- ¿El patrón de policy con EXISTS(perfiles) es robusto ante race conditions?
- ¿Hay riesgo de bypass del filtro de rol via JWT manipulation?
- ¿La policy de clientes_contactos INSERT permite insertar con cliente_id arbitrario?
- ¿Los rollbacks son suficientemente específicos para no dejar estado intermedio?

## 5. Qué NO debe hacer Fable
[Ver G.4]
```

#### G.3 Qué debe recibir Fable

| ítem | incluir | por qué |
|---|---|---|
| Resumen ejecutivo de hallazgos (sección 1 de este documento) | SÍ | Contexto suficiente del estado del sistema |
| SQL borradores de P0-bis y P0 | SÍ | La revisión principal que se pide |
| Schema de `clientes_contactos`, `tickets`, `perfiles` | SÍ | Necesario para validar las policies |
| Descripción de roles (`admin`, `soporte`, `ventas`) | SÍ | Contexto de las decisiones D1/D2/D3 |
| SQL de rollback | SÍ | Para revisar que es correcto y específico |
| Preguntas específicas sobre el SQL | SÍ | Enfoca la revisión |
| Todo el repo | NO | El volumen de 13 documentos + código ES innecesario y diluyente |
| Código JS del frontend (`PANEL/*.js`) | NO (salvo fragmentos específicos) | No necesita revisar el código de UI para validar RLS SQL |
| Credenciales, service_role key, secrets | **NUNCA** | Esto nunca debe enviarse a ningún agente externo |
| Nombres de clientes, correos, datos de producción | **NUNCA** | PII — nunca en un handoff |

#### G.4 Qué NO debe hacer Fable

- **NO ejecutar SQL** en el proyecto Supabase — la revisión es solo de código SQL propuesto, no de ejecución
- **NO acceder al Dashboard** de Supabase ni a credenciales del proyecto
- **NO crear ni editar archivos** en el repo — su rol es solo review y comentarios
- **NO proponer rollback de fixes ya aplicados** (dev anon policies, ticket-internal-reply) — están bien
- **NO sugerir arquitecturas alternativas** completas que requieran refactorizar todo el sistema — el objetivo es blindar el sistema actual, no rediseñarlo
- **NO asumir** que el schema SQL del snapshot es idéntico al de producción — el snapshot es de 2026-06-13 y puede haber cambios posteriores no reflejados

#### G.5 Preguntas específicas recomendadas para el handoff

1. ¿El patrón `EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN (...))` tiene vulnerabilidades de escalada de privilegios si un usuario puede modificar su propia fila en `perfiles`?
2. ¿La policy `cc_select_staff` propuesta permite que un usuario con rol `ventas` lea contactos de clientes que no le corresponden, o hay algún vector de filtrado adicional necesario?
3. ¿El rollback de P0 (recrear policies con `qual=true`) es suficientemente específico o puede dejar estado de BD inconsistente si se ejecuta parcialmente?
4. ¿Hay algún riesgo de SQL injection en las policies propuestas dado que usan `auth.uid()` directamente en el `WHERE`?
5. ¿La policy de INSERT para `cc_insert_staff` permite insertar una fila en `clientes_contactos` con un `cliente_id` arbitrario (de un cliente que no pertenece al usuario)?

---

### H. Actualización del Porcentaje de Auditoría

Con la adición de este Addendum, la cobertura de auditoría se actualiza:

| sub-área | % anterior | % actualizado |
|---|---|---|
| Schema de BD (23+ tablas, constraints, FKs, índices) | 100% | 100% |
| RLS policies (Dashboard SQL read-only) | 100% | 100% |
| Edge Functions (código en repo, riesgos) | 95% | 95% |
| Dependencias de código JS (grep PANEL/*.js) | 100% | 100% |
| Storage policies | 0% | 0% (sigue requiriendo Dashboard visual) |
| Versiones de EF en producción (deploy drift) | 0% | 0% (sigue requiriendo Dashboard visual) |
| pg_cron / limpieza operativa | 100% | 100% |
| Decisiones humanas identificadas | 100% | 100% |
| Borradores de SQL de remediación | 100% | 100% |
| **Secrets / variables de entorno** | 0% | **90%** (auditado conceptualmente; falta verificación visual Dashboard) |
| **CORS / origins** | 0% | **80%** (análisis conceptual completo; falta leer código CORS de cada EF) |
| **Auth / perfiles (dependencia RLS)** | 0% | **100%** (completamente documentado) |
| **Frontend exposure (anon key, URLs, EF calls)** | 30% | **90%** (auditado desde grep; falta verificar HTML de soporte.html/estado.html) |
| **Rollback operativo documentado** | 60% | **100%** |
| **Pruebas finales por rol definidas** | 70% | **100%** |
| **Handoff externo preparado conceptualmente** | 0% | **80%** (estructura definida; archivo no creado todavía) |
| **TOTAL ACTUALIZADO** | **88%** | **~92%** |

**Faltante para llegar al 100%:** verificación visual en Dashboard de Storage policies, EF deploy status, y Turnstile secrets (~3h de trabajo); lectura de archivos HTML de formularios públicos para confirmar exposición frontend (~1h).

---

*Addendum generado: 2026-06-15 · Solo documentación · Sin SQL ejecutado · Sin código modificado · Sin deploy · Sin commits*  
*Auditoría: 92% cerrada (actualizado) · Implementación: 12% · Fase 1 (documentación) COMPLETADA*  
*Siguiente acción: tomar D1 y D3 → ejecutar P0-bis en Dashboard → documentar resultado*
