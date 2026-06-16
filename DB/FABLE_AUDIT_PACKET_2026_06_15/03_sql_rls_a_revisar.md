# SQL RLS a Revisar — Borradores de Remediación
**Fecha:** 2026-06-15  
**ADVERTENCIA CRÍTICA:** Todo el SQL de este documento es un borrador conceptual para revisión lógica.  
**NO ejecutar.** Fable debe revisar la lógica, no ejecutar los bloques.

---

## Qué hacer con este documento

1. Revisar la lógica de cada policy (¿el `USING` es correcto? ¿el `WITH CHECK` es correcto?)
2. Identificar si hay casos edge donde la policy podría denegar acceso legítimo
3. Identificar si hay casos edge donde la policy podría permitir acceso no deseado
4. Verificar que los `EXISTS` subqueries sean eficientes (usan PK de `perfiles`)
5. Señalar si falta alguna policy para completar el cuadro de permisos
6. NO generar SQL nuevo ni ejecutable — solo comentar el existente

---

## SQL-01 — Backup de estado actual (leer antes de cualquier cambio)

```sql
-- ⚠️ SOLO LECTURA — ejecutar en Dashboard antes de cualquier fix
-- Devuelve el estado actual de todas las policies de las tablas P0-bis y P0
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
    'clientes_contactos',
    'tickets',
    'clientes',
    'cliente_accesos',
    'ticket_respuestas_rapidas',
    'ticket_archivos',
    'ticket_match_decisiones'
  )
ORDER BY tablename, policyname;

-- Resultado esperado para clientes_contactos:
-- tablename            | policyname                    | qual  | with_check
-- clientes_contactos   | deny_all_clientes_contactos   | false | false
-- (sin otras políticas)

-- Resultado esperado para tickets:
-- tickets | tickets_select_auth         | true | null
-- tickets | tickets_select_authenticated| true | null
-- (estas son las dos duplicadas abiertas — ambas deben cerrarse)
```

---

## SQL-02 — Script P0-bis: `clientes_contactos` (BORRADOR — NO EJECUTAR)

**Objetivo:** Reemplazar `deny_all` por policies positivas para staff.  
**Decisiones humanas que afectan este SQL:**
- D3: ¿`ventas` en el array de `cc_select_staff`? (recomendación: SÍ)
- D4: ¿`registros.js:approve()` usa SDK directo o EF? (recomendación: SDK, por eso se necesita INSERT para authenticated)

```sql
-- ================================================================
-- BORRADOR P0-bis — clientes_contactos
-- Estado del borrador: pendiente de decisiones D3 y D4
-- Fable debe revisar: lógica de EXISTS, array de roles, WITH CHECK
-- ================================================================

BEGIN;

-- PASO 1: Eliminar deny_all (redundante una vez que haya policies positivas)
-- Riesgo: NINGUNO — RLS sigue habilitado, comportamiento predeterminado es denegar
DROP POLICY IF EXISTS deny_all_clientes_contactos ON public.clientes_contactos;

-- PASO 2: Policy SELECT para staff
-- PREGUNTA PARA FABLE: ¿El EXISTS es suficiente o debería filtrar también por cliente_id?
-- PREGUNTA PARA FABLE: ¿La cláusula p.activo = true es necesaria o demasiado restrictiva?
CREATE POLICY "cc_select_staff" ON public.clientes_contactos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')  -- D3: ¿incluir 'ventas'?
        AND p.activo = true
    )
  );

-- PASO 3: Policy INSERT para admin/soporte
-- Necesaria porque registros.js:47,49 hace INSERT directo con sesión authenticated
-- D4: Si registros.js se migra a EF, esta policy puede omitirse (EF usa service_role)
-- PREGUNTA PARA FABLE: ¿WITH CHECK debería verificar que cliente_id existe en clientes?
CREATE POLICY "cc_insert_staff" ON public.clientes_contactos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
        AND p.activo = true
    )
  );

-- PASO 4: Policy UPDATE para admin/soporte
-- PREGUNTA PARA FABLE: ¿USING y WITH CHECK deben ser idénticos?
-- ¿Hay riesgo de que USING sea evaluado en el estado anterior de la fila
-- y WITH CHECK en el estado nuevo, creando inconsistencias?
CREATE POLICY "cc_update_staff" ON public.clientes_contactos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
        AND p.activo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
        AND p.activo = true
    )
  );

-- (OPCIONAL) PASO 5: Policy DELETE — no documentada como necesaria en flujos actuales
-- Si se omite, DELETE queda bloqueado por RLS (ninguna policy positiva para DELETE)
-- ¿Es correcto no tener DELETE policy? ¿O debería haber una para admin?

COMMIT;
```

**Rollback de P0-bis:**

```sql
-- ⚠️ ROLLBACK — ejecutar si el fix rompe algo
-- Vuelve al estado anterior (deny_all sin policies positivas)
BEGIN;
DROP POLICY IF EXISTS cc_select_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_insert_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_update_staff ON public.clientes_contactos;
CREATE POLICY "deny_all_clientes_contactos" ON public.clientes_contactos
  AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
COMMIT;
```

---

## SQL-03 — Script P0: `tickets` (BORRADOR — NO EJECUTAR)

**Objetivo:** Reemplazar 2 policies SELECT abiertas con una policy filtrada por rol.  
**Decisión bloqueante D1:** ¿`ventas` ve todos los tickets o solo los asignados?

```sql
-- ================================================================
-- BORRADOR P0 — tickets (solo SELECT — INSERT/UPDATE no se toca aquí)
-- OPCIÓN A: ventas ve todos los tickets (recomendado para inicio)
-- OPCIÓN B: ventas ve solo los asignados (más seguro, más riesgoso para UX)
-- ================================================================

BEGIN;

-- Eliminar las 2 policies duplicadas abiertas
DROP POLICY IF EXISTS tickets_select_auth ON public.tickets;
DROP POLICY IF EXISTS tickets_select_authenticated ON public.tickets;

-- OPCIÓN A — ventas ve todos (misma visibilidad que admin/soporte)
-- PREGUNTA PARA FABLE: ¿Es seguro que ventas vea todos los tickets?
-- ¿O debería haber una segunda policy más restrictiva solo para ventas?
CREATE POLICY "tickets_select_staff" ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')
        AND p.activo = true
    )
  );

-- OPCIÓN B (alternativa si D1 = ventas solo ve los asignados)
-- ADVERTENCIA: Con la OPCIÓN B, el board de ventas quedaría vacío si no hay tickets asignados
-- PREGUNTA PARA FABLE: ¿La condición asignado_a = auth.uid() es suficiente,
-- o debería ser OR creado_por = auth.uid()?
--
-- CREATE POLICY "tickets_select_admin_soporte" ON public.tickets
--   FOR SELECT TO authenticated
--   USING (
--     EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte') AND p.activo = true)
--   );
-- CREATE POLICY "tickets_select_ventas" ON public.tickets
--   FOR SELECT TO authenticated
--   USING (
--     EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'ventas' AND p.activo = true)
--     AND (asignado_a = auth.uid() OR creado_por = auth.uid())
--   );

COMMIT;
```

---

## SQL-04 — Script P0: `clientes` (BORRADOR — NO EJECUTAR)

```sql
-- ================================================================
-- BORRADOR P0 — clientes
-- Nota: dashboard.js:142 hace SELECT * sin LIMIT — debe funcionar para todos los roles
-- PREGUNTA PARA FABLE: ¿Debería haber filtro por cliente asignado
-- o todos los roles ven todos los clientes?
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS clientes_select_auth ON public.clientes;

CREATE POLICY "clientes_select_staff" ON public.clientes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')
        AND p.activo = true
    )
  );

-- PREGUNTA PARA FABLE: ¿El INSERT y UPDATE de clientes también deben restringirse?
-- Actualmente no hay policies de INSERT/UPDATE visibles en la auditoría.
-- dashboard.js:84 hace INSERT de cliente rápido. cliente.core.js:34 hace UPDATE.
-- Si no hay policies de INSERT/UPDATE, estas operaciones también están abiertas a todos.

COMMIT;
```

---

## SQL-05 — Script P0: `cliente_accesos` (BORRADOR — NO EJECUTAR)

```sql
-- ================================================================
-- BORRADOR P0 — cliente_accesos (credenciales AnyDesk)
-- Recomendación: solo admin/soporte — ventas no necesita credenciales de acceso remoto
-- Decisión humana D2: ¿se incluye ventas?
-- PREGUNTA PARA FABLE: ¿Debería este campo estar en una tabla separada con
-- mayor nivel de protección? ¿Es suficiente RLS o se recomienda cifrado adicional?
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS cliente_accesos_select_auth ON public.cliente_accesos;

CREATE POLICY "cliente_accesos_select_staff" ON public.cliente_accesos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')  -- D2: ¿agregar 'ventas'? Recomendación: NO
        AND p.activo = true
    )
  );

-- PREGUNTA PARA FABLE: ¿La columna clave_cifrada debería tener cifrado a nivel columna
-- (pg_crypto, Vault) además de RLS? ¿RLS es suficiente para credenciales de acceso remoto?

COMMIT;
```

---

## SQL-06 — Script P0: `ticket_respuestas_rapidas` (BORRADOR — NO EJECUTAR)

```sql
-- ================================================================
-- BORRADOR P0 — ticket_respuestas_rapidas
-- Problema: hay 6 policies abiertas en 2 grupos duplicados
-- Hay también policies correctas (para admin/soporte) que deben mantenerse
-- RIESGO: si se eliminan las 6 abiertas y las "correctas" no existen,
-- los quick replies quedan sin acceso. VERIFICAR PRIMERO.
-- PREGUNTA PARA FABLE: ¿Cómo verificar cuáles son las "correctas" sin ejecutar
-- queries que no aparecen en la auditoría?
-- ================================================================

BEGIN;

-- ⚠️ VERIFICAR PRIMERO que existen policies "correctas" antes de DROP
-- Ejecutar read-only: SELECT policyname FROM pg_policies WHERE tablename = 'ticket_respuestas_rapidas';

-- SOLO si se confirma que las policies correctas existen:
DROP POLICY IF EXISTS qr_select_auth ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS qr_insert_auth ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS qr_update_auth ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS qr_select_authenticated ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS qr_insert_authenticated ON public.ticket_respuestas_rapidas;
DROP POLICY IF EXISTS qr_update_authenticated ON public.ticket_respuestas_rapidas;
-- (los nombres exactos deben confirmarse en Dashboard antes de ejecutar)

COMMIT;
```

---

## SQL-07 — Script P1: `ticket_match_decisiones` (BORRADOR — NO EJECUTAR)

```sql
-- ================================================================
-- BORRADOR P1 — ticket_match_decisiones
-- Riesgo de UI: NINGUNO (0 refs en PANEL JS — solo EF con service_role)
-- Puede adelantarse al P0 sin impacto
-- PREGUNTA PARA FABLE: ¿Confirmas que eliminar estas policies no rompe nada?
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS ticket_match_decisiones_select_auth ON public.ticket_match_decisiones;
DROP POLICY IF EXISTS ticket_match_decisiones_insert_auth ON public.ticket_match_decisiones;
DROP POLICY IF EXISTS ticket_match_decisiones_update_auth ON public.ticket_match_decisiones;

-- No crear policies nuevas — la EF usa service_role (bypass completo de RLS)
-- Todo acceso desde JS a esta tabla está controlado solo por la EF

COMMIT;
```

---

## SQL-08 — Script P1: `ticket_archivos` (BORRADOR — NO EJECUTAR)

```sql
-- ================================================================
-- BORRADOR P1 — ticket_archivos (tabla legacy activa)
-- Usada desde browser: ticket.js:160 (INSERT soft-fail), ticket.js:240 (SELECT)
-- cliente.core.js:33 (INSERT desde cliente.html)
-- PREGUNTA PARA FABLE: ¿La policy debe incluir ventas para SELECT?
-- ¿ticket.html y cliente.html son accesibles para ventas?
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS ticket_archivos_select_auth ON public.ticket_archivos;

CREATE POLICY "ticket_archivos_select_staff" ON public.ticket_archivos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')  -- ¿agregar ventas?
        AND p.activo = true
    )
  );

-- NOTA: La policy INSERT debe mantenerse para admin/soporte (cliente.core.js:33, ticket.js:160)
-- Si no existe policy INSERT, agregar:
-- CREATE POLICY "ticket_archivos_insert_staff" ON public.ticket_archivos
--   FOR INSERT TO authenticated
--   WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte') AND p.activo = true));

COMMIT;
```

---

## SQL-09 — Validación read-only post-fix (NO ejecutar antes del fix)

```sql
-- ⚠️ SOLO LECTURA — ejecutar DESPUÉS de cada script para verificar
-- Ejecutar en Dashboard como read-only

-- Verificar que las policies nuevas existen
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clientes_contactos'  -- cambiar según tabla verificada
ORDER BY policyname;

-- Verificar que deny_all fue eliminado
SELECT COUNT(*) FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clientes_contactos'
  AND policyname = 'deny_all_clientes_contactos';
-- Resultado esperado: 0

-- Verificar que el patrón EXISTS(perfiles) funciona lógicamente
-- (esto requiere una sesión de usuario real para probar — no es SQL de schema)
```

---

## Preguntas abiertas para Fable sobre estos SQL

1. **¿El patrón `EXISTS(SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN (...) AND activo = true)` tiene alguna vulnerabilidad conocida en Supabase?**

2. **¿Debería el subquery del EXISTS usar `SECURITY DEFINER` o hay alguna implicación de seguridad en que se ejecute como el usuario actual?**

3. **¿La eliminación de `deny_all_clientes_contactos` y su reemplazo por policies positivas cambia el comportamiento para el rol `service_role`?** (Los EFs ya tienen bypass completo — esto no debería afectarles, pero confirmar.)

4. **¿Hay alguna implicación de las policies de tipo PERMISSIVE vs RESTRICTIVE que deberíamos considerar para las tablas de credenciales (`cliente_accesos`)?** ¿Sería más seguro usar `RESTRICTIVE` en lugar de `PERMISSIVE`?

5. **Con las policies actuales de `ticket_respuestas_rapidas`, ¿hay riesgo de que al eliminar los duplicados abiertos queden sin cobertura operaciones de INSERT/UPDATE que el código sí necesita?**
