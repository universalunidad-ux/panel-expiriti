# BD Arquitectura a Revisar — Panel Expiriti
**Fecha:** 2026-06-15  
**Fuente:** DB/audit_bd_arquitectura_normalizacion_2026_06_15.md (1,281 líneas)  
**Modo:** Resumen ejecutivo para segunda opinión. Sin SQL ejecutable.

---

## 1. La God Table: `tickets` (60+ columnas)

### Estado actual

La tabla `tickets` acumula datos de 4 dominios distintos en una sola tabla:

```
DOMINIO SOPORTE (correcto):
  id, cliente_id, contacto_id, titulo, descripcion, tipo, prioridad,
  estado, origen, creado_por, folio (UNIQUE), token_publico (UNIQUE),
  token_publico_expira, primera_respuesta_en, fecha_cierre, timestamps

DOMINIO MATCHING (denormalizado — debería estar en ticket_match_decisiones):
  empresa_capturada, nombre_capturado, correo_capturado, telefono_capturado,
  cliente_id_sugerido, contacto_id_sugerido, match_nivel, match_score,
  match_confirmado, contacto_confirmado, contacto_es_nuevo, requiere_consolidacion

DOMINIO CONTACTO (denormalizado — duplica clientes_contactos):
  horario_laboral, horario_notas, horario_contacto,
  nombre_cliente_contacto, correo_cliente_contacto

DOMINIO SLA (candidato a tabla separada):
  sla_policy, sla_first_response_deadline, sla_resolution_deadline,
  sla_breached_first_response, sla_breached_resolution

DOMINIO ARCHIVOS/TIMELINE (JSONB — denormalizado):
  timeline_publica DEFAULT '[]'   ← duplica ticket_eventos
  adjuntos DEFAULT '[]'           ← duplica archivos_ticket + ticket_archivos

CONTADORES REDUNDANTES (3 columnas para el mismo dato):
  evidencia_count, attachments_count, files_count
```

### Pregunta para Fable

¿La estrategia de normalización propuesta (5 fases con doble-escritura temporal) es la correcta para este volumen (<500 clientes, <10K tickets)? ¿Vale el esfuerzo ahora o puede esperar?

---

## 2. Modelo Dual de Archivos (3 fuentes simultáneas)

### Estado actual

| Fuente | Tipo | Escribe | Lee | Estado |
|--------|------|---------|-----|--------|
| `tickets.adjuntos` | JSONB | `dashboard.js:141`, `ticket.js:250` | `ticket.js:241` | LEGACY en uso |
| `ticket_archivos` | Tabla | `ticket.js:160` (soft-fail), `cliente.core.js:33` | `ticket.js:240` | LEGACY en uso |
| `archivos_ticket` | Tabla | `ticket.js:160` (throw), EFs | `ticket.js:241` | CANÓNICO activo |

**Doble escritura en `ticket.js:160`:**
```
uploadPublicLogFiles():
  1. storage.upload(path, file)              → soporte_adjuntos bucket
  2. ticket_archivos.insert(path)            → legacy (error IGNORADO: console.error)
  3. archivos_ticket.insert(path)            → canónico (error PROPAGADO: throw)
```

**Implicación crítica:** Si archivos_ticket INSERT falla después del storage upload, el archivo queda en Storage sin referencia en ninguna tabla. No hay rollback del storage upload.

**Lectura en `ticket.js:241`:**
```javascript
const canonFiles    = normalizeFiles(archivos_ticket)
const legacyFiles   = normalizeFiles(ticket_archivos)
const ticketFiles   = normalizeFiles(tickets.adjuntos)
const timelineFiles = normalizeFiles(timeline_publica.flatMap(...))
FILES = dedup([...canonFiles, ...ticketFiles, ...timelineFiles, ...legacyFiles])
```
La deduplicación prioriza la fuente canónica.

### Ruta de migración propuesta

```
Fase 1: Mantener doble escritura (actual)
Fase 2: Migrar rows de ticket_archivos a archivos_ticket
Fase 3: Migrar tickets.adjuntos JSONB a archivos_ticket
Fase 4: Eliminar escritura a ticket_archivos y adjuntos JSONB
Fase 5: DROP ticket_archivos (solo después de que Storage también migrado)
```

---

## 3. Modelo Dual de Eventos (2 fuentes simultáneas)

### Estado actual

| Fuente | Tipo | Escribe | Lee |
|--------|------|---------|-----|
| `tickets.timeline_publica` | JSONB DEFAULT '[]' | `ticket.js:250`, `dashboard.js:141`, EF `estado-ticket-responder-ts` (no confirmado) | `ticket.js:240` (fallback si no hay ticket_eventos) |
| `ticket_eventos` | Tabla | `ticket.js:250 saveLog()`, EF `crear-ticket-interno` | `ticket.js:240` (preferida) |

**GAP CRÍTICO:** Tres flujos NO insertan en `ticket_eventos`:
- `tickets.js:260 moveTicket()` — cambio de estado desde board → solo UPDATE en tickets
- `tickets.js:263 closeTicket()` — cierre desde board → solo UPDATE en tickets  
- `dashboard.js:150 batchClose()` — cierre masivo → solo UPDATE en tickets

**Impacto visible:** El portal del cliente (`estado.html`) usa `ticket_eventos` para mostrar el historial. Los cambios de estado desde el board son invisibles para el cliente en el portal.

### Comparación

| Aspecto | timeline_publica JSONB | ticket_eventos |
|---------|----------------------|----------------|
| Visibilidad granular (publica/interna) | No | Sí |
| autor_tipo estructurado | No | Sí |
| FK garantizada | No | Sí (ticket_id → tickets) |
| Indexable por campo | No (solo GIN) | Sí |
| Soporte RLS por fila | No | Sí |
| Borrado selectivo | Difícil (array JSONB) | Fácil |

---

## 4. Token Público: Riesgos y Gaps

### Modelo actual

```sql
tickets.folio         -- UNIQUE (índice tickets_folio_uidx, confirmado en Dashboard)
tickets.token_publico -- UNIQUE (índice tickets_token_publico_uidx, confirmado en Dashboard)
tickets.token_publico_expira -- TIMESTAMPTZ, sin cleanup automático
```

**Generación (dashboard.js:141):**
```javascript
const token_publico = randToken()  // función local — entropía no verificada
const token_publico_expira = new Date(Date.now() + 30*864e5).toISOString()  // 30 días
```

### Gaps de seguridad

| Gap | Severidad | Descripción |
|-----|-----------|-------------|
| token en plaintext | Media | Almacenado sin hash. Si la BD es comprometida, todos los portales son accesibles sin necesidad de bruteforce |
| Sin rate limit en `estado-ticket-ts` | Alta | El endpoint que recibe folio+token no tiene rate limit HTTP. `folio` es secuencial (inferible), `token_publico` es aleatorio pero en plaintext. Sin RL, es posible bruteforce de tokens |
| Sin cleanup automático de tokens expirados | Baja | Tokens expirados permanecen en la tabla. Sin `pg_cron`, acumulación indefinida |
| Sin flujo de renovación | Baja | Ticket con folio válido pero token expirado no tiene enlace funcional — requiere intervención manual del staff |
| Entropía de `randToken()` no verificada | Media | La función es local y no está en el repositorio auditado. Si usa `Math.random()` en lugar de `crypto.randomUUID()`, la entropía es insuficiente |

---

## 5. Índices Duplicados (7 identificados)

**Confirmados en Dashboard SQL read-only (2026-06-13):**

| Tabla | Índices totales | Superfluos |
|-------|----------------|------------|
| `tickets` | 3 sobre mismo campo | 2 de sobra |
| `ticket_eventos` | 2 sobre mismo campo | 1 de sobra |
| `archivos_ticket` | 2 sobre mismo campo | 1 de sobra |
| **Total** | 7 | **4 superfluos** |

**Impacto:** Overhead en cada INSERT/UPDATE. Con el volumen actual (<10K tickets) es mínimo. Con escala es lineal.

**Acción propuesta:** `DROP INDEX CONCURRENTLY` de los 4 superfluos en ventana de mantenimiento. Los nombres exactos deben confirmarse en Dashboard antes de actuar.

**Índices faltantes recomendados:**
- `tickets.token_publico_expira` — para cleanup eficiente de tokens expirados
- `tickets.cliente_id + estado` — filtro combinado frecuente no observado
- `bitacora.detalle->>'ticket_id'` — query actual sin índice GIN especializado

---

## 6. Constraints e Integridad Referencial

### FK compuesta en `ticket_respuestas_rapidas`

**Confirmado en Dashboard:** 
```
FK simple:    cliente_id → clientes(id) ON DELETE CASCADE
FK simple:    contacto_id → clientes_contactos(id)
FK compuesta: (contacto_id, cliente_id) → clientes_contactos(id, cliente_id)
```

La FK compuesta garantiza que `contacto_id` pertenece al mismo `cliente_id` del quick reply. El Dashboard audit calificó esto como "correcta y robusta".

**Pendiente de confirmar:** Para que la FK compuesta sea válida, `clientes_contactos` debe tener una UNIQUE constraint sobre `(id, cliente_id)`. Dashboard no lo confirma explícitamente.

### PK no observada en `cliente_aliases`

El snapshot DDL (`supabase-public-schema.sql`) no muestra `PRIMARY KEY` explícito en `cliente_aliases`. La columna `id` tiene `NOT NULL DEFAULT gen_random_uuid()` pero sin `CONSTRAINT ... PRIMARY KEY`. Puede ser omisión del snapshot — pendiente de verificar en Dashboard.

### CHECK constraints faltantes en `ticket_eventos`

```sql
-- Faltantes en el DDL actual:
-- CHECK (kind IN ('nota','estado','mensaje','archivo'))
-- CHECK (autor_tipo IN ('soporte','cliente','sistema'))
-- CHECK (visibilidad IN ('publica','interna'))
```

Sin estos CHECKs, es posible insertar valores inválidos. Los EFs y JS deberían validar, pero la defensa en profundidad recomienda validar en BD también.

### CASCADE behavior sin verificar

No se ha verificado el comportamiento ON DELETE CASCADE para:
- `ticket_archivos → tickets`
- `archivos_ticket → tickets`  
- `ticket_eventos → tickets`
- `clientes_contactos → clientes`

Sin CASCADE, borrar un ticket dejaría filas huérfanas en las tablas hijas.

---

## 7. Tablas con Problemas de Naming o Propósito Confuso

### `ticket_archivos` vs `archivos_ticket`

| Tabla | Naming | Columna engañosa | Estado |
|-------|--------|------------------|--------|
| `ticket_archivos` | Legacy | `url_archivo` almacena storage_path (no URL) | Legacy activa |
| `archivos_ticket` | Canónico | `storage_path` nombrado correctamente | Canónico activo |

### `solicitud_archivos` — FK apunta a tabla equivocada

La tabla `solicitud_archivos` tiene FK `solicitud_id → solicitudes_soporte(id)`. Su nombre sugiere que debería apuntar a `solicitudes_alta`. Las 31 filas existentes apuntan a `solicitudes_soporte`. La EF `submit-alta` usa `solicitudes_alta.archivos` (JSONB) en vez de esta tabla.

### `clientes_usuarios` — preparada pero inactiva

0 referencias en PANEL/*.js. La tabla soportaría multi-tenant (owner/editor/viewer por cliente) pero el frontend carga todos los clientes sin filtro. No está conectada a ningún flujo activo.

---

## 8. `cliente_aliases` — Uso en Pipeline de Matching

La tabla almacena aliases de nombres de empresa (fuzzy matching):
```
cliente_aliases.alias      — nombre alternativo
cliente_aliases.alias_norm — nombre normalizado
cliente_aliases.confianza  — score de confianza del alias
```

Usada por la EF `match-cliente` para el pipeline de matching de solicitudes de alta. Si esta tabla no tiene PK explícita, la integridad referencial del pipeline es frágil.

---

## 9. Performance y Escalabilidad

### Queries sin LIMIT críticas

`dashboard.js:142`:
```javascript
s.from("clientes").select("id,nombre")  // sin .limit()
s.from("tickets").select("*")           // sin .limit(), hasta 1200 por inner limit JS
```

Con <500 clientes actuales: manejable. Con >5,000: carga lenta en dashboard de ventas.

### Tablas sin TTL

| Tabla | Filas actuales | Riesgo de crecimiento |
|-------|---------------|----------------------|
| `bitacora` | Desconocido | Alto — toda acción genera fila |
| `rate_limit_events` | 41 | Lineal con tráfico del portal |
| `edge_idempotency` | 10 | Bajo (1 por invocación EF) |
| `ticket_portal_logs` | Desconocido | Alto — polling cada X segundos |

### Ticket con >100 eventos

`ticket.js:240` carga `ticket_eventos` completo para cada ticket. Sin paginación. Con tickets de soporte de larga duración (>500 eventos), el payload de la query crece sin límite.

---

## 10. Reglas de Oro Derivadas de la Auditoría

| Regla | Principio |
|-------|-----------|
| R1 | Una tabla, una responsabilidad — `tickets` viola esto |
| R2 | JSONB para datos realmente variables — `timeline_publica` y `adjuntos` tienen estructura fija, merecen tablas |
| R3 | Una fuente de verdad por entidad — archivos tienen 3, eventos tienen 2 |
| R4 | FKs hacia columnas PK o UNIQUE — verificar UNIQUE(id, cliente_id) en clientes_contactos |
| R5 | PKs explícitas siempre — cliente_aliases sin PK explícita en DDL |
| R6 | Índices únicos solo donde necesarios — 4 índices superfluos actuales |
| R7 | Rate limiting y cleanup con TTL desde diseño — rate_limit_events y edge_idempotency sin TTL |
| R8 | Triggers solo para invariantes de integridad, no lógica de negocio |
| R9 | Nombres de columnas deben describir lo que contienen — `url_archivo` almacena storage_path |
| R10 | Migraciones con doble-escritura temporal, eliminando legacy solo cuando lectura legacy desconectada |
