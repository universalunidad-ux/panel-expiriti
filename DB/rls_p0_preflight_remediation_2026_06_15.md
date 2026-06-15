# RLS P0 — Preflight de Remediación
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo documentación. Sin SQL write. Sin código editado. Sin deploy.  
**Estado:** BORRADOR — no ejecutar SQL todavía. Solo análisis y propuesta.  

---

## 1. Resumen Ejecutivo

### Qué se va a blindar (P0)

Cuatro tablas tienen policies `authenticated` con `qual = true` o `with_check = true` sin ningún filtro de rol ni de propiedad. Cualquier usuario con sesión válida — independientemente de su rol (`admin`, `soporte`, `ventas`) — puede leer y/o escribir todos los registros de esas tablas:

| tabla | problema |
|---|---|
| `tickets` | 2 policies SELECT duplicadas: `tickets_select_auth` + `tickets_select_authenticated`, ambas `qual=true` |
| `clientes` | 1 policy SELECT: `clientes_select_auth` `qual=true` |
| `cliente_accesos` | 1 policy SELECT: `cliente_accesos_select_auth` `qual=true` (tabla de credenciales AnyDesk) |
| `ticket_respuestas_rapidas` | 6 policies abiertas duplicadas: SELECT/INSERT/UPDATE `qual=true` + `with_check=true` en dos grupos |

### Por qué P0

- `cliente_accesos` contiene IDs de AnyDesk y credenciales de acceso remoto. Exponer esto a rol `ventas` es un riesgo de seguridad inmediato.
- `tickets` con SELECT total permite que un usuario vea los tickets de todos los clientes de la empresa, violando la separación básica de datos.
- `clientes` con SELECT total permite que cualquier usuario autenticado exporte la base de clientes completa (nombre, correo, RNC, razón social, estatus).
- `ticket_respuestas_rapidas` con INSERT/UPDATE totales permite que cualquier usuario modifique respuestas rápidas de otros clientes o contactos.

### Qué NO se toca todavía

- Tablas P1: `ticket_archivos` (legacy), `ticket_match_decisiones` — se remedia en la siguiente fase.
- `clientes_contactos` — requiere auditoría de código primero (ver Sección 3 y 10).
- Storage: `soporte_adjuntos`, `altas_tmp` — requiere verificación visual en Dashboard.
- Edge Functions: rate limits, Turnstile, `match-cliente` sin auth — Fase 4.
- Cualquier migración de doble-write o schema — Fases 5-6.

### Diferencia entre P0 y P1

| criterio | P0 | P1 |
|---|---|---|
| Impacto de no corregir | Credenciales expuestas, datos de clientes visibles a todos los roles | Menor — tabla legacy, datos de matching, contactos |
| Urgencia | Antes de escalar usuarios | Antes del siguiente ciclo de soporte |
| Riesgo de rollback | Bajo — policies bien definidas, rollback documentado | Medio — puede requerir auditoría adicional |
| Dependencias de código | Confirmadas en esta auditoría | Requieren análisis adicional |

---

## 2. Lectura Cruzada de Documentos

### 2.1 Hallazgos de `DB/audit_dashboard_2026_06_15.md`

- **Sección 2.1:** Confirma las 4 tablas P0 con policies abiertas. Cita exacta: *"Cualquier usuario autenticado (incluyendo rol ventas) puede leer todos los tickets de todos los clientes sin restricción."*
- **Sección 2.1 (`cliente_accesos`):** *"`cliente_accesos` almacena IDs de AnyDesk y credenciales de acceso remoto. Con qual=true, cualquier usuario autenticado puede leer todas las credenciales de todos los clientes."*
- **Sección 2.1 (`ticket_respuestas_rapidas`):** Confirma dos grupos de 3 policies duplicadas abiertas, lo que da 6 policies abiertas totales para SELECT/INSERT/UPDATE.
- **Sección 2.2:** Lista las policies que SÍ están bien — bitácora, perfiles, avisos_globales, solicitudes_*, rate_limit_events, portal_logs — estas NO se tocan en P0.
- **Sección 2.3:** Documenta que `clientes_contactos` tiene `deny_all public` sin policy positiva visible — analizado en Sección 3 de este documento.

### 2.2 Hallazgos de `DB/plan_remediacion_blindaje_130_2026_06_15.md`

- **Sección 3 (P0-1 a P0-5):** Define la matriz de priorización. P0 incluye los 4 cierres de RLS más `quick-function`.
- **Sección 4 (Plan RLS):** Para cada tabla P0 define el objetivo de policy conceptualmente: *"admin y soporte: acceso total; ventas: solo tickets asignados/propios"*.
- **Sección 7 (Fase 2):** Define la secuencia: primero `tickets` y `clientes` (mayor riesgo), luego `cliente_accesos`, luego `ticket_respuestas_rapidas`.
- **Sección 9 (Pruebas 9.9):** Define las pruebas por rol que deben ejecutarse post-fix.

### 2.3 Hallazgos de `DB/auditoria_repo_audit_bd_2026_06_15.md`

- **Sección 3 (C1, C2):** Documenta que `tickets.folio` tiene UNIQUE index confirmado. Las policies `authenticated` abiertas no afectan la integridad — solo la confidencialidad.
- **Sección 3 (C11):** `cliente_accesos` — *"Contiene IDs AnyDesk y credenciales de acceso remoto. Leída directamente desde ticket.js con s.from('cliente_accesos').select('*'). RLS no auditada."*
- **Sección 4 (B2):** *"Si alguna tiene qual=true, cualquier usuario autenticado ve todos los tickets/clientes."* — Confirmado por Dashboard SQL.

### 2.4 Cómo se conectan

Los tres documentos forman una cadena de evidencia:
1. `auditoria_repo_audit_bd_2026_06_15.md` identificó el riesgo teórico desde el código.
2. `audit_dashboard_2026_06_15.md` lo confirmó empíricamente via SQL read-only en producción.
3. `plan_remediacion_blindaje_130_2026_06_15.md` lo priorizó y definió la secuencia.
4. **Este documento** cierra el ciclo con el análisis de dependencias y los borradores de SQL.

---

## 3. Auditoría Read-Only de Dependencias en Código

> Inspeccionados vía grep en PANEL/. Todos los archivos son frontend (browser) con sesión `authenticated` salvo cuando se indica EF (service_role).

---

### 3.1 Tabla `tickets`

| archivo | línea | operación | desde | requiere policy RLS | se rompería al restringir |
|---|---|---|---|---|---|
| `PANEL/cliente.core.js` | 28 | SELECT `*` WHERE `cliente_id` | browser (authenticated) | Sí — SELECT staff | Solo si `ventas` no tiene policy para ver sus tickets |
| `PANEL/cliente.core.js` | 33 | INSERT ticket + INSERT `ticket_archivos` | browser (authenticated) | Sí — INSERT staff | Solo si se elimina policy INSERT actual |
| `PANEL/cliente.js` | 34 | SELECT `*` WHERE `cliente_id` | browser (authenticated) | Sí — SELECT staff | Solo si `ventas` no tiene policy |
| `PANEL/dashboard.js` | 38 | SELECT `COUNT(*)` (folio naive — race condition conocida) | browser (authenticated) | Sí — SELECT staff | Solo si policy no cubre admin/soporte/ventas |
| `PANEL/dashboard.js` | 141 | INSERT ticket (desde modal) | browser (authenticated) | Sí — INSERT staff | Solo si se elimina policy INSERT |
| `PANEL/dashboard.js` | 142 | SELECT `*` con join a `clientes` + límite 1200 | browser (authenticated) | Sí — SELECT staff (todos) | Si `ventas` no puede ver todos los tickets |
| `PANEL/dashboard.js` | 150 | UPDATE batch close (estados → `cerrado`) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| `PANEL/ticket.js` | 168 | UPDATE `contexto_adicional` (saveAnyDesk) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| `PANEL/ticket.js` | 194 | UPDATE identity change (applyTicketIdentityUpdate) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| `PANEL/ticket.js` | 239 | SELECT single WHERE `id` | browser (authenticated) | Sí — SELECT staff | No — ticket individual, cualquier staff debería verlo |
| `PANEL/ticket.js` | 240 | SELECT heatmap WHERE `cliente_id`, gte 365 días | browser (authenticated) | Sí — SELECT staff | No — filtrado por cliente_id |
| `PANEL/ticket.js` | 250 | UPDATE vía `saveLog` (estado, timeline, adjuntos) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| `PANEL/tickets.js` | 260 | UPDATE `moveTicket` (cambio de estado) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| `PANEL/tickets.js` | 263 | UPDATE `closeTicket` (cerrar ticket) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| EF `ticket-internal-reply` | — | SELECT + UPDATE | service_role (bypass RLS) | No | No |
| EF `crear-ticket-interno` | — | INSERT | service_role (bypass RLS) | No | No |
| EF `estado-ticket-ts` | — | SELECT (folio+token) | service_role (bypass RLS) | No | No |
| EF `support-submit-secure` | — | INSERT + UPDATE | service_role (bypass RLS) | No | No |

**Conclusión tickets:** El frontend usa `tickets` intensamente vía SDK browser. La policy SELECT restrictiva **debe incluir a admin, soporte y ventas**. Restringir UPDATE a solo admin/soporte requiere analizar si `ventas` hace UPDATEs desde `dashboard.js` (batch close: sí lo hace). Decisión humana requerida (ver Sección 10).

---

### 3.2 Tabla `clientes`

| archivo | línea | operación | desde | requiere policy RLS | se rompería al restringir |
|---|---|---|---|---|---|
| `PANEL/altas.js` | 33 | SELECT `id,nombre` WHERE `correo` / `nombre` (findExistingClient) | browser (authenticated) | Sí — SELECT staff | Solo si `ventas` no tiene policy |
| `PANEL/altas.js` | 35 | INSERT cliente (createClientFromRequest) | browser (authenticated) | Sí — INSERT staff | **POSIBLE CÓDIGO MUERTO** — `alta-aprobar` EF lo reemplaza |
| `PANEL/altas.js` | 44 | SELECT `id,nombre` WHERE `id IN (...)` (hydrateAltaSuggestions) | browser (authenticated) | Sí — SELECT staff | No — solo lee IDs específicos |
| `PANEL/cliente.core.js` | 26 | SELECT `*` WHERE `id` single | browser (authenticated) | Sí — SELECT staff | No — lectura por ID específico |
| `PANEL/cliente.core.js` | 34 | UPDATE cliente (saveCRM) | browser (authenticated) | Sí — UPDATE staff | Solo si se restringe UPDATE |
| `PANEL/cliente.js` | 32 | SELECT `*` WHERE `id` single | browser (authenticated) | Sí — SELECT staff | No — ID específico |
| `PANEL/dashboard.js` | 84 | INSERT cliente rápido | browser (authenticated) | Sí — INSERT staff | Solo si se restringe INSERT |
| `PANEL/dashboard.js` | 142 | **SELECT `*` ORDER nombre — SIN FILTRO** | browser (authenticated) | Sí — SELECT staff (todos) | **CRÍTICO:** carga todos los clientes al abrir dashboard |
| `PANEL/registros.js` | 29, 31, 33 | SELECT `id,nombre` WHERE correo/tel/nombre | browser (authenticated) | Sí — SELECT staff | Solo si `ventas` no tiene policy |
| `PANEL/registros.js` | 45 | INSERT cliente (createClientFromRequest) | browser (authenticated) | Sí — INSERT staff | **POSIBLE CÓDIGO MUERTO** — `registro-aprobar` EF lo reemplaza |
| `PANEL/ticket.js` | 240 | SELECT `id,nombre` WHERE `id` single | browser (authenticated) | Sí — SELECT staff | No — ID específico |
| `PANEL/tickets.js` | 255 | SELECT `id,nombre` ILIKE búsqueda | browser (authenticated) | Sí — SELECT staff | No — búsqueda libre, limitada a staff |
| EF `match-cliente`, `submit-alta`, `submit-registro`, `alta-aprobar`, `registro-aprobar`, `crear-ticket-interno` | — | SELECT / INSERT / UPDATE | service_role (bypass RLS) | No | No |

**Hallazgo crítico en `dashboard.js:142`:** `s.from("clientes").select("*").order("nombre")` — carga **todos los clientes sin límite** al abrir el dashboard. No hay `.limit()`. Si se restringe el SELECT de `clientes` a solo admin/soporte y `ventas` no tiene policy, el dashboard de `ventas` quedará vacío en la sección de clientes. Si `ventas` sí tiene policy (todos), la carga masiva continúa. **Decisión de diseño requerida.**

**Conclusión clientes:** La policy SELECT debe incluir admin, soporte y ventas. Los INSERT en `altas.js:35` y `registros.js:45` parecen ser código antiguo de aprobación directa que el panel ya no usa (reemplazado por EFs). Si se confirma que son dead code, se puede restringir INSERT a solo admin/soporte sin impacto. Verificar antes de actuar.

---

### 3.3 Tabla `cliente_accesos`

| archivo | línea | operación | desde | requiere policy RLS | se rompería al restringir |
|---|---|---|---|---|---|
| `PANEL/ticket.js` | 166 | SELECT `*` WHERE `cliente_id`, `activo=true` (loadClientAccesses) | browser (authenticated) | Sí — SELECT staff | Si `ventas` no tiene policy → sección AnyDesk quedará vacía |
| `PANEL/ticket.js` | 168 | INSERT/UPDATE (saveAnyDeskAccess) | browser (authenticated) | Sí — INSERT/UPDATE staff | Si `ventas` no tiene INSERT/UPDATE → no puede guardar AnyDesk |

**Conclusión `cliente_accesos`:** Solo `ticket.js` la usa, solo para la sección AnyDesk en la vista de ticket. La pregunta clave es si `ventas` debe poder ver y editar IDs de AnyDesk. Por defecto recomendado: **solo admin/soporte** (ver Sección 10).

---

### 3.4 Tabla `ticket_respuestas_rapidas`

| archivo | línea | operación | desde | requiere policy RLS | se rompería al restringir |
|---|---|---|---|---|---|
| `PANEL/quick-replies.shared.js` | 13 | SELECT `*` filtrado por scope/modo/cliente/contacto | browser (authenticated) | Sí — SELECT staff | Solo si policy no cubre admin/soporte |
| `PANEL/quick-replies.shared.js` | 14 | SELECT `*` filtrado por scope | browser (authenticated) | Sí | Idem |
| `PANEL/quick-replies.shared.js` | 15 | UPDATE `activo=false` (soft delete) | browser (authenticated) | Sí — UPDATE staff | Si `ventas` no tiene UPDATE → no puede editar |
| `PANEL/quick-replies.shared.js` | 16 | SELECT + UPDATE soft delete + INSERT nuevas | browser (authenticated) | Sí — SELECT+UPDATE+INSERT | Si policy restringe a admin/soporte solamente |
| `PANEL/ticket.js` | 67 | SELECT filtrado (loadQuickReplies) | browser (authenticated) | Sí | Solo si policy no cubre admin/soporte |
| `PANEL/ticket.js` | 77 | SELECT filtrado (qrLoadEditor) | browser (authenticated) | Sí | Idem |
| `PANEL/ticket.js` | 82 | UPDATE `activo=false` (soft delete inline) | browser (authenticated) | Sí | Idem que shared.js:15 |
| `PANEL/ticket.js` | 83 | SELECT + UPDATE + INSERT (qrSaveAll) | browser (authenticated) | Sí | Idem que shared.js:16 |
| `PANEL/ticket.js` | 84 | INSERT/UPDATE (saveQuickReply) | browser (authenticated) | Sí | Idem |
| `PANEL/ticket.js` | 85 | UPDATE (deleteQuickReply) | browser (authenticated) | Sí | Idem |

**Hallazgo importante:** `ticket_respuestas_rapidas` es usada extensamente desde el browser, con SELECT, INSERT, UPDATE y soft-DELETE. Las políticas correctas que ya existen (por rol admin/soporte) deberían cubrir estos flujos. El problema es que los 6 duplicados abiertos anulan la necesidad de las policies correctas. Al eliminar los duplicados, las policies existentes deben ser suficientes para admin/soporte. El efecto para `ventas`: si no existe policy para ventas, no podrá ver quick replies — aceptable si ventas no usa el panel de tickets.

---

### 3.5 Tabla `ticket_archivos` (P1 — documentado por referencia)

| archivo | línea | operación | desde | nota |
|---|---|---|---|---|
| `PANEL/cliente.core.js` | 33 | INSERT (desde bucket `certificados`, no `soporte_adjuntos`) | browser (authenticated) | Flujo legacy de cliente.html, bucket distinto |
| `PANEL/ticket.js` | 160 | INSERT (uploadPublicLogFiles, soft-fail) | browser (authenticated) | Legacy write |
| `PANEL/ticket.js` | 240 | SELECT (loadTicketContext) | browser (authenticated) | Lectura de archivos del ticket |

---

### 3.6 Tabla `ticket_match_decisiones` (P1 — documentado por referencia)

| fuente | operación | desde |
|---|---|---|
| **PANEL JS** | **Sin referencias encontradas** | — |
| EF `crear-ticket-interno` | INSERT | service_role (bypass RLS) |

**Hallazgo clave:** `ticket_match_decisiones` **NO es accedida desde ningún archivo JS del browser**. Las 3 policies abiertas (`_select_auth`, `_insert_auth`, `_update_auth`) nunca son ejercidas por el frontend. Cerrarlas o eliminarlas **no rompe ningún flujo de UI**. El INSERT va siempre por EF con service_role. Se puede adelantar a P0 si se desea, o mantener en P1.

---

### 3.7 Tabla `clientes_contactos` (P1 — gap identificado)

| archivo | línea | operación | desde | nota |
|---|---|---|---|---|
| `PANEL/altas.js` | 34 | SELECT por cliente_id (findExistingContact) | browser (authenticated) | Posible dead code — `alta-aprobar` EF cubre esto |
| `PANEL/altas.js` | 35 | INSERT principal (createPrimaryContactFromRequest) | browser (authenticated) | Posible dead code — `alta-aprobar` EF |
| `PANEL/altas.js` | 37, 38 | SELECT + INSERT alterno | browser (authenticated) | Posible dead code — `alta-aprobar` EF |
| `PANEL/altas.js` | 44 | SELECT `id,nombre,correo,telefono` IN (hydrateAltaSuggestions) | browser (authenticated) | **ACTIVO** — hidrata sugerencias en la UI de altas |
| `PANEL/cliente.js` | 35 | SELECT `*` por cliente_id (loadContacts) | browser (authenticated) | **ACTIVO** — carga contactos en ficha de cliente |
| `PANEL/registros.js` | 40 | SELECT por cliente_id | browser (authenticated) | Posible dead code — dentro de findExistingContact |
| `PANEL/registros.js` | 47, 48, 49 | INSERT principal + SELECT + INSERT alterno | browser (authenticated) | Posible dead code — `registro-aprobar` EF |
| `PANEL/ticket.js` | 138 | SELECT por `contacto_id` o `cliente_id` (loadLinkedContact) | browser (authenticated) | **ACTIVO** — muestra contacto ligado al ticket |
| `PANEL/ticket.js` | 202 | SELECT `id,nombre,correo,telefono,puesto,activo` por cliente_id (loadClientContacts) | browser (authenticated) | **ACTIVO** — selector de contacto en ticket |

**Conclusión `clientes_contactos`:** Hay **al menos 4 flujos activos** que hacen SELECT directo desde el browser. Si `clientes_contactos` tiene `deny_all public` sin policy positiva para `authenticated`, estos flujos devuelven 0 filas silenciosamente:
- `altas.js:44` — sugerencias de clientes en panel de altas quedan vacías
- `cliente.js:35` — sección de contactos en ficha de cliente queda vacía
- `ticket.js:138` — contacto ligado al ticket no se muestra
- `ticket.js:202` — selector de contactos en ticket queda vacío

**Esto puede estar roto en producción ahora mismo**, o puede haber una policy positiva que no fue capturada en el SQL de auditoría. **Requiere verificación urgente en Dashboard** antes de que P0 se ejecute, ya que si se añade policy positiva como parte del trabajo, debe hacerse coordinadamente.

---

### 3.8 Edge Functions — referencias en código

| EF | archivo que la invoca | método | auth |
|---|---|---|---|
| `ticket-internal-reply` | `tickets.js:137` via `s.functions.invoke` | JWT Bearer (sesión) | Verificado en EF |
| `crear-ticket-interno` | `tickets.js:256` via `s.functions.invoke` | JWT Bearer (sesión) | Verificado en EF |
| `estado-ticket-ts` | `estado.js:4` via fetch GET | Token público (folio+token) | Verificado en EF |
| `support-submit-secure` | `soporte.js:6` via fetch POST | Pública + rate limit | En EF |
| `match-cliente` | `soporte.js:8` via fetch POST | **Sin auth** | Sin verificación |

---

## 4. Matriz de Dependencia por Tabla

| tabla | uso frontend directo | uso edge function | rol requerido | policy actual peligrosa | policy objetivo | riesgo de romper UI | prueba necesaria |
|---|---|---|---|---|---|---|---|
| `tickets` | Sí — SELECT, INSERT, UPDATE desde 5 archivos JS | Sí — service_role en 4 EFs | admin, soporte, ventas (con restricción) | `tickets_select_auth` + `tickets_select_authenticated` `qual=true` | SELECT para admin/soporte (todos) + ventas (asignados o todos — decisión humana) | **ALTO** si ventas queda sin SELECT | Board `tickets.html` carga con cada rol |
| `clientes` | Sí — SELECT, INSERT, UPDATE desde 6 archivos | Sí — service_role en 6 EFs | admin, soporte, ventas | `clientes_select_auth` `qual=true` | SELECT para admin/soporte/ventas (todos, o acotado) | **ALTO** si dashboard queda sin clientes | `dashboard.html` + `cliente.html` cargan |
| `cliente_accesos` | Sí — SELECT + INSERT/UPDATE desde `ticket.js` | No | admin, soporte (ventas: decisión) | `cliente_accesos_select_auth` `qual=true` | SELECT/INSERT/UPDATE solo admin/soporte | MEDIO — sección AnyDesk de tickets quedaría vacía para ventas | `ticket.html` con rol soporte ve AnyDesk; rol ventas no ve (si se restringe) |
| `ticket_respuestas_rapidas` | Sí — SELECT/INSERT/UPDATE/soft-DELETE desde `ticket.js` y `quick-replies.shared.js` | No | admin, soporte | 6 policies abiertas duplicadas | SELECT/INSERT/UPDATE/DELETE solo admin/soporte | BAJO — ya existen policies correctas; solo eliminar duplicados abiertos | Panel de quick replies en `ticket.html` y `tickets.html` funciona para admin/soporte |
| `ticket_archivos` (P1) | Sí — SELECT desde `ticket.js`, INSERT desde `ticket.js` y `cliente.core.js` | Sí — service_role soft-fail en EFs | admin, soporte | `ticket_archivos_select_auth` `qual=true` | SELECT/INSERT solo admin/soporte | MEDIO — sección de archivos legacy en ticket | Archivos visibles en `ticket.html` |
| `ticket_match_decisiones` (P1) | **No** — sin referencias en PANEL JS | Sí — `crear-ticket-interno` service_role | Solo EF | 3 policies abiertas (`_select_auth`, `_insert_auth`, `_update_auth`) | Eliminar las 3 o reemplazar con deny all authenticated | **NINGUNO** — ningún frontend accede directo | Crear ticket interno → no hay regresión de UI |
| `clientes_contactos` (P1/GAP) | Sí — SELECT activo en 4 flujos; INSERT en posible dead code | Sí — service_role en `alta-aprobar`, `registro-aprobar`, `crear-ticket-interno` | admin, soporte | `deny_all public` sin policy positiva visible | Confirmar en Dashboard: si no existe policy positiva, añadir SELECT para admin/soporte/ventas | **CRÍTICO** — si no existe policy positiva, 4 flujos del panel están rotos ahora | `ticket.html` muestra contacto ligado; `cliente.html` muestra lista de contactos |

---

## 5. Diseño de Policy Objetivo P0

### 5.A `tickets` — diseño de policies

**Objetivo:** Reemplazar las 2 policies SELECT abiertas por una sola policy restrictiva. Mantener INSERT y UPDATE para staff mientras se determina si se acotan.

**Policies a eliminar:**
- `tickets_select_auth` (qual=true para authenticated)
- `tickets_select_authenticated` (qual=true para authenticated — duplicado)

**Policy SELECT objetivo (opción recomendada — staff completo):**

Nombre: `tickets_select_staff`  
Comando: SELECT  
Roles: `authenticated`  
Qual: restricción a roles `admin`, `soporte`, `ventas` verificados vía `perfiles`

```sql
-- Conceptual: solo usuarios cuyo id existe en perfiles con rol conocido
USING (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
    AND p.rol IN ('admin', 'soporte', 'ventas')
  )
)
```

**Alternativa más restrictiva para `ventas`:**

```sql
-- ventas solo ve tickets asignados a él
USING (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
    AND (
      p.rol IN ('admin', 'soporte')
      OR (p.rol = 'ventas' AND (tickets.asignado_a = auth.uid() OR tickets.creado_por = auth.uid()))
    )
  )
)
```

**Política para INSERT (revisar si se conserva):**

`dashboard.js:141` y `cliente.core.js:33` hacen INSERT directo de tickets desde el browser. Si se quiere mantener este flujo para admin/soporte/ventas, la policy INSERT actual debe conservarse o ajustarse al mismo patrón de filtro de rol. Documentar la decisión (ver Sección 10).

**Política para UPDATE (revisar si se conserva):**

Múltiples archivos JS hacen UPDATE de tickets desde el browser. Restringir UPDATE a solo admin/soporte implicaría que `ventas` no pueda cerrar tickets desde el board. Documentar la decisión (ver Sección 10).

---

### 5.B `clientes` — diseño de policies

**Policy a eliminar:**
- `clientes_select_auth` (qual=true para authenticated)

**Policy SELECT objetivo:**

Nombre: `clientes_select_staff`  
Roles: `authenticated`  
Qual:

```sql
USING (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
    AND p.rol IN ('admin', 'soporte', 'ventas')
  )
)
```

**Políticas INSERT y UPDATE:**

`altas.js:35` y `registros.js:45` tienen INSERT de clientes desde el browser, pero parecen ser código antiguo reemplazado por EFs. Si se confirman como dead code, se puede restringir INSERT/UPDATE a solo admin/soporte y las EFs (service_role) continúan funcionando sin interrupción. Verificar antes de actuar.

---

### 5.C `cliente_accesos` — diseño de policies

**Policy a eliminar:**
- `cliente_accesos_select_auth` (qual=true para authenticated)

**Policy SELECT objetivo (opción segura recomendada):**

Nombre: `cliente_accesos_select_staff`  
Roles: `authenticated`  
Qual:

```sql
USING (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
    AND p.rol IN ('admin', 'soporte')
  )
)
```

> Si se decide que `ventas` también necesita ver credenciales AnyDesk, agregar `'ventas'` al array de roles. Ver Sección 10 para la decisión.

**Policy INSERT/UPDATE objetivo:**

Si ya existe policy INSERT/UPDATE para staff: revisar que no incluya a `ventas`. Si no existe: crear para `admin`/`soporte` únicamente.

---

### 5.D `ticket_respuestas_rapidas` — diseño de policies

**Policies a eliminar (6 abiertas):**
- `ticket_qr_select_authenticated`
- `ticket_qr_insert_authenticated`
- `ticket_qr_update_authenticated`
- `ticket_respuestas_rapidas_auth_select`
- `ticket_respuestas_rapidas_auth_insert`
- `ticket_respuestas_rapidas_auth_update`

**Verificar que las policies correctas existentes cubren admin/soporte:**

Las policies específicas por rol (ya existentes, reportadas como correctas en el dashboard) deben mantenerse. Antes de eliminar las abiertas, confirmar en SQL read-only que estas policies existentes tienen `roles IN ('admin','soporte')` con `qual` apropiado.

Si las policies correctas no existen o son insuficientes, crear:

```sql
-- SELECT para admin/soporte
-- Nombre: ticket_qr_select_staff
-- Roles: authenticated
-- Qual:
USING (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
    AND p.rol IN ('admin', 'soporte')
  )
)

-- INSERT para admin/soporte
-- Nombre: ticket_qr_insert_staff
-- WITH CHECK:
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
    AND p.rol IN ('admin', 'soporte')
  )
)

-- UPDATE para admin/soporte (mismo patrón)
-- DELETE: si no existe policy DELETE, el soft-delete via UPDATE activo=false está cubierto por UPDATE
```

`ventas` no debe poder editar quick replies salvo decisión expresa del negocio.

---

## 6. SQL Propuesto de Remediación P0 — BORRADOR (NO EJECUTAR)

> **ADVERTENCIA:** Este SQL es un borrador conceptual. NO ejecutar directamente.  
> Antes de ejecutar: (1) Hacer backup de pg_policies actuales. (2) Revisar con el equipo técnico. (3) Ejecutar en orden, tabla por tabla. (4) Validar cada tabla antes de continuar.

```sql
-- ================================================================
-- BORRADOR P0 — REMEDIACIÓN RLS — Panel Expiriti
-- Fecha propuesta: post-revisión humana
-- NO EJECUTAR SIN REVISIÓN
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- PASO 1: tickets — eliminar policies SELECT abiertas duplicadas
-- ----------------------------------------------------------------

-- Riesgo: si la policy correcta de SELECT no queda activa, el board
-- de tickets quedará vacío para todos los usuarios.
-- Verificar primero que las policies de INSERT y UPDATE para
-- authenticated siguen activas y no se borran aquí.

DROP POLICY IF EXISTS tickets_select_auth ON public.tickets;
DROP POLICY IF EXISTS tickets_select_authenticated ON public.tickets;

-- Crear nueva policy SELECT restrictiva para staff
-- DECISIÓN HUMANA REQUERIDA: elegir entre opción A (todos los staff)
-- o opción B (ventas solo ve sus tickets).

-- OPCIÓN A — todos los roles de staff ven todos los tickets:
CREATE POLICY tickets_select_staff ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')
    )
  );

-- OPCIÓN B — ventas solo ve tickets asignados o creados por él:
-- (comentada — descomentar si se elige esta opción)
--
-- CREATE POLICY tickets_select_staff ON public.tickets
--   FOR SELECT
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.perfiles p
--       WHERE p.id = auth.uid()
--         AND (
--           p.rol IN ('admin', 'soporte')
--           OR (
--             p.rol = 'ventas'
--             AND (
--               public.tickets.asignado_a = auth.uid()
--               OR public.tickets.creado_por = auth.uid()
--             )
--           )
--         )
--     )
--   );

-- ----------------------------------------------------------------
-- PASO 2: clientes — eliminar policy SELECT abierta
-- ----------------------------------------------------------------

-- Riesgo: dashboard.js hace SELECT sin límite de clientes.
-- Si policy nueva no cubre al rol que abre el dashboard,
-- la sección de clientes quedará vacía.

DROP POLICY IF EXISTS clientes_select_auth ON public.clientes;

CREATE POLICY clientes_select_staff ON public.clientes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')
    )
  );

-- ----------------------------------------------------------------
-- PASO 3: cliente_accesos — eliminar policy SELECT abierta
-- ----------------------------------------------------------------

-- Riesgo BAJO en UI: solo ticket.js la usa para sección AnyDesk.
-- Si ventas no debe ver credenciales, solo incluir admin/soporte.
-- DECISIÓN HUMANA: ver Sección 10.

DROP POLICY IF EXISTS cliente_accesos_select_auth ON public.cliente_accesos;

CREATE POLICY cliente_accesos_select_staff ON public.cliente_accesos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
        -- Agregar 'ventas' aquí si se decide que ventas ve credenciales
    )
  );

-- ----------------------------------------------------------------
-- PASO 4: ticket_respuestas_rapidas — eliminar 6 policies abiertas
-- ----------------------------------------------------------------

-- Riesgo: BAJO si las policies correctas por rol ya existen.
-- Verificar ANTES de ejecutar que existen policies específicas
-- para admin/soporte que cubran SELECT/INSERT/UPDATE.
-- Si no existen, crear primero (bloque de creación abajo).

DROP POLICY IF EXISTS ticket_qr_select_authenticated ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS ticket_qr_insert_authenticated ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS ticket_qr_update_authenticated ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS ticket_respuestas_rapidas_auth_select ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS ticket_respuestas_rapidas_auth_insert ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS ticket_respuestas_rapidas_auth_update ON public.ticket_respuestas_rapidas;

-- Si las policies correctas existentes NO cubren admin/soporte,
-- crear estas (descomentar si necesario):
--
-- CREATE POLICY ticket_qr_select_staff ON public.ticket_respuestas_rapidas
--   FOR SELECT TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.perfiles p
--       WHERE p.id = auth.uid()
--         AND p.rol IN ('admin', 'soporte')
--     )
--   );
--
-- CREATE POLICY ticket_qr_insert_staff ON public.ticket_respuestas_rapidas
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.perfiles p
--       WHERE p.id = auth.uid()
--         AND p.rol IN ('admin', 'soporte')
--     )
--   );
--
-- CREATE POLICY ticket_qr_update_staff ON public.ticket_respuestas_rapidas
--   FOR UPDATE TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.perfiles p
--       WHERE p.id = auth.uid()
--         AND p.rol IN ('admin', 'soporte')
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.perfiles p
--       WHERE p.id = auth.uid()
--         AND p.rol IN ('admin', 'soporte')
--     )
--   );

COMMIT;

-- ================================================================
-- FIN DEL BORRADOR P0
-- Las tablas P1 (ticket_archivos, ticket_match_decisiones) NO están
-- incluidas aquí. Se tratan en la siguiente fase.
-- ================================================================
```

---

## 7. SQL de Rollback P0 — BORRADOR (SOLO SI HAY REGRESIÓN)

> **ADVERTENCIA:** Ejecutar el rollback reabre los riesgos de seguridad. Solo usar temporalmente si se detecta regresión crítica. Documentar el incidente y corregir el problema de raíz antes de volver a aplicar P0.

```sql
-- ================================================================
-- ROLLBACK P0 — RESTAURA POLICIES ABIERTAS
-- Usar SOLO si hay regresión crítica post-aplicación de P0.
-- Reabre los riesgos de seguridad documentados.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- Restaurar tickets
-- ----------------------------------------------------------------

CREATE POLICY tickets_select_auth ON public.tickets
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY tickets_select_authenticated ON public.tickets
  FOR SELECT
  TO authenticated
  USING (true);

-- ----------------------------------------------------------------
-- Restaurar clientes
-- ----------------------------------------------------------------

CREATE POLICY clientes_select_auth ON public.clientes
  FOR SELECT
  TO authenticated
  USING (true);

-- ----------------------------------------------------------------
-- Restaurar cliente_accesos
-- ----------------------------------------------------------------

CREATE POLICY cliente_accesos_select_auth ON public.cliente_accesos
  FOR SELECT
  TO authenticated
  USING (true);

-- ----------------------------------------------------------------
-- Restaurar ticket_respuestas_rapidas (6 policies abiertas)
-- ----------------------------------------------------------------

CREATE POLICY ticket_qr_select_authenticated ON public.ticket_respuestas_rapidas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY ticket_qr_insert_authenticated ON public.ticket_respuestas_rapidas
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY ticket_qr_update_authenticated ON public.ticket_respuestas_rapidas
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY ticket_respuestas_rapidas_auth_select ON public.ticket_respuestas_rapidas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY ticket_respuestas_rapidas_auth_insert ON public.ticket_respuestas_rapidas
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY ticket_respuestas_rapidas_auth_update ON public.ticket_respuestas_rapidas
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ================================================================
-- FIN DEL ROLLBACK P0
-- RECORDATORIO: este rollback devuelve el estado inseguro.
-- Investigar la causa de la regresión y reaplicar P0 corregido.
-- ================================================================
```

---

## 8. Validaciones SQL Read-Only Post-Fix

Ejecutar en Dashboard SQL Editor después de aplicar el P0 para confirmar que los cambios son correctos. Solo SELECT. Sin PII.

```sql
-- ================================================================
-- VALIDACIONES POST-FIX P0 — Solo lectura
-- ================================================================

-- 8.1 Listar todas las policies activas en tablas P0
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tickets',
    'clientes',
    'cliente_accesos',
    'ticket_respuestas_rapidas'
  )
ORDER BY tablename, policyname;


-- 8.2 Detectar si todavía hay qual=true o with_check=true sin filtro
--     en las tablas P0 (debe devolver 0 filas post-fix)
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tickets', 'clientes', 'cliente_accesos', 'ticket_respuestas_rapidas'
  )
  AND (
    qual = 'true'
    OR with_check = 'true'
  )
ORDER BY tablename;
-- Resultado esperado: 0 filas


-- 8.3 Confirmar que anon NO tiene access a tablas P0
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tickets', 'clientes', 'cliente_accesos', 'ticket_respuestas_rapidas'
  )
  AND (
    'anon' = ANY(roles)
    OR roles = '{}'  -- {} significa todos los roles incluyendo anon
  )
ORDER BY tablename;
-- Resultado esperado: 0 filas


-- 8.4 Confirmar conteo de roles en perfiles (sin PII)
SELECT
  rol,
  COUNT(*) AS total_usuarios
FROM public.perfiles
GROUP BY rol
ORDER BY rol;
-- Resultado esperado: filas con roles admin, soporte, ventas y sus conteos
-- Sirve para confirmar que la policy de perfiles funciona correctamente


-- 8.5 Confirmar que la tabla perfiles tiene RLS y policy self
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'perfiles'
ORDER BY policyname;
-- Esperado: policy self (qual = auth.uid() = id)
-- Si esta policy no existe, la subquery EXISTS de las nuevas policies
-- puede devolver vacío para todos los usuarios


-- 8.6 Confirmar RLS encendido en tablas P0 post-fix
SELECT
  tablename,
  rowsecurity AS rls_habilitado
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tickets', 'clientes', 'cliente_accesos', 'ticket_respuestas_rapidas'
  )
ORDER BY tablename;
-- Resultado esperado: rls_habilitado = true en todas
```

---

## 9. Matriz de Pruebas Manuales Post-Fix

Ejecutar en orden. Documentar resultado (✅ / ❌) para cada ítem.

| # | test | rol | pasos | resultado esperado |
|---|---|---|---|---|
| T01 | Board `tickets.html` carga | admin | Iniciar sesión como admin → abrir tickets.html | Todos los tickets visibles en el board |
| T02 | Board `tickets.html` carga | soporte | Iniciar sesión como soporte → abrir tickets.html | Todos los tickets visibles |
| T03 | Board `tickets.html` carga | ventas | Iniciar sesión como ventas → abrir tickets.html | Tickets visibles según la opción A/B elegida |
| T04 | Board `tickets.html` vacío | authenticated sin rol | Usuario sin fila en `perfiles` → abrir tickets.html | 0 tickets (no pasa el EXISTS de perfiles) |
| T05 | `ticket.html` carga ticket individual | soporte | Abrir `ticket.html?id=X` | Ticket carga correctamente |
| T06 | Mover ticket de estado | soporte | Arrastrar ticket en board | Estado cambia, toast "Estado actualizado" |
| T07 | Cerrar ticket desde board | admin | Click en cerrar ticket | Ticket pasa a cerrado, desaparece del board activo |
| T08 | `dashboard.html` carga clientes | admin | Abrir dashboard.html | Lista de clientes visible |
| T09 | `dashboard.html` carga clientes | ventas | Abrir dashboard.html | Lista de clientes visible (si opción A) o vacía (si se restringe) |
| T10 | `cliente.html` carga ficha | soporte | Abrir cliente.html?id=X | Ficha de cliente carga con datos, contactos y tickets |
| T11 | AnyDesk visible en ticket | soporte | Abrir ticket con cliente que tiene AnyDesk → sección de acceso remoto | ID AnyDesk visible |
| T12 | AnyDesk NO visible en ticket | ventas | Abrir mismo ticket como ventas (si cliente_accesos restringido a admin/soporte) | Sección AnyDesk vacía o no renderizada |
| T13 | Guardar AnyDesk | soporte | Click en "Agregar AnyDesk", ingresar valor, guardar | Toast "AnyDesk guardado", valor persiste |
| T14 | Quick replies en `ticket.html` | soporte | Abrir panel de quick replies en ticket | Respuestas rápidas visibles |
| T15 | Quick replies en `ticket.html` | admin | Idem | Respuestas rápidas visibles |
| T16 | Quick replies en `tickets.html` (board) | soporte | Abrir panel QR desde board | Respuestas rápidas visibles |
| T17 | Guardar quick reply | admin | Editar respuesta rápida global, guardar | Toast "Guardado", persiste en BD |
| T18 | anon NO puede leer tickets | anon | Abrir `estado.html` con URL directa (sin folio+token) | Sin acceso a datos de tickets |
| T19 | anon accede portal con token válido | anon | Abrir magic link de estado.html | Portal del cliente carga vía EF (service_role, no afectada por RLS) |
| T20 | Formulario soporte público funciona | anon | Enviar formulario `soporte.html` | Ticket creado, folio devuelto (via EF service_role) |
| T21 | Contactos visibles en ticket | soporte | Abrir ticket → dropdown de contactos | Contactos del cliente aparecen en selector |
| T22 | Contactos visibles en ficha cliente | admin | Abrir `cliente.html` → sección contactos | Lista de contactos carga |
| T23 | `altas.html` carga sugerencias de cliente | admin | Abrir panel de altas con solicitud que tiene cliente_id_sugerido | Nombre del cliente sugerido aparece |

---

## 10. Riesgos y Decisiones Humanas

Las siguientes decisiones **no pueden resolverse solo con análisis técnico** — requieren input del negocio:

---

### D1 — ¿Debe `ventas` ver todos los tickets o solo los suyos?

**Opción A (recomendada para inicio):** `ventas` ve todos los tickets (mismo que admin/soporte). Más simple, menos riesgo de UI rota.  
**Opción B:** `ventas` solo ve tickets donde `asignado_a = auth.uid()` o `creado_por = auth.uid()`. Más restrictivo, requiere que los tickets estén correctamente asignados.  

**Impacto:** `dashboard.js:142` carga todos los tickets para el board. Con Opción B, el board de ventas mostrará solo un subconjunto. Si ventas no tiene tickets asignados, verá un board vacío.

---

### D2 — ¿Debe `ventas` ver `cliente_accesos` (IDs AnyDesk)?

**Recomendación:** No. `cliente_accesos` contiene credenciales de acceso remoto. Un vendedor no necesita IDs de AnyDesk.  
**Si se decide que sí:** Agregar `'ventas'` al array de roles en la policy `cliente_accesos_select_staff`.  
**Impacto:** Si se restringe a solo admin/soporte, la sección de "Acceso remoto" en `ticket.html` quedará vacía para el rol `ventas`. Asegurarse de que la UI maneje esto graciosamente (sin error, solo vacío).

---

### D3 — ¿Debe `ventas` poder INSERT/UPDATE tickets desde el browser?

`dashboard.js:141` y `cliente.core.js:33` tienen INSERT directo. `dashboard.js:150` tiene batch UPDATE.  
**Si la respuesta es no:** Eliminar las policies INSERT/UPDATE para ventas y redirigir a EFs con validación de rol.  
**Si la respuesta es sí:** Conservar las policies actuales de INSERT/UPDATE (solo restringir SELECT).

---

### D4 — ¿El código de `altas.js` y `registros.js` para INSERT en `clientes` y `clientes_contactos` es dead code?

Si `alta-aprobar` y `registro-aprobar` son las EFs que crean clientes y contactos, el código JS en `altas.js:35` y `registros.js:45-49` sería dead code. Verificar si hay alguna ruta de código en el panel que ejecute esas funciones directamente.  
**Si es dead code:** Restringir INSERT en `clientes` y `clientes_contactos` a solo admin/soporte (o incluso solo EF service_role) sin impacto en producción.  
**Si no es dead code:** Mantener policy INSERT para authenticated mientras se refactoriza el código.

---

### D5 — ¿Qué policy debe tener `clientes_contactos`?

`deny_all public` sin policy positiva para `authenticated` puede estar causando que 4 flujos activos devuelvan 0 filas en producción. Opciones:

- **Verificar en Dashboard** si existe policy positiva no capturada en el SQL (posible si hay policy en un role personalizado).
- **Añadir policy SELECT** para admin/soporte/ventas en `clientes_contactos` si no existe.
- **No tocar** hasta confirmar — si el panel funciona con contactos visibles en producción, hay una policy que no se vio en el SQL.

**Esta verificación debe hacerse ANTES de ejecutar el P0**, ya que si se añade policy aquí, puede interactuar con los cambios de P0.

---

### D6 — ¿Se adelanta `ticket_match_decisiones` a P0?

`ticket_match_decisiones` no tiene ninguna referencia en código JS de browser. Cerrar sus 3 policies abiertas no tiene riesgo de UI. Se puede hacer en el mismo script de P0 o en P1 — sin diferencia funcional.

---

## 11. Orden de Ejecución Recomendado

```
1. BACKUP PREVIO A LA EJECUCIÓN
   ─────────────────────────────
   En Dashboard SQL Editor, ejecutar:
     SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
   Copiar y guardar el resultado completo como referencia.

2. VERIFICACIÓN DE `clientes_contactos` (antes de P0)
   ─────────────────────────────────────────────────
   Consultar en Dashboard si existe policy positiva para clientes_contactos.
   Si no existe → decidir en D5 antes de continuar.

3. RESOLUCIÓN DE DECISIONES HUMANAS (D1–D6)
   ─────────────────────────────────────────
   Elegir Opción A o B para tickets (D1).
   Decidir ventas en cliente_accesos (D2).
   Confirmar si el código JS de altas/registros es dead code (D4).

4. APLICAR P0 TABLA POR TABLA (ventana controlada)
   ─────────────────────────────────────────────
   a. PASO 1: tickets (mayor riesgo de visibilidad, probar inmediatamente)
   b. Validar con T01–T07 antes de continuar
   c. PASO 2: clientes
   d. Validar con T08–T10 antes de continuar
   e. PASO 3: cliente_accesos
   f. Validar con T11–T13
   g. PASO 4: ticket_respuestas_rapidas
   h. Validar con T14–T17

5. VALIDACIÓN SQL POST-FIX (Sección 8)
   ─────────────────────────────────────
   Ejecutar las 6 queries de validación read-only.
   Confirmar: 0 filas en query 8.2 (sin qual=true abiertas).
   Confirmar: 0 filas en query 8.3 (anon sin acceso).

6. PRUEBAS COMPLETAS (Sección 9)
   ─────────────────────────────
   Ejecutar T01–T23 con cada rol.
   Documentar ✅ / ❌ en cada ítem.
   Si algún test es ❌: evaluar si es regresión crítica o ajuste de UX.

7. DECISIÓN: CONTINUAR O ROLLBACK
   ─────────────────────────────────
   Si todos los tests críticos ✅ → documentar y avanzar a P1.
   Si hay regresión crítica → ejecutar SQL de rollback (Sección 7) → investigar causa → redesign → retry.

8. DOCUMENTAR EL RESULTADO
   ─────────────────────────
   Crear DB/rls_p0_resultado_FECHA.md con:
     - Qué se ejecutó exactamente
     - Resultado de cada test
     - Decisiones tomadas en D1–D6
     - Hash o timestamp del SQL aplicado
   Commit y push de ese documento.

9. AVANZAR A P1
   ──────────────
   ticket_archivos, ticket_match_decisiones, clientes_contactos policy positiva.
```

---

## 12. Checklist Final P0

Al completar la ejecución, todos los ítems deben estar en ✅:

- [ ] `tickets_select_auth` eliminada de producción
- [ ] `tickets_select_authenticated` eliminada de producción (duplicado)
- [ ] `tickets_select_staff` (o equivalente) creada con filtro de rol
- [ ] `clientes_select_auth` eliminada de producción
- [ ] `clientes_select_staff` creada con filtro de rol
- [ ] `cliente_accesos_select_auth` eliminada de producción
- [ ] `cliente_accesos_select_staff` creada con filtro de rol (admin/soporte)
- [ ] 6 policies abiertas de `ticket_respuestas_rapidas` eliminadas
- [ ] Policies correctas de `ticket_respuestas_rapidas` verificadas y activas para admin/soporte
- [ ] Validación SQL 8.2: 0 filas con qual=true en tablas P0
- [ ] Validación SQL 8.3: 0 filas de anon con acceso a tablas P0
- [ ] Tests T01–T23 ejecutados y documentados
- [ ] Rollback SQL verificado y disponible localmente
- [ ] Resultado documentado en `DB/rls_p0_resultado_FECHA.md`
- [ ] Decisiones D1–D6 documentadas explícitamente

---

*Documento generado: 2026-06-15 · Solo análisis y borradores · Sin SQL ejecutado · Sin código modificado*  
*Basado en inspección read-only de PANEL/*.js y en documentos de auditoría previos*  
*Siguiente acción: revisión humana de decisiones D1–D6, luego ejecución controlada del SQL de P0*
