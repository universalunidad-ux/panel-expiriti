# Puntos para Revisión Fable — Preguntas Exactas
**Fecha:** 2026-06-15  
**Propósito:** Estas son las 9 preguntas que necesitamos que Fable responda con evidencia y razonamiento.

---

## INSTRUCCIONES PARA FABLE

Para cada pregunta:
1. Responde directamente: SÍ / NO / DEPENDE (con condición)
2. Explica el razonamiento técnico en 2-4 oraciones
3. Si identificas un riesgo adicional no preguntado, añádelo como P.X.extra
4. Usa evidencia del paquete para sustentar tu respuesta
5. Si la pregunta no puede responderse con la información disponible, indica qué información adicional faltaría

---

## P1 — ¿La priorización P0/P0-bis/P1/P2/P3 es correcta?

**Contexto:**  
- P0-bis: `clientes_contactos` (deny_all, roto en producción)
- P0: `tickets`, `clientes`, `cliente_accesos`, `ticket_respuestas_rapidas` (SELECT/INSERT/UPDATE qual=true)
- P0-5: `quick-function` EF rota deployada
- P1: `ticket_archivos` (legacy), `ticket_match_decisiones`, `super-service`, `match-cliente`, Storage buckets
- P2: Rate limits (4 endpoints), Turnstile, `ticket_eventos` incompleto, pg_cron
- P3: Deuda técnica de normalización, índices duplicados, doble-write

**Pregunta específica:** ¿Hay algún item que debería estar en una prioridad más alta o más baja de donde está? ¿El orden P0-bis → P0 → P1 → P2 → P3 es el correcto para minimizar riesgo de regresión y maximizar seguridad?

---

## P2 — ¿El patrón RLS con EXISTS(public.perfiles) es seguro?

**Contexto técnico:**  
Los borradores de SQL proponen este patrón para las policies de staff:

```sql
-- Patrón propuesto para SELECT
CREATE POLICY "cc_select_staff" ON public.clientes_contactos
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
```

**Pregunta específica:** ¿Este patrón de `EXISTS(SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN (...))` es seguro como mecanismo de control de acceso por rol? ¿Hay vectores de bypass o debilidades en la implementación? ¿Es `auth.uid()` garantizado en el contexto de RLS de Supabase?

---

## P3 — ¿Hay bypass posible por usuario `authenticated` sin perfil?

**Contexto:**  
En Supabase, cualquier usuario que tenga una cuenta en `auth.users` tiene el rol JWT `authenticated`. El sistema crea un registro en `perfiles` durante el onboarding, pero existe el estado intermedio de "usuario autenticado sin perfil en la tabla `perfiles`".

Con el patrón `EXISTS(SELECT 1 FROM perfiles WHERE id = auth.uid() AND activo=true)`:
- Un usuario autenticado SIN fila en `perfiles` → `EXISTS` devuelve `false` → denegado ✓ (aparentemente seguro)
- Pero: ¿qué pasa si la tabla `perfiles` tiene RLS habilitado y el usuario no puede leer su propia fila?

La policy de `perfiles` es: `perfiles_self_select` — SELECT WHERE `id = auth.uid()` — correcto.  
Esto significa que el `EXISTS` en la policy de `clientes_contactos` ejecuta como el usuario `authenticated`, que SÍ puede leer su propia fila en `perfiles` (por la policy self).

**Pregunta específica:** ¿El usuario `authenticated` sin perfil realmente no puede bypassear el `EXISTS(perfiles)`? ¿Hay algún caso edge donde el subquery en el `USING` de una policy se evalúe con un contexto de permisos diferente al del usuario actual? ¿Se recomienda algún cambio adicional al patrón?

---

## P4 — ¿Las policies propuestas para `clientes_contactos` son suficientes?

**Contexto del borrador P0-bis:**

```sql
-- Policy SELECT (staff)
CREATE POLICY "cc_select_staff" ON public.clientes_contactos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte','ventas') AND p.activo = true));

-- Policy INSERT (admin/soporte)
CREATE POLICY "cc_insert_staff" ON public.clientes_contactos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte') AND p.activo = true));

-- Policy UPDATE (admin/soporte)
CREATE POLICY "cc_update_staff" ON public.clientes_contactos
  FOR UPDATE TO authenticated
  USING (EXISTS (...)) WITH CHECK (EXISTS (...));
```

**La tabla tiene FK:** `clientes_contactos.cliente_id → clientes.id`  
La policy NO filtra por `cliente_id` — cualquier admin/soporte puede ver contactos de todos los clientes.

**Pregunta específica:** ¿Es suficiente filtrar solo por rol (admin/soporte/ventas) sin filtrar por `cliente_id` del usuario? ¿Debería haber una FK join adicional para asegurar que el usuario solo ve contactos de sus clientes asignados? ¿La ausencia de DELETE policy (solo DROP deny_all + CREATE select/insert/update) deja un gap?

---

## P5 — ¿Las policies propuestas para `tickets/clientes/cliente_accesos/ticket_respuestas_rapidas` podrían romper UI?

**Contexto:**  
El borrador P0 propone cambiar de `qual=true` a `qual=EXISTS(perfiles WHERE rol IN ('admin','soporte') [+ opcional ventas])` en 4 tablas. Los flujos de código dependientes son extensos:

- `dashboard.js:142` — carga TODOS los tickets sin LIMIT al abrir dashboard
- `dashboard.js:142` — carga TODOS los clientes sin LIMIT
- `ticket.js:202` — dropdown de contactos (afectado por P0-bis, no P0)
- `ticket.js:166` — carga accesos AnyDesk del cliente
- `tickets.js:260,263` — moveTicket, closeTicket (solo UPDATE, no SELECT)
- `quick-replies.shared.js:13-16` — SELECT/INSERT/UPDATE respuestas rápidas

**Punto sensible:** La decisión D1 (¿`ventas` ve todos los tickets o solo los asignados?) define el `qual` de la policy de `tickets`. Si se elige Opción B (solo asignados) y el board de ventas queda vacío porque no hay tickets asignados correctamente, es una regresión funcional.

**Pregunta específica:** Con los patrones de uso de código documentados arriba, ¿identificas algún flujo de UI que podría romperse silenciosamente al aplicar las policies propuestas? ¿Hay dependencias de SELECT → INSERT en la misma transacción que requieran atención especial con RLS?

---

## P6 — ¿La arquitectura BD canónica propuesta es razonable?

**Contexto:**  
La auditoría identifica que `tickets` es una "God Table" con 60+ columnas y propone una hoja de ruta de normalización en 5 fases:

- Fase 1: Completar `ticket_eventos` como única fuente de eventos (migrar desde `tickets.timeline_publica` JSONB)
- Fase 2: Completar `archivos_ticket` como única fuente de archivos (migrar desde `ticket_archivos` legacy + `tickets.adjuntos` JSONB)
- Fase 3: `ticket_match_decisiones` como única fuente de matching (migrar desde columnas match_* en tickets)
- Fase 4: Separar SLA fields a tabla `ticket_sla` (futuro)
- Fase 5: Activar `clientes_usuarios` para multi-tenant (futuro)

La migración usa doble-escritura temporal como patrón de transición.

**Pregunta específica:** ¿La estrategia de normalización en 5 fases con doble-escritura temporal es razonable para un sistema en producción de bajo volumen (<500 clientes, <10K tickets)? ¿Hay alguna fase que debería hacerse diferente o que introduce riesgo no documentado? ¿Vale la pena el esfuerzo dado el volumen actual?

---

## P7 — ¿Qué falta antes de aplicar fixes?

**Contexto:**  
La auditoría identifica estos prerrequisitos antes de ejecutar el primer SQL:

**Imprescindibles (documentados como GD-1, GV-1 a GV-6):**
1. Decisión D1: ¿ventas ve todos los tickets? (bloquea SQL de `tickets`)
2. Decisión D3: ¿ventas ve clientes_contactos? (bloquea SQL de P0-bis para la policy SELECT completa)
3. Verificar Storage policies de 3 buckets visualmente en Dashboard
4. Verificar si `quick-function` y `super-service` siguen activas y revisar sus logs
5. Verificar fecha de deploy de `ticket-internal-reply` (¿es post-fix?)

**Recomendables pero no bloqueantes:**
- Decisión D2: ¿ventas ve `cliente_accesos`?
- Decisión D4: ¿`registros.js:approve()` se migra a EF?
- Confirmar dead code en `altas.js:34-38`

**Pregunta específica:** ¿Hay algo que la auditoría no identificó como prerrequisito pero que debería verificarse antes de ejecutar el primer script de remediación? ¿El orden propuesto (P0-bis primero, luego P0, luego P1) tiene algún punto ciego?

---

## P8 — ¿Qué no debe tocarse todavía?

**Contexto:**  
La auditoría explicita estos items como "NO tocar todavía":

- `DROP ticket_archivos` — doble escritura activa + datos históricos no migrados
- `DROP tickets.timeline_publica` — portal estado.js la lee + EF estado-ticket-responder-ts escribe en ella
- `DROP tickets.adjuntos` — archivos referenciados solo en este JSONB
- `DROP columnas match_*` de tickets — frontend las lee directamente (ticket.js:178)
- `ALTER TABLE documentos` — requiere migración coordinada
- Activar `clientes_usuarios` — requiere diseño completo de RLS multi-tenant
- Ejecutar P0 antes del P0-bis — diagnóstico simultáneo de regresiones se complica

**Pregunta específica:** ¿Hay algún item en la lista de "no tocar" que la auditoría está siendo demasiado conservadora y podría hacerse ya? ¿O hay algún item que NO está en la lista pero debería estar?

---

## P9 — ¿Qué riesgo no estamos viendo?

**Esta es la pregunta más importante para una segunda opinión.**

**Áreas donde la auditoría reconoce limitaciones:**
- Realtime subscriptions: no auditadas. ¿Algún canal RT depende de policies que vamos a cambiar?
- Grants de DB: no verificados. ¿Hay grants directos sobre tablas que bypaseen RLS?
- CORS exacto de EFs: documentado conceptualmente pero no leído el código (EF no disponible en repo local)
- RPCs/funciones PostgreSQL custom: no documentadas. ¿Existen con SECURITY DEFINER?
- Estado de Realtime replication para tablas críticas
- `estado-ticket-responder-ts`: código no disponible en repositorio local — comportamiento exacto inferido

**Pregunta específica:** Con el panorama completo descrito en este paquete, ¿qué vector de ataque, punto de fallo o riesgo de arquitectura no está siendo contemplado? ¿Hay alguna categoría de riesgo típica en sistemas Supabase + RLS que no vemos aquí? ¿Qué preguntarías tú si fueras el auditor?

---

## Formato de respuesta solicitado

Por favor organiza tu respuesta así:

```
## Respuesta P1 — Priorización
[Respuesta directa + razonamiento]
[Riesgos adicionales identificados si los hay]

## Respuesta P2 — Patrón EXISTS(perfiles)
...

(etc. hasta P9)

## Hallazgos adicionales no preguntados
[Si identifies algo relevante que no cae en las preguntas]

## Semáforo de remediación
- P0-bis: [🟢 Listo para ejecutar / 🟡 Falta X / 🔴 No ejecutar]
- P0: [idem]
- P1: [idem]
- P2: [idem]

## Tabla aprobar / corregir / posponer
| Item | Veredicto | Razón |
|------|-----------|-------|
| H01 clientes_contactos P0-bis | APROBAR / CORREGIR / POSPONER | ... |
(resto de hallazgos)
```
