# Plan de Remediación RLS P0-bis — `clientes_contactos`
**Fecha:** 2026-06-15  
**Rama:** `audit/supabase-flows`  
**Modo:** Solo documentación. Sin SQL write. Sin código editado. Sin deploy.  
**Estado:** BORRADOR — no ejecutar SQL todavía. Solo análisis y propuesta.  

---

## 1. Resumen Ejecutivo

La tabla `clientes_contactos` tiene RLS habilitado con una única policy activa (`deny_all_clientes_contactos`) que bloquea todo acceso desde el SDK del browser. No existe ninguna policy positiva para el rol `authenticated`. Esto provoca que al menos cinco flujos de UI del panel fallen silenciosamente o con error en producción ahora mismo.

El flujo más crítico es la aprobación de registros de contacto en `registros.js`, que realiza SELECT e INSERT directos contra `clientes_contactos` con la sesión del usuario autenticado. Con la policy actual, esas operaciones fallan: el SELECT devuelve vacío (impidiendo la deduplicación de contactos) y el INSERT falla con error de RLS (impidiendo la creación del contacto). El staff que intenta aprobar un registro ve un toast de error.

La corrección es añadir tres policies positivas: SELECT para admin/soporte/ventas, INSERT para admin/soporte, UPDATE para admin/soporte. Estas policies conviven con la `deny_all` existente gracias a la lógica OR de las policies PERMISSIVE en PostgreSQL, aunque la recomendación técnica es eliminar la `deny_all` y reemplazarla por políticas explícitas — más limpio y sin ambigüedad.

**Clasificación: P0-bis — ejecutar antes del P0 de RLS.** La razón es que este fix está aislado de las tablas P0 (`tickets`, `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas`) y corrige regresiones activas en producción sin riesgo de interacción.

---

## 2. Por Qué `clientes_contactos` es P0-bis

### 2.1 Estado actual en BD (confirmado vía SQL read-only en Dashboard)

| campo | valor |
|---|---|
| `schemaname` | `public` |
| `tablename` | `clientes_contactos` |
| `rls_habilitado` | `true` |
| `rls_forzado` | `false` |

**Única policy activa:**

| campo | valor |
|---|---|
| `policyname` | `deny_all_clientes_contactos` |
| `permissive` | `PERMISSIVE` |
| `roles` | `{public}` |
| `cmd` | `ALL` |
| `qual` | `false` |
| `with_check` | `false` |

**Interpretación:** `roles={public}` en contexto de RLS de PostgreSQL equivale a aplicar la policy a todos los roles, incluyendo `anon` y `authenticated`. `qual=false` significa que ninguna fila pasa el predicado: para SELECT nunca devuelve filas, para INSERT/UPDATE/DELETE siempre falla. Como no existe ninguna policy positiva para `authenticated`, todo acceso desde el SDK del browser resulta en denegación.

### 2.2 Comportamiento de policies PERMISSIVE en PostgreSQL

PostgreSQL evalúa las policies PERMISSIVE con lógica OR:

```
acceso_concedido = (policy_1 OR policy_2 OR policy_3 OR ...)
```

Esto significa:
- `deny_all_clientes_contactos` tiene `qual=false` → siempre contribuye `false` al OR.
- Si se añade una policy positiva con `qual=EXISTS(...)` que devuelve `true` para un usuario de rol `admin` → el OR total es `true` → acceso concedido.
- Para `anon` o `authenticated` sin perfil: la nueva policy positiva devuelve `false` → el OR es `false` → acceso denegado.

Por lo tanto, técnicamente es posible **mantener** `deny_all_clientes_contactos` y solo añadir policies positivas. Sin embargo, la recomendación de este plan es **eliminar** `deny_all_clientes_contactos` y reemplazarla por policies explícitas porque:
1. La presencia de `deny_all` con `roles={public}` crea confusión semántica — parece que bloquea todo incluso cuando hay policies positivas.
2. El comportamiento predeterminado de RLS habilitado en PostgreSQL ya es denegar todo lo que no esté explícitamente permitido. La `deny_all` es redundante una vez que existen policies positivas.
3. Mantenerla aumenta el riesgo de error humano futuro (alguien podría asumir incorrectamente que bloquea acceso incluso con otras policies activas).

### 2.3 Por qué es P0-bis y no simplemente P1

| criterio | evaluación |
|---|---|
| ¿Hay regresión activa en producción? | **Sí** — aprobación de registros falla ahora mismo |
| ¿Interactúa con las tablas P0? | **No** — fix completamente aislado |
| ¿Depende de decisiones humanas críticas? | Parcialmente — solo D3 (¿ventas ve contactos?), que tiene respuesta recomendada clara |
| ¿Riesgo del fix? | Bajo — agrega acceso donde había denegación total |
| ¿Riesgo de no hacer el fix antes del P0? | Medio — si el P0 produce regresiones y hay que debugear simultáneamente con `clientes_contactos` rota, el diagnóstico se complica |

---

## 3. Flujos Afectados por Archivo y Línea

### 3.1 `PANEL/registros.js` — APROBACIÓN ROTA (crítico)

La función `approve()` en `registros.js` realiza todas sus operaciones sobre `clientes_contactos` vía SDK directo con la sesión `authenticated` del usuario. No usa ninguna Edge Function.

| línea | función | operación SQL | estado con deny_all |
|---|---|---|---|
| 40 | `findExistingContact(row, cliente_id)` | `SELECT id,nombre,correo,telefono FROM clientes_contactos WHERE cliente_id=? LIMIT 30` | Devuelve `[]` siempre → el sistema nunca reutiliza contactos existentes → siempre intenta crear un contacto nuevo |
| 47 | `createPrimaryContactFromRequest(row, cliente_id)` | `INSERT INTO clientes_contactos (...) VALUES (...) RETURNING *` | **Falla con error de RLS** — `approve()` captura el error y llama `toast(msg(c.error), "bad")` → el staff ve un mensaje de error y la aprobación se aborta |
| 48 | `findAlternateContact(row, cliente_id)` | `SELECT id,nombre,correo,telefono FROM clientes_contactos WHERE cliente_id=? LIMIT 30` | Devuelve `[]` siempre → mismo problema que línea 40 |
| 49 | `createAlternateContactFromRequest(row, cliente_id)` | `INSERT INTO clientes_contactos (...) VALUES (...) RETURNING *` | **Falla con error de RLS** — la aprobación parcial se aborta |

**Secuencia de fallo en `registros.js:approve()`:**
```
approve(id)
  → findExistingContact()       → SELECT → [] (vacío por RLS)
  → createPrimaryContactFromRequest() → INSERT → ERROR de RLS
  → toast("No se pudo aprobar", "bad")   ← el staff ve esto
  → return (abort)
```

**Nota sobre dead code en `altas.js`:** Las funciones análogas `findExistingContact`, `createPrimaryContactFromRequest`, `createAlternateContactFromRequest` también están definidas en `altas.js:34,35,37,38`, pero **nunca son invocadas** en el flujo de aprobación de altas. La función `altas.js:40 approve()` llama exclusivamente a `callAltaEdge({action:"approve", solicitud_id})`, que hace fetch POST a la Edge Function `alta-aprobar` con el Bearer token de la sesión. La EF corre con `service_role` y bypass RLS total. El código de `altas.js:34-38` es dead code.

### 3.2 `PANEL/cliente.js` — SECCIÓN CONTACTOS VACÍA

| línea | función | operación SQL | estado con deny_all |
|---|---|---|---|
| 35 | `loadContacts()` | `SELECT * FROM clientes_contactos WHERE cliente_id=? ORDER BY es_principal DESC, nombre ASC` | Devuelve `[]` — `CONTACTS` queda como array vacío — la sección "Contactos" en `cliente.html` renderiza vacío sin error visible para el usuario |

### 3.3 `PANEL/ticket.js` — CONTACTO INVISIBLE Y DROPDOWN VACÍO

| línea | función | operación SQL | estado con deny_all |
|---|---|---|---|
| 138 | `loadLinkedContact()` | Primero: `SELECT id,nombre,correo,telefono,puesto,es_principal FROM clientes_contactos WHERE id=? LIMIT 1` (si hay `contacto_id`). Fallback: `SELECT ... WHERE cliente_id=? AND activo=true ORDER BY es_principal DESC` | Ambas queries devuelven vacío → función retorna `null` → la sección de contacto en el header del ticket no muestra nombre |
| 202 | `loadClientContacts()` | `SELECT id,nombre,correo,telefono,puesto,activo,es_principal FROM clientes_contactos WHERE cliente_id=? AND activo=true ORDER BY es_principal DESC, nombre ASC` | Devuelve `[]` → `sel.innerHTML` solo tiene el `<option>` vacío → dropdown "Selecciona un contacto del cliente" queda vacío → el staff no puede vincular ni cambiar el contacto de un ticket |

### 3.4 `PANEL/altas.js` — SUGERENCIAS DE CONTACTO VACÍAS (degradado)

| línea | función | operación SQL | estado con deny_all | criticidad |
|---|---|---|---|---|
| 44 | `hydrateAltaSuggestions()` | `SELECT id,nombre,correo,telefono FROM clientes_contactos WHERE id IN (contacto_id_sugerido[])` | Devuelve `[]` → `ctm` queda como `Map` vacío → las columnas `contacto_sugerido` de todas las rows quedan como string vacío | Degradado — la UI muestra la solicitud sin el nombre del contacto sugerido, pero no falla |

**Nota:** Las funciones `altas.js:34,35,37,38` (`findExistingContact`, `createPrimaryContactFromRequest`, `findAlternateContact`, `createAlternateContactFromRequest`) están en el módulo pero son dead code en el flujo de aprobación. Solo `altas.js:44` (`hydrateAltaSuggestions`) accede activamente a `clientes_contactos` desde `altas.js`.

### 3.5 Resumen de impacto

| flujo | archivo | línea(s) | operación | impacto con deny_all | prioridad |
|---|---|---|---|---|---|
| Aprobación de registro | `registros.js` | 40, 47, 48, 49 | SELECT + INSERT | **Error visible — flujo completamente roto** | Crítico |
| Ver contactos del cliente | `cliente.js` | 35 | SELECT | Sección vacía — sin error visible | Alto |
| Contacto vinculado al ticket | `ticket.js` | 138 | SELECT | Nombre del contacto no aparece | Alto |
| Dropdown de contactos en ticket | `ticket.js` | 202 | SELECT | Dropdown vacío — no se puede cambiar contacto | Alto |
| Sugerencias de contacto en altas | `altas.js` | 44 | SELECT | Nombres vacíos — UI degradada | Medio |

---

## 4. SQL Propuesto

> **⚠️ ADVERTENCIA: TODO EL SQL DE ESTA SECCIÓN ES UN BORRADOR. NO EJECUTAR.**  
> Antes de ejecutar: (1) hacer backup de `pg_policies` actuales. (2) resolver las decisiones humanas D3 y D4. (3) ejecutar en ventana controlada con rollback disponible. (4) validar con las queries de la Sección 6 inmediatamente después.

### 4.1 Backup previo (leer antes de ejecutar cualquier cambio)

```sql
-- ⚠️ NO EJECUTAR — SOLO LECTURA
-- Ejecutar en Dashboard SQL Editor ANTES de aplicar cualquier cambio.
-- Guardar el resultado completo como referencia de rollback.

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clientes_contactos'
ORDER BY policyname;

-- Resultado esperado antes del fix:
-- policyname                    | permissive | roles    | cmd | qual  | with_check
-- deny_all_clientes_contactos   | PERMISSIVE | {public} | ALL | false | false
```

### 4.2 Script de remediación P0-bis

```sql
-- ================================================================
-- BORRADOR P0-bis — REMEDIACIÓN RLS clientes_contactos
-- Fecha propuesta: post-revisión humana + decisiones D3/D4
-- ⚠️ NO EJECUTAR SIN REVISIÓN PREVIA
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- PASO 1: Eliminar la policy deny_all_clientes_contactos
-- ----------------------------------------------------------------
-- Razón: la policy es redundante con el comportamiento predeterminado
-- de RLS habilitado (denegar todo lo no permitido explícitamente).
-- Mantenerla junto con policies positivas crea ambigüedad semántica.
-- La eliminamos y la reemplazamos por policies explícitas y legibles.
--
-- Riesgo: NINGUNO — la ausencia de esta policy no abre acceso.
-- El RLS sigue habilitado. Sin policy positiva, sigue denegando todo.

DROP POLICY IF EXISTS deny_all_clientes_contactos ON public.clientes_contactos;


-- ----------------------------------------------------------------
-- PASO 2: Policy SELECT para admin, soporte y ventas
-- ----------------------------------------------------------------
-- Quién necesita leer contactos desde el browser:
--   - admin: gestión completa de clientes
--   - soporte: ficha de cliente + vista de ticket + aprobación de registros
--   - ventas: dropdown de contactos en ticket (si D3=sí)
--
-- DECISIÓN HUMANA D3 requerida: ¿ventas debe ver contactos?
-- Si D3=sí: incluir 'ventas' en el array (opción recomendada).
-- Si D3=no: eliminar 'ventas' del array.
--
-- Depende de la tabla 'perfiles' que tiene policy 'self' correcta.
-- El EXISTS hace un lookup eficiente por PK (auth.uid()).

CREATE POLICY cc_select_staff
  ON public.clientes_contactos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')
        -- Si D3=no: remover 'ventas' de esta lista
    )
  );


-- ----------------------------------------------------------------
-- PASO 3: Policy INSERT para admin y soporte
-- ----------------------------------------------------------------
-- Quién necesita insertar contactos desde el browser:
--   - admin: gestión directa de contactos
--   - soporte: aprobación de registros en registros.js (líneas 47, 49)
--
-- ventas NO debe poder crear contactos directamente.
-- La aprobación de altas va por EF alta-aprobar (service_role),
-- por lo que no necesita policy INSERT para el browser.
--
-- El WITH CHECK se usa para INSERT (no el USING).
-- El mismo filtro de rol aplica al nuevo registro.

CREATE POLICY cc_insert_staff
  ON public.clientes_contactos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
    )
  );


-- ----------------------------------------------------------------
-- PASO 4: Policy UPDATE para admin y soporte
-- ----------------------------------------------------------------
-- Quién necesita actualizar contactos desde el browser:
--   - admin: edición de datos de contacto
--   - soporte: actualización de contacto vinculado al ticket
--
-- ventas NO debe poder editar contactos.
-- Las EFs usan service_role — no necesitan esta policy.
--
-- Requiere tanto USING (qué filas puede ver para editar)
-- como WITH CHECK (qué puede escribir después de la edición).

CREATE POLICY cc_update_staff
  ON public.clientes_contactos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
    )
  );


-- ----------------------------------------------------------------
-- PASO 5 (opcional): Policy DELETE para admin únicamente
-- ----------------------------------------------------------------
-- Solo incluir si existe funcionalidad de eliminación de contactos
-- desde el panel. Si no hay ninguna UI que haga DELETE de contactos,
-- no crear esta policy — el comportamiento predeterminado (denegar)
-- es el correcto.
--
-- Descomentarr SOLO si se confirma que hay flujo de eliminación:
--
-- CREATE POLICY cc_delete_admin
--   ON public.clientes_contactos
--   FOR DELETE
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1
--       FROM public.perfiles p
--       WHERE p.id = auth.uid()
--         AND p.rol = 'admin'
--     )
--   );


COMMIT;

-- ================================================================
-- FIN DEL BORRADOR P0-bis
-- Aplicar ANTES del P0 de RLS (tickets, clientes, cliente_accesos,
-- ticket_respuestas_rapidas).
-- ================================================================
```

---

## 5. SQL de Rollback

> **⚠️ ADVERTENCIA: EJECUTAR SOLO SI EL FIX CAUSA REGRESIÓN.**  
> El rollback restaura la situación actual (rota). Úsarlo solo temporalmente mientras se investiga la causa. Documentar el incidente. No dejar activo indefinidamente.

```sql
-- ================================================================
-- ROLLBACK P0-bis — RESTAURA deny_all SIN POLICIES POSITIVAS
-- ⚠️ NO EJECUTAR SIN NECESIDAD — devuelve el estado roto actual
-- ================================================================

BEGIN;

-- Eliminar las policies positivas añadidas por el P0-bis
DROP POLICY IF EXISTS cc_select_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_insert_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_update_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_delete_admin ON public.clientes_contactos;

-- Restaurar la deny_all original
CREATE POLICY deny_all_clientes_contactos
  ON public.clientes_contactos
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

COMMIT;

-- ================================================================
-- FIN DEL ROLLBACK P0-bis
-- Estado resultante: igual al actual — flujos de UI rotos.
-- Investigar la causa de la regresión antes de volver a aplicar.
-- ================================================================
```

---

## 6. Validaciones Read-Only Post-Fix

Ejecutar en Dashboard → SQL Editor **después de aplicar el P0-bis**, antes de las pruebas manuales. Solo lectura. Sin PII.

### 6.1 Confirmar estado de policies en `clientes_contactos`

```sql
-- ⚠️ SOLO LECTURA — confirmar policies post-fix

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clientes_contactos'
ORDER BY policyname;

-- Resultado esperado post-fix (con ventas en SELECT):
-- policyname          | permissive | roles          | cmd    | qual                      | with_check
-- cc_insert_staff     | PERMISSIVE | {authenticated}| INSERT | —                         | EXISTS(...)
-- cc_select_staff     | PERMISSIVE | {authenticated}| SELECT | EXISTS(...)               | —
-- cc_update_staff     | PERMISSIVE | {authenticated}| UPDATE | EXISTS(...)               | EXISTS(...)
--
-- La deny_all_clientes_contactos NO debe aparecer.
-- Si aparece, el DROP POLICY no se ejecutó correctamente.
```

### 6.2 Confirmar que RLS sigue habilitado

```sql
-- ⚠️ SOLO LECTURA

SELECT
  tablename,
  rowsecurity AS rls_habilitado,
  forcrowsecurity AS rls_forzado
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'clientes_contactos';

-- Resultado esperado:
-- tablename            | rls_habilitado | rls_forzado
-- clientes_contactos   | true           | false
```

### 6.3 Confirmar que `anon` NO tiene acceso

```sql
-- ⚠️ SOLO LECTURA
-- Verificar que ninguna policy activa cubre al rol anon.
-- Resultado esperado: 0 filas.

SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clientes_contactos'
  AND (
    'anon' = ANY(roles)
    OR roles = '{}'        -- {} = todos los roles incluyendo anon
    OR roles = '{public}'  -- public incluye anon
  );

-- Si devuelve 0 filas: correcto — anon no tiene acceso.
-- Si devuelve alguna fila: revisar — podría ser la deny_all reinstalada
-- (que con qual=false es inofensiva pero confusa) o una policy nueva inesperada.
```

### 6.4 Conteo de contactos por cliente (sin PII)

```sql
-- ⚠️ SOLO LECTURA — confirmar que los datos son accesibles post-fix
-- Ejecutar desde el Dashboard con rol service_role (siempre bypass)
-- o usar set role authenticated para simular un usuario.

SELECT
  COUNT(*) AS total_contactos,
  COUNT(DISTINCT cliente_id) AS clientes_con_contacto,
  COUNT(*) FILTER (WHERE es_principal = true) AS contactos_principales,
  COUNT(*) FILTER (WHERE activo = true) AS contactos_activos
FROM public.clientes_contactos;

-- Resultado esperado: números > 0 (confirma que la tabla tiene datos).
-- Si devuelve 0 con service_role: problema en los datos, no en la policy.
```

### 6.5 Confirmar que `perfiles` tiene policy `self` activa

```sql
-- ⚠️ SOLO LECTURA
-- Las nuevas policies de clientes_contactos usan EXISTS(perfiles).
-- Si perfiles no tiene policy activa, el EXISTS puede devolver vacío
-- para todos los usuarios y las policies nuevas negarían todo.

SELECT
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'perfiles'
ORDER BY policyname;

-- Resultado esperado: al menos una policy SELECT que incluya
-- WHERE id = auth.uid() o similar (policy 'self').
-- Si no existe: las nuevas policies de clientes_contactos fallarán
-- para todos los usuarios porque el EXISTS no encontrará su perfil.
```

---

## 7. Pruebas Manuales

Ejecutar en orden con sesión de usuario autenticado (no service_role) en el entorno de producción. Documentar resultado ✅ / ❌ en cada ítem.

### 7.1 Aprobación de registro (`registros.js`)

| # | test | pasos | resultado esperado |
|---|---|---|---|
| R01 | Aprobar registro sin contacto preexistente | Abrir `registros.html` → buscar solicitud pendiente con empresa nueva → click Aprobar | Toast "Registro consolidado" o "Registro y contacto alterno consolidados". Sin toast de error. |
| R02 | Aprobar registro con empresa ya existente | Abrir solicitud cuya empresa ya está en `clientes` | El sistema reutiliza el `cliente_id` existente y crea solo el contacto faltante |
| R03 | Aprobar registro con contacto ya existente | Solicitud cuyo correo/teléfono ya existe en `clientes_contactos` para ese cliente | El sistema encuentra el contacto existente (SELECT funciona) y lo reutiliza sin crear duplicado |
| R04 | Verificar en BD sin PII | Ejecutar `SELECT COUNT(*) FROM solicitudes_registro WHERE estatus='aprobada'` | El conteo aumenta respecto al estado previo |

### 7.2 Ver contactos del cliente (`cliente.js`)

| # | test | pasos | resultado esperado |
|---|---|---|---|
| C01 | Sección contactos visible | Abrir `cliente.html?id=X` (cliente con contactos en BD) | La sección "Contactos" muestra la lista de contactos con nombre, correo, teléfono, puesto |
| C02 | Cliente sin contactos | Abrir `cliente.html?id=Y` (cliente sin contactos en BD) | La sección muestra "Sin contactos" o equivalente — no muestra error |
| C03 | Orden correcto | Verificar en pantalla | Contacto marcado como `es_principal=true` aparece primero |

### 7.3 Contacto vinculado al ticket (`ticket.js:138`)

| # | test | pasos | resultado esperado |
|---|---|---|---|
| T01 | Contacto aparece en ticket | Abrir `ticket.html?id=X` (ticket con `contacto_id` asignado) | El nombre y datos del contacto aparecen en el header/panel del ticket |
| T02 | Ticket sin contacto | Abrir ticket sin `contacto_id` asignado | La sección de contacto muestra vacío o placeholder — sin error |
| T03 | Ticket con cliente pero sin contacto_id | Abrir ticket con `cliente_id` pero sin `contacto_id` | `loadLinkedContact()` hace fallback a SELECT por `cliente_id` → muestra el contacto principal del cliente |

### 7.4 Dropdown de contactos en ticket (`ticket.js:202`)

| # | test | pasos | resultado esperado |
|---|---|---|---|
| D01 | Dropdown cargado | Abrir `ticket.html?id=X` (ticket con cliente ligado que tiene contactos) | El dropdown "Selecciona un contacto del cliente" muestra la lista de contactos activos |
| D02 | Cambiar contacto | Seleccionar un contacto diferente en el dropdown y guardar | El `contacto_id` del ticket se actualiza |
| D03 | Ticket sin cliente ligado | Abrir ticket sin `cliente_id` | Dropdown muestra "Primero liga un cliente" y está deshabilitado — sin error |

### 7.5 Sugerencias de contacto en altas (`altas.js:44`)

| # | test | pasos | resultado esperado |
|---|---|---|---|
| A01 | Nombres de contacto sugerido visibles | Abrir `altas.html` → buscar solicitud con `contacto_id_sugerido` asignado | La columna "Contacto sugerido" muestra el nombre del contacto (no vacío) |
| A02 | Sin contacto_id_sugerido | Solicitud sin sugerencia de contacto | La columna muestra vacío — sin error |

---

## 8. Riesgos

### 8.1 Riesgo de la remediación

| riesgo | probabilidad | impacto | mitigación |
|---|---|---|---|
| La policy SELECT es demasiado permisiva — `ventas` ve contactos de todos los clientes | Bajo (si esto es aceptable para el negocio, como recomienda D3) | Medio | Decidir D3 antes de ejecutar. Si ventas no debe ver contactos, remover `'ventas'` del array. |
| La policy INSERT permite que `soporte` cree contactos falsos o duplicados | Bajo — el INSERT ya incluye deduplicación en el código JS | Bajo | `registros.js` busca contacto existente antes de insertar. La deduplicación está en el código, no en la BD. |
| El EXISTS de `perfiles` devuelve vacío si el usuario no tiene fila en `perfiles` | Bajo | Alto (el usuario no podría acceder) | Verificar con la query 6.5 que `perfiles` tiene policy self activa y que todos los usuarios staff tienen fila en `perfiles`. |
| Conflicto con policy existente no visible en el SQL de auditoría | Muy bajo | Bajo | La query 6.1 confirma el estado real post-fix. |

### 8.2 Riesgo de NO hacer la remediación

| área | descripción |
|---|---|
| Operaciones bloqueadas | Cada aprobación de registro falla con error visible. Los registros de nuevos contactos quedan en estado `pendiente` indefinidamente. |
| Datos de UI incompletos | Todos los tickets muestran sin contacto vinculado. Todas las fichas de clientes muestran sin contactos. |
| Confusión del equipo | El staff que no sabe del estado de RLS asumirá que hay un bug en el código de `registros.js` y puede intentar "arreglos" que empeoren la situación. |
| Acumulación de solicitudes | Las `solicitudes_registro` en estado `pendiente` se acumulan sin poder ser procesadas. |

### 8.3 Riesgo de la policy UPDATE

Si no existe funcionalidad de edición de contactos desde el browser actualmente (no se encontraron referencias directas a UPDATE en `clientes_contactos` en el código de PANEL/), la policy UPDATE puede omitirse en la primera versión y añadirse después. La omisión no rompe ningún flujo activo conocido.

---

## 9. Decisiones Humanas Pendientes

### D3 — ¿`ventas` debe poder SELECT en `clientes_contactos`?

**Contexto técnico:** `ticket.js:202` `loadClientContacts()` carga el dropdown de contactos cuando el staff abre un ticket para cambiar el contacto vinculado. Si el rol `ventas` usa `ticket.html` en algún flujo de trabajo, necesita poder leer contactos para poblar ese dropdown.

**Recomendación técnica:** Sí, incluir `ventas` en el SELECT. La información de contacto (nombre, correo, puesto, teléfono) es información operacional que el equipo de ventas necesita para gestionar las relaciones con clientes.

**Impacto si la respuesta es NO:** El dropdown de contactos quedaría vacío para el rol `ventas`. Si ventas no usa `ticket.html`, no hay impacto.

**Lo que define:** Si `'ventas'` va o no en el array de roles de `cc_select_staff`.

### D4 — ¿`ventas` debe poder INSERT o UPDATE en `clientes_contactos`?

**Recomendación técnica:** **No.** La creación y edición de contactos es una operación de administración de datos de clientes que debe estar restringida a roles de soporte y administración.

- La aprobación de registros (única fuente activa de INSERT desde browser) es ejecutada por admin/soporte en el panel de registros.
- `ventas` no tiene un flujo conocido que requiera crear o editar contactos directamente.

**Impacto si la respuesta es SÍ:** Ventas podría crear contactos desde cualquier lugar del panel que invoque el SDK directamente, incluso si la UI no lo expone explícitamente. No recomendado.

**Lo que define:** Si `'ventas'` se agrega a `cc_insert_staff` y `cc_update_staff` — la recomendación es que NO.

---

## 10. Orden Recomendado de Ejecución

```
════════════════════════════════════════════════════════
ORDEN RECOMENDADO — REMEDIACIÓN P0-bis clientes_contactos
════════════════════════════════════════════════════════

PASO 0 — DECISIONES PREVIAS (bloqueantes)
  ─────────────────────────────────────────
  [ ] D3 confirmada: ¿ventas va en cc_select_staff? (sí/no)
  [ ] D4 confirmada: ¿ventas va en cc_insert_staff / cc_update_staff? (recomendación: no)
  [ ] Confirmar que no existe policy de UPDATE en clientes_contactos desde el panel
      (buscar en código si hay algún flujo de edición de contactos no documentado)

PASO 1 — BACKUP PREVIO
  ─────────────────────
  [ ] En Dashboard SQL Editor, ejecutar la query de la Sección 6.1 (SELECT de pg_policies)
  [ ] Guardar el resultado completo — este es el estado de rollback
  [ ] Confirmar que el único resultado es: deny_all_clientes_contactos | PERMISSIVE | {public} | ALL | false | false

PASO 2 — APLICAR P0-bis (Sección 4.2)
  ─────────────────────────────────────
  [ ] Ajustar el array de roles en cc_select_staff según D3
  [ ] Ejecutar el script completo (BEGIN → DROP POLICY → 3 CREATE POLICY → COMMIT)
  [ ] Si el COMMIT falla: el BEGIN protege — ningún cambio parcial queda en BD

PASO 3 — VALIDACIONES READ-ONLY (Sección 6)
  ─────────────────────────────────────────
  [ ] Ejecutar query 6.1 — confirmar las 3 policies nuevas y ausencia de deny_all
  [ ] Ejecutar query 6.2 — confirmar rls_habilitado=true
  [ ] Ejecutar query 6.3 — confirmar que anon no tiene acceso (0 filas)
  [ ] Ejecutar query 6.5 — confirmar que perfiles tiene policy self activa
  [ ] Si alguna query arroja resultado inesperado: ROLLBACK (Sección 5) y revisar

PASO 4 — PRUEBAS MANUALES DE UI (Sección 7)
  ────────────────────────────────────────────
  [ ] R01–R04: aprobar al menos un registro en registros.html
  [ ] C01–C03: ver contactos en cliente.html
  [ ] T01–T03: ver contacto vinculado en ticket.html
  [ ] D01–D03: verificar dropdown de contactos en ticket.html
  [ ] A01–A02: verificar sugerencias en altas.html
  [ ] Si algún test falla: evaluar si es regresión crítica o ajuste de UX.
      Solo hacer rollback si la regresión bloquea flujos de trabajo del staff.

PASO 5 — DOCUMENTAR Y AVANZAR
  ────────────────────────────
  [ ] Crear DB/rls_p0_bis_resultado_FECHA.md con:
        - Decisiones D3/D4 tomadas
        - Resultado de cada test (✅/❌)
        - Hash o timestamp del SQL aplicado
  [ ] Commit y push del documento de resultado
  [ ] AHORA sí: ejecutar el RLS P0 (tickets, clientes, cliente_accesos,
      ticket_respuestas_rapidas, ticket_match_decisiones)

════════════════════════════════════════════════════════
IMPORTANTE: El P0 de RLS no debe ejecutarse hasta que
el P0-bis esté validado y las pruebas manuales pasen.
════════════════════════════════════════════════════════
```

---

## 11. Prompt Exacto para Commit del Documento

Una vez que este documento sea revisado y se desee registrarlo en el historial del repo, ejecutar exactamente lo siguiente (sin git add ., sin force push):

```bash
git status --short
git add DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md
git commit -m "docs: add clientes_contactos P0-bis remediation plan"
git push origin audit/supabase-flows
git log --oneline -5
git status -sb
```

No agregar otros archivos al mismo commit. No usar `git add .`. No usar `git commit --amend`.

---

*Documento generado: 2026-06-15 · Solo análisis y borradores · Sin SQL ejecutado · Sin código modificado*  
*Basado en inspección read-only de `PANEL/registros.js`, `PANEL/cliente.js`, `PANEL/ticket.js`, `PANEL/altas.js` y documentos de auditoría previos*  
*Siguiente acción: confirmar decisiones D3 y D4 con el equipo, luego ejecutar el script de P0-bis en ventana controlada*
