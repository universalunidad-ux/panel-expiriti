# Checkpoint ejecutivo — Panel Expiriti
**Fecha:** 2026-06-14  
**Contexto:** Cierre de sprint de auditoría + consolidación UI. Sin remediación todavía.

---

## Repos
| Repo | Rama | Estado |
|---|---|---|
| `panel-expiriti` | `main` | Limpio, publicado en GitHub Pages |
| `panel-expiriti-audit-bd` | `audit/supabase-flows` | `ticket-internal-reply` modificado sin commit |

## Commits relevantes (panel-expiriti, rama main)
- `e455f6e` — fix: use session token for quick replies REST fallback
- `d45cb8a` — fix: consolidate tickets responsive UI

## Archivos de auditoría en DB/
- `DB/auditoria_edges_rls_2026_06_13.md` — RLS + Edge Functions (fase 1)
- `DB/auditoria_flujo_tickets_crm_2026_06_14.md` — flujo completo tickets/CRM (fase 2, 760 líneas)

---

## Qué quedó cerrado en este sprint
- RLS/dev anon crítico corregido y auditado.
- `tickets.js` usa `tkSessionToken()` como Bearer (no `supabaseKey`). Publicado en `main`.
- GitHub Pages validado: `{ viejo:false, nuevo:true }`.
- UI responsive del board de tickets consolidada y publicada.
- Auditoría funcional completa del ciclo tickets/CRM escrita y guardada.

---

## Estado por área

| Área | Confianza | Blocker activo |
|---|---|---|
| Seguridad / RLS crítico | 84% | `match-cliente` sin auth; Turnstile apagado |
| Flujo tickets (punta a punta) | 79% | Sin transacción atómica; doble escritura |
| CRM | 82% | Código de aprobación JS directo en altas.js/registros.js |
| Adjuntos (integridad) | 70% | Doble write; huérfanos en storage posibles |
| Edge Functions | 75% | `quick-function` rota; `super-service` legacy; EF modificada sin commit |
| UI / board | 88% | — |
| Performance | 65% | Polling sin backoff; matchCliente full-scan |
| Notificaciones (portal) | 80% | No hay notif al agente en reapertura desde portal |

**Global ciclo de tickets: 79%**

---

## Hallazgos críticos y altos

**[CRÍTICO] `quick-function`**  
Env vars son hashes SHA-256 hardcodeados → `createClient(undefined!, undefined!)` → 500 en toda llamada. Retirar.

**[CRÍTICO] Sin transacción atómica en `support-submit-secure`**  
INSERT solicitud → INSERT ticket → upload archivos → UPDATE ticket. Si falla a mitad, no hay rollback.

**[ALTO] `match-cliente` sin autenticación**  
POST abierto con service_role. Devuelve candidatos de clientes con scores. Debe requerir header interno.

**[ALTO] Turnstile apagado globalmente**  
`TURNSTILE_ENABLED=false` (frontend) + `REQUIRE_TURNSTILE=false` (EF). Solo rate limit 5/10min por IP protege contra spam.

**[ALTO] Doble escritura de archivos sin transacción**  
`archivos_ticket` (canónico, fallo duro) + `ticket_archivos` (legacy, soft-fail) en 3 flujos paralelos. Pueden divergir.

**[ALTO] `ticket_eventos` vs `tickets.timeline_publica`**  
Doble verdad en historial. Ambos se actualizan sin garantía de consistencia. Si un UPDATE falla, el portal y el panel divergen.

**[ALTO] Cambios de estado desde el board sin `ticket_evento`**  
`moveTicket` y `closeTicket` actualizan `tickets.estado` directamente (SDK). No generan evento en el historial canónico.

**[ALTO] `ticket-internal-reply` modificado sin commit**  
4 líneas cambiadas (`2 ++, 2 --`) en el repo de audit. Si la EF fue desplegada antes del cambio, producción difiere del código auditado.

---

## Próximos pasos (ordenados por impacto/riesgo)

1. **Retirar `quick-function`** — desactivar en Supabase Functions. Confirmar que ningún frontend activo la llama.
2. **Commitear o revertir cambio en `ticket-internal-reply`** — resolver deuda del diff sin commit antes de cualquier otro deploy.
3. **Proteger `match-cliente`** — agregar validación de header interno (ej. `x-service-key`) o mover lógica inline.
4. **Agregar `ticket_eventos` en `moveTicket` / `closeTicket`** — insertar evento de cambio de estado desde el board para completar el historial canónico.
5. **Evaluar Turnstile** — re-habilitar o documentar la decisión con los riesgos aceptados.
6. **Auditar RLS con schema** — obtener `schema_public_actual.sql` + `rls_policies_actuales.sql` para cerrar la confianza de seguridad.
7. **Plan de migración de doble escritura** — definir cuándo `ticket_archivos` y `tickets.timeline_publica` pueden dejarse de escribir.

---

## NO tocar todavía
- `tickets.timeline_publica` — muchos lectores dependen del fallback; requiere migración planificada.
- `ticket_archivos` (tabla legacy) — no eliminar hasta confirmar que `archivos_ticket` tiene todos los datos históricos.
- `super-service` — retirar solo después de confirmar que `submit-alta` es el reemplazo completo.
- Schema de BD, RLS, policies — sin `schema_public_actual.sql` no auditar; riesgo de romper RLS sin visibilidad.
- `ticket_match_decisiones` — verificar existencia en BD antes de cualquier acción.

---

## Comandos de validación

```bash
# Verificar rama y estado del repo principal
git -C ~/Documents/EXPIRITI_REPOS/panel-expiriti branch --show-current
git -C ~/Documents/EXPIRITI_REPOS/panel-expiriti log --oneline -5

# Ver cambio pendiente en ticket-internal-reply
git -C ~/Documents/EXPIRITI_REPOS/panel-expiriti-audit-bd diff HEAD

# Confirmar token fix publicado
grep -n "tkSessionToken\|supabaseKey" ~/Documents/EXPIRITI_REPOS/panel-expiriti/PANEL/tickets.js | head -10

# Listar Edge Functions descargadas
ls ~/Documents/EXPIRITI_REPOS/panel-expiriti-audit-bd/supabase/functions/

# Ver archivos de auditoría existentes
ls -lh ~/Documents/EXPIRITI_REPOS/panel-expiriti-audit-bd/DB/*.md
```
