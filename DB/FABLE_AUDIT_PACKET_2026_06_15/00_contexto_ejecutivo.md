# Contexto Ejecutivo — Panel Expiriti / Supabase

## 1. Qué es Panel Expiriti

Panel Expiriti es un CRM de soporte técnico B2B. Los clientes son empresas que usan software de gestión; el equipo de Expiriti provee soporte, gestión de licencias y seguimiento de tickets. El sistema tiene:

- **Un panel interno** (PANEL/*.html + PANEL/*.js) para el equipo de soporte/admin/ventas.
- **Un portal público** (soporte.html, estado.html) para que los clientes reporten problemas y consulten el estado de sus tickets.
- **Un backend Supabase** (PostgreSQL 15, RLS, 12 Edge Functions, 3 buckets de Storage).

La base de código JS es JavaScript puro (sin framework), con el SDK de Supabase en el browser. Las Edge Functions son TypeScript/Deno.

---

## 2. Flujo Crítico: soporte.html → Supabase → tickets.html → estado.html

```
CLIENTE (navegador público)
  │
  └─► soporte.html
        │ llena formulario: nombre, empresa, descripción, adjuntos
        │
        ▼
        EF support-submit-secure (Deno/Supabase Edge Functions)
          │ rate limit: 5/10min por IP (único endpoint con RL activo)
          │ Turnstile: implementado pero APAGADO (REQUIRE_TURNSTILE=false)
          │ service_role → bypass RLS total
          │
          ├── INSERT solicitudes_soporte
          ├── INSERT solicitudes_alta ← si hay datos de empresa nueva
          ├── INSERT archivos_ticket (adjuntos)
          └── UPSERT rate_limit_events (control de frecuencia)

STAFF (panel interno, sesión authenticated)
  │
  └─► tickets.html (board de tickets)
        │ dashboard.js:142 → SELECT tickets sin límite (carga todos)
        │ dashboard.js:141 → INSERT ticket nuevo (modal)
        │ tickets.js:260  → UPDATE estado (moveTicket) — sin ticket_evento
        │ tickets.js:263  → UPDATE estado (closeTicket) — sin ticket_evento
        │
  └─► ticket.html (vista individual)
        │ ticket.js:239   → SELECT ticket individual
        │ ticket.js:240   → SELECT ticket_eventos + archivos_ticket + ticket_archivos (paralelo)
        │ ticket.js:250   → UPDATE ticket + INSERT ticket_evento (saveLog)
        │ ticket.js:160   → upload a soporte_adjuntos + INSERT archivos_ticket
        │
        ▼
        EF ticket-internal-reply (JWT requerido, admin/soporte)
          │ Requiere Authorization: Bearer {jwt_token}
          │ service_role → INSERT solicitudes_soporte + UPDATE ticket
          └── INSERT archivos_ticket (adjuntos de respuesta interna)

CLIENTE (portal de seguimiento)
  │
  └─► estado.html?folio=X&token=Y
        │ estado.js:58 → GET /estado-ticket?folio=X&token=Y
        │
        ▼
        EF estado-ticket-ts (pública, sin JWT)
          │ Valida: tickets WHERE folio=X AND token_publico=Y AND token_publico_expira > now()
          │ Lee: ticket_eventos (historial), archivos_ticket (adjuntos), ticket_portal_logs
          │ Genera: signed URLs para archivos (vigencia 8h)
          └── Sin rate limit HTTP en GET (gap P2) — [inferencia: throttle de logs interno — código EF no disponible en repo local]
        │
  └─► Respuesta del portal
        │ estado.js → POST /estado-ticket-responder-ts?folio=X&token=Y
        │
        ▼
        EF estado-ticket-responder-ts (pública, sin JWT, solo folio+token)
          │ Sin rate limit HTTP — FALTA
          │ [inferencia: anti-spam en BD por porcentaje — código EF no disponible en repo local; comportamiento no confirmado]
          └── Escribe respuesta del cliente en el ticket
```

---

## 3. Roles del Sistema

| Rol | Descripción | Origen |
|-----|-------------|--------|
| `admin` | Acceso total — puede ver todos los tickets, clientes, credenciales, aprobar altas y registros | `perfiles.rol = 'admin'` |
| `soporte` | Gestión de tickets y clientes — mismo nivel que admin en la mayoría de flujos | `perfiles.rol = 'soporte'` |
| `ventas` | Rol de vendedor — **sin definición clara de permisos todavía**. ¿Ve todos los tickets o solo los asignados? Decisión humana pendiente (D1). | `perfiles.rol = 'ventas'` |
| `authenticated` | Cualquier usuario con sesión JWT válida en Supabase. Usado por las policies RLS como el rol "any staff". El problema es que las policies abiertas aplican a `authenticated` sin filtrar por rol en `perfiles`. | JWT válido |
| `authenticated sin perfil` | Usuario con cuenta en `auth.users` pero sin fila en `perfiles`. Estado posible si se crea una cuenta pero no se completa el onboarding. Las policies con `EXISTS(public.perfiles WHERE id=auth.uid())` lo excluirían. | JWT válido + perfiles vacío |
| `anon` | Requests sin autenticar. Usado por el portal público, formularios de alta/registro/soporte. | Sin sesión |
| `service_role` | Rol interno de Supabase — bypass completo de RLS. Usado exclusivamente en las Edge Functions. **NUNCA en el frontend.** | Edge Functions |

---

## 4. Tablas Principales (23+ tablas en public schema)

```
DOMINIO CRM (clientes)
  clientes              ← P0 RLS abierto (SELECT qual=true)
  clientes_contactos    ← P0-bis CRÍTICO (deny_all, 5 flujos rotos)
  cliente_accesos       ← P0 RLS abierto (credenciales AnyDesk qual=true)
  cliente_sistemas      ← OK
  cliente_aliases       ← OK (PK pendiente de confirmar)
  clientes_usuarios     ← Sin uso en JS (tabla para multi-tenant no activo)
  clientes_contacto_historial ← RLS no auditado

DOMINIO TICKETS (soporte)
  tickets               ← P0 RLS abierto (2 SELECTs duplicadas qual=true)
  ticket_eventos        ← Canónico, parcialmente alimentado (3 flujos JS no insertan)
  archivos_ticket       ← Canónico, RLS OK
  ticket_archivos       ← LEGACY activa, P1 RLS abierto (SELECT qual=true)
  ticket_respuestas_rapidas ← P0 RLS (6 policies abiertas duplicadas)
  ticket_match_decisiones   ← P1 RLS (3 policies abiertas, 0 refs en JS)
  ticket_portal_logs    ← RLS OK
  ticket_folios         ← RLS OK

DOMINIO SOLICITUDES PÚBLICAS
  solicitudes_soporte   ← RLS OK (EF service_role)
  solicitudes_alta      ← RLS OK (EF service_role), migración campos en curso
  solicitudes_registro  ← RLS OK
  solicitud_archivos    ← Confuso: FK apunta a solicitudes_soporte, no a alta

DOMINIO OPERACIONAL
  perfiles              ← RLS OK (self policy), base del filtro EXISTS
  bitacora              ← RLS OK, sin TTL
  avisos_globales       ← RLS OK
  rate_limit_events     ← Solo en EFs, sin TTL automático
  edge_idempotency      ← Sin TTL, 10 filas >7 días
```

---

## 5. Rama Actual y Commits Relevantes

**Rama activa:** `audit/supabase-flows`  
**Creada:** Inicio del ciclo de auditoría formal (2026-06-13)  
**Estado del working tree:** limpio — sin cambios pendientes

### Commits de auditoría (cronológico inverso)

| commit | fecha | descripción |
|--------|-------|-------------|
| `43f131f` | 2026-06-15 | docs: add database architecture normalization audit |
| `0143cb1` | 2026-06-15 | docs: add 130 audit closure gap matrix |
| `8bec195` | 2026-06-15 | docs: add clientes contactos P0-bis RLS plan |
| `7de8240` | 2026-06-15 | docs: add P1 P2 readonly audit checkpoint |
| `d3a23af` | 2026-06-15 | docs: add RLS P0 preflight remediation document |
| `4b50ce5` | 2026-06-15 | docs: add 130 blindaje remediation plan |
| `309f5fe` | 2026-06-15 | docs: add dashboard sql read-only audit 2026-06-15 |
| `e6fda04` | 2026-06-15 | docs: add audit-bd repository checkpoint |
| `f54e22b` | 2026-06-13 | docs: add ticket-internal-reply pre-fix backup |
| `5ce8502` | 2026-06-13 | docs: add supabase public schema snapshot |
| `fad413e` | 2026-06-13 | docs: add rollback policies dev snapshot |
| `567ef9a` | 2026-06-13 | fix: harden ticket internal reply idempotency |
| `5f650eb` | 2026-06-14 | docs: auditoría funcional panel Expiriti 2026-06-14 |

### Fixes ya aplicados (pre-auditoría o durante)

- `567ef9a` — hardening de idempotencia en `ticket-internal-reply` (deploy no confirmado visualmente)
- 6 policies `dev_anon` cerradas en producción (2026-06-13, antes del ciclo formal)
- `tickets.js:111` — Bearer token corregido en `tkSessionToken()` (en repo `panel-expiriti`, rama `main`)

---

## 6. Nivel de Auditoría vs Nivel de Fixes

| Dimensión | % |
|-----------|---|
| Auditoría cerrada | 88% (falta verificación visual de Storage y EF deploy en Dashboard) |
| Fixes implementados | 12% (solo los 3 fixes previos al ciclo actual) |
| Borradores SQL listos | 100% (P0-bis, P0, P1, P2, rollbacks) |
| Pruebas definidas | 100% (23 tests P0-bis, T01–T20 P0, etc.) |
| Decisiones humanas tomadas | 0 de 6 (D1–D6 pendientes) |

**Conclusión:** La auditoría es casi completa. Los borradores de remediación existen. Lo que bloquea la ejecución son las 6 decisiones humanas y la verificación visual de 3 buckets de Storage + estado de deploy de EFs.
