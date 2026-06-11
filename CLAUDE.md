# CLAUDE.md — Panel ExpIRI Ti

## Stack y alcance

- **Solo** HTML, CSS y JavaScript vanilla. Sin React, Bootstrap ni frameworks.
- Rama de trabajo: siempre una branch de feature basada en `main`. No hagas push ni merge a `main` sin instrucción explícita.
- No apliques ni borres el stash sin confirmación. Consúltalo solo con `git stash show -p`.

## Seguridad

- No expongas secretos, claves ni credenciales en ningún archivo.
- No modifiques esquema de Supabase, RLS ni Edge Functions sin autorización explícita.
- No ejecutes `git push --force`, `git reset --hard` ni operaciones destructivas sin confirmación.

## Archivos de tickets — invariantes funcionales

Archivos en scope: `PANEL/tickets.css`, `PANEL/tickets.js`, `PANEL/tickets.html`.
Archivo de revisión solamente: `PANEL/quick-replies.shared.js`.

Invariantes que **no deben romperse**:
- `fetchTicketsRest`: carga REST de tickets, sin modificar.
- `tkColHeader` / `tkColModalHtml` / `tkOpenColModal` / `tkRenderColModal`: modal por columna, 10 por página.
- `QR_SHARED_OK` en `quick-replies.shared.js`: flag de carga del módulo.
- Bolt (⚡): clase `k-action-bolt`, atributo `data-quick-panel`. No confundir con `.tk-qr-*`.
- Flechas de estado (`data-ticket-state`), cierre (`data-ticket-close`), búsqueda principal (`#tkSearch`).
- `data-view="kanban"` / `data-view="compact"` en `body[data-page="tickets"]`.
- `data-mobile-state` en body para cambio de columna en móvil.

## CSS — reglas de edición

- Consolida editando reglas **existentes** en su sección canónica: Kanban / Lista compacta / Modal columna / Responsive.
- No agregues un bloque de overrides al final del archivo como nueva capa.
- Minimiza el uso de `!important` nuevo; redúcelo cuando sea seguro.
- Antes de cambiar `overflow:hidden` en un contenedor, corrige primero el layout interno (altura, flex/grid, min-width).

## Flujo de validación antes de commit

1. Confirmar rama activa: `git branch --show-current`.
2. Revisar diff completo: `git diff HEAD`.
3. Verificar balance de llaves CSS y ausencia de errores de sintaxis JS.
4. Confirmar que no se introdujeron secretos.
5. Validar visualmente en al menos 1440 px y 430 px.
6. Solo después: `git commit` dentro de la branch de feature. No hacer `git push` hasta indicación.
