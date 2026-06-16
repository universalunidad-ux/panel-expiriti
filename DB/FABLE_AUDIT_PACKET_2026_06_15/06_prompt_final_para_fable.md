# Prompt Final para Fable — Listo para Pegar

---

> **INSTRUCCIONES DE USO:**  
> Copiar todo el contenido de la sección "PROMPT" a continuación y pegarlo en Fable.  
> No modificar el prompt antes de pegarlo — contiene el contexto completo necesario.  
> Si Fable tiene límite de tokens, pegar primero las secciones "Contexto" y "Preguntas", y en un segundo turno pegar "SQL a revisar".

---

## PROMPT

Eres Fable, un auditor de seguridad especializado en Supabase, PostgreSQL RLS y arquitectura de backend. Voy a darte el contexto de una auditoría de seguridad que quiero que revises como segunda opinión.

**No tienes acceso al código fuente, a la base de datos, ni a producción.** Todo lo que necesitas está en este mensaje. Si algo no está claro o necesitas información adicional, pídela — no inferas ni inventes datos.

---

### 1. EL SISTEMA

**Panel Expiriti** es un CRM de soporte técnico B2B construido sobre:
- Frontend: JavaScript puro (sin framework), SDK Supabase en el browser
- Backend: PostgreSQL 15 (Supabase), RLS habilitado en todas las tablas, 12 Edge Functions (Deno/TypeScript)
- Storage: 3 buckets en Supabase Storage
- Roles de usuario: `admin`, `soporte`, `ventas`, `authenticated` (genérico), `anon` (público)

**Flujo central:**
```
soporte.html → EF support-submit-secure → tickets (tabla) → tickets.html (board interno)
                                                           → estado.html (portal cliente con folio+token)
```

**Estado del sistema:**
- Auditoría al 88% completada (falta verificación visual de Storage y deploy de EFs en Dashboard)
- Fixes aplicados: 12% (solo 3 fixes menores previos al ciclo actual)
- Borradores SQL de remediación: 100% redactados, ninguno ejecutado

---

### 2. HALLAZGOS CRÍTICOS (resumen por prioridad)

#### P0-bis — ROTO EN PRODUCCIÓN AHORA

**`clientes_contactos`:** Tiene RLS habilitado con una sola policy `deny_all_clientes_contactos` (`qual=false`, `roles={public}`, `ALL`). No existe ninguna policy positiva para `authenticated`. Efecto: 5 flujos de UI fallan:

| Flujo | Archivo | Líneas | Efecto |
|-------|---------|--------|--------|
| Aprobación de registros | registros.js | 40,47,48,49 | **Error visible — flujo roto** |
| Ver contactos de cliente | cliente.js | 35 | Sección vacía |
| Contacto en header del ticket | ticket.js | 138 | Nombre no aparece |
| Dropdown de contactos | ticket.js | 202 | Vacío |
| Sugerencias en altas | altas.js | 44 | Vacío (degradado, no roto) |

Asimetría: `altas.js:approve()` usa EF `alta-aprobar` (service_role, bypass RLS, **funciona**). `registros.js:approve()` usa SDK directo (authenticated, **roto**).

#### P0 — DATOS EXPUESTOS A TODOS LOS ROLES

Cuatro tablas con policies `qual=true` (sin filtro de rol):

| Tabla | Policy activa | Riesgo |
|-------|---------------|--------|
| `tickets` | `tickets_select_auth` + `tickets_select_authenticated` (duplicadas) `qual=true` | Cualquier rol lee todos los tickets de todos los clientes |
| `clientes` | `clientes_select_auth` `qual=true` | Cualquier rol exporta base completa de clientes (PII) |
| `cliente_accesos` | `cliente_accesos_select_auth` `qual=true` | Cualquier rol lee IDs AnyDesk y credenciales de acceso remoto |
| `ticket_respuestas_rapidas` | 6 policies abiertas en 2 grupos duplicados | Cualquier rol lee/crea/modifica quick replies de cualquier cliente |

Además: `quick-function` — EF deployada con `Deno.env.get("6fb8db5c...")` (hash SHA256 como nombre de variable → undefined → 500 siempre). Endpoint público con service_role, sin uso en ningún frontend. Superficie de ataque activa.

#### P1 — RIESGO ACTIVO MEDIO

- `ticket_archivos` (legacy): SELECT `qual=true`
- `ticket_match_decisiones`: 3 policies abiertas, 0 refs en PANEL JS (puede cerrarse sin costo de UI)
- `super-service`: EF legacy sin uso, POST público con service_role — candidata a retirar
- `match-cliente`: POST público sin JWT ni rate limit, full scan de 400+ clientes, devuelve nombre/email/teléfono/score
- Storage: 3 buckets (`soporte_adjuntos`, `altas_tmp`, `certificados`) sin verificación visual de policies

#### P2 — OPERACIONAL / CONTROL DE ABUSO

- `estado-ticket-responder-ts` (POST): sin rate limit HTTP (solo folio+token). **[inferencia]:** mecanismo anti-spam en BD no confirmado — código EF no disponible en repo local
- `estado-ticket-ts` (GET): sin rate limit HTTP confirmado — gap P2 adicional; superficie distinta del POST; bruteforce de folio+token sin barrera de red (ver §4.5 de `08_scope_ampliado_para_fable.md`)
- `submit-alta`: sin rate limit (acepta hasta 80MB/request)
- `submit-registro`: sin rate limit
- `support-submit-secure`: Turnstile implementado pero apagado (`REQUIRE_TURNSTILE=false`)
- `ticket_eventos`: 3 flujos JS sin INSERT — historial incompleto (moveTicket, closeTicket, batchClose)
- `edge_idempotency` y `rate_limit_events`: sin TTL, sin pg_cron

---

### 3. BORRADORES SQL PROPUESTOS (para revisión lógica — NO ejecutar)

#### P0-bis: clientes_contactos

```sql
BEGIN;

-- Eliminar deny_all (redundante una vez que haya policies positivas)
DROP POLICY IF EXISTS deny_all_clientes_contactos ON public.clientes_contactos;

-- SELECT para staff (rol en perfiles)
CREATE POLICY "cc_select_staff" ON public.clientes_contactos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')  -- ventas: pendiente decisión D3
        AND p.activo = true
    )
  );

-- INSERT para admin/soporte (registros.js usa SDK directo)
CREATE POLICY "cc_insert_staff" ON public.clientes_contactos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte')
        AND p.activo = true
    )
  );

-- UPDATE para admin/soporte
CREATE POLICY "cc_update_staff" ON public.clientes_contactos
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte') AND p.activo = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte') AND p.activo = true));

COMMIT;
```

#### P0: tickets (dos variantes según decisión D1)

```sql
BEGIN;

DROP POLICY IF EXISTS tickets_select_auth ON public.tickets;
DROP POLICY IF EXISTS tickets_select_authenticated ON public.tickets;

-- OPCIÓN A: ventas ve todos los tickets
CREATE POLICY "tickets_select_staff" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'soporte', 'ventas')
        AND p.activo = true
    )
  );

-- OPCIÓN B: ventas solo ve sus asignados (más segura, más riesgo de board vacío)
-- CREATE POLICY "tickets_select_admin_soporte" ...  -- admin/soporte ven todo
-- CREATE POLICY "tickets_select_ventas" ...          -- ventas: asignado_a = auth.uid() OR creado_por = auth.uid()

COMMIT;
```

#### P0: clientes, cliente_accesos

```sql
BEGIN;

DROP POLICY IF EXISTS clientes_select_auth ON public.clientes;
CREATE POLICY "clientes_select_staff" ON public.clientes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte','ventas') AND p.activo = true));

DROP POLICY IF EXISTS cliente_accesos_select_auth ON public.cliente_accesos;
CREATE POLICY "cliente_accesos_select_staff" ON public.cliente_accesos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','soporte') AND p.activo = true));
  -- ventas excluido: credenciales AnyDesk no necesarias para ventas

COMMIT;
```

---

### 4. DECISIONES HUMANAS BLOQUEANTES (contexto para tu revisión)

| ID | Pregunta | Bloquea | Recomendación actual |
|----|---------|---------|----------------------|
| D1 | ¿`ventas` ve todos los tickets o solo los asignados? | SQL de tickets (P0) | Opción A para inicio |
| D2 | ¿`ventas` ve `cliente_accesos` (credenciales AnyDesk)? | Array de roles P0 | NO |
| D3 | ¿`ventas` ve `clientes_contactos`? | Array de roles P0-bis | SÍ (ticket.js:202 lo necesita) |
| D4 | ¿`registros.js:approve()` se migra a EF? | Diseño INSERT de clientes_contactos | Mantener SDK + crear policy |
| D5 | ¿Activar Turnstile en support-submit-secure? | Deploy EF | Depende de spam activo |
| D6 | ¿`match-cliente` usa header x-service-key o rediseño JWT? | Diseño fix P1-4 | Header x-service-key |

---

### 5. LAS 9 PREGUNTAS QUE NECESITO QUE RESPONDAS

**P1 — Priorización:**  
¿La clasificación P0-bis / P0 / P1 / P2 / P3 es correcta? ¿Hay algún item mal priorizado?

**P2 — Patrón EXISTS(perfiles):**  
¿El patrón `EXISTS(SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN (...) AND activo = true)` es seguro como control de acceso por rol en Supabase? ¿Hay vulnerabilidades conocidas o vectores de bypass?

**P3 — Usuario authenticated sin perfil:**  
¿Un usuario con JWT válido pero sin fila en `perfiles` puede bypassear el `EXISTS(perfiles)`? ¿El subquery del USING se evalúa con los permisos del usuario o con permisos del sistema?

**P4 — Suficiencia de policies de clientes_contactos:**  
¿Filtrar solo por rol (sin filtrar por cliente_id) es suficiente, o debería haber un join adicional para limitar los contactos visibles por usuario?

**P5 — Riesgo de rotura de UI al aplicar P0:**  
Con el código descrito (dashboard.js:142 sin LIMIT, ticket.js:202, etc.), ¿identificas algún flujo que podría romperse silenciosamente al aplicar las policies propuestas?

**P6 — Arquitectura BD canónica:**  
¿La estrategia de normalización en 5 fases con doble-escritura temporal es razonable para este volumen (<500 clientes, <10K tickets)?

**P7 — Prerrequisitos antes de fixes:**  
¿Hay algo que la auditoría no identificó como prerrequisito pero que debería verificarse antes de ejecutar el primer SQL? Contexto adicional: la auditoría identificó cuatro gaps de cobertura post-cierre que aún no tienen evidencia:

- **G01 — `ticket_eventos` RLS no auditado:** Las policies SELECT/INSERT/UPDATE/DELETE de esta tabla no fueron consultadas en Dashboard. La tabla es leída por `estado-ticket-ts` (EF pública sin JWT). Su estado real es desconocido.
- **G02 — `clientes_contacto_historial` no auditada:** Tabla detectada en el inventario pero sin análisis de RLS, grants, writers, readers ni presencia de PII. Completamente opaca.
- **G03 — INSERT/UPDATE/DELETE de `clientes` y `cliente_accesos` no auditadas:** La auditoría P0 solo cubre SELECT. `dashboard.js:84` hace INSERT en `clientes`; `ticket.js:168` hace INSERT/UPDATE en `cliente_accesos`. Si las policies de escritura son abiertas, el riesgo de integridad sigue activo post-P0 SELECT.
- **G04 — `estado-ticket-ts` GET sin rate limit HTTP:** Superficie distinta de `estado-ticket-responder-ts` POST. No tiene fix documentado en el plan P2 actual. La entropía de `token_publico` no está confirmada (implementación de `randToken()` no auditada).

¿Son estos gaps bloqueantes para aprobar el SQL de P0-bis/P0, o pueden auditarse en paralelo?

**P8 — Qué no tocar todavía:**  
¿Hay algo en la lista de "no tocar" que es demasiado conservador, o algo que falta agregar a esa lista?

**P9 — Riesgo no visto:**  
Con el panorama completo, ¿qué vector de ataque, punto de fallo o riesgo de arquitectura no está siendo contemplado?

---

### 6. QUÉ NO DEBE HACER FABLE EN SU RESPUESTA

- **NO ejecutar SQL** — los borradores son para revisión lógica, no para ejecución
- **NO proponer una reescritura completa** — el objetivo es confirmar o corregir las decisiones ya tomadas
- **NO pedir credenciales ni acceso a producción** — toda la información disponible está en este prompt
- **NO asumir acceso al repositorio de código** — el análisis se basa en extractos de grep y auditoría
- **NO inventar datos** — si algo no está documentado, indicarlo como "información no disponible"
- **NO retirar EFs legacy sin confirmar logs primero** — el paso de verificación es obligatorio
- **NO mezclar fixes de UI (P3) con fixes de seguridad (P0)** — son ventanas de ejecución separadas

---

### 7. FORMATO DE RESPUESTA SOLICITADO

Por favor responde con esta estructura:

```
## Respuesta P1 — Priorización
[Veredicto directo + razonamiento]

## Respuesta P2 — Patrón EXISTS(perfiles)
[Veredicto directo + análisis de seguridad]

## Respuesta P3 — Usuario sin perfil
[Veredicto directo + explicación técnica]

## Respuesta P4 — Suficiencia de policies clientes_contactos
[Veredicto + recomendaciones si las hay]

## Respuesta P5 — Riesgo de rotura de UI
[Lista de flujos en riesgo si los hay]

## Respuesta P6 — Arquitectura canónica
[Veredicto + orden recomendado si difiere]

## Respuesta P7 — Prerrequisitos faltantes
[Lista de items adicionales si los hay]

## Respuesta P8 — Lista de no-tocar
[Items a agregar o quitar]

## Respuesta P9 — Riesgos no vistos
[Hallazgos adicionales con prioridad sugerida]

---

## Hallazgos adicionales no solicitados
[Si identificas algo importante fuera de las 9 preguntas]

---

## Semáforo de remediación

| Fix | Estado | Condición para proceder |
|-----|--------|------------------------|
| P0-bis: clientes_contactos | 🟢 / 🟡 / 🔴 | [condición] |
| P0: tickets | 🟢 / 🟡 / 🔴 | [condición] |
| P0: clientes | 🟢 / 🟡 / 🔴 | [condición] |
| P0: cliente_accesos | 🟢 / 🟡 / 🔴 | [condición] |
| P0: ticket_respuestas_rapidas | 🟢 / 🟡 / 🔴 | [condición] |
| P0: quick-function retirar | 🟢 / 🟡 / 🔴 | [condición] |
| P1: match-cliente fix | 🟢 / 🟡 / 🔴 | [condición] |
| P1: Storage verificación | 🟢 / 🟡 / 🔴 | [condición] |
| P2: rate limits (4 endpoints) | 🟢 / 🟡 / 🔴 | [condición] |

---

## Tabla aprobar / corregir / posponer

| Item | Veredicto | Razón en una línea |
|------|-----------|-------------------|
| P0-bis: SQL de clientes_contactos | APROBAR / CORREGIR / POSPONER | ... |
| P0: SQL de tickets (Opción A) | APROBAR / CORREGIR / POSPONER | ... |
| P0: SQL de clientes | APROBAR / CORREGIR / POSPONER | ... |
| P0: SQL de cliente_accesos | APROBAR / CORREGIR / POSPONER | ... |
| P0: Retirar quick-function | APROBAR / CORREGIR / POSPONER | ... |
| P1-4: match-cliente header x-service-key | APROBAR / CORREGIR / POSPONER | ... |
| P2-1/2/3: Rate limits | APROBAR / CORREGIR / POSPONER | ... |
| P2-5: ticket_eventos en moveTicket | APROBAR / CORREGIR / POSPONER | ... |
| P3: Normalización tickets | APROBAR / CORREGIR / POSPONER | ... |

---

## Ranking final de prioridades (tu ordenamiento)
1. [Item más urgente]
2. ...
```

---

### REFERENCIA RÁPIDA — Tablas de `perfiles` (base del patrón EXISTS)

```sql
-- Estructura de perfiles (desde snapshot DDL):
CREATE TABLE public.perfiles (
  id uuid NOT NULL,  -- FK → auth.users(id)
  nombre text,
  rol text,          -- valores: 'admin', 'soporte', 'ventas'
  email text,
  activo boolean
  -- Sin campos adicionales de granularidad
);

-- Policy actual de perfiles (correcta, confirmada en Dashboard):
-- perfiles_self_select: FOR SELECT WHERE id = auth.uid()
-- Esto significa: el EXISTS en las policies de otras tablas puede leer
-- la fila de perfiles del usuario actual (self-read).
```

---

*Fin del prompt. Gracias por la revisión.*
