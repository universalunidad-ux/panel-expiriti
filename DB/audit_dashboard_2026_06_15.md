# Auditoría Dashboard — Supabase SQL Read-Only
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo lectura. Sin SQL write. Sin remediación. Sin deploy. Sin commits.  
**Fuente:** Resultados de SQL read-only ejecutado en Supabase Dashboard → SQL Editor  
**Herramienta:** Claude Sonnet 4.6 vía claude-code  

---

## Resumen Ejecutivo

El sistema tiene una base estructural sólida: RLS encendido en todas las tablas, constraints bien definidos e índices razonables. Sin embargo, **no está listo para comercialización** hasta cerrar las policies `authenticated` abiertas con `qual = true`, revisar Storage y Edge Functions visualmente en Dashboard, y añadir los rate limits faltantes en endpoints públicos críticos.

---

## 1. RLS Habilitado por Tabla

**Resultado:** RLS habilitado en todas las tablas `public` revisadas.

| campo | valor |
|---|---|
| `rls_habilitado` | `true` en todas las tablas |
| `rls_forzado` | `false` en todas — **normal, no crítico** |

> `forcerowsecurity = false` es el comportamiento esperado. Con `rls_habilitado = true`, el RLS aplica a todos los roles que no sean `superuser` o `bypassrls`. Los usuarios de Supabase Auth (`authenticated`, `anon`) están sujetos a las políticas. Los service_role de Edge Functions bypass total — correcto y esperado.

**Veredicto:** ✅ RLS encendido en la totalidad del schema público. Base correcta.

---

## 2. Policies RLS — Análisis por Tabla

---

### 2.1 Tablas con policies RIESGOSAS (authenticated, qual = true)

#### `tickets` — RIESGO ALTO

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `tickets_select_auth` | SELECT | authenticated | `true` | — |
| `tickets_select_authenticated` | SELECT | authenticated | `true` | — |

**Problema:** Hay **dos políticas SELECT duplicadas** para `authenticated`, ambas con `qual = true`. Cualquier usuario autenticado (cualquier rol: admin, soporte, ventas) puede leer **todos los tickets de todos los clientes** sin restricción. No hay filtro por `creado_por`, `asignado_a`, `cliente_id` ni rol.

**Riesgo adicional:** La duplicación de políticas (`tickets_select_auth` + `tickets_select_authenticated`) sugiere que se crearon en distintos momentos sin limpiar la anterior. Ambas son permisivas; la BD aplica OR entre ellas (Postgres: si al menos una policy permissive aplica, el acceso es concedido). El resultado neto es el mismo — acceso total — pero hay que eliminar el duplicado también por higiene.

**Prioridad:** P0 — cerrar antes de cualquier expansión de usuarios.

---

#### `clientes` — RIESGO ALTO

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `clientes_select_auth` | SELECT | authenticated | `true` | — |

**Problema:** Cualquier usuario autenticado lee todos los clientes: nombre, correo, teléfono, RNC, razón social, calidad de datos, estatus. Tabla contiene información comercial sensible.

**Prioridad:** P0.

---

#### `cliente_accesos` — RIESGO ALTO

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `cliente_accesos_select_auth` | SELECT | authenticated | `true` | — |

**Problema:** `cliente_accesos` almacena IDs de AnyDesk y credenciales de acceso remoto. Con `qual = true`, cualquier usuario autenticado (incluyendo rol `ventas`) puede leer todas las credenciales de todos los clientes.

**Prioridad:** P0 — tabla de credenciales, riesgo inmediato.

---

#### `ticket_respuestas_rapidas` — RIESGO ALTO (policies duplicadas y abiertas)

Tiene policies específicas correctas **y además** policies abiertas que las anulan:

**Policies abiertas (problemáticas):**

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `ticket_qr_select_authenticated` | SELECT | authenticated | `true` | — |
| `ticket_qr_insert_authenticated` | INSERT | authenticated | — | `true` |
| `ticket_qr_update_authenticated` | UPDATE | authenticated | `true` | `true` |
| `ticket_respuestas_rapidas_auth_select` | SELECT | authenticated | `true` | — |
| `ticket_respuestas_rapidas_auth_insert` | INSERT | authenticated | — | `true` |
| `ticket_respuestas_rapidas_auth_update` | UPDATE | authenticated | `true` | `true` |

**Problema:** Seis policies abiertas para `authenticated`, en dos grupos duplicados. Cualquier usuario autenticado puede leer, insertar y actualizar **cualquier respuesta rápida de cualquier cliente o contacto** sin restricción. El sistema de quick replies por scope (global/cliente/contacto) no tiene sentido de propiedad si la RLS no lo impone.

**Prioridad:** P0 — reemplazar por policies con filtro de rol o `cliente_id`.

---

#### `ticket_archivos` (legacy) — RIESGO MEDIO

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `ticket_archivos_select_auth` | SELECT | authenticated | `true` | — |

**Problema:** Tabla legacy activa. Cualquier usuario autenticado lee los archivos de todos los tickets. Como la tabla almacena `url_archivo` (= storage_path), un usuario podría construir signed URLs para archivos de tickets que no le corresponden si tuviera acceso al SDK.

**Prioridad:** P1 — legacy, pero contiene storage_paths activos.

---

#### `ticket_match_decisiones` — RIESGO MEDIO

| policy | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `ticket_match_decisiones_select_auth` | SELECT | authenticated | `true` | — |
| `ticket_match_decisiones_insert_auth` | INSERT | authenticated | — | `true` |
| `ticket_match_decisiones_update_auth` | UPDATE | authenticated | `true` | `true` |

**Problema:** Cualquier usuario autenticado puede leer, crear y modificar decisiones de consolidación de clientes. La tabla contiene datos sensibles de matching (empresa capturada, correo capturado, score, nivel de decisión). Un usuario con rol `ventas` podría marcar decisiones como `aceptado` o `rechazado` sin autorización.

**Prioridad:** P1 — tabla operativa de CRM con datos de matching.

---

### 2.2 Tablas con policies CORRECTAS

| tabla | policies | evaluación |
|---|---|---|
| `archivos_ticket` | `staff_select/insert/update` por rol `admin/soporte/ventas` | ✅ Correcto — acceso acotado a staff |
| `avisos_globales` | `public_read` acotada por `activo = true`, `mostrar_en_soporte = true` y rango de fechas | ✅ Correcto — lectura pública filtrada |
| `bitacora` | SELECT solo `admin/soporte` | ✅ Correcto — solo staff relevante |
| `cliente_sistemas` | `staff` con roles definidos | ✅ Correcto |
| `solicitudes_alta` | cerradas a `anon`; abiertas solo a staff | ✅ Correcto |
| `solicitudes_registro` | cerradas a `anon`; abiertas solo a staff | ✅ Correcto |
| `solicitudes_soporte` | `deny_all public` | ✅ Correcto — acceso solo vía Edge Function con service_role |
| `solicitud_archivos` | `no_client_access` | ✅ Correcto |
| `rate_limit_events` | `no_client_access` | ✅ Correcto — tabla interna de infraestructura |
| `ticket_folios` | `no_client_access` | ✅ Correcto — tabla interna de secuencias |
| `ticket_portal_logs` | `deny_all` | ✅ Correcto |
| `perfiles` | `self` — cada usuario solo ve y edita su propio perfil | ✅ Correcto |

---

### 2.3 Tabla con posible gap — `clientes_contactos`

**Hallazgo:** `clientes_contactos` tiene `deny_all public` sin policy positiva visible para `authenticated`.

**Implicación:** Si no existe ninguna policy SELECT para `authenticated`, el acceso desde el SDK con sesión de usuario devuelve vacío (RLS deniega por defecto). El acceso actual depende enteramente de Edge Functions con service_role.

**Verificar:** Que `alta.js`, `registros.js`, `ticket.js` y `cliente.js` usen siempre Edge Function o que tengan otra policy no capturada en la consulta. Si algún JS hace `supabase.from("clientes_contactos").select(...)` directo con sesión, devolverá 0 filas en producción.

**Prioridad:** P1 — confirmar que no hay código JS que dependa de acceso directo autenticado a esta tabla.

---

## 3. Constraints Reales

---

### 3.1 `solicitud_archivos` — HALLAZGO CRÍTICO RESUELTO

| constraint | tipo | columna origen | tabla referenciada | columna referenciada | on_delete |
|---|---|---|---|---|---|
| `solicitud_archivos_pkey` | PK | id | — | — | — |
| `solicitud_archivos_solicitud_id_fkey` | FK | solicitud_id | `solicitudes_soporte` | id | CASCADE |

**Confirmación:** La FK apunta **únicamente a `solicitudes_soporte(id)`** con `ON DELETE CASCADE`.

**Conteo E3 confirma:**
- Total filas: **31**
- Apuntan a `solicitudes_soporte`: **31**
- No apuntan a `solicitudes_soporte` (huérfanas): **0**

**Conclusión sobre el hallazgo crítico previo:** `submit-alta` **NO inserta en `solicitud_archivos`**. Los archivos de altas se almacenan únicamente en el campo `archivos` (JSONB) de `solicitudes_alta`. La tabla `solicitud_archivos` solo la usa `support-submit-secure` (tickets de soporte público). El hallazgo de posible FK violation queda **RESUELTO — sin riesgo activo**.

---

### 3.2 `ticket_respuestas_rapidas`

| constraint | tipo | descripción |
|---|---|---|
| `ticket_respuestas_rapidas_pkey` | PK | `id` |
| `modo` CHECK | CHECK | Limitado a `seguimiento / nota / solucion` |
| `scope` CHECK | CHECK | Limitado a `global / cliente / contacto` |
| `scope_ids_check` | CHECK | global: cliente_id=NULL, contacto_id=NULL · cliente: cliente_id NOT NULL, contacto_id=NULL · contacto: ambos NOT NULL |
| `ticket_respuestas_rapidas_cliente_id_fkey` | FK | `cliente_id → clientes(id) ON DELETE CASCADE` |
| `ticket_respuestas_rapidas_contacto_id_fkey` | FK | `contacto_id → clientes_contactos(id)` |
| FK compuesta | FK | `(contacto_id, cliente_id) → clientes_contactos(id, cliente_id)` |

**Evaluación:** Estructura de constraints correcta y robusta. El `scope_ids_check` garantiza coherencia de los campos nullable según el scope. La FK compuesta evita que un `contacto_id` se asigne a un `cliente_id` diferente al que pertenece. **El problema de esta tabla no es de constraints sino de RLS** (ver sección 2.1).

---

### 3.3 `tickets`

| constraint | tipo | descripción |
|---|---|---|
| `tickets_pkey` | PK | `id` |
| `estado` CHECK | CHECK | `abierto / en_proceso / esperando_cliente / resuelto / cerrado` |
| `prioridad` CHECK | CHECK | `baja / media / alta / urgente` |
| `tipo` CHECK | CHECK | `soporte / renovacion / facturacion / configuracion` |
| `tickets_cliente_id_fkey` | FK | `cliente_id → clientes(id)` |
| `tickets_contacto_id_fkey` | FK | `contacto_id → clientes_contactos(id)` |
| `tickets_solicitud_soporte_id_fkey` | FK | `solicitud_soporte_id → solicitudes_soporte(id)` |
| `tickets_asignado_a_fkey` | FK | `asignado_a → auth.users(id)` |
| `tickets_creado_por_fkey` | FK | `creado_por → auth.users(id)` |
| `tickets_documento_id_fkey` | FK | `documento_id → documentos(id)` |
| `tickets_cliente_id_sugerido_fkey` | FK | `cliente_id_sugerido → clientes(id)` |
| `tickets_contacto_id_sugerido_fkey` | FK | `contacto_id_sugerido → clientes_contactos(id)` |

**Gap documentado (mejora futura, P3):** No existe FK compuesta que obligue a que `contacto_id` pertenezca al mismo `cliente_id` del ticket. Un contacto de cliente A podría quedar asignado a un ticket de cliente B. La validación actual es solo lógica en el código de Edge Functions.

---

### 3.4 `archivos_ticket`

| constraint | tipo | descripción |
|---|---|---|
| `archivos_ticket_pkey` | PK | `id` |
| `origen` CHECK | CHECK | `solicitud / ticket / portal / interno` |
| `visibilidad` CHECK | CHECK | `publica / interna` |
| `archivos_ticket_ticket_id_fkey` | FK | `ticket_id → tickets(id) ON DELETE CASCADE` |
| `archivos_ticket_solicitud_id_fkey` | FK | `solicitud_id → solicitudes_soporte(id) ON DELETE SET NULL` |
| `archivos_ticket_subido_por_fkey` | FK | `subido_por → auth.users(id)` |

**Evaluación:** Estructura correcta. `ON DELETE CASCADE` en `ticket_id` (si el ticket se elimina, sus archivos también). `ON DELETE SET NULL` en `solicitud_id` (la solicitud puede eliminarse sin perder el archivo). `visibilidad` con CHECK garantiza que el filtro de `estado-ticket-ts` (`WHERE visibilidad='publica'`) siempre opera sobre valores válidos.

---

## 4. Índices

---

### 4.1 `tickets`

| índice | tipo | columnas | nota |
|---|---|---|---|
| `tickets_folio_uidx` | UNIQUE | `folio` | ✅ Crítico — garantiza unicidad de folio |
| `tickets_token_publico_uidx` | UNIQUE | `token_publico` | ✅ Crítico — garantiza unicidad de token |
| `idx_tickets_estado` | BTREE | `estado` | ✅ Útil para kanban y filtros |
| `idx_tickets_prioridad` | BTREE | `prioridad` | ✅ Útil para filtros SLA |
| `idx_tickets_cliente_id` | BTREE | `cliente_id` | ✅ Útil para ficha de cliente |
| `idx_tickets_fecha_actualizacion` | BTREE | `fecha_actualizacion DESC` | ✅ Útil para ordenamiento |
| `idx_tickets_folio_token` | BTREE | `folio, token_publico` | ✅ Útil para lookup de portal |
| `idx_tickets_fecha` | BTREE | `fecha_creacion` | ⚠️ Duplicado funcional con `idx_tickets_fecha_actualizacion` |
| `idx_tickets_actualizacion` | BTREE | `fecha_actualizacion` | ⚠️ Duplicado de `idx_tickets_fecha_actualizacion` (sin DESC) |
| `tickets_folio_token_idx` | BTREE | `folio, token_publico` | ⚠️ Duplicado de `idx_tickets_folio_token` |

**P3 — optimización menor:** Eliminar 3 índices duplicados (`idx_tickets_fecha`, `idx_tickets_actualizacion`, `tickets_folio_token_idx`) cuando haya ventana de mantenimiento. No es urgente.

---

### 4.2 `ticket_eventos`

| índice | tipo | columnas | nota |
|---|---|---|---|
| `idx_ticket_eventos_ticket_created` | BTREE | `ticket_id, created_at` | ✅ Lookup principal por ticket |
| `idx_ticket_eventos_ticket_vis_created` | BTREE | `ticket_id, visibilidad, created_at` | ✅ Filtro de portal (solo `publica`) |
| `idx_ticket_eventos_kind_created` | BTREE | `kind, created_at` | ✅ Útil para métricas por tipo |
| `idx_ticket_eventos_idempotency` | UNIQUE PARTIAL | `meta->>'idempotency_key'` WHERE NOT NULL | ✅ Crítico — previene duplicados de quick replies |
| `idx_ticket_eventos_ticket_publica` | BTREE | `ticket_id, visibilidad, created_at` | ⚠️ Duplicado de `idx_ticket_eventos_ticket_vis_created` |
| `ticket_eventos_ticket_vis_idx` | BTREE | `ticket_id, visibilidad` | ⚠️ Subconjunto de `idx_ticket_eventos_ticket_vis_created` |

**P3 — optimización menor:** Limpiar 2 índices duplicados/subconjunto.

---

### 4.3 `archivos_ticket`

| índice | tipo | columnas | nota |
|---|---|---|---|
| `idx_archivos_ticket_ticket_created` | BTREE | `ticket_id, creado_en` | ✅ Lookup por ticket |
| `idx_archivos_ticket_solicitud_created` | BTREE | `solicitud_id, creado_en` | ✅ Lookup por solicitud |
| `idx_archivos_ticket_origen_created` | BTREE | `origen, creado_en` | ✅ Filtro por origen |
| `idx_archivos_ticket_ticket_vis_created` | BTREE | `ticket_id, visibilidad, creado_en` | ✅ Filtro de portal |
| `archivos_ticket_vis_idx` | BTREE | `ticket_id, visibilidad` | ⚠️ Subconjunto duplicado |
| `idx_archivos_ticket_ticket_publica` | BTREE | `ticket_id, visibilidad, creado_en` | ⚠️ Duplicado de `idx_archivos_ticket_ticket_vis_created` |

**P3 — optimización menor:** Limpiar 2 índices.

---

### 4.4 `ticket_respuestas_rapidas`

| índice | columnas | nota |
|---|---|---|
| `idx_qr_modo_scope_cliente` | `modo, scope, cliente_id, activo, orden` | ✅ Lookup por modo + scope |
| `idx_qr_cliente_modo` | `cliente_id, modo, activo, orden` | ✅ Lookup por cliente |
| `idx_qr_contacto_cliente_modo` | `contacto_id, cliente_id, modo, activo, orden` | ✅ Lookup por contacto |

**Evaluación:** Índices suficientes para los patrones de consulta actuales. El problema de rendimiento no es de índices sino de RLS (policies abiertas permiten leer toda la tabla).

---

### 4.5 `rate_limit_events`

| índice | columnas | nota |
|---|---|---|
| `idx_rate_limit_scope_key_created` | `scope, key, created_at DESC` | ✅ Correcto para ventana de tiempo por IP+scope |

**Evaluación:** Un solo índice bien diseñado. Suficiente para el patrón de uso actual.

---

### 4.6 `edge_idempotency`

| índice | columnas | nota |
|---|---|---|
| `edge_idempotency_pkey` | `idempotency_key` (UNIQUE) | ✅ PK — lookup O(1) por key |
| `idx_edge_idem_action_resource` | `action, resource_id, created_at DESC` | ✅ Útil para auditoría por acción |

**Evaluación:** Estructura correcta para el patrón de idempotencia actual.

---

## 5. Conteos y Estado Operativo

---

### 5.1 `edge_idempotency` — volumen actual

| status | total | mayores 7 días | mayores 30 días |
|---|---|---|---|
| `completed` | 9 | 9 | 0 |
| `failed` | 1 | 1 | 0 |
| **Total** | **10** | **10** | **0** |

**Análisis:**
- Volumen bajo (10 filas). Sin riesgo de crecimiento descontrolado en el corto plazo.
- Los 10 registros tienen más de 7 días — todos son candidatos a limpieza.
- La fila `failed` (1) es relevante: representaría un intento de `ticket-internal-reply` que falló y no fue reintentado. No hay dato de cuándo ocurrió más allá de que tiene más de 7 días.
- **Sin pg_cron instalado**, la limpieza debe hacerse manualmente o via scheduled job externo.

---

### 5.2 `rate_limit_events` — volumen actual

| scope | hits totales | últimas 24h | últimos 7 días | más antiguo | más reciente |
|---|---|---|---|---|---|
| `support_submit` | 41 | 0 | 2 | 2026-04-20 | 2026-06-13 |

**Análisis:**
- Solo se observa el scope `support_submit` — confirma que `support-submit-secure` es la única función que usa `rate_limit_events`.
- Scopes **no encontrados**: `submit_alta`, `submit_registro`, `estado_ticket_responder`, `match_cliente` — ninguno tiene rate limit implementado todavía.
- 41 hits totales en ~2 meses con 0 en las últimas 24h = actividad normal de formulario público, sin signos de abuso.
- Los eventos más antiguos (abril 2026) tienen ~55 días. Sin limpieza automática, este volumen crecerá indefinidamente aunque lentamente.

---

### 5.3 `solicitud_archivos` — integridad referencial

| total_filas | apuntan_a_solicitudes_soporte | no_apuntan_a_solicitudes_soporte |
|---|---|---|
| 31 | 31 | 0 |

**Confirmación definitiva:** Cero filas huérfanas. La tabla `solicitud_archivos` solo contiene archivos de tickets de soporte público (`support-submit-secure`). El flujo de `submit-alta` guarda archivos exclusivamente en `solicitudes_alta.archivos` (JSONB), no en esta tabla. **El hallazgo crítico previo sobre posible FK violation queda CERRADO — sin riesgo.**

---

### 5.4 Extensiones instaladas

| extensión | versión |
|---|---|
| `pg_stat_statements` | — |
| `pg_trgm` | — |
| `pgcrypto` | — |
| `plpgsql` | — |
| `supabase_vault` | — |
| `unaccent` | — |
| `uuid-ossp` | — |

**Ausente:** `pg_cron` — **no instalado**. Confirma que no hay limpieza automática de `edge_idempotency` ni `rate_limit_events`.

**Relevante:**
- `pg_trgm` + `unaccent` explican los índices de matching fuzzy en nombres de clientes (`nombre_norm`, `razon_social_norm`, `alias_norm`). El matchCliente en Edge Functions puede usar `ILIKE` o `SIMILARITY` eficientemente.
- `supabase_vault` está instalado — si en algún momento se guardan secretos en BD (en lugar de solo en Supabase Secrets), el vault está disponible.

---

## 6. Matriz de Priorización

### P0 — Acción inmediata (antes de cualquier expansión de usuarios)

| ítem | tabla/scope | riesgo concreto | tipo de acción |
|---|---|---|---|
| Cerrar `tickets_select_auth` + `tickets_select_authenticated` (duplicadas) | `tickets` | Cualquier usuario autenticado lee todos los tickets de todos los clientes | Dashboard → Policies → eliminar o reemplazar |
| Cerrar `clientes_select_auth` qual=true | `clientes` | Cualquier usuario autenticado lee todos los clientes (nombre, correo, RNC, razón social) | Dashboard → Policies → reemplazar por filtro de rol |
| Cerrar `cliente_accesos_select_auth` qual=true | `cliente_accesos` | Cualquier usuario autenticado lee todas las credenciales AnyDesk de todos los clientes | Dashboard → Policies → reemplazar por rol admin/soporte |
| Eliminar/reemplazar 6 policies abiertas en `ticket_respuestas_rapidas` | `ticket_respuestas_rapidas` | Cualquier usuario autenticado lee, crea y modifica respuestas rápidas de cualquier cliente | Dashboard → Policies → reemplazar por filtro de rol o cliente_id |

### P1 — Alta prioridad (antes del siguiente ciclo de soporte)

| ítem | tabla/scope | riesgo concreto | tipo de acción |
|---|---|---|---|
| Revisar y acotar `ticket_archivos_select_auth` qual=true | `ticket_archivos` (legacy) | storage_paths accesibles a cualquier usuario autenticado | Dashboard → Policies |
| Revisar y acotar policies de `ticket_match_decisiones` | `ticket_match_decisiones` | Cualquier usuario autenticado puede leer/modificar decisiones de consolidación CRM | Dashboard → Policies |
| Confirmar qué código usa `clientes_contactos` directo | `clientes_contactos` | `deny_all public` sin policy positiva puede romper flujos que hacen select directo con SDK | Auditoría de código |
| Confirmar Edge Functions deployadas en Dashboard visual | EF Dashboard | No confirmable via SQL — requiere vista visual | Dashboard → Edge Functions |
| Confirmar Storage policies de `soporte_adjuntos` y `altas_tmp` | Storage | No confirmable via SQL de schema | Dashboard → Storage → Policies |

### P2 — Media prioridad

| ítem | riesgo | tipo de acción |
|---|---|---|
| Añadir rate limit a `estado-ticket-responder-ts` | Spam con token válido | Código + deploy |
| Añadir rate limit a `submit-alta` y `submit-registro` | Spam de solicitudes sin límite | Código + deploy |
| Añadir rate limit a `match-cliente` | Full scan clientes sin límite + exposición de datos | Código + deploy |
| Activar Turnstile en producción | Bot spam de tickets (decisión humana pendiente) | Código + Dashboard Secrets |
| Instalar `pg_cron` y configurar limpieza de `edge_idempotency` | Crecimiento indefinido de tabla | Dashboard → Extensions + SQL job |
| Instalar `pg_cron` y configurar limpieza de `rate_limit_events` | Crecimiento indefinido de tabla | Dashboard → Extensions + SQL job |
| INSERT `ticket_eventos` en `moveTicket` / `closeTicket` | Historial canónico incompleto para cambios de estado desde el board | Código |

### P3 — Puede esperar

| ítem | tipo de acción |
|---|---|
| Limpiar índices duplicados en `tickets`, `ticket_eventos`, `archivos_ticket` | SQL (ventana de mantenimiento) |
| Evaluar FK compuesta `tickets(contacto_id, cliente_id)` → `clientes_contactos(id, cliente_id)` | SQL (mejora futura) |
| Migrar de doble escritura `ticket_eventos` + `tickets.timeline_publica` | Sprint dedicado |
| Migrar de doble escritura `archivos_ticket` + `ticket_archivos` | Sprint dedicado |
| Activar `pg_stat_statements` como herramienta de diagnóstico de queries lentas | Dashboard |

---

## 7. Qué NO se pudo confirmar con SQL de metadata

Los siguientes ítems requieren vista visual en Supabase Dashboard — no son consultables via `pg_policies`, `pg_indexes` ni `pg_constraint`:

| ítem | dónde confirmar |
|---|---|
| **Edge Functions actualmente desplegadas** y su fecha/versión de último deploy | Dashboard → Edge Functions |
| **Storage policies** de `soporte_adjuntos` y `altas_tmp` | Dashboard → Storage → [bucket] → Policies |
| Si `ticket-internal-reply` desplegada en producción = commit `f54e22b` | Dashboard → Edge Functions → ticket-internal-reply → logs/versión |
| Si `quick-function` y `super-service` siguen activas o ya fueron retiradas | Dashboard → Edge Functions |
| **Logs de errores** de Edge Functions (para confirmar si `quick-function` genera 500s reales) | Dashboard → Edge Functions → Logs |
| **Realtime subscriptions** activas (si algún frontend usa canal en tiempo real además del polling) | Dashboard → Database → Realtime |

---

## 8. Conclusión

### Lo que esta auditoría Dashboard confirma

- **RLS encendido en todo el schema público.** Base correcta.
- **Constraints sólidos:** CHECKs de enumeración en todas las tablas críticas, FKs correctas, sin datos corruptos.
- **Índices razonables** con duplicados menores no urgentes.
- **Hallazgo crítico previo RESUELTO:** `solicitud_archivos` no acepta archivos de altas; la FK violation no ocurre. `submit-alta` usa JSONB en `solicitudes_alta.archivos`.
- **`edge_idempotency` y `rate_limit_events`** en volumen bajo y manejable. Sin riesgo inmediato, pero sin limpieza automática.
- **Varias políticas correctas** en tablas de infraestructura y backoffice (bitácora, portal logs, folios, rate limit).

### Lo que requiere corrección antes de escalar usuarios

El sistema **no está listo para comercialización completa** porque:

1. `tickets`, `clientes`, `cliente_accesos` y `ticket_respuestas_rapidas` tienen policies `authenticated` con `qual = true` — cualquier empleado autenticado accede a la totalidad de datos de clientes y tickets, sin restricción por rol ni por propiedad.
2. `ticket_match_decisiones` y `ticket_archivos` (legacy) también tienen acceso total para `authenticated`.
3. Storage policies y Edge Functions deployadas no han sido verificadas visualmente.
4. Cuatro endpoints públicos (`match-cliente`, `estado-ticket-responder-ts`, `submit-alta`, `submit-registro`) carecen de rate limit.
5. `pg_cron` no está instalado — sin limpieza automática de tablas de infraestructura.

### Restricciones vigentes

- No aplicar ningún fix todavía. Los P0 deben ser definidos y revisados antes de ejecutarse.
- El SQL de remediación de policies debe ser preparado, revisado y ejecutado en secuencia controlada.
- No tocar `tickets.timeline_publica`, `ticket_archivos` ni el schema de BD hasta completar los P0 de RLS.

---

*Auditoría generada: 2026-06-15 · Solo lectura · Sin SQL write · Sin remediación · Sin deploy*  
*Fuente: resultados de SQL read-only ejecutados en Supabase Dashboard → SQL Editor*  
*Próxima acción: confirmar visualmente Edge Functions y Storage policies en Dashboard, luego preparar SQL de remediación P0 para revisión humana*
