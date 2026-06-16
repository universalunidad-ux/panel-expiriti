# Edge Functions y Storage — Estado a Revisar
**Fecha:** 2026-06-15  
**Fuente:** DB/cierre_auditoria_130_gap_matrix_2026_06_15.md §6 y §7 + DB/audit_p1_p2_readonly_2026_06_15.md §5 y §6  
**Nota:** El código de algunas EFs no está disponible en el repositorio local. El análisis se basa en el repositorio `panel-expiriti-audit-bd` que contiene copias de auditoría.

---

## 1. Inventario de Edge Functions (12 total)

### 1.1 EFs Críticas — Activas y Correctas

| EF | Acceso | JWT | service_role | Rate Limit | Estado |
|----|--------|-----|-------------|------------|--------|
| `support-submit-secure` | Pública | No (público) | Sí | **SÍ** (5/10min) | ✅ ACTIVA OK |
| `estado-ticket-ts` | Pública | No (folio+token) | Sí | No (throttle logs) | ✅ ACTIVA OK |
| `ticket-internal-reply` | Interna | **Sí (JWT required)** | Sí | No (flujo auth) | ✅ ACTIVA, deploy no confirmado |
| `crear-ticket-interno` | Interna | **Sí (JWT required)** | Sí | No | ✅ ACTIVA OK |
| `alta-aprobar` | Interna | **Sí (JWT required)** | Sí | No | ✅ ACTIVA OK |
| `registro-aprobar` | Interna | **Sí (JWT required)** | Sí | No | ✅ ACTIVA OK |

### 1.2 EFs con Problemas de Seguridad — Activas

| EF | Acceso | Problema | Prioridad | Acción |
|----|--------|----------|-----------|--------|
| `match-cliente` | **Pública sin JWT** | Full scan de clientes, devuelve nombre/email/teléfono/score | P1-4 | Header x-service-key + rate limit |
| `submit-alta` | Pública sin JWT | Sin rate limit, acepta hasta 80MB por request | P2-2 | Agregar rate limit |
| `submit-registro` | Pública sin JWT | Sin rate limit | P2-3 | Agregar rate limit |
| `estado-ticket-responder-ts` | Pública (folio+token) | Sin rate limit HTTP | P2-1 | Agregar rate limit |

### 1.3 EFs Legacy — Candidatas a Retirar

| EF | Problema | Último uso conocido | Riesgo |
|----|----------|---------------------|--------|
| `quick-function` | Usa `Deno.env.get("6fb8db5c...")` — hash SHA256 como nombre de variable → undefined → 500 en cada llamada. Sin frontend que la invoque. | Desconocido — sin referencias en PANEL/*.js | **ALTO** — service_role expuesto en endpoint público roto |
| `super-service` | Duplicado funcional de `submit-alta` sin uso documentado. Acepta POST sin autenticación con service_role. | Desconocido — sin referencias en PANEL/*.js activo | **ALTO** — service_role bypass RLS en endpoint público |

---

## 2. Detalle por Edge Function Problemática

### 2.1 `quick-function` — P0-5 (EF rota, retirar del deploy)

**Diagnóstico:**
```typescript
// Lo que hace la EF (reconstruido del análisis de código):
const key = Deno.env.get("6fb8db5c...")  // variable con nombre = hash SHA256
// Deno.env.get() con nombre de variable que no existe en Supabase Secrets → undefined
// El resto de la función falla con error de TypeScript/runtime → HTTP 500
```

**Preguntas para Fable:**
- ¿La simple existencia de un endpoint con `service_role` que devuelve 500 representa un riesgo explotable, o el 500 ocurre antes de cualquier operación sobre la BD?
- ¿Antes de retirarla del deploy, qué nivel de revisión de logs recomendarías? ¿7 días? ¿30 días?
- ¿Hay alguna forma de "desactivar" una EF en Supabase sin borrarla del deploy?

**Estado de verificación:** Pendiente de confirmar si sigue activa en Dashboard → Edge Functions.

### 2.2 `super-service` — P1-3 (EF legacy sin uso, retirar)

**Diagnóstico:**
- Acepta POST sin autenticación
- Usa `service_role` → bypass completo de RLS
- Funcionalmente duplica `submit-alta`
- Sin referencias en el código activo del panel

**Preguntas para Fable:**
- ¿El hecho de que no aparezca en código activo es suficiente evidencia para retirarlo, o hay que verificar también los logs por llamadas externas?
- ¿Podría haber clientes con integraciones directas a este endpoint que no están documentadas?

### 2.3 `match-cliente` — P1-4 (EF pública sin protección, fix pendiente)

**Flujo actual:**
```
POST /match-cliente
  Body: { nombre, empresa, correo, telefono }
  → service_role
  → SELECT + fuzzy search en clientes, clientes_contactos, cliente_aliases (hasta 400 filas)
  → Devuelve: candidatos con { nombre, correo, telefono, score }
  Sin autenticación. Sin rate limit. CORS *
```

**Fix propuesto:**
```
Opción A (recomendada para velocidad):
  Header x-service-key en cada request de soporte.js
  Rate limit por IP (scope: match_cliente, 10/min)
  Secret x-service-key en Supabase Secrets

Opción B (más seguro, más complejo):
  Rediseño: mover el match a una EF autenticada con JWT
  Requiere que soporte.html tenga sesión (rompe flujo público)
```

**Decisión humana D6 bloqueante:** ¿Header x-service-key (visible en JS del frontend) o rediseño completo?

**Preguntas para Fable:**
- ¿Un secreto en el JS del frontend que solo permite operaciones de lectura (búsqueda de clientes) representa un riesgo aceptable?
- ¿El rate limit por IP (sin autenticación) es suficiente mitigación si el header x-service-key se filtra?
- ¿Hay alguna alternativa que no requiera sesión pero que sea más segura que ambas opciones propuestas?

### 2.4 `estado-ticket-responder-ts` — P2-1 (sin rate limit HTTP)

**Estado:** Código NO disponible en repositorio local. El análisis es inferido del comportamiento observado.

**Comportamiento inferido:**
- Acepta POST con folio+token (sin JWT de sesión)
- Permite que el cliente (dueño del portal) envíe respuestas a sus propios tickets
- Hay un check de anti-spam en BD (porcentaje de respuestas recientes), pero sin rate limit HTTP

**Pregunta para Fable:**
- ¿El anti-spam a nivel de BD (filas en ticket_portal_logs o similar) es suficiente si no hay rate limit HTTP? ¿Qué costo tiene el ataque si el anti-spam falla?

### 2.5 `ticket-internal-reply` — P1-7 (deploy no confirmado)

**Fix aplicado:** Commit `f54e22b` (2026-06-13) — hardening de idempotencia con `edge_idempotency`.

**Comportamiento post-fix:**
```typescript
// Patrón de idempotencia implementado:
1. Recibe idempotency_key en el request
2. SELECT FROM edge_idempotency WHERE key = idempotency_key AND status = 'completed'
3. Si existe: devuelve respuesta cacheada (no re-ejecuta)
4. Si no: INSERT pending, ejecuta operación, UPDATE completed
```

**Riesgo si deploy es pre-fix:** Dos clicks rápidos en "Enviar respuesta" desde el panel crean dos respuestas duplicadas. Los 10 registros en `edge_idempotency` son evidencia de que la función SÍ se usa post-fix (pero el deploy fecha no confirmado).

**Pregunta para Fable:**
- Con el patrón de idempotencia descrito, ¿qué pasa si la EF crashea entre el INSERT pending y el UPDATE completed? ¿El registro queda en estado pending indefinidamente? ¿Hay un timeout?

### 2.6 `support-submit-secure` — Turnstile apagado (decisión D5)

**Estado de Turnstile:**

| Componente | Estado |
|------------|--------|
| Lógica de verificación en EF | Implementada |
| `REQUIRE_TURNSTILE` en Supabase Secrets | `false` — apagado |
| `TURNSTILE_ENABLED` en `soporte.js:11` | `false` — apagado |
| Widget HTML en `soporte.html` | Desconocido — no auditado visualmente |
| `TURNSTILE_SECRET_KEY` en Secrets | Desconocido — no verificado desde repo |

**Para activar (si D5 = sí):** Los cuatro componentes deben configurarse coordinadamente. Si `REQUIRE_TURNSTILE=true` en Secrets pero el widget HTML no existe en `soporte.html`, el formulario queda completamente bloqueado para todos los usuarios.

**Pregunta para Fable:**
- ¿Con rate limit de 5/10min y sin Turnstile, qué nivel de abuso de bots podría pasar? ¿Es un riesgo operativo real o teórico para un CRM B2B de bajo volumen?

---

## 3. Storage — 3 Buckets sin Verificación Visual

### Problema fundamental

Las Storage policies de Supabase NO son consultables via SQL de schema. La query `SELECT * FROM pg_policies` muestra las policies de tablas PostgreSQL, pero los buckets de Storage tienen policies en una capa separada del Dashboard. La única forma de verificarlas es visualmente: Dashboard → Storage → [bucket] → Policies.

### 3.1 Bucket `soporte_adjuntos`

| Aspecto | Estado conocido |
|---------|-----------------|
| **Propósito** | Adjuntos de tickets de soporte |
| **Upload desde browser** | `ticket.js:160` — staff sube directamente (authenticated) |
| **Upload desde EF** | `support-submit-secure`, `ticket-internal-reply` (service_role) |
| **Lectura** | `ticket.js:127` — signed URL (8h), `estado-ticket-ts` — signed URLs para portal |
| **Riesgo si policy pública** | Adjuntos de tickets de clientes accesibles sin firma — evidencias, screenshots, documentos sensibles |
| **Policy ideal** | INSERT: authenticated (admin/soporte) + service_role. SELECT directa: solo service_role. anon: SIN ACCESO |
| **Verificación pendiente** | **SÍ — Dashboard visual obligatorio** |

**Hallazgo crítico de código:**  
`ticket.js:160` hace upload DIRECTO desde browser (sesión authenticated). La Storage policy DEBE tener INSERT para `authenticated` o los adjuntos de tickets internos del staff fallarán silenciosamente. El INSERT a `ticket_archivos` tiene soft-fail (console.error, no throw), lo que podría enmascarar este error.

### 3.2 Bucket `altas_tmp`

| Aspecto | Estado conocido |
|---------|-----------------|
| **Propósito** | Documentos adjuntos de solicitudes de alta (temporal hasta aprobación) |
| **Upload** | Solo EF `submit-alta` (service_role) — ningún JS de browser hace upload directo |
| **Lectura** | `altas.js` lee metadata desde `solicitudes_alta.archivos` JSONB, no del bucket directamente |
| **Signed URL** | No confirmado — si el panel necesita mostrar documentos de alta, debe generarse vía signed URL |
| **Riesgo si público** | Documentos empresariales: INE, RFC, contratos — accesibles públicamente por URL |
| **Policy ideal** | INSERT: solo service_role. SELECT: solo service_role o authenticated admin/soporte. anon: SIN ACCESO |
| **Verificación pendiente** | **SÍ — Dashboard visual obligatorio** |

### 3.3 Bucket `certificados`

| Aspecto | Estado conocido |
|---------|-----------------|
| **Propósito** | Licencias de software, certificados de cliente, PDFs empresariales |
| **Upload desde browser** | `cliente.core.js:32` (PDFs de licencias), `cliente.core.js:33` (adjuntos de tickets desde cliente.html), `dashboard.js:137` (PDFs desde dashboard) — 3 puntos de upload directo |
| **Lectura** | `supabase.js` — signed URLs con `h*3600` (h debe verificarse — probablemente 8h) |
| **Riesgo si público** | MAYOR — es el bucket más activo del panel. PDFs de licencias, certificados, documentación empresarial sensible accesibles públicamente |
| **Policy ideal** | INSERT: authenticated (admin/soporte) — 3 puntos de upload. SELECT directa: BLOQUEADA para todos — solo via signed URL. DELETE: solo service_role/admin |
| **Verificación pendiente** | **SÍ — Dashboard visual CRÍTICO** |

---

## 4. Checklist de Verificación Visual para Dashboard

Antes de ejecutar cualquier fix de Storage, verificar estos items en Dashboard:

```
[ ] Dashboard → Storage → soporte_adjuntos → Policies
    ¿INSERT solo authenticated o también service_role?
    ¿SELECT directa bloqueada para anon?
    ¿SELECT directa bloqueada para authenticated?
    ¿DELETE solo service_role?

[ ] Dashboard → Storage → altas_tmp → Policies
    ¿INSERT solo service_role?
    ¿SELECT solo service_role o authenticated admin/soporte?
    ¿anon completamente bloqueado?

[ ] Dashboard → Storage → certificados → Policies
    ¿INSERT authenticated (admin/soporte)?
    ¿SELECT directa bloqueada?
    ¿DELETE solo service_role o admin?

[ ] Dashboard → Edge Functions → (lista)
    ¿quick-function aparece en la lista? ¿Tiene logs de invocación recientes?
    ¿super-service aparece en la lista? ¿Tiene logs?
    ¿ticket-internal-reply → fecha de último deploy (¿posterior a 2026-06-13)?

[ ] Dashboard → Database → Extensions
    ¿pg_cron aparece instalado?

[ ] Dashboard → Settings → Edge Functions → Secrets
    ¿REQUIRE_TURNSTILE está en false o true?
    ¿TURNSTILE_SECRET_KEY existe?
```

---

## 5. Resumen de Riesgos Edge/Storage

| Item | Riesgo | Verificado | Acción requerida |
|------|--------|------------|------------------|
| `quick-function` activa | ALTO | ❌ No | Verificar logs → retirar |
| `super-service` activa | ALTO | ❌ No | Verificar logs → retirar |
| `match-cliente` sin RL ni auth | ALTO | ✅ Sí | Fix P1-4 (código + deploy) |
| `submit-alta` sin RL | MEDIO | ✅ Sí | Fix P2-2 (código + deploy) |
| `submit-registro` sin RL | MEDIO | ✅ Sí | Fix P2-3 (código + deploy) |
| `estado-ticket-responder-ts` sin RL | MEDIO | ✅ Sí | Fix P2-1 (código + deploy) |
| `ticket-internal-reply` deploy fecha | MEDIO | ❌ No | Verificar Dashboard |
| `support-submit-secure` Turnstile off | MEDIO | ✅ Sí | Decisión D5 → activar si spam |
| Storage `soporte_adjuntos` policies | DESCONOCIDO | ❌ No | Verificación Dashboard visual |
| Storage `altas_tmp` policies | DESCONOCIDO | ❌ No | Verificación Dashboard visual |
| Storage `certificados` policies | DESCONOCIDO | ❌ No | Verificación Dashboard visual |

---

## 6. Preguntas para Fable sobre Edge/Storage

**EF-1:** ¿El diseño de autenticación de las EFs internas (JWT via Authorization: Bearer) es suficiente, o debería haber una capa adicional de verificación de rol dentro de la EF además del JWT?

**EF-2:** Las EFs con `service_role` que aceptan requests públicos (`submit-alta`, `submit-registro`, `match-cliente`) tienen bypass total de RLS. ¿Hay algún patrón de seguridad en defensa en profundidad que debería aplicarse dentro de la EF para limitar el alcance de service_role, incluso si el endpoint es comprometido?

**EF-3:** El patrón de idempotencia en `ticket-internal-reply` usa una tabla (`edge_idempotency`) en la BD. ¿Qué pasa con la atomicidad si la EF crashea entre el INSERT y el UPDATE? ¿Se recomienda usar el mecanismo nativo de idempotencia de Supabase en lugar de una tabla custom?

**ST-1:** ¿Hay alguna forma de auditar el historial de accesos a un bucket de Supabase Storage para determinar si ha habido accesos directos (sin signed URL) que no deberían haber ocurrido?

**ST-2:** Las signed URLs tienen vigencia de 8h (confirmado en `estado-ticket-ts`). ¿Es 8h un período adecuado para datos sensibles de clientes? ¿Qué vigencia recomendarías para las distintas categorías de contenido (adjuntos de soporte, documentos de alta, certificados)?

**ST-3:** Con 3 puntos de upload directo desde browser hacia `certificados` (usando sesión authenticated), ¿cuál es el riesgo real si la Storage policy de SELECT fuera pública? ¿Solo los que tienen la URL pueden acceder, o hay algún vector de enumeración de paths en Supabase Storage?
