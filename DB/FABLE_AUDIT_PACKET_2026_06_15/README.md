# FABLE AUDIT PACKET — Panel Expiriti / Supabase
**Fecha de generación:** 2026-06-15  
**Elaborado por:** Claude Sonnet 4.6 vía claude-code  
**Propósito:** Segunda opinión externa (Fable) sobre auditoría de seguridad BD/RLS/EF  
**Rama fuente:** `audit/supabase-flows`  
**Repo:** panel-expiriti-audit-bd

---

## Instrucciones para Fable

Este paquete contiene toda la información necesaria para auditar el estado de seguridad del Panel Expiriti sin necesidad de acceder al repositorio de código ni a la base de datos de producción.

**NO ejecutes SQL.** Los bloques SQL en este paquete son borradores de análisis, no scripts ejecutables.  
**NO pidas credenciales ni acceso a producción.** Todo lo auditado es documentación derivada de inspección read-only.  
**NO propongas una reescritura completa.** El objetivo es confirmar, corregir o rechazar las decisiones de priorización ya tomadas.

---

## Contenido del paquete

| Archivo | Contenido |
|---------|-----------|
| `README.md` | Este índice — leer primero |
| `00_contexto_ejecutivo.md` | Qué es el sistema, flujos, roles, rama, commits |
| `01_hallazgos_criticos.md` | Todos los hallazgos clasificados P0-bis a P3 |
| `02_puntos_para_revision_fable.md` | Las 9 preguntas exactas que queremos que Fable responda |
| `03_sql_rls_a_revisar.md` | Borradores SQL de remediación para revisión conceptual |
| `04_bd_arquitectura_a_revisar.md` | Deuda técnica de BD: God Table, doble-write, tokens, índices |
| `05_edge_storage_a_revisar.md` | Estado de las 12 Edge Functions y 3 buckets de Storage |
| `06_prompt_final_para_fable.md` | Prompt listo para pegar — contiene todo el brief de la revisión |

---

## Contexto ultra-comprimido (200 palabras)

Panel Expiriti es un CRM de soporte técnico B2B construido sobre Supabase. El frontend (JS puro) corre en PANEL/*.js y usa el SDK de Supabase con sesión `authenticated`. El backend son 12 Edge Functions (Deno/TypeScript) + PostgreSQL con RLS.

**El problema central:** RLS está habilitado en todas las tablas pero 4 de ellas tienen policies con `qual=true` (sin filtro de rol), lo que significa que cualquier usuario autenticado lee datos de todos los clientes. Además, `clientes_contactos` tiene una policy que deniega todo acceso, lo que rompe 5 flujos de UI en producción.

**Estado actual:** Auditoría al 88%, implementación de fixes al 12%. Solo se han aplicado 3 fixes menores. Los borradores de SQL de remediación están listos pero bloqueados por decisiones humanas pendientes.

**Objetivo de esta revisión:** Fable debe leer los hallazgos, validar la priorización P0-bis/P0/P1/P2/P3, identificar riesgos omitidos, confirmar que el SQL borrador es lógicamente correcto, y dar un semáforo para iniciar la remediación.

**Archivos clave del sistema auditado:** soporte.html → support-submit-secure → tickets (tabla) → tickets.html, ticket.html → ticket-internal-reply → portal estado.html

---

## Advertencia de modo

Los documentos originales de auditoría tienen más de 8,000 líneas combinadas. Este paquete extrae solo lo relevante para la segunda opinión. Si Fable necesita más contexto sobre algún punto específico, pedirlo explícitamente en lugar de inferir.

---

*Generado en modo estricto: solo documentación. Sin SQL ejecutado. Sin código editado. Sin deploy.*
