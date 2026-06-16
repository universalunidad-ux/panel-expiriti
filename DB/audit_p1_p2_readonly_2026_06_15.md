# Auditoría P1/P2 — Panel Expiriti Read-Only
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo lectura + análisis. Sin SQL write. Sin código editado. Sin deploy. Sin commits.  
**Basada en:** Inspección read-only de `PANEL/*.js` + documentos de auditoría previos + resultados SQL del Dashboard  
**Documentos fuente:**
- `DB/auditoria_repo_audit_bd_2026_06_15.md`
- `DB/audit_dashboard_2026_06_15.md`
- `DB/plan_remediacion_blindaje_130_2026_06_15.md`
- `DB/rls_p0_preflight_remediation_2026_06_15.md`
- `DB/auditoria_edges_rls_2026_06_13.md`

---

## 1. Estado Git Actual

| campo | valor |
|---|---|
| Rama activa | `audit/supabase-flows` |
| Upstream | `origin/audit/supabase-flows` — sincronizada |
| Último commit | `d3a23af docs: add RLS P0 preflight remediation document` |
| Working tree | **limpio** — nada pendiente de commit |
| Stash | limpio |
| Ramas locales adicionales | `backup/ui-before-rebase-20260613_234804`, `feat/ef-snapshot-20260614`, `fix-panel-expiriti-20260608-2215`, `fix/tickets-ui-consolidation`, `main` |

El repo está en el estado esperado. La Fase 1 de documentación (4 documentos) está completada y commiteada. No hay cambios no comprometidos.

---

## 2. Hallazgo Principal — `clientes_contactos` como P0-bis

### 2.1 Estado RLS confirmado en Dashboard

| campo | valor |
|---|---|
| `schemaname` | `public` |
| `tablename` | `clientes_contactos` |
| `rls_habilitado` | `true` |
| `rls_forzado` | `false` |

### 2.2 Única policy existente

| campo | valor |
|---|---|
| `policyname` | `deny_all_clientes_contactos` |
| `permissive` | `PERMISSIVE` |
| `roles` | `{public}` |
| `cmd` | `ALL` |
| `qual` | `false` |
| `with_check` | `false` |

**Conclusión:** La tabla tiene RLS habilitado con una sola policy que deniega todo acceso (`qual=false` significa que ninguna fila pasa el filtro). No existe ninguna policy positiva para el rol `authenticated`. Cualquier query desde el SDK del browser con sesión de usuario devuelve 0 filas en SELECT y error en INSERT/UPDATE/DELETE, sin mensaje de error explícito en la UI en la mayoría de los casos.

### 2.3 Asimetría crítica: altas vs registros

**`altas.js` — flujo de aprobación:**
- `altas.js:40` `approve()` llama `callAltaEdge({action:"approve", solicitud_id})` → fetch POST a la EF `alta-aprobar` con Bearer token.
- La EF corre con `service_role` → bypass RLS total.
- Las funciones `createPrimaryContactFromRequest`, `findExistingContact`, `createAlternateContactFromRequest` definidas en `altas.js:34,35,37,38` **nunca son invocadas en el flujo de aprobación de altas**. Son dead code de una versión anterior.

**`registros.js` — flujo de aprobación:**
- `registros.js:54` `approve()` hace **todas las operaciones vía SDK directo** con la sesión `authenticated` del usuario.
- Llama `findExistingContact()` (SELECT), `createPrimaryContactFromRequest()` (INSERT), `findAlternateContact()` (SELECT), `createAlternateContactFromRequest()` (INSERT) directamente contra `clientes_contactos`.
- Con `deny_all public` activo: los SELECTs devuelven vacío → siempre intenta crear contacto nuevo en vez de reusar. Los INSERTs fallan con error de RLS. **La aprobación de registros está rota en producción ahora mismo.**

### 2.4 Flujos rotos en producción

| archivo | línea | función | operación | efecto con deny_all |
|---|---|---|---|---|
| `registros.js` | 40, 48 | `findExistingContact` / `findAlternateContact` | SELECT `clientes_contactos` WHERE `cliente_id` | Devuelve vacío → nunca reutiliza contactos existentes |
| `registros.js` | 47, 49 | `createPrimaryContactFromRequest` / `createAlternateContactFromRequest` | INSERT `clientes_contactos` | **Falla con error de RLS** — aprobación de registro completamente rota |
| `cliente.js` | 35 | `loadContacts()` | SELECT `*` WHERE `cliente_id` ORDER `es_principal DESC` | Sección de contactos en ficha de cliente vacía — sin error visible |
| `ticket.js` | 138 | `loadLinkedContact()` | SELECT por `contacto_id` + fallback por `cliente_id` | Nombre del contacto vinculado al ticket no aparece |
| `ticket.js` | 202 | `loadClientContacts()` | SELECT para dropdown de contactos en ticket | Dropdown vacío — no se puede cambiar contacto desde el ticket |
| `altas.js` | 44 | `hydrateAltaSuggestions()` | SELECT `id,nombre,correo,telefono` IN (ctids) | Nombres de contactos sugeridos vacíos — UI degradada pero no rota |

### 2.5 Flujos que SÍ funcionan (service_role, bypass RLS)

| EF | operación en `clientes_contactos` | bypass |
|---|---|---|
| `alta-aprobar` | SELECT + INSERT de contactos en aprobación de altas | Sí — service_role |
| `registro-aprobar` (si existe) | SELECT + INSERT de contactos | Sí — service_role |
| `crear-ticket-interno` | SELECT de contactos | Sí — service_role |

### 2.6 Policy objetivo conceptual (sin SQL ejecutable)

La tabla necesita como mínimo:

- **SELECT** para `admin`, `soporte`, `ventas` — todos los roles de staff necesitan ver contactos para trabajar con clientes y tickets.
- **INSERT** para `admin`, `soporte` — la aprobación de registros en `registros.js` necesita crear contactos desde el browser con sesión authenticated.
- **UPDATE** para `admin`, `soporte` — si existe edición de contactos desde el panel.

Filtro propuesto: `EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte','ventas'))` para SELECT. Para INSERT/UPDATE, el mismo patrón en `WITH CHECK`. La inclusión de `ventas` en SELECT depende de la decisión D3 (ver Sección 9).

### 2.7 Clasificación: P0-bis — prioritario sobre el P0 de RLS

Razones:
1. Regresiones activas confirmadas en producción — no es un riesgo futuro.
2. El fix es aislado — no interactúa con las tablas P0 (`tickets`, `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas`).
3. Agregar una policy positiva donde solo había `deny_all` es una operación de bajo riesgo con rollback trivial.
4. No depende de ninguna decisión humana sobre ventas (D1) — los roles de SELECT para admin/soporte son incuestionables.
5. Puede verificarse inmediatamente: si `cliente.html` muestra contactos después del fix, está funcionando.

**El script de P0-bis debe prepararse y ejecutarse antes del P0 de RLS**, no después.

---

## 3. Riesgos P1

### 3.1 `ticket_archivos` (tabla legacy activa)

**Policy actual:** `ticket_archivos_select_auth` — SELECT, rol `authenticated`, `qual=true` — **ABIERTA**. Cualquier usuario autenticado lee los archivos de todos los tickets.

**Uso desde browser (confirmado por grep en PANEL/):**

| archivo | línea | operación | detalles |
|---|---|---|---|
| `ticket.js` | 160 | INSERT (legacy soft-fail) | `uploadPublicLogFiles()` intenta INSERT en `ticket_archivos`; si falla solo loguea el error y continúa con el INSERT canónico en `archivos_ticket` |
| `ticket.js` | 240 | SELECT `*` WHERE `ticket_id` | `loadTicketContext()` lee ambas tablas (`ticket_archivos` + `archivos_ticket`) y fusiona los resultados |
| `cliente.core.js` | 33 | INSERT sin soft-fail | `saveTicket()` crea un ticket desde `cliente.html` y adjunta archivos subidos al bucket `certificados` (no `soporte_adjuntos`) con INSERT en `ticket_archivos` |

**Uso desde Edge Functions:** Las EFs (`ticket-internal-reply`, `support-submit-secure`) no acceden a `ticket_archivos`; usan `archivos_ticket` (canónica) con service_role.

**Riesgo concreto:** Con SELECT abierta, cualquier empleado autenticado puede leer `url_archivo` (= storage path) de archivos de tickets de cualquier cliente. Si el bucket tiene policy de SELECT directa para authenticated, podría construir signed URLs o acceder a los paths directamente.

**¿Policy positiva necesaria?** Sí — SELECT e INSERT para `admin`/`soporte`. El browser lee y escribe activamente esta tabla.

**¿Debe quedar deny_all?** No. Hay flujos de browser activos que la usan.

**Riesgo al restringir:** MEDIO. Si se restringe SELECT a solo admin/soporte, el historial de archivos legacy en `ticket.html` puede quedar vacío para roles sin acceso. Sin embargo, como es una tabla legacy en proceso de migración a `archivos_ticket`, y `ticket.js:240` lee ambas tablas, el impacto funcional es limitado.

**Pruebas necesarias:**
- Abrir `ticket.html` con ticket que tiene archivos en `ticket_archivos` → deben aparecer en historial.
- Abrir `cliente.html` → crear ticket con adjunto → archivo debe aparecer en la vista del ticket.
- Verificar que el INSERT soft-fail de `ticket.js:160` no bloquea el flujo principal cuando falla.

### 3.2 `ticket_match_decisiones`

**Policies actuales (todas abiertas):**

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `ticket_match_decisiones_select_auth` | SELECT | authenticated | `true` | — |
| `ticket_match_decisiones_insert_auth` | INSERT | authenticated | — | `true` |
| `ticket_match_decisiones_update_auth` | UPDATE | authenticated | `true` | `true` |

**Uso desde browser:** **NINGUNO.** Búsqueda exhaustiva en todos los archivos `PANEL/*.js` — cero referencias a `ticket_match_decisiones`.

**Uso desde Edge Functions:** `crear-ticket-interno` la usa con service_role (bypass RLS completo).

**Riesgo concreto:** Cualquier usuario autenticado puede leer y modificar decisiones de consolidación CRM (empresa capturada, correo capturado, score, nivel de decisión, estado de matching). Un usuario con rol `ventas` podría marcar decisiones como `aceptado` o `rechazado` sin autorización.

**¿Policy positiva necesaria para browser?** No. Solo la EF la escribe, y la EF no necesita policy (service_role bypass).

**¿Debe quedar deny_all?** Sí. Con las 3 policies abiertas eliminadas y sin policy positiva para authenticated, los usuarios del panel no pueden acceder desde el browser. Las EFs siguen funcionando sin restricción.

**Riesgo al cerrar:** **NINGUNO.** Confirmado por grep — ningún archivo JS en PANEL/ referencia esta tabla. Puede incluirse en el mismo script de P0 sin costo adicional y sin ninguna prueba de UI adicional.

**Pruebas necesarias:**
- Solo verificar que `crear-ticket-interno` sigue creando tickets correctamente después de cerrar las 3 policies. Debería pasar sin cambio porque es service_role.

---

## 4. Riesgos P2

### 4.1 `moveTicket` sin `ticket_eventos` (`tickets.js:260`)

**Lo que hace actualmente:**
```javascript
// Solo actualiza el estado en tickets:
await s.from("tickets").update({estado, fecha_actualizacion}).eq("id", id)
// No hay INSERT en ticket_eventos
```

**Efecto:** Cuando el staff mueve un ticket de estado desde el board (kanban), el cambio de estado **no aparece en `ticket_eventos`** y por lo tanto **no aparece en el portal del cliente** (`estado.html`). El cliente no sabe que su ticket pasó de "abierto" a "en proceso".

### 4.2 `closeTicket` sin `ticket_eventos` (`tickets.js:263`)

**Lo que hace actualmente:**
```javascript
// Solo actualiza estado y fecha_cierre:
await s.from("tickets").update({estado:"cerrado", fecha_actualizacion, fecha_cierre}).eq("id", id)
// No hay INSERT en ticket_eventos
```

**Efecto:** Cuando el staff cierra un ticket desde el board, el evento de cierre no aparece en el portal. El cliente solo nota que el ticket "desaparece" de la vista activa al recargar la página.

### 4.3 `batchClose` sin `ticket_eventos` (`dashboard.js:150`)

**Lo que hace actualmente:**
```javascript
// Batch UPDATE de múltiples tickets a "cerrado":
await s.from("tickets").update({estado:"cerrado", fecha_actualizacion}).in("id", ids)
// No hay INSERT en ticket_eventos para ninguno de los tickets cerrados
```

**Efecto:** Mismo que `closeTicket`, pero amplificado — puede afectar múltiples tickets en una sola operación sin dejar ningún rastro en el historial canónico.

### 4.4 Ausencia de `pg_cron`

Confirmado en `audit_dashboard_2026_06_15.md §5.4`: la extensión `pg_cron` **no está instalada**. Efecto en dos tablas de infraestructura:

| tabla | volumen actual | riesgo |
|---|---|---|
| `edge_idempotency` | 10 filas (9 `completed`, 1 `failed`), todas con más de 7 días — candidatas a limpieza | Sin job de limpieza, crece indefinidamente con cada respuesta rápida enviada. A bajo volumen actual no es urgente, pero sí es un riesgo operativo a medida que escala el uso. |
| `rate_limit_events` | 41 filas, scope `support_submit` únicamente, evento más antiguo de 2026-04-20 (~55 días) | Mismo problema. Con 4 endpoints sin rate limit aún (y cuando se les agregue rate limit, empezarán a generar filas), el crecimiento acelerará. |

**Alternativa si no se instala pg_cron:** GitHub Actions schedulado con llamada REST al Supabase API. Más portable, trazable en git, sin dependencia de extensión BD.

---

## 5. Edge Functions — Estado y Acción Requerida

### 5.1 `quick-function`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — POST sin autenticación |
| ¿Usa service_role? | Sí — pero los nombres de las env vars son hashes SHA256 inutilizables |
| ¿Rate limit? | No |
| ¿Turnstile/CAPTCHA? | No |
| ¿La llama algún JS activo en PANEL/? | **Ninguno** |
| Estado funcional | Produce HTTP 500 en cada llamada — nunca funcional tal como está deployada |

**Acción:** **RETIRAR — P0-5.** Superficie activa con service_role que produce 500 en cada invocación. Ningún frontend la invoca. Zero pérdida funcional al retirarla.

**Prerequisito:** Confirmar en Dashboard → Edge Functions → `quick-function` → Logs que no hay invocaciones en los últimos 7 días.

**Rollback:** El código fuente permanece en `supabase/functions/quick-function/`. Se puede redesplegar si es necesario.

### 5.2 `super-service`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — POST sin autenticación |
| ¿Usa service_role? | Sí — `SUPABASE_SERVICE_ROLE_KEY` expuesta en endpoint público |
| ¿Rate limit? | No |
| ¿Turnstile/CAPTCHA? | No |
| ¿La llama algún JS activo en PANEL/? | **Ninguno** — `alta.js` llama a `submit-alta`, no a esta |
| Funcionalidad | Duplicado de `submit-alta` sin match-cliente. Crea solicitudes en `solicitudes_alta`, sube archivos a `altas_tmp`. |

**Acción:** **RETIRAR — P1-3.** Duplicado sin uso con service_role expuesto públicamente. Cualquier persona puede hacer POST y crear solicitudes + subir archivos a `altas_tmp` sin ningún control.

**Prerequisito:** Confirmar en Dashboard logs que no hay invocaciones recientes. Verificar que `submit-alta` cubre todos los casos.

**Rollback:** Código fuente en `supabase/functions/super-service/`. Redesplegar desde repo si necesario.

### 5.3 `match-cliente`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — POST sin autenticación ni header |
| ¿Usa service_role? | Sí — full table scan de `clientes`, `clientes_aliases` |
| ¿Rate limit? | **No** |
| ¿Turnstile/CAPTCHA? | No |
| ¿La llama algún JS activo? | Sí — `soporte.js` con debounce en campo de empresa del formulario público |
| ¿Qué devuelve? | Candidatos de cliente con nombre, correo, teléfono y score de matching |

**Acción:** **ENDURECER — P1-4.** No retirar — es funcional y necesario para `soporte.html`. Plan: (a) agregar header `x-service-key` verificado contra Supabase Secret, (b) rate limit 10 req/min por IP usando `rate_limit_events`, (c) reducir payload de respuesta: devolver solo `cliente_id`, nombre truncado y `score`, sin correo completo ni teléfono. Deploy coordinado: actualizar EF y `soporte.js` en el mismo ciclo para evitar ruptura.

**Rollback:** Revertir EF + `soporte.js` a versiones anteriores.

### 5.4 `submit-alta`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — POST sin autenticación |
| ¿Usa service_role? | Sí — escribe `solicitudes_alta`, sube archivos a `altas_tmp` |
| ¿Rate limit? | **No** |
| ¿Turnstile/CAPTCHA? | No |
| Capacidad de carga | Hasta 80MB por request (múltiples archivos) |

**Acción:** **MANTENER + AGREGAR RATE LIMIT — P2-2.** Formulario público activo invocado desde `alta.html`. Agregar check de `rate_limit_events` con scope `submit_alta`: máximo 5 requests en 10 minutos por IP. Patrón idéntico al de `support-submit-secure`.

**Rollback:** Eliminar el bloque de rate limit check en la EF.

### 5.5 `submit-registro`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — POST sin autenticación |
| ¿Usa service_role? | Sí — full scan hasta 400 clientes + 1000 aliases, escribe `solicitudes_registro` |
| ¿Rate limit? | **No** |
| ¿Turnstile/CAPTCHA? | No |

**Acción:** **MANTENER + AGREGAR RATE LIMIT — P2-3.** Formulario público activo invocado desde `registro.html`. Agregar rate limit 5 req/10min por IP con scope `submit_registro`.

**Rollback:** Eliminar el bloque de rate limit check.

### 5.6 `estado-ticket-responder-ts`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — autenticación por `folio` + `token_publico` en el body |
| ¿Usa service_role? | Sí — escribe `ticket_eventos`, `archivos_ticket`, actualiza `tickets` |
| ¿Rate limit? | **No HTTP.** Solo anti-spam en BD: bloquea 3er mensaje consecutivo sin respuesta de soporte |
| ¿Turnstile/CAPTCHA? | No |

**Acción:** **MANTENER + AGREGAR RATE LIMIT — P2-1.** Es el núcleo del portal del cliente. Retirarla rompe el portal. Agregar check de `rate_limit_events` con scope `portal_responder`: máximo 10 requests en 5 minutos por IP.

**Rollback:** Eliminar el bloque de rate limit check.

### 5.7 `support-submit-secure`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Pública — POST sin autenticación |
| ¿Usa service_role? | Sí — crea ticket, solicitud, archivos, eventos, envía email |
| ¿Rate limit? | **Sí** — 5 req/10min por IP (el único endpoint público con rate limit activo) |
| ¿Turnstile/CAPTCHA? | Implementado en código pero deshabilitado (`REQUIRE_TURNSTILE=false`) |

**Acción:** **MANTENER. Activar Turnstile si el negocio decide — P2-4.** Es el endpoint mejor implementado del sistema. El rate limit ya existe y funciona. Solo falta activar `REQUIRE_TURNSTILE=true` en Supabase Secrets + `TURNSTILE_ENABLED=true` en `soporte.js`. El widget de Cloudflare Turnstile debe estar correctamente renderizado en `soporte.html`.

**Decisión humana requerida:** Si el formulario recibe spam de bots actualmente, Turnstile es urgente. Si el rate limit es suficiente protección por ahora, puede esperar.

**Rollback:** Revertir `REQUIRE_TURNSTILE=false` en Secrets + `TURNSTILE_ENABLED=false` en `soporte.js`.

### 5.8 `ticket-internal-reply`

| criterio | valor |
|---|---|
| ¿Pública o requiere JWT? | Requiere JWT — Bearer token de sesión autenticada |
| ¿Usa service_role? | Sí — escribe `ticket_eventos`, actualiza `tickets` |
| Fix de idempotencia | Commiteado en `f54e22b` (2026-06-13) |
| Versión deployada | **No confirmada visualmente** |

**Acción:** **VERIFICAR versión en Dashboard — P1-7.** Dashboard → Edge Functions → `ticket-internal-reply` → comparar fecha del último deploy con la fecha del commit `f54e22b`. Si la versión deployada es anterior al fix: redesplegar. Si ya está actualizada: ninguna acción.

**Rollback:** Redesplegar desde `DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts` si la versión con fix genera regresión.

---

## 6. Storage — Verificación Visual Pendiente

**No confirmable vía SQL de metadata — requiere Dashboard → Storage → [bucket] → Policies.**

### 6.1 Bucket `soporte_adjuntos`

**Uso confirmado desde browser:**

| archivo | línea | operación |
|---|---|---|
| `ticket.js` | 127 | `s.storage.from("soporte_adjuntos").createSignedUrl(path, 60*60*8)` — genera signed URL para evidencias |
| `ticket.js` | 160 | `s.storage.from("soporte_adjuntos").upload(path, file, {...})` — **upload directo desde browser** |

**Hallazgo crítico:** `ticket.js:160` hace upload directo a `soporte_adjuntos` desde el browser con la sesión del usuario autenticado. No es una EF quien sube — es el navegador directamente. La Storage policy de `soporte_adjuntos` DEBE tener INSERT para `authenticated` (al menos admin/soporte), o los adjuntos de tickets internos fallan silenciosamente.

**Qué verificar visualmente en Dashboard:**
- ¿Existe policy INSERT para `authenticated`? Si no, `ticket.js:160` falla.
- ¿Existe policy SELECT para `anon` con `using=true`? Si sí, los archivos de soporte son públicamente accesibles.

**Policies ideales (conceptual):**
- INSERT: `authenticated` con rol `admin`/`soporte` (para upload desde panel)
- SELECT directa: bloqueada para `anon` y `authenticated` — acceso solo via signed URL
- DELETE: solo `service_role`

### 6.2 Bucket `altas_tmp`

**Uso desde browser:** Ninguno directo. `altas.js` lee referencias de archivos desde `solicitudes_alta.archivos` (JSONB), no desde el bucket directamente. Los adjuntos de altas se muestran desde el JSONB del row.

**Uso desde EFs:** `submit-alta` (service_role) sube archivos. `super-service` también (pero se retirará).

**Qué verificar visualmente en Dashboard:**
- ¿Existe policy SELECT para `anon` o `authenticated`? Si sí, los documentos de solicitudes de alta son accesibles sin firma — contienen documentos empresariales sensibles.
- ¿Existe policy INSERT para `authenticated` o `anon`? Si sí, cualquiera puede subir archivos directamente al bucket sin pasar por la EF.
- ¿Puede el panel de altas mostrar los archivos adjuntos? (Necesita signed URL — verificar si el flujo funciona con las políticas actuales.)

**Policies ideales (conceptual):**
- INSERT: solo `service_role`
- SELECT: solo `service_role` o `authenticated` admin/soporte para revisar desde el panel
- `anon`: sin acceso

### 6.3 Bucket `certificados`

**Uso confirmado desde browser:**

| archivo | línea | operación |
|---|---|---|
| `cliente.core.js` | 32 | `s.storage.from("certificados").upload(path, file, {...})` — sube PDFs de licencias desde `cliente.html` |
| `cliente.core.js` | 33 | `s.storage.from("certificados").upload(path, file, {...})` — sube adjuntos de tickets desde `cliente.html` |
| `dashboard.js` | 137 | `s.storage.from("certificados").upload(path, file, {...})` — sube PDFs desde el dashboard |
| `supabase.js` | — | `s.storage.from("certificados").createSignedUrl(p, h*3600)` — genera signed URL para abrir PDFs |

**Hallazgo:** Es el bucket más activo desde el browser — tres puntos de upload directo. Almacena PDF de licencias y certificados de clientes (información comercial sensible).

**Policies ideales (conceptual):**
- INSERT: `authenticated` con rol `admin`/`soporte` para uploads desde el panel
- SELECT directa: bloqueada — acceso solo via signed URL de 8h
- `anon`: sin acceso

---

## 7. Integridad e Historial — Estado y Pendientes

### 7.1 `ticket_eventos`

**Estado:** Tabla canónica de eventos. Las EFs (`ticket-internal-reply`, `estado-ticket-responder-ts`) insertan correctamente. Tiene índice unique partial sobre `meta->>'idempotency_key'` que previene duplicados de quick replies.

**Gap confirmado:** `moveTicket` (`tickets.js:260`), `closeTicket` (`tickets.js:263`) y `batchClose` (`dashboard.js:150`) NO insertan en `ticket_eventos`. Solo actualizan `tickets.estado` vía SDK directo.

**Impacto:** Los cambios de estado desde el board son invisibles en el portal del cliente. La timeline pública está incompleta para todos los tickets cerrados o movidos desde el board.

### 7.2 `tickets.timeline_publica`

Campo JSONB en la tabla `tickets`. `buildTicketUpdatePayload()` (`ticket.js:247`) appenda entradas al array cuando el staff responde desde `ticket.html`. El portal `estado.html` lee el JSONB via la EF `estado-ticket-ts`. Es una segunda fuente de verdad paralela a `ticket_eventos`.

**Estado:** Funcional para respuestas del staff desde `ticket.html`. No cubre cambios de estado del board. La migración completa a solo `ticket_eventos` (eliminando el doble-write con JSONB) es P3 — sprint dedicado con migración de datos históricos.

### 7.3 `ticket_archivos` vs `archivos_ticket`

**`ticket_archivos`** (legado activo):
- Escrita por: `ticket.js:160` (soft-fail), `cliente.core.js:33` (sin soft-fail)
- Bucket: `soporte_adjuntos` (tickets) o `certificados` (desde `cliente.core.js`)
- Sin constraints de `visibilidad` ni `origen`

**`archivos_ticket`** (canónica):
- Escrita por: `ticket.js:160` (hard-fail — criterio de éxito), EFs con service_role
- Columnas bien definidas: `visibilidad CHECK`, `origen CHECK`, `storage_path`, `url_firma`, `meta JSONB`
- FK `ticket_id → tickets(id) ON DELETE CASCADE`

**Gestión de la transición:** `ticket.js:240` `loadTicketContext()` lee AMBAS tablas en paralelo (`Promise.all`) y fusiona los resultados. El doble-write en `uploadPublicLogFiles()` tiene el orden correcto: primero intenta legacy (soft-fail), luego canónica (hard-fail). La migración completa es P3.

### 7.4 `solicitud_archivos` vs `solicitudes_soporte`

**Estado: CERRADO.** Confirmado en `audit_dashboard_2026_06_15.md §5.3`:
- 31 filas totales
- 31 apuntan a `solicitudes_soporte`
- 0 filas huérfanas
- `submit-alta` NO inserta en `solicitud_archivos` — usa JSONB en `solicitudes_alta.archivos`

No hay riesgo activo. Documentado y cerrado.

### 7.5 `solicitudes_alta.archivos` JSONB

`submit-alta` EF guarda los archivos como array JSONB: `[{nombre, tipo, peso, storage_path}]`. No hay tabla relacional para archivos de altas.

**Implicación:** No se puede hacer FK de integridad sobre los archivos de altas. Si se elimina un archivo del bucket `altas_tmp` sin actualizar el JSONB, el JSONB queda con un path inexistente. Baja probabilidad en la práctica actual dado el volumen.

**Plan:** P3 — evaluar crear tabla `solicitud_alta_archivos` equivalente a `solicitud_archivos` pero con FK a `solicitudes_alta`. No urgente mientras el volumen sea bajo.

---

## 8. Matriz de Próximos Fixes en Orden Recomendado

| orden | fix | fase | por qué este orden | dificultad | rollback |
|---|---|---|---|---|---|
| **1** | `clientes_contactos` — policy positiva SELECT (admin/soporte/ventas) + INSERT (admin/soporte) | P0-bis | Roto en producción ahora. No depende de ninguna otra decisión. Fix aislado sin interacción con tablas P0. | Baja | Eliminar la policy nueva |
| **2** | Decidir D1 (¿ventas ve todos los tickets?) | — | Bloqueante para el SQL de `tickets` — sin esta decisión hay dos `qual` posibles e incompatibles | — | — |
| **3** | `ticket_match_decisiones` — eliminar 3 policies abiertas | P1 | Zero riesgo de UI. Ningún JS en PANEL/ la referencia. Puede incluirse en el script de P0 sin costo. | Baja | Recrear las 3 policies |
| **4** | `tickets` — eliminar 2 SELECTs abiertas + crear policy con filtro de rol | P0 | Mayor riesgo de confidencialidad — cualquier empleado ve todos los tickets | Media | Guardar CREATE POLICY previo |
| **5** | `clientes` — eliminar SELECT abierta + crear policy con filtro de rol | P0 | Alta exposición de PII (nombre, correo, RNC, razón social) | Baja | Guardar CREATE POLICY previo |
| **6** | `cliente_accesos` — eliminar SELECT abierta + policy solo admin/soporte | P0 | Credenciales AnyDesk — riesgo de seguridad inmediato | Baja | Guardar CREATE POLICY previo |
| **7** | `ticket_respuestas_rapidas` — eliminar 6 policies abiertas | P0 | Verificar primero que policies correctas existentes cubren admin/soporte | Media | Guardar las 6 CREATE POLICY previas |
| **8** | Retirar `quick-function` del deploy | P0-5 | No hay ningún riesgo — produce 500 y nadie la usa | Muy baja | Redesplegar desde repo |
| **9** | Verificar logs y retirar `super-service` del deploy | P1-3 | Confirmar en Dashboard que no hay invocaciones antes de retirar | Muy baja | Redesplegar desde repo |
| **10** | Verificar versión deployada de `ticket-internal-reply` en Dashboard | P1-7 | Verificar que el fix de idempotencia `f54e22b` está en producción | Muy baja | Redesplegar versión anterior |
| **11** | Verificar Storage policies (`soporte_adjuntos`, `altas_tmp`, `certificados`) visualmente | P1-6 | No confirmable via SQL — requiere Dashboard visual | Variable | Depende de lo que se encuentre |
| **12** | `ticket_archivos` — reemplazar SELECT abierta por policy admin/soporte | P1-1 | Después de verificar que `cliente.core.js` no se rompe | Baja | Guardar CREATE POLICY previo |
| **13** | `match-cliente` — agregar header `x-service-key` + rate limit + reducir payload | P1-4 | Deploy coordinado EF + `soporte.js` | Media | Revertir EF + JS |
| **14** | Rate limit en `estado-ticket-responder-ts` (scope `portal_responder`, 10/5min) | P2-1 | Independiente — puede hacerse en cualquier orden respecto a P2-2/P2-3 | Media | Eliminar bloque de rate limit |
| **15** | Rate limit en `submit-alta` (scope `submit_alta`, 5/10min) | P2-2 | Independiente | Media | Eliminar bloque de rate limit |
| **16** | Rate limit en `submit-registro` (scope `submit_registro`, 5/10min) | P2-3 | Independiente | Media | Eliminar bloque de rate limit |
| **17** | INSERT `ticket_eventos` en `moveTicket` + `closeTicket` + `batchClose` | P2-5 | No mezclar con el P0 de RLS — ventana separada | Media | Eliminar las líneas de INSERT |
| **18** | Activar Turnstile en `support-submit-secure` | P2-4 | Decisión humana — activar cuando el negocio decida | Baja | Revertir Secret + JS |
| **19** | `pg_cron` (o GitHub Actions) para limpiar `edge_idempotency` + `rate_limit_events` | P2-6/7 | Puede hacerse en paralelo después de que rate limits estén activos | Media | Ajustar intervalo o desactivar job |
| **20** | Índices duplicados (`tickets`, `ticket_eventos`, `archivos_ticket`) | P3 | En ventana de mantenimiento de baja carga | Baja | `DROP INDEX CONCURRENTLY` reversible |

---

## 9. Decisiones Humanas Pendientes

### D1 — ¿`ventas` ve todos los tickets o solo los asignados?

**Opciones:**
- **A (recomendada para inicio):** `ventas` ve todos los tickets — igual que admin/soporte. La UI no cambia. Riesgo: un vendedor puede ver casos de clientes que no son "suyos".
- **B (restrictiva):** `ventas` solo ve tickets donde `asignado_a = auth.uid()` o `creado_por = auth.uid()`. Requiere que todos los tickets de ventas estén correctamente asignados, o el board queda vacío.

**Impacto en código:** `dashboard.js:142` carga `s.from("tickets").select("*").order("nombre")` sin filtro de cliente. Con Opción B y rol ventas, el board mostrará solo un subconjunto. Si ventas tiene pocos tickets asignados, el board parece roto.

**Por qué no puede tomarse técnicamente:** Solo el negocio sabe si ventas necesita ver todos los tickets para gestionar su trabajo o si es suficiente con los suyos.

**Bloquea:** El `qual` del SQL de `tickets` en el P0. Sin esta decisión hay dos versiones incompatibles del script.

### D2 — ¿`ventas` ve `cliente_accesos` (IDs de AnyDesk)?

**Recomendación técnica:** No. `cliente_accesos` contiene credenciales de acceso remoto. Un vendedor no tiene caso de uso para IDs de AnyDesk.

**Impacto:** La sección de "Acceso remoto" en `ticket.html` quedaría vacía para rol `ventas`. La UI debe manejar esto graciosamente (vacío, sin error 403 visible). Verificar que `ticket.js` no lanza error cuando el SELECT devuelve 0 filas.

**Define:** Si `'ventas'` va o no en el array de roles de la policy de `cliente_accesos`.

### D3 — ¿`ventas` ve `clientes_contactos` (contactos de clientes)?

**Análisis:** `ticket.js:202` `loadClientContacts()` carga el dropdown de contactos cuando el staff abre un ticket. Si `ventas` usa `ticket.html`, necesita ver los contactos para poder seleccionar cuál va en el ticket. La información de contacto (nombre, correo, puesto, teléfono) no es más sensible que la información de clientes que ventas ya va a ver.

**Recomendación:** Incluir `ventas` en el SELECT de `clientes_contactos`.

**Define:** El array de roles en la policy SELECT de `clientes_contactos` (P0-bis).

### D4 — ¿`registros.js:approve()` se migra a EF o se mantiene con SDK directo?

**Asimetría actual:** `altas.js` aprueba via EF `alta-aprobar` (service_role). `registros.js` aprueba via SDK directo (authenticated). Dos enfoques diferentes para funcionalidades equivalentes.

**Opciones:**
- **Mantener la asimetría:** Agregar policies positivas a `clientes_contactos` para authenticated. Más simple, no requiere nueva EF.
- **Migrar a EF `registro-aprobar`:** Más seguro, consistente con altas, pero requiere crear y desplegar una nueva EF.

**Recomendación inmediata:** Mantener la asimetría (opción 1) para desbloquear la funcionalidad. La migración a EF es una mejora para Fase 5.

### D5 — ¿Se activa Turnstile en `support-submit-secure`?

**Prerequisitos técnicos listos:** La función ya tiene la lógica de verificación. Solo necesita `REQUIRE_TURNSTILE=true` en Supabase Secrets y `TURNSTILE_ENABLED=true` en `soporte.js`. El widget debe estar renderizado en `soporte.html`.

**Decisión de negocio:** Si el formulario de soporte recibe spam de bots actualmente, activar Turnstile es urgente. Si el rate limit (5/10min por IP) es suficiente protección por ahora, puede esperar.

### D6 — ¿`match-cliente` se protege con header interno (`x-service-key`) o con JWT?

**El formulario de soporte es público.** JWT requeriría que el usuario del portal tenga sesión, lo que rompe la naturaleza pública del formulario.

**Header `x-service-key`:** El secreto estaría en el JS del frontend (`soporte.js`), expuesto en el código fuente. Sin embargo, es un secreto de bajo impacto (solo permite buscar clientes, no escribir). La alternativa de no tener ningún header es peor.

**Recomendación:** Header `x-service-key` con valor en Supabase Secret, pasado desde `soporte.js` en cada fetch a `match-cliente`.

---

## 10. Qué NO Debe Hacerse Todavía

- **NO ejecutar el SQL de P0** (`tickets`, `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas`) hasta que D1 (¿ventas ve todos los tickets?) esté decidida. Sin esa respuesta, el `qual` de `tickets` tiene dos opciones incompatibles y elegir la incorrecta puede dejar el board de ventas vacío.

- **NO retirar `quick-function` ni `super-service`** sin confirmar primero en Dashboard → Edge Functions → Logs que no hay invocaciones activas en los últimos 7 días. Si alguien las está invocando desde fuera del panel conocido, retirarlas podría romper algo no documentado.

- **NO modificar `ticket.js` ni `tickets.js`** (agregar `ticket_eventos` en `moveTicket`/`closeTicket`) en la misma ventana de cambios que el P0 de RLS. Mezclar cambios de seguridad (policies) con cambios de lógica (código JS) hace el rollback más difícil y complica la atribución de regresiones.

- **NO desplegar rate limits en EFs** sin verificar primero en Dashboard la versión actualmente deployada de cada función. Puede haber divergencia entre el código en el repo y lo que está en producción.

- **NO aplicar el P0 de RLS antes del P0-bis de `clientes_contactos`.** Si se cierran primero las policies de `tickets`/`clientes` y hay alguna regresión, el debug será más difícil si `clientes_contactos` también está en estado roto simultáneamente. Resolver P0-bis primero despeja el campo.

- **NO asumir** que las funciones `createPrimaryContactFromRequest`, `findExistingContact`, `createAlternateContactFromRequest` de `altas.js:34,35,37,38` son activas. Son dead code confirmado — la aprobación de altas va por `callAltaEdge()` → EF `alta-aprobar`. Solo sus equivalentes en `registros.js` son activas.

- **NO crear otros archivos** en esta sesión de modo estricto de auditoría.

- **NO hacer `git add`, `commit`, `push`** hasta que el equipo valide el contenido de este documento.

---

## 11. Prompt Exacto para Continuar

```
Continuamos auditoría Panel Expiriti — siguiente sesión.

Repo: /Users/jaziel/Documents/EXPIRITI_REPOS/panel-expiriti-audit-bd
Rama: audit/supabase-flows

Modo estricto: solo análisis. NO edites código. NO commits. NO SQL ejecutable. NO deploy.

Contexto confirmado en sesiones anteriores:
- clientes_contactos: deny_all_clientes_contactos (PERMISSIVE, public, ALL, qual=false).
  Sin policy positiva para authenticated.
  Rompe: registros.js approve() (INSERT falla con RLS), loadContacts en cliente.js (vacío),
  loadLinkedContact y loadClientContacts en ticket.js (vacíos), hydrateAltaSuggestions (degradado).
  altas.js:approve() va por EF alta-aprobar (service_role) — INSERTs en altas.js son dead code.
  registros.js:approve() hace SDK directo (authenticated) — INSERTs de registros.js son ACTIVOS.
  Clasificado como P0-bis — prioritario sobre P0 de RLS.

- ticket_match_decisiones: 3 policies abiertas, zero referencias en PANEL/*.js.
  Puede incluirse en el script de P0 sin costo ni riesgo de UI.

- moveTicket y closeTicket en tickets.js NO insertan ticket_eventos — historial incompleto.
- quick-function produce 500 en cada llamada. super-service sin uso. Ambas deben retirarse.
- match-cliente es POST público sin JWT ni rate limit — expone datos de contacto de clientes.
- ticket-internal-reply: fix de idempotencia commiteado en f54e22b, versión deployada no confirmada.

Documentos commiteados en DB/:
- audit_dashboard_2026_06_15.md
- auditoria_repo_audit_bd_2026_06_15.md
- plan_remediacion_blindaje_130_2026_06_15.md
- rls_p0_preflight_remediation_2026_06_15.md
- audit_p1_p2_readonly_2026_06_15.md (este documento)

Tarea de esta sesión:
1. Confirmar decisión D1: ¿ventas ve todos los tickets o solo los asignados?
2. Confirmar decisión D3: ¿ventas ve clientes_contactos?
3. Con D1 y D3 decididas: redactar en el chat el SQL de P0-bis para clientes_contactos:
   - policy SELECT (admin/soporte + ventas si D3=sí)
   - policy INSERT (admin/soporte)
   - SQL de validación post-fix (read-only)
   - SQL de rollback
   - lista de pruebas manuales específicas
4. Redactar SQL de P0 para tickets usando la opción decidida en D1.

No generes SQL ejecutable sin confirmación de las decisiones D1 y D3.
No edites archivos de código.
No hagas commits.
```

---

*Documento generado: 2026-06-15 · Solo lectura · Sin SQL write · Sin remediación · Sin deploy*  
*Basado en inspección read-only de `PANEL/*.js` y en documentos de auditoría previos*  
*Siguiente acción: confirmar decisiones D1 y D3, luego preparar SQL de P0-bis para revisión humana*
