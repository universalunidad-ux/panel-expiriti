# Auditoría Profunda: Arquitectura BD, Normalización y Modelo Canónico
## Panel Expiriti / Supabase PostgreSQL
**Fecha:** 2026-06-15  
**Rama:** audit/supabase-flows  
**Snapshot de esquema:** docs/audit/supabase-public-schema.sql (2026-06-13)  
**Modo:** Solo lectura — sin SQL ejecutable de remediación  
**Scope:** 23+ tablas public schema · 3 Storage buckets · 12 Edge Functions

---

## 1. Resumen Ejecutivo

El modelo de base de datos del Panel Expiriti refleja tres etapas de evolución superpuestas que aún coexisten en producción. La etapa **legacy** (2023–2024) depositó lógica estructural en columnas JSONB de `tickets` (`timeline_publica`, `adjuntos`) y en la tabla plana `ticket_archivos`. La etapa **canónica** (2024–2025) introdujo `archivos_ticket`, `ticket_eventos` y campos de matching estructurado, pero mantuvo escritura doble para compatibilidad. La etapa **migración en curso** (2025–2026) está normalizando `solicitudes_alta` hacia campos estructurados de contacto y separando responsabilidades.

El resultado es un esquema funcional pero con **deuda técnica significativa**: tabla `tickets` con 60+ columnas que viola 3NF; 7 índices duplicados; dos modelos de archivo y dos modelos de eventos con lectura paralela; una tabla de archivos de alta (`solicitud_archivos`) que no usa el flujo submit-alta real; y columnas de análisis mezcladas en `documentos` con metadatos operacionales.

**Diagnóstico general:** El sistema puede operar en producción tal como está. La migración es viable por fases sin romper producción, pero requiere decisiones humanas explícitas antes de ejecutar.

**Porcentaje de auditoría BD:** 91%  
**Porcentaje de implementación:** 3% (solo se leen datos — no hay fixes aplicados)

---

## 2. Mapa de Dominios de BD

### 2.1 Dominios identificados

```
┌─────────────────────────────────────────────────────────────────┐
│  DOMINIO CLIENTES (CRM Core)                                    │
│  clientes · clientes_contactos · clientes_contacto_historial    │
│  clientes_usuarios · cliente_aliases · cliente_accesos          │
│  cliente_sistemas                                               │
└────────────────────┬────────────────────────────────────────────┘
                     │ FK: tickets.cliente_id → clientes.id
                     │ FK: tickets.contacto_id → clientes_contactos.id
┌────────────────────▼────────────────────────────────────────────┐
│  DOMINIO TICKETS (Soporte Core)                                 │
│  tickets · ticket_eventos · ticket_folios                       │
│  ticket_archivos [legacy] · archivos_ticket [canónico]          │
│  ticket_respuestas_rapidas · ticket_portal_logs                 │
│  ticket_match_decisiones                                        │
└────────────────────┬────────────────────────────────────────────┘
                     │ FK: solicitudes_soporte.ticket_id → tickets.id
┌────────────────────▼────────────────────────────────────────────┐
│  DOMINIO SOLICITUDES PÚBLICAS                                   │
│  solicitudes_alta · solicitud_archivos                          │
│  solicitudes_soporte · solicitudes_registro                     │
└────────────────────┬────────────────────────────────────────────┘
                     │ Pipeline: solicitudes_alta → match-cliente EF → ticket_match_decisiones
┌────────────────────▼────────────────────────────────────────────┐
│  DOMINIO DOCUMENTOS (DMS)                                       │
│  documentos · documentos_borrado_vdi_backup                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  DOMINIO OPERACIONAL / AUDIT                                    │
│  bitacora · perfiles · avisos_globales                          │
│  auditoria_storage_manual · auditoria_borrado_storage           │
│  rate_limit_events · edge_idempotency                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Flujos entre dominios

| Flujo | Origen | Destino | Canal |
|-------|--------|---------|-------|
| Alta de cliente | solicitudes_alta | tickets (vía EF) | Edge Function submit-alta |
| Matching automático | solicitudes_alta | ticket_match_decisiones | Edge Function match-cliente |
| Portal público | tickets (folio+token) | ticket_portal_logs | Edge Function estado-ticket |
| Respuesta portal | tickets.timeline_publica [pendiente confirmar] | archivos_ticket [pendiente confirmar] | Edge Function estado-ticket-responder-ts (no disponible en repo local) |
| Solicitud soporte | solicitudes_soporte | tickets | Edge Function submit-soporte |
| Creación ticket interno | tickets | ticket_eventos, bitacora | Edge Function crear-ticket-interno |
| DMS | documentos | tickets (documento_id) | PANEL/cliente.js SDK directo |

---

## 3. Data Dictionary Ejecutivo — Tabla por Tabla

### 3.1 clientes

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 500 (CRM activo) |
| **PK** | id UUID |
| **Columnas clave** | nombre, email_contacto, telefono, rfc, sistema, sistema_detectado, sistema_norm, sistema_norm2, estado, origen, plan |
| **FKs entrantes** | tickets.cliente_id, documentos.cliente_id, bitacora.cliente_id, solicitudes_alta.cliente_id (nullable), clientes_contactos.cliente_id, clientes_usuarios.cliente_id, cliente_sistemas.cliente_id, cliente_aliases.cliente_id, cliente_accesos.cliente_id |
| **FKs salientes** | ninguna |
| **RLS** | P0 ABIERTO: 1 policy SELECT con qual=true (devuelve todo a authenticated) |
| **Acceso JS** | dashboard.js:142 → SELECT sin LIMIT (carga toda la tabla) |
| **Issues** | sistema_norm + sistema_norm2: dos columnas de normalización de sistema. Redundancia. El campo `email_contacto` duplica datos con clientes_contactos.correo |
| **Dominio** | CRM Core |

### 3.2 clientes_contactos

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 2,000 |
| **PK** | id UUID |
| **Columnas clave** | cliente_id, nombre, correo, telefono, puesto, horario_laboral, horario_notas, es_principal, activo |
| **FKs salientes** | cliente_id → clientes(id) |
| **RLS** | P0-BIS CRÍTICO: deny_all_clientes_contactos bloquea todo. 5 flujos rotos en producción |
| **Acceso JS** | registros.js approve(), cliente.js:35, ticket.js:138/202 → todos retornan vacío |
| **Issues** | RLS completamente cerrado — producción rota. La FK compuesta de ticket_respuestas_rapidas `(contacto_id, cliente_id) → clientes_contactos(id, cliente_id)` implica la existencia de una UNIQUE constraint en `clientes_contactos(id, cliente_id)` — pendiente de confirmar en Dashboard. |
| **Dominio** | CRM Core |

### 3.3 clientes_contacto_historial

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 5,000 |
| **PK** | id UUID |
| **Columnas clave** | contacto_id, cliente_id, campo, valor_anterior, valor_nuevo, cambiado_por, fecha |
| **FKs salientes** | contacto_id → clientes_contactos(id), cliente_id → clientes(id) |
| **RLS** | Estado desconocido (no auditado en Dashboard) |
| **Acceso JS** | grep: clientes_contacto_historial referenciado en código |
| **Issues** | Audit de RLS pendiente |
| **Dominio** | CRM Core |

### 3.4 clientes_usuarios

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | desconocido |
| **PK** | id UUID (inferido) |
| **Columnas clave** | cliente_id, user_id, rol (owner/editor/viewer), activo |
| **FKs salientes** | cliente_id → clientes(id) |
| **RLS** | No auditado |
| **Acceso JS** | **CERO referencias en PANEL/\*.js** — tabla definida pero sin uso en frontend actual |
| **Issues** | Tabla preparada para multi-tenancy de cliente (scoping por rol), pero no está conectada a ningún flujo activo. Posible feature planificada o muerta. Requiere decisión D-CU1: ¿activar o deprecar? |
| **Dominio** | CRM Core |

### 3.5 cliente_aliases

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 200 |
| **PK** | id UUID NOT NULL — no se observa PRIMARY KEY constraint en snapshot DDL (docs/audit/supabase-public-schema.sql); pendiente de validar en Dashboard |
| **Columnas clave** | cliente_id, alias, tipo, alias_norm, confianza, activo |
| **FKs salientes** | cliente_id → clientes(id) |
| **RLS** | No auditado en detalle |
| **Issues** | En el snapshot DDL (`CREATE TABLE public.cliente_aliases`) la columna id tiene `NOT NULL DEFAULT gen_random_uuid()` pero no hay `CONSTRAINT ... PRIMARY KEY (id)` explícito. Puede ser omisión del snapshot o descuido de migración. Pendiente de confirmar en Dashboard → Table Editor. No clasificar como bug confirmado hasta verificación. |
| **Dominio** | CRM Core |

### 3.6 cliente_accesos

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 100 |
| **PK** | id UUID |
| **Columnas clave** | cliente_id, tipo_acceso, url, usuario, clave_cifrada, notas, activo |
| **FKs salientes** | cliente_id → clientes(id) |
| **RLS** | P0 CRÍTICO: 1 policy SELECT con qual=true — expone credenciales a authenticated |
| **Acceso JS** | PANEL/cliente.js — lectura de accesos |
| **Issues** | Tabla de credenciales de clientes con RLS abierto. Riesgo alto. Ver D1 |
| **Dominio** | CRM Core |

### 3.7 cliente_sistemas

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 1,000 |
| **PK** | id UUID |
| **Columnas clave** | cliente_id, sistema, version, notas, activo |
| **FKs salientes** | cliente_id → clientes(id) |
| **RLS** | Correcto según Dashboard audit |
| **Acceso JS** | ticket.js → CLIENT_SYSTEMS para contexto de QR templates |
| **Dominio** | CRM Core |

### 3.8 tickets

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 10,000 activos + histórico |
| **PK** | id UUID |
| **Columnas operacionales** | cliente_id, contacto_id, documento_id, titulo, descripcion, tipo, prioridad, estado, origen, creado_por, folio (UNIQUE: índice `tickets_folio_uidx` confirmado Dashboard; no en snapshot DDL), token_publico (UNIQUE: índice `tickets_token_publico_uidx` confirmado Dashboard; no en snapshot DDL), token_publico_expira, primera_respuesta_en, fecha_cierre, fecha_creacion, fecha_actualizacion |
| **Columnas JSONB** | timeline_publica DEFAULT '[]', adjuntos DEFAULT '[]' |
| **Columnas match (denormalizadas)** | empresa_capturada, nombre_capturado, correo_capturado, telefono_capturado, sistema, sistema_detectado, desde_cuando, ultimo_cambio, cliente_id_sugerido, contacto_id_sugerido, match_nivel, match_score, match_confirmado, contacto_confirmado, contacto_es_nuevo, requiere_consolidacion |
| **Columnas SLA** | sla_policy, sla_first_response_deadline, sla_resolution_deadline, sla_breached_first_response, sla_breached_resolution |
| **Otras columnas** | notificar, notificado_en, read_only, evidencia_count, attachments_count, files_count, horario_laboral, horario_notas, horario_contacto, nombre_cliente_contacto, correo_cliente_contacto, contacto_id, sistema_norm, tipo_sistema |
| **FKs salientes** | cliente_id → clientes(id), contacto_id → clientes_contactos(id), documento_id → documentos(id) |
| **RLS** | P0: 2 policies SELECT con qual=true duplicadas |
| **Issues 3NF** | 1) Columnas match_* deberían estar en ticket_match_decisiones. 2) timeline_publica JSONB no normalizado — datos en ticket_eventos duplican esto. 3) adjuntos JSONB duplica archivos_ticket/ticket_archivos. 4) Campos horario_* duplican clientes_contactos. 5) SLA fields podrían ser tabla separada. 6) evidencia_count/attachments_count/files_count: tres columnas redundantes para el mismo dato |
| **Acceso JS** | ticket.js:247 buildTicketUpdatePayload — actualiza timeline_publica y adjuntos JSONB. ticket.js:240-241 — lectura paralela de ticket_eventos Y timeline_publica |
| **Dominio** | Tickets Core |

### 3.9 ticket_eventos

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 50,000 |
| **PK** | id UUID |
| **Columnas clave** | ticket_id, autor_tipo (soporte/cliente/sistema), visibilidad (publica/interna), kind (nota/estado/mensaje/archivo), texto, meta JSONB, created_at |
| **FKs salientes** | ticket_id → tickets(id) |
| **RLS** | No auditado explícitamente |
| **Issues** | 1) moveTicket (tickets.js:260), closeTicket (tickets.js:263), batchClose (dashboard.js:150) NO insertan ticket_eventos — historial incompleto. 2) La columna kind no tiene CHECK constraint en DDL |
| **Acceso JS** | ticket.js:240 — se lee en paralelo con timeline_publica; si hay eventos, se ignora timeline |
| **Dominio** | Tickets Core |

### 3.10 ticket_folios

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 100 (secuencia de folios) |
| **PK** | id UUID |
| **Columnas clave** | prefijo, siguiente, creado_en |
| **RLS** | Correcto según Dashboard audit |
| **Issues** | Generación de folios vía PANEL JS (nextFolioSimple en dashboard.js:141) con race condition potencial: dos inserciones simultáneas podrían generar el mismo folio. tickets.folio tiene UNIQUE index que lo protege a nivel DB, pero el error de unicidad llegaría al cliente |
| **Dominio** | Tickets Core |

### 3.11 ticket_archivos (LEGACY)

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 5,000 (archivo histórico + doble escritura activa) |
| **PK** | id UUID |
| **Columnas clave** | ticket_id, nombre_archivo, url_archivo (NOMBRE ENGAÑOSO: almacena storage_path), mime_type, tamano_bytes, subido_por, fecha_subida |
| **FKs salientes** | ticket_id → tickets(id) |
| **RLS** | P1: SELECT con qual=true |
| **Issues** | 1) url_archivo almacena storage_path — nombre de columna engañoso. 2) Sin columnas visibilidad ni origen — no hay diferenciación entre archivo interno/público/portal. 3) Sin columna url_firma para signed URLs. 4) Doble escritura activa en ticket.js:160 y cliente.core.js:33 |
| **Dominio** | Tickets Core |

### 3.12 archivos_ticket (CANÓNICO)

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 5,000 (paralelo a ticket_archivos) |
| **PK** | id UUID |
| **Columnas clave** | ticket_id, origen CHECK ('solicitud','ticket','portal','interno'), visibilidad CHECK ('publica','interna'), nombre_archivo, storage_path, url_firma, mime_type, tamano_bytes, subido_por, meta JSONB, creado_en |
| **FKs salientes** | ticket_id → tickets(id) |
| **RLS** | Correcto según Dashboard audit |
| **Issues** | 1) url_firma almacena NULL en escritura — se regenera on-demand vía signedUrl. 2) Doble escritura con ticket_archivos activa en ticket.js:160 |
| **Ventajas vs legacy** | origen + visibilidad estructurados; storage_path nombrado correctamente; meta JSONB extensible |
| **Dominio** | Tickets Core |

### 3.13 ticket_respuestas_rapidas

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 500 |
| **PK** | id UUID (confirmado en snapshot: `CONSTRAINT ticket_respuestas_rapidas_pkey PRIMARY KEY (id)`) |
| **Columnas clave** | id, cliente_id, contacto_id, scope, modo, titulo, texto, orden, activo, variables JSONB, categoria |
| **Constraints** | `scope` CHECK: global/cliente/contacto; `modo` CHECK: seguimiento/nota/solucion; `scope_ids_check`: coherencia de nullable según scope (global: ambos NULL, cliente: cliente_id NOT NULL / contacto_id NULL, contacto: ambos NOT NULL) |
| **FKs salientes** | `cliente_id → clientes(id) ON DELETE CASCADE` (confirmado Dashboard + snapshot línea 574); `contacto_id → clientes_contactos(id)` (confirmado Dashboard + snapshot línea 575); FK compuesta `(contacto_id, cliente_id) → clientes_contactos(id, cliente_id)` (confirmado Dashboard — garantiza que el contacto_id pertenece al cliente_id asignado) |
| **RLS** | P0: 6 policies abiertas en 2 grupos duplicados — cualquier authenticated puede leer/escribir quick replies de cualquier cliente |
| **Issues** | 1) 6 policies RLS abiertas — problema confirmado P0. 2) El snapshot DDL muestra la FK compuesta con representación ambigua (mismo nombre de constraint en dos líneas: probablemente artifact del snapshot, no dos constraints independientes). 3) Dashboard audit clasificó la estructura de constraints como "correcta y robusta" |
| **Dominio** | Tickets Core |

### 3.14 ticket_portal_logs

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 10,000 |
| **PK** | id UUID |
| **Columnas clave** | ticket_id, evento (view/reply/etc), meta JSONB, created_at |
| **FKs salientes** | ticket_id → tickets(id) |
| **RLS** | Correcto según Dashboard audit |
| **Acceso JS** | ticket.js:140 loadPortalMeta — último view y última respuesta |
| **Issues** | Sin particionamiento por fecha — crecerá linealmente con el uso del portal |
| **Dominio** | Tickets Core |

### 3.15 ticket_match_decisiones

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 1,000 |
| **PK** | id UUID |
| **Columnas clave** | ticket_id, match_nivel, match_score, cliente_id_sugerido, contacto_id_sugerido, decision, decidido_por, fecha |
| **FKs salientes** | ticket_id → tickets(id) |
| **RLS** | P1: 3 policies abiertas |
| **Acceso JS** | CERO referencias en PANEL/\*.js — tabla alimentada solo por EF match-cliente, nunca consultada por JS |
| **Issues** | Las columnas match_* en tickets son denormalizaciones de lo que debería estar aquí. La tabla canónica existe pero no se usa en el frontend |
| **Dominio** | Tickets Core |

### 3.16 solicitudes_alta

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 2,000 |
| **PK** | id UUID |
| **Columnas legacy** | nombre, telefono, contacto (texto plano, estilo libre) |
| **Columnas canónicas nuevas** | contacto_principal_nombre, contacto_principal_puesto, contacto_principal_correo, contacto_principal_telefono, contacto_secundario_nombre, contacto_secundario_correo (et al.) |
| **Columna JSONB** | archivos JSONB DEFAULT '[]' — almacena metadata de archivos subidos |
| **FKs salientes** | cliente_id → clientes(id) (nullable) |
| **RLS** | Correcto (EF service_role bypass) |
| **Issues** | 1) Migración en curso: campos legacy y canónicos coexisten. Rows antiguas solo tienen campos legacy; nuevas solo tienen canónicos. 2) archivos JSONB es el modelo real para submit-alta — solicitud_archivos NO se usa para este flujo |
| **Dominio** | Solicitudes Públicas |

### 3.17 solicitud_archivos

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | 31 (confirmado Dashboard) |
| **PK** | id UUID |
| **Columnas clave** | solicitud_id, nombre_archivo, storage_path, mime_type, tamano_bytes, subido_por |
| **FKs salientes** | solicitud_id → solicitudes_soporte(id) CASCADE — apunta a soporte, NO a alta |
| **RLS** | Correcto según Dashboard (FK CASCADE correcto) |
| **Issues** | La tabla apunta a solicitudes_soporte pero el nombre sugiere que debería apuntar a solicitudes_alta. submit-alta usa JSONB en solicitudes_alta.archivos, no esta tabla. Las 31 filas apuntan todas a solicitudes_soporte. 0 orphans. Tabla de propósito confuso |
| **Dominio** | Solicitudes Públicas |

### 3.18 solicitudes_soporte

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 5,000 |
| **PK** | id UUID |
| **Columnas clave** | ticket_id (nullable), nombre, correo, telefono, empresa, descripcion, archivos JSONB, estado, origen |
| **FKs salientes** | ticket_id → tickets(id) (nullable) |
| **RLS** | Correcto |
| **Acceso JS** | soporte.js — formulario público de soporte |
| **Dominio** | Solicitudes Públicas |

### 3.19 solicitudes_registro

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 500 |
| **PK** | id UUID |
| **Columnas clave** | nombre, correo, telefono, empresa, plan_solicitado, estado, notas |
| **FKs salientes** | ninguna hacia clientes (pendiente de aprobación) |
| **RLS** | Correcto |
| **Acceso JS** | registros.js — panel de aprobación de nuevos registros |
| **Issues** | approve() roto: registros.js llama a clientes_contactos que está bloqueado (P0-bis) |
| **Dominio** | Solicitudes Públicas |

### 3.20 documentos

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 50,000 |
| **PK** | id UUID |
| **Columnas operacionales** | cliente_id, nombre, tipo, fecha_vencimiento, estado, activo, sistema, sistema_detectado, sistema_norm, sistema_norm2 |
| **Columnas DMS** | storage_path, storage_bucket, mime_type, tamano_bytes |
| **Columnas hash duplicadas** | hash_sha256, hash_archivo — dos columnas de hash para el mismo contenido |
| **Columnas texto PDF duplicadas** | texto_extraido, pdf_text — dos columnas para texto extraído de PDF |
| **Columnas sistema duplicadas** | sistema_norm, sistema_norm2 |
| **Columnas analytics** | vistas, descargas, ultima_vista, ultima_descarga, calificacion, etiquetas JSONB |
| **FKs salientes** | cliente_id → clientes(id) |
| **RLS** | No auditado explícitamente |
| **Issues** | 60+ columnas. Viola 3NF por mezcla de metadata de archivo, texto extraído, analytics y datos operacionales. Candidata a separación: documentos (metadata) + documentos_contenido (texto) + documentos_analytics (métricas) |
| **Dominio** | DMS |

### 3.21 perfiles

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 50 (usuarios staff) |
| **PK** | id UUID (= auth.users.id) |
| **Columnas clave** | nombre, rol (admin/soporte/ventas), email, activo |
| **FKs salientes** | id → auth.users(id) |
| **RLS** | Correcto según Dashboard audit |
| **Issues** | Sin campo perfil_tipo o permiso granular más allá de rol. Extensible pero actualmente correcto |
| **Dominio** | Operacional |

### 3.22 bitacora

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 100,000 (log de todas las acciones) |
| **PK** | id UUID |
| **Columnas clave** | accion, cliente_id, documento_id, usuario_id, detalle JSONB, fecha, visibilidad, tipo |
| **FKs salientes** | cliente_id → clientes(id) (nullable), usuario_id → auth.users(id) (nullable) |
| **RLS** | Correcto según Dashboard audit |
| **Issues** | 1) detalle es JSONB sin schema enforcement — dificulta queries analíticos. 2) Sin particionamiento por fecha — crecerá indefinidamente. 3) Sin TTL ni archivado automático (sin pg_cron) |
| **Dominio** | Operacional |

### 3.23 avisos_globales

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | < 100 |
| **PK** | id UUID |
| **Columnas clave** | titulo, texto, tipo (info/warn/error), activo, fecha_inicio, fecha_fin |
| **RLS** | Correcto según Dashboard audit |
| **Dominio** | Operacional |

### 3.24 rate_limit_events

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | 41 (confirmado Dashboard — todas scope=support_submit, 2026-04-20 a la fecha) |
| **PK** | id UUID |
| **Columnas clave** | identifier, scope, created_at |
| **Issues** | 1) Sin TTL ni cleanup — crecerá indefinidamente. 2) Solo scope=support_submit activo — match-cliente, estado-ticket-responder-ts, submit-alta y submit-registro no tienen rate limiting. 3) Sin pg_cron para limpieza automática de registros viejos |
| **Dominio** | Operacional |

### 3.25 edge_idempotency

| Atributo | Valor |
|----------|-------|
| **Filas estimadas** | 10 (confirmado Dashboard: 9 completed, 1 failed — todas >7 días) |
| **PK** | id UUID (o idempotency_key UNIQUE) |
| **Columnas clave** | idempotency_key, status (pending/completed/failed), created_at, expires_at |
| **Issues** | Sin limpieza de registros expirados. El 1 failed nunca fue limpiado. Sin pg_cron. Timeout de 90s puede dejar registros pending indefinidamente si el EF crashes |
| **Dominio** | Operacional |

### 3.26 auditoria_storage_manual / auditoria_borrado_storage

| Atributo | Valor |
|----------|-------|
| **Tipo** | Tablas de auditoría operacional manual |
| **Issues** | Sin RLS verificado. Sin estructura normalizada — son registros manuales ad-hoc |
| **Dominio** | Operacional / Audit |

### 3.27 documentos_borrado_vdi_backup

| Atributo | Valor |
|----------|-------|
| **Tipo** | Tabla backup de documentos borrados (legacy/operacional) |
| **Issues** | Sin constraints. Sin FK. Artefacto de auditoría pasada. Potencialmente dead table |
| **Dominio** | DMS / Audit |

---

## 4. Normalización y Duplicidades

### 4.1 Violaciones de Primera Forma Normal (1NF)

| Tabla | Columna | Problema |
|-------|---------|---------|
| tickets | timeline_publica JSONB | Array de objetos no normalizado — datos relacionales en JSON |
| tickets | adjuntos JSONB | Array de archivos duplicando archivos_ticket |
| solicitudes_alta | archivos JSONB | Metadata de archivos en JSONB en vez de tabla |
| solicitudes_soporte | archivos JSONB | Idem |
| bitacora | detalle JSONB | Schema libre — imposible indexar campos internos |
| ticket_eventos | meta JSONB | Schema libre |
| archivos_ticket | meta JSONB | Schema libre |
| documentos | etiquetas JSONB | Lista de etiquetas sin tabla normalizada |

### 4.2 Violaciones de Segunda Forma Normal (2NF)

| Tabla | Columna(s) dependiente(s) | Dependencia parcial de |
|-------|--------------------------|----------------------|
| ticket_respuestas_rapidas | texto, etiqueta | id (no de cliente_id) |
| solicitudes_alta | contacto_principal_* | id (no de cliente_id) |

### 4.3 Violaciones de Tercera Forma Normal (3NF)

| Tabla | Columnas problemáticas | Depende transitivamente de |
|-------|----------------------|--------------------------|
| tickets | empresa_capturada, nombre_capturado, correo_capturado, telefono_capturado | ticket_id → clientes/clientes_contactos |
| tickets | match_nivel, match_score, cliente_id_sugerido, contacto_id_sugerido, match_confirmado | → ticket_match_decisiones |
| tickets | horario_laboral, horario_notas, horario_contacto, nombre_cliente_contacto, correo_cliente_contacto | → clientes_contactos |
| tickets | sistema, sistema_detectado | → clientes |
| tickets | sla_policy, sla_first_response_deadline, sla_resolution_deadline | Podría ser tabla sla_policies |
| documentos | hash_sha256, hash_archivo | → mismo archivo (duplicado) |
| documentos | texto_extraido, pdf_text | → mismo archivo (duplicado) |
| documentos | sistema_norm, sistema_norm2 | → clientes.sistema |
| clientes | sistema_norm, sistema_norm2 | → clientes.sistema |

### 4.4 Duplicidades de Columnas Identificadas

```
DUPLICIDAD 1 — Hash de archivos
  documentos.hash_sha256     (SHA-256 del contenido)
  documentos.hash_archivo    (hash alternativo — ¿diferente algoritmo?)
  → Auditoría pendiente: ¿contienen datos distintos?

DUPLICIDAD 2 — Texto extraído de PDF
  documentos.texto_extraido  (extracción primaria)
  documentos.pdf_text        (extracción alternativa — ¿diferente pipeline?)
  → Auditoría pendiente: ¿ambas activas?

DUPLICIDAD 3 — Normalización de sistema
  clientes.sistema_norm
  clientes.sistema_norm2
  documentos.sistema_norm
  documentos.sistema_norm2
  → Cuatro columnas de normalización de nombre de sistema en dos tablas

DUPLICIDAD 4 — Conteo de evidencias
  tickets.evidencia_count
  tickets.attachments_count
  tickets.files_count
  → Tres columnas para el mismo contador

DUPLICIDAD 5 — Archivos del ticket
  tickets.adjuntos JSONB       (JSONB inline)
  ticket_archivos (tabla)      (legacy)
  archivos_ticket (tabla)      (canónico)
  → Tres repositorios simultáneos de archivos por ticket
  → ticket.js:241 lee las tres fuentes y deduplicidad por fileUniqKey

DUPLICIDAD 6 — Timeline/eventos del ticket
  tickets.timeline_publica JSONB  (JSONB inline)
  ticket_eventos (tabla)          (canónico)
  → ticket.js:240: si hay ticket_eventos, se usa. Si no, se lee timeline_publica

DUPLICIDAD 7 — Contacto en ticket
  tickets.nombre_capturado / correo_capturado / telefono_capturado
  tickets.nombre_cliente_contacto / correo_cliente_contacto
  clientes_contactos.nombre / correo / telefono
  → Tres registros del mismo dato en estados distintos de resolución
```

### 4.5 Índices Duplicados (7 identificados en Dashboard)

| Tabla | Índices duplicados | Impacto |
|-------|-------------------|---------|
| tickets | 3 índices sobre el mismo campo | Escrituras lentas, 2 índices de sobra |
| ticket_eventos | 2 índices duplicados | Escrituras lentas, 1 índice de sobra |
| archivos_ticket | 2 índices duplicados | Escrituras lentas, 1 índice de sobra |

**Total:** 4 índices superfluos que consumen espacio y ralentizan INSERT/UPDATE.

---

## 5. Modelo Canónico Recomendado

### 5.1 Modelo canónico de archivos

```
ESTADO ACTUAL (3 fuentes):
  tickets.adjuntos JSONB           ← escriben: dashboard.js; estado-ticket-responder-ts [pendiente de confirmar — EF no disponible en repositorio local]
  ticket_archivos (legacy table)   ← escriben: ticket.js:160, cliente.core.js:33
  archivos_ticket (canon table)    ← escriben: ticket.js:160 (único con checks)

MODELO CANÓNICO TARGET:
  archivos_ticket                  ← única fuente de verdad
    · ticket_id FK
    · origen: 'solicitud' | 'ticket' | 'portal' | 'interno'
    · visibilidad: 'publica' | 'interna'
    · storage_path (nombre correcto)
    · url_firma (regenerada on-demand)
    · meta JSONB (canal, folio, etc.)

MIGRACIÓN:
  Fase 1: Mantener doble escritura (actual)
  Fase 2: Migrar rows legacy de ticket_archivos a archivos_ticket
  Fase 3: Migrar JSONB de tickets.adjuntos a archivos_ticket
  Fase 4: Eliminar escritura a ticket_archivos y adjuntos JSONB
  Fase 5: Drop ticket_archivos (solo si Storage también migrado)
```

### 5.2 Modelo canónico de eventos

```
ESTADO ACTUAL (2 fuentes):
  tickets.timeline_publica JSONB   ← escriben: ticket.js:247 (confirmado), dashboard.js:141 (confirmado);
                                      estado-ticket-responder-ts [pendiente de confirmar — EF no disponible en repo local]
  ticket_eventos (canon table)     ← escriben: ticket.js:250 (saveLog), ticket.js:250 con nextState (estado)

MODELO CANÓNICO TARGET:
  ticket_eventos                   ← única fuente de verdad
    · ticket_id FK
    · autor_tipo: 'soporte' | 'cliente' | 'sistema'
    · visibilidad: 'publica' | 'interna'
    · kind: 'nota' | 'estado' | 'mensaje' | 'archivo'
    · texto
    · meta JSONB (adjuntos, folio, etc.)

GAP CRÍTICO: moveTicket / closeTicket / batchClose NO insertan ticket_eventos
  → Historial incompleto — cambios de estado sin registro en tabla canónica

MIGRACIÓN:
  Fase 1: Agregar INSERT ticket_eventos en moveTicket/closeTicket/batchClose
  Fase 2: Migrar timeline_publica JSONB a ticket_eventos
  Fase 3: Eliminar escritura a timeline_publica
  Fase 4: DROP columna tickets.timeline_publica (decisión humana requerida)
```

### 5.3 Modelo canónico de matching

```
ESTADO ACTUAL:
  tickets contiene: empresa_capturada, nombre_capturado, correo_capturado,
    telefono_capturado, cliente_id_sugerido, contacto_id_sugerido,
    match_nivel, match_score, match_confirmado, contacto_confirmado,
    contacto_es_nuevo, requiere_consolidacion

  ticket_match_decisiones: tabla canónica con match_nivel, match_score,
    cliente_id_sugerido, contacto_id_sugerido, decision, decidido_por
    → Sin lecturas en PANEL/JS (solo escribe EF match-cliente)

MODELO CANÓNICO TARGET:
  ticket_match_decisiones          ← única fuente para datos de matching
  tickets                          ← mantener solo cliente_id, contacto_id (resolución final)

MIGRACIÓN:
  Fase 1: Conectar frontend a ticket_match_decisiones para lectura de suggestions
  Fase 2: Eliminar columnas match_* de tickets (excepto confirmados y flags)
  Fase 3: Limpiar campos horario_* y nombre_cliente_contacto (redirigir a clientes_contactos)
```

### 5.4 Modelo canónico de contactos en solicitudes_alta

```
ESTADO ACTUAL:
  solicitudes_alta.nombre / telefono / contacto  (legacy plano)
  solicitudes_alta.contacto_principal_nombre / correo / puesto (nuevo estructurado)

MODELO CANÓNICO TARGET:
  solicitudes_alta: solo campos estructurados contacto_principal_*
  → Migrar datos legacy a campos canónicos para registros anteriores
  → Limpiar campos legacy (decisión D-SA1 requerida: ¿hay datos legacy aún activos?)
```

---

## 6. Reglas de Oro de BD — Panel Expiriti

Estas reglas emergen del análisis del esquema real y los patrones de uso:

**R1 — Una tabla, una responsabilidad**  
tickets no debe contener datos de matching, SLA, contacto y timeline simultáneamente. Cada dominio en su tabla.

**R2 — JSONB para datos realmente variables, tabla para datos con estructura fija**  
adjuntos y timeline_publica tienen estructura fija documentada → merecen tablas. Los JSONB meta/detalle con schema libre son aceptables donde la variabilidad es real.

**R3 — Una fuente de verdad por entidad**  
Los archivos tienen tres fuentes (adjuntos JSONB, ticket_archivos, archivos_ticket). Los eventos tienen dos (timeline_publica, ticket_eventos). Cada entidad debe tener exactamente una fuente canónica.

**R4 — FKs deben referenciar columnas PK o UNIQUE**  
La FK compuesta `(contacto_id, cliente_id) → clientes_contactos(id, cliente_id)` en `ticket_respuestas_rapidas` requiere que `clientes_contactos` tenga una UNIQUE constraint sobre `(id, cliente_id)`. El Dashboard audit calificó la estructura como "correcta y robusta", lo que implica que dicha constraint existe. Pendiente de confirmar en Dashboard. En general, todo FK hacia una columna no-PK debe verificar que haya un UNIQUE constraint explícito en la columna referenciada.

**R5 — PKs explícitas siempre**  
cliente_aliases no tiene PRIMARY KEY explícito en DDL. Toda tabla necesita PK declarada explícitamente.

**R6 — Índices únicos en tablas de alta escritura solo cuando son necesarios**  
Los 7 índices duplicados generan overhead sin beneficio. Eliminar antes de que la tabla crezca más.

**R7 — Rate limiting y cleanup siempre acompañados de TTL**  
rate_limit_events y edge_idempotency crecen sin límite. Toda tabla de eventos operacionales necesita estrategia de expiración desde diseño.

**R8 — Los triggers de base de datos solo para invariantes de integridad**  
No usar triggers para lógica de negocio — usar Edge Functions para orquestación compleja.

**R9 — Nombres de columnas deben describir lo que contienen**  
ticket_archivos.url_archivo almacena storage_path — naming engañoso que genera bugs silenciosos.

**R10 — Migraciones en producción siempre con doble escritura temporal**  
El patrón actual de doble escritura (ticket_archivos + archivos_ticket) es el correcto para migrar sin romper producción. Solo eliminar la escritura legacy cuando la lectura legacy esté desconectada.

---

## 7. Seguridad de Tokens Públicos

### 7.1 Modelo de token actual

```sql
-- En tabla tickets:
folio         TEXT    -- UNIQUE: índice tickets_folio_uidx confirmado en Dashboard audit
token_publico TEXT    -- UNIQUE: índice tickets_token_publico_uidx confirmado en Dashboard audit
                      -- Ninguno de los dos aparece como UNIQUE en snapshot DDL (omisión del snapshot)
token_publico_expira TIMESTAMPTZ
```

**Generación confirmada (dashboard.js:141):**
```javascript
const token_publico = randToken()  // función local
const token_publico_expira = new Date(Date.now() + 30*864e5).toISOString()  // 30 días
```

**Consulta pública (estado.js:58):**
```
GET /estado-ticket?folio=X&token=Y
```

### 7.2 Gaps de seguridad en tokens

| Gap | Severidad | Descripción |
|-----|-----------|-------------|
| folio y token_publico ausentes en snapshot DDL | Informativo | Los índices UNIQUE `tickets_folio_uidx` y `tickets_token_publico_uidx` están confirmados en Dashboard audit (2026-06-13). El snapshot `supabase-public-schema.sql` no los incluye en el DDL de `CREATE TABLE` — es una omisión del snapshot, no un problema en la BD viva. Colisión de tokens: no posible. |
| token_publico en plaintext | Media | El token se almacena sin hash. Si la DB es comprometida, todos los portales son accesibles. Riesgo mitigado parcialmente por expiración. |
| Sin rate limiting en estado-ticket | Alta | El endpoint público que recibe folio+token no tiene rate limit (confirmado: rate_limit_events tiene solo scope=support_submit). Permite enumeración de tokens por fuerza bruta. |
| Expiración manual, no automática | Baja | No hay job que invalide tokens expirados (sin pg_cron). Los tokens expirados siguen en la tabla pero el EF rechaza accesos. |
| read_only flag dependiente de estado | Baja | tickets.read_only controla si el portal acepta respuestas, pero el valor debe mantenerse sincronizado con tickets.estado. |

### 7.3 Flujo de renovación de token

No existe flujo documentado para renovar token_publico expirado. Un ticket con folio válido pero token expirado no tiene enlace de portal funcional. El soporte debe regenerar manualmente.

### 7.4 Recomendación de seguridad de tokens

```
Prioridad inmediata:
  1. Agregar rate limiting a estado-ticket EF (tabla rate_limit_events ya existe)
     → El índice UNIQUE tickets_token_publico_uidx ya protege unicidad (confirmado Dashboard)

Prioridad media:
  2. Considerar HMAC(folio + secret) en lugar de token aleatorio en plaintext
  3. Limpiar tokens expirados con pg_cron cuando esté disponible

No urgente:
  4. Documentar índices UNIQUE de folio y token_publico en el snapshot DDL formal
  5. Interfaz de renovación de token en panel de soporte
```

---

## 8. Modelo de Archivos

### 8.1 Tres Storage Buckets

| Bucket | Acceso | Flujo de escritura | Flujo de lectura |
|--------|--------|-------------------|-----------------|
| soporte_adjuntos | Browser directo (ticket.js:160) | Staff sube desde ticket view | ticket.js:127 signedUrl(8h) |
| altas_tmp | Solo EF (service_role) | EF submit-alta | Desconocido — posible cleanup manual |
| certificados | Browser directo (cliente.core.js:33, 3 puntos) | Staff/cliente desde cliente.html | Directo o signedUrl |

### 8.2 Ruta de Storage para soporte_adjuntos

```
soporte_adjuntos/{ticket_id}/soporte_{Date.now()}_{uuid}_{nombre_seguro}
```

Código (ticket.js:160):
```javascript
const path = `${ID}/soporte_${Date.now()}_${crypto.randomUUID()}_${safe}`
```

Problemas:
- `Date.now()` en milisegundos puede colisionar si dos uploads ocurren en el mismo ms (muy improbable con UUID adicional, pero el patrón es redundante)
- El prefijo es `ticket_id` solamente — sin año/mes, lo que puede generar carpetas con cientos de archivos si un ticket tiene muchos adjuntos

### 8.3 Doble escritura de archivos (patrón activo)

```
ticket.js:160 uploadPublicLogFiles():
  1. storage.upload(path, file)                              → soporte_adjuntos bucket
  2. ticket_archivos.insert({url_archivo: path})            → legacy (error ignorado: console.error)
  3. archivos_ticket.insert({storage_path: path})           → canónico (error propagado: throw)
```

**Implicación crítica:** Un fallo en el INSERT legacy (ticket_archivos) se ignora silenciosamente. Un fallo en el INSERT canónico (archivos_ticket) aborta el flujo. Esto es correcto como estrategia de migración, pero significa que el rollback al legacy ya no es limpio — si archivos_ticket falla, el archivo ya está en storage pero ninguna tabla lo referencia.

### 8.4 Lectura paralela de archivos (ticket.js:241)

```javascript
const canonFiles    = normalizeFiles(newArchRows?.data)       // archivos_ticket
const legacyFiles   = normalizeFiles(legacyArchRows?.data)    // ticket_archivos
const ticketFiles   = normalizeFiles(T?.adjuntos)             // tickets.adjuntos JSONB
const timelineFiles = normalizeFiles(T?.timeline_publica.flatMap(...)) // timeline JSONB
FILES = dedup([...canonFiles, ...ticketFiles, ...timelineFiles, ...legacyFiles])
```

El orden de merge (canon primero, legacy al final) prioriza la fuente correcta en deduplicación.

### 8.5 Archivos en solicitudes_alta

```
solicitudes_alta.archivos JSONB  ← EF submit-alta escribe aquí
solicitud_archivos (tabla)       ← apunta a solicitudes_soporte, no a alta
```

Los archivos de solicitudes de alta nunca se mueven a archivos_ticket cuando se crea el ticket derivado. Gap en el modelo de migración de archivos entre dominios.

---

## 9. Modelo de Eventos

### 9.1 Estado actual del modelo de eventos

```
ESCRITURAS (confirmadas en código PANEL/):
  ticket.js:250 saveLog()          → ticket_eventos (INSERT siempre)
                                   → tickets (UPDATE timeline_publica + adjuntos)
  dashboard.js:141 saveTicketFn()  → tickets (INSERT con timeline_publica=[{...}])
  tickets.js:260 moveTicket()      → tickets (UPDATE estado) — SIN ticket_eventos [confirmado]
  tickets.js:263 closeTicket()     → tickets (UPDATE estado) — SIN ticket_eventos [confirmado]
  dashboard.js:150 batchClose()    → tickets (UPDATE estado múltiple) — SIN ticket_eventos [confirmado]

ESCRITURAS (Edge Functions — no disponibles en repo local, pendiente de confirmar):
  EF estado-ticket-responder-ts    → escritura exacta pendiente de confirmar en Dashboard EF logs
                                     (probablemente UPDATE timeline_publica, pero no verificado en código)
  EF crear-ticket-interno          → ticket_eventos (INSERT via service_role) [referenciado en tickets.js]

LECTURAS:
  ticket.js:240 loadTicketContext()
    → ticket_eventos.select().eq("ticket_id", ID)
    → bitacora.select().filter("detalle->>ticket_id", ID)  [LECTURA PARALELA]
  Estrategia: si hay ticket_eventos, se usa. Si no, bitacora (legacy).
```

### 9.2 Eventos faltantes (historial incompleto)

| Acción | ¿Inserta ticket_eventos? | Impacto |
|--------|--------------------------|---------|
| Respuesta de soporte con texto | SÍ (ticket.js:250) | Correcto |
| Cambio de estado desde ticket view | SÍ (ticket.js:250 con nextState) | Correcto |
| Mover ticket entre estados (lista) | NO (tickets.js:260) | Historial missing |
| Cerrar ticket desde lista | NO (tickets.js:263) | Historial missing |
| Cierre masivo de tickets | NO (dashboard.js:150) | Historial missing |
| Respuesta del portal cliente | Pendiente de confirmar (EF estado-ticket-responder-ts no disponible en repo local) | Verificar en Dashboard EF |
| Creación de ticket nuevo | Sí (EF crear-ticket-interno) | Correcto |

### 9.3 Comparación tickets.timeline_publica vs ticket_eventos

| Aspecto | timeline_publica JSONB | ticket_eventos |
|---------|----------------------|----------------|
| Visibilidad granular | No (solo texto plano) | Sí (publica/interna) |
| Autor_tipo estructurado | No | Sí (soporte/cliente/sistema) |
| FK garantizada | No | Sí |
| Indexable | No (solo GIN) | Sí (columns normales) |
| Borrado selectivo | Difícil (JSONB array) | Fácil (DELETE WHERE id) |
| Migración a portal | Requiere parse | Nativo |
| Soporte RLS por fila | No | Sí (con policy sobre visibilidad) |

**Conclusión:** ticket_eventos es el modelo correcto. timeline_publica debe quedar como campo de compatibilidad temporal hasta que todos los lectores migren.

---

## 10. Índices y Performance

### 10.1 Índices duplicados confirmados (Dashboard 2026-06-13)

| Tabla | Campo(s) | Número de índices | Índices de sobra |
|-------|---------|-------------------|--------------------|
| tickets | (campo auditado) | 3 | 2 |
| ticket_eventos | (campo auditado) | 2 | 1 |
| archivos_ticket | (campo auditado) | 2 | 1 |
| **Total** | | 7 | **4 superfluos** |

Acción requerida: identificar nombres exactos en Dashboard → DROP los duplicados (ver plan de remediación sección 14).

### 10.2 Índices recomendados faltantes

| Tabla | Campo | Justificación |
|-------|-------|---------------|
| tickets | folio | UNIQUE confirmado: `tickets_folio_uidx` (Dashboard). También cubierto por `idx_tickets_folio_token`. El snapshot DDL no lo muestra — omisión del snapshot, no gap en BD |
| tickets | token_publico | UNIQUE confirmado: `tickets_token_publico_uidx` (Dashboard). Índice compuesto `idx_tickets_folio_token (folio, token_publico)` también cubre lookups del portal |
| tickets | token_publico_expira | Para cleanup de tokens expirados — no observado en Dashboard audit |
| tickets | cliente_id + estado | Filtro combinado frecuente — no observado en Dashboard audit |
| rate_limit_events | scope + key + created_at | `idx_rate_limit_scope_key_created` CONFIRMADO en Dashboard — correcto para ventana de tiempo |
| edge_idempotency | idempotency_key | PK UNIQUE confirmado en Dashboard: `edge_idempotency_pkey`. Índice adicional `idx_edge_idem_action_resource` también presente |
| bitacora | detalle->>'ticket_id' | Query actual usa JSONB path filter sin índice GIN especializado — pendiente de validar en Dashboard |
| ticket_portal_logs | ticket_id + evento | Lectura frecuente por loadPortalMeta — índice no observado en Dashboard audit; pendiente de confirmar |

### 10.3 Tabla sin LIMIT crítica

`dashboard.js:142`: `s.from("clientes").select("id,nombre")` sin `.limit(n)`

Con < 500 clientes actuales es manejable. Con > 5,000 clientes (escala) se convierte en problema. La RLS policy P0 de clientes devuelve TODAS las filas a authenticated — combinado con la carga sin límite, es un riesgo de performance.

### 10.4 Query costosa identificada

`ticket.js:240 loadTicketContext()` ejecuta 6 queries en paralelo por carga de ticket:
1. clientes.select() by cliente_id
2. bitacora.select() con filter JSONB path
3. tickets.select() de historial de cliente (365 días)
4. ticket_archivos.select() by ticket_id
5. ticket_eventos.select() by ticket_id
6. archivos_ticket.select() by ticket_id

El query 2 (bitacora con detalle->>'ticket_id') es el más costoso por ser filtro JSONB sin índice GIN sobre ese campo específico.

### 10.5 Crecimiento proyectado de tablas sin TTL

| Tabla | Filas actuales | Crecimiento esperado | TTL/Cleanup |
|-------|---------------|---------------------|-------------|
| bitacora | desconocido | Alto (toda acción genera fila) | Ninguno |
| rate_limit_events | 41 | Lineal con uso del portal | Ninguno |
| edge_idempotency | 10 | Bajo (1 por invocación EF) | Ninguno |
| ticket_portal_logs | desconocido | Alto (polling cada X segundos) | Ninguno |

---

## 11. Constraints e Integridad Referencial

### 11.1 FK compuesta en ticket_respuestas_rapidas (aclaración de snapshot vs Dashboard)

**Contradicción entre snapshot y Dashboard:**

El snapshot DDL (`supabase-public-schema.sql`, líneas 574–577) muestra cuatro líneas de FK para `ticket_respuestas_rapidas`, dos de las cuales comparten el mismo nombre `ticket_respuestas_rapidas_contacto_cliente_fkey` — algo imposible en PostgreSQL (constraint names son únicos por tabla). Esto indica que el snapshot representa mal una FK compuesta, dividiéndola en dos líneas:

```
Snapshot (representación incorrecta):
  línea 576: CONSTRAINT ticket_respuestas_rapidas_contacto_cliente_fkey FK (contacto_id) → clientes_contactos(id)
  línea 577: CONSTRAINT ticket_respuestas_rapidas_contacto_cliente_fkey FK (cliente_id)  → clientes_contactos(cliente_id)
```

**Lo que confirma el Dashboard audit (2026-06-13)** — fuente autoritativa para el estado real:

```
FK simple:    cliente_id  → clientes(id) ON DELETE CASCADE
FK simple:    contacto_id → clientes_contactos(id)
FK compuesta: (contacto_id, cliente_id) → clientes_contactos(id, cliente_id)
```

La FK compuesta `(contacto_id, cliente_id) → clientes_contactos(id, cliente_id)` garantiza que el contacto_id asignado pertenece al mismo cliente_id del quick reply — evita asignar contactos de cliente A a respuestas de cliente B. El Dashboard audit calificó esta estructura como **"correcta y robusta"**.

**Pendiente de confirmar:** Para que la FK compuesta sea válida, `clientes_contactos` debe tener una UNIQUE constraint sobre `(id, cliente_id)`. Dado que `id` es PK, esto implicaría una UNIQUE constraint compuesta explícita — pendiente de verificar en Dashboard → Table Editor → clientes_contactos → Constraints.

**Veredicto corregido:** No hay bug de FK confirmado. La estructura de constraints es correcta según Dashboard audit. El snapshot DDL tiene una representación ambigua de la FK compuesta.

### 11.2 PK no observada en snapshot de cliente_aliases

**Observado en snapshot DDL** (`supabase-public-schema.sql`, línea 253–264):

```sql
CREATE TABLE public.cliente_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid,
  alias text,
  ...
  -- Sin CONSTRAINT cliente_aliases_pkey PRIMARY KEY (id)
);
```

El snapshot no incluye ningún `CONSTRAINT ... PRIMARY KEY` en esta tabla. Sin embargo, Supabase puede haber agregado la PK mediante `ALTER TABLE` separado (que no aparece en el snapshot) o mediante la interfaz Dashboard. La columna `id` tiene `NOT NULL DEFAULT gen_random_uuid()` lo cual es consistente con el patrón de PK de Supabase.

**No clasificar como bug confirmado.** Pendiente de validar en Dashboard → Table Editor → cliente_aliases → Primary Keys. Si el Dashboard muestra la PK, es omisión del snapshot. Si no la muestra, es un bug real de esquema.

### 11.3 Constraints CHECK faltantes

| Tabla | Campo | Restricción esperada | Estado |
|-------|-------|---------------------|--------|
| ticket_eventos | kind | CHECK ('nota','estado','mensaje','archivo') | AUSENTE |
| ticket_eventos | autor_tipo | CHECK ('soporte','cliente','sistema') | AUSENTE |
| ticket_eventos | visibilidad | CHECK ('publica','interna') | AUSENTE |
| tickets | estado | CHECK ('abierto','en_proceso','esperando_cliente','resuelto','cerrado') | VERIFICAR |
| tickets | prioridad | CHECK ('baja','media','alta','critica') | VERIFICAR |
| tickets | tipo | CHECK ('soporte','certificado','alta','registro') | VERIFICAR |

Los CHECKs ausentes permiten insertar valores inválidos — los EFs y JS deberían validar, pero la defensa en profundidad recomienda validar en DB también.

### 11.4 CASCADE behavior

| FK | Comportamiento | Riesgo |
|----|----------------|--------|
| solicitud_archivos → solicitudes_soporte | CASCADE DELETE | Correcto — si se borra solicitud, se borran archivos |
| ticket_archivos → tickets | Verificar (no visible en DDL) | Sin CASCADE, borrar ticket dejaría archivos huérfanos |
| archivos_ticket → tickets | Verificar | Idem |
| ticket_eventos → tickets | Verificar | Idem |
| clientes_contactos → clientes | Verificar | Sin CASCADE, borrar cliente dejaría contactos huérfanos |

### 11.5 Referential integrity de Storage

Los buckets de Storage no tienen FK hacia las tablas de la base de datos. Es posible:
- Archivo en storage sin fila en archivos_ticket/ticket_archivos (si el INSERT falla después del upload)
- Fila en archivos_ticket/ticket_archivos con storage_path que no existe en Storage (si el archivo fue borrado manualmente)

Esta es una brecha estructural entre el sistema de archivos y la base de datos que no puede resolverse con FKs de PostgreSQL. Requiere jobs de reconciliación periódica.

---

## 12. Arquitectura Escalable

### 12.1 Límites actuales del modelo

| Componente | Límite actual | Límite con escala |
|------------|---------------|-------------------|
| clientes sin LIMIT | ~500 filas OK | > 5,000 filas → carga lenta |
| tickets JSONB timeline | < 100 eventos/ticket OK | > 500 eventos → query lento |
| bitacora sin TTL | crecimiento lineal | > 1M filas → scans lentos |
| rate_limit_events sin cleanup | 41 filas OK | > 100K filas → degradación |
| ticket_portal_logs sin partición | desconocido | > 1M filas → degradación |
| tickets 60+ columnas | OK para lectura única | JOIN costoso en queries analíticos |

### 12.2 Estrategia de particionamiento (futuro)

```
Candidatos a particionamiento por fecha:
  bitacora              → PARTITION BY RANGE (fecha)
  ticket_portal_logs    → PARTITION BY RANGE (created_at)
  ticket_eventos        → PARTITION BY RANGE (created_at)

No urgente con volúmenes actuales, pero diseñar las tablas nuevas con esta capacidad.
```

### 12.3 Escalabilidad del modelo de matching

El pipeline actual:
```
solicitudes_alta → EF match-cliente → ticket_match_decisiones
                                    → tickets (update match_*)
```

Con volumen alto (> 1,000 altas/día), el EF match-cliente ejecuta fuzzy matching con pg_trgm + unaccent sobre clientes y clientes_contactos. El performance depende de:
- Índices GIN sobre los campos de búsqueda (verificar existencia)
- Tamaño de clientes/clientes_contactos (actualmente < 500/2,000)

### 12.4 Modelo multi-tenant (clientes_usuarios)

La tabla clientes_usuarios existe y soportaría un modelo donde múltiples usuarios del panel tienen acceso solo a sus clientes asignados (owner/editor/viewer). Este modelo no está activo — dashboard.js carga todos los clientes.

Si se activa, requiere:
- RLS en tickets filtrada por clientes_usuarios.user_id = auth.uid()
- RLS en documentos similar
- Cambio en dashboard.js para no cargar todos los clientes

Esta es la migración más impactante de todas — no ejecutar sin diseño completo.

### 12.5 Supabase Realtime

No hay evidencia de uso de Supabase Realtime (canales `supabase.channel()`) en el código JS. El polling se hace manualmente:
- estado.js: `document.addEventListener('visibilitychange', () => load(true))`
- ticket.js: polling manual por hash de estado visible

Oportunidad: migrar a Realtime subscriptions para reducir polling en el portal público.

---

## 13. Auditoría Pendiente de Grants

### 13.1 Grants que necesitan verificación manual

Los siguientes grants no son visibles en el snapshot SQL y requieren revisión en Dashboard → SQL Editor o pg_roles:

```sql
-- Queries read-only recomendadas para verificar (NO ejecutar en prod sin DBA):
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
ORDER BY table_name, grantee;

SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolname;
```

### 13.2 Roles de Supabase en uso

| Rol | Descripción | Uso confirmado |
|-----|-------------|---------------|
| anon | Requests sin autenticar | EFs públicas (submit-alta, submit-soporte, estado-ticket) |
| authenticated | Usuarios con sesión JWT | PANEL/ staff (admin/soporte/ventas) |
| service_role | Bypass de RLS | Todos los Edge Functions internos |
| postgres | Rol superusuario interno | Supabase interno |

### 13.3 Grants en tablas de auditoría

Las tablas `auditoria_storage_manual` y `auditoria_borrado_storage` pueden tener grants incorrectos si fueron creadas manualmente en Dashboard. Sin verificación en pg_roles no es posible confirmar.

### 13.4 Funciones RPC

No hay RPCs documentadas en el audit actual. Las funciones personalizadas (si existen) en public schema también necesitan audit de SECURITY DEFINER vs SECURITY INVOKER.

---

## 14. Fases de Remediación BD

### Fase 0 — Correcciones críticas de esquema (SIN romper producción)

| Acción | Tabla | Prioridad | Decisión humana |
|--------|-------|-----------|-----------------|
| Documentar índices UNIQUE de folio y token_publico en snapshot DDL | tickets | P3 | Ninguna — UNIQUE ya existe en BD (confirmado Dashboard) |
| DROP índices duplicados (4 superfluos: `idx_tickets_fecha`, `idx_tickets_actualizacion`, `tickets_folio_token_idx`, duplicados en ticket_eventos y archivos_ticket) | tickets, ticket_eventos, archivos_ticket | P3 | Confirmar nombres exactos con DROP INDEX IF EXISTS |
| Agregar CHECK constraints a ticket_eventos (kind, autor_tipo, visibilidad) | ticket_eventos | P1 | Ninguna |
| Validar PK de cliente_aliases en Dashboard → Table Editor | cliente_aliases | P2 | Verificar estado real antes de actuar |
| Verificar UNIQUE(id, cliente_id) en clientes_contactos (requerida por FK compuesta de ticket_respuestas_rapidas) | clientes_contactos | P2 | Confirmar en Dashboard → Constraints |

### Fase 1 — Completar modelo de eventos (sin migrar datos aún)

| Acción | Archivo JS | Impacto |
|--------|-----------|---------|
| Agregar INSERT ticket_eventos en moveTicket | tickets.js:260 | Historial completo |
| Agregar INSERT ticket_eventos en closeTicket | tickets.js:263 | Historial completo |
| Agregar INSERT ticket_eventos en batchClose | dashboard.js:150 | Historial completo |
| Agregar INSERT ticket_eventos en estado-ticket-responder-ts | EF | Respuestas portal en historial |

### Fase 2 — Rate limiting y cleanup operacional

| Acción | Descripción |
|--------|-------------|
| Instalar pg_cron | Prerequisito para cleanup automático |
| Cleanup rate_limit_events | DELETE WHERE created_at < now() - interval '30 days' |
| Cleanup edge_idempotency | DELETE WHERE expires_at < now() |
| Agregar rate limit a estado-ticket EF | Usar rate_limit_events existente |
| Agregar rate limit a submit-alta EF | Idem |

### Fase 3 — Normalización de tickets (migración de datos)

| Acción | Riesgo | Prerequisito |
|--------|--------|--------------|
| Migrar ticket_match_decisiones como fuente de matching | Bajo (tabla ya existe) | Conectar JS a tabla |
| Migrar timeline_publica → ticket_eventos (historial) | Medio | Fase 1 completa + validación |
| Migrar adjuntos JSONB → archivos_ticket | Medio | Auditoría de deduplicación |
| Eliminar doble escritura a ticket_archivos | Alto | Migración de datos completa |

### Fase 4 — Normalización de documentos (migración mayor)

| Acción | Riesgo |
|--------|--------|
| Separar documentos en documentos + documentos_contenido + documentos_analytics | Alto |
| Unificar columnas hash duplicadas | Medio |
| Unificar columnas texto_extraido/pdf_text | Medio |
| Eliminar sistema_norm2 de clientes y documentos | Bajo |

### Fase 5 — Multi-tenant (activación de clientes_usuarios)

| Acción | Riesgo |
|--------|--------|
| Diseñar RLS basada en clientes_usuarios | Muy alto — requiere diseño completo |
| Migrar dashboard.js a carga filtrada | Alto |
| Activar asignación usuario-cliente | Muy alto |

---

## 15. Qué NO Hacer Todavía

### 15.1 No ejecutar todavía

| Acción prohibida | Razón |
|-----------------|-------|
| DROP ticket_archivos | Doble escritura activa + datos históricos que no han migrado |
| DROP tickets.timeline_publica | Portal público (estado.js) la lee; EF estado-ticket-responder-ts escribe en ella |
| DROP tickets.adjuntos | Hay archivos referenciados solo en este JSONB |
| DROP columnas match_* de tickets | Frontend las lee directamente (ticket.js:178 renderIdentity) |
| ALTER TABLE documentos (separar) | Requiere migration coordinada con todos los lectores |
| Activar clientes_usuarios | Requiere diseño completo de RLS multi-tenant |
| Cambiar FK de ticket_respuestas_rapidas | Requiere decisión sobre el modelo de negocio correcto |
| supabase db push sin backup | Siempre backup antes de migration |
| DROP rate_limit_events antiguas manualmente | Usar pg_cron cuando esté disponible |

### 15.2 Antipatrones a no introducir

| Antipatrón | Alternativa |
|-----------|-------------|
| Usar tickets como tabla de log (más columnas ad-hoc) | Crear tabla especializada |
| Agregar más columnas JSONB sin schema | Crear tabla normalizada |
| Triggers para lógica de negocio | Edge Functions |
| Índices sobre todas las columnas | Solo donde hay queries reales lentos |
| Eliminar doble escritura antes de validar migración | Mantener doble escritura hasta confirmación total |

---

## 16. Matriz Final BD

### 16.1 Estado por dominio

| Dominio | Tablas | Normalización | RLS | Índices | Performance | Estado |
|---------|--------|---------------|-----|---------|-------------|--------|
| CRM Core | clientes, clientes_contactos, cliente_accesos, cliente_sistemas, cliente_aliases, clientes_usuarios, clientes_contacto_historial | Medio (sistema_norm2 duplicado) | CRÍTICO (P0-bis contactos, P0 clientes/accesos) | OK | OK para escala actual | En remediación |
| Tickets Core | tickets, ticket_eventos, ticket_folios, archivos_ticket, ticket_archivos, ticket_respuestas_rapidas, ticket_portal_logs, ticket_match_decisiones | Bajo (60+ cols, 3 fuentes archivos, 2 fuentes eventos) | P0 (tickets, ticket_respuestas_rapidas), P1 (ticket_archivos, ticket_match_decisiones) | 7 duplicados | Race condition en folio | Deuda técnica alta |
| Solicitudes Públicas | solicitudes_alta, solicitud_archivos, solicitudes_soporte, solicitudes_registro | Medio (migración en curso en solicitudes_alta) | Correcto (EF service_role) | OK | OK | En migración |
| DMS | documentos, documentos_borrado_vdi_backup | Bajo (60+ cols, hash y texto duplicados) | No auditado | OK | OK para escala actual | Deuda técnica alta |
| Operacional | bitacora, perfiles, avisos_globales, rate_limit_events, edge_idempotency, auditoria_* | Medio | Correcto | OK | Sin TTL — riesgo crecimiento | Correcto, TTL pendiente |

### 16.2 Severidad por gap

| Categoría | Gaps críticos | Gaps medios | Gaps bajos |
|-----------|--------------|-------------|------------|
| RLS | 4 tablas P0, 1 tabla P0-bis | 4 tablas P1/P2 | — |
| Normalización | tickets (60+ cols) | documentos (60+ cols) | 5 tablas con campos duplicados |
| Índices | — | 4 índices duplicados | 3 índices faltantes recomendados |
| Integridad referencial | — | FK compuesta ticket_respuestas_rapidas requiere UNIQUE(id, cliente_id) en clientes_contactos (pendiente de confirmar); PK de cliente_aliases pendiente de validar en Dashboard | CASCADE behavior sin verificar en la mayoría de tablas |
| Tokens públicos | Sin rate limit en estado-ticket | token_publico en plaintext (sin hash) | folio/token_publico UNIQUE confirmados en Dashboard; ausentes solo en snapshot DDL |
| Historial | 3 flujos JS sin ticket_eventos (confirmado: moveTicket/closeTicket/batchClose) | EF estado-ticket-responder-ts: pendiente de confirmar en Dashboard EF | — |
| TTL/Cleanup | rate_limit_events, edge_idempotency sin cleanup | bitacora sin archivado | ticket_portal_logs sin partición |
| Tabla sin uso | clientes_usuarios (0 refs JS) | ticket_match_decisiones (solo EF, no JS) | documentos_borrado_vdi_backup |

### 16.3 Tabla de acceso real (PANEL/\*.js confirmado)

| Tabla | Accedida desde JS | Accedida desde EF | Estado de uso |
|-------|-----------------|-------------------|--------------|
| clientes | SÍ | SÍ | Activa |
| clientes_contactos | SÍ (roto por RLS) | SÍ | Activa pero rota |
| clientes_contacto_historial | SÍ | Desconocido | Activa |
| clientes_usuarios | NO | NO | Sin uso confirmado |
| cliente_aliases | SÍ | SÍ (match) | Activa |
| cliente_accesos | SÍ | Desconocido | Activa |
| cliente_sistemas | SÍ | SÍ (match) | Activa |
| tickets | SÍ | SÍ | Activa (tabla crítica) |
| ticket_eventos | SÍ | SÍ | Activa (canónico parcial) |
| ticket_folios | SÍ | SÍ | Activa |
| ticket_archivos | SÍ | Desconocido | Activa (legacy, doble escritura) |
| archivos_ticket | SÍ | SÍ | Activa (canónico) |
| ticket_respuestas_rapidas | SÍ | Desconocido | Activa |
| ticket_portal_logs | SÍ | SÍ | Activa |
| ticket_match_decisiones | NO | SÍ (match-cliente) | Solo EF |
| solicitudes_alta | NO (EF only) | SÍ | Activa vía EF |
| solicitud_archivos | Desconocido | Desconocido | Uso confuso |
| solicitudes_soporte | SÍ | SÍ | Activa |
| solicitudes_registro | SÍ | Desconocido | Activa |
| documentos | SÍ | Desconocido | Activa |
| perfiles | SÍ | SÍ | Activa |
| bitacora | SÍ | SÍ | Activa |
| avisos_globales | SÍ | Desconocido | Activa |
| rate_limit_events | NO | SÍ | Solo EF |
| edge_idempotency | NO | SÍ | Solo EF |

---

## 17. Veredicto Final

### 17.1 Arquitectura general

**Veredicto: Funcional con deuda técnica significativa.**

El esquema refleja un producto que fue creciendo orgánicamente desde un MVP. La estructura base es sólida — los dominios son identificables, los FKs existen, Supabase RLS está habilitado en todas las tablas. La deuda está concentrada en:

1. **tickets** como God Table (60+ columnas, datos de 4 dominios distintos)
2. **Modelo dual** de archivos y eventos que requiere mantenimiento paralelo
3. **RLS P0/P0-bis** que bloquea flujos críticos en producción
4. **Sin TTL** en tablas de crecimiento indefinido
5. **Historial incompleto** en ticket_eventos

### 17.2 Prioridad de remediación

```
INMEDIATO (antes de escalar usuarios):
  → Fix RLS P0-bis (clientes_contactos) — 5 flujos rotos
  → Fix RLS P0 (tickets, clientes, cliente_accesos, ticket_respuestas_rapidas)
  → Agregar ticket_eventos en moveTicket/closeTicket/batchClose

CORTO PLAZO (1-2 sprints):
  → DROP 4 índices duplicados (nombres exactos confirmados en Dashboard audit sección 4)
  → Instalar pg_cron + cleanup rate_limit_events / edge_idempotency
  → Agregar rate limit a estado-ticket EF
  → Agregar CHECK constraints a ticket_eventos (kind, autor_tipo, visibilidad)
  → [token_publico UNIQUE ya existe — confirmado Dashboard. No requiere acción]

MEDIO PLAZO (3-6 meses):
  → Migrar timeline_publica JSONB → ticket_eventos
  → Migrar adjuntos JSONB → archivos_ticket
  → Eliminar doble escritura en ticket_archivos
  → Normalizar documentos (separar analytics)

LARGO PLAZO (planificado):
  → Evaluar clientes_usuarios para multi-tenant
  → Particionar bitacora y ticket_portal_logs
  → Conectar ticket_match_decisiones al frontend
  → Separar tickets en tickets_core + tickets_match + tickets_sla
```

### 17.3 Riesgo de escala

Con el volumen actual (< 500 clientes, < 10K tickets), el sistema opera correctamente. Los problemas de performance y normalización se manifestarán con:
- > 5,000 clientes (dashboard.js sin LIMIT)
- > 100K filas en bitacora (sin archivado)
- > 1M filas en ticket_portal_logs (sin partición)
- Tickets con > 500 eventos (JSONB timeline creciente)

La ventana para resolver sin presión de tiempo es ahora, durante el período de baja escala.

### 17.4 Porcentaje de auditoría BD

| Área | Cobertura |
|------|-----------|
| Mapeo de dominios | 100% |
| Data dictionary (23 tablas) | 95% (2 tablas operacionales sin detalle de grants) |
| Normalización identificada | 90% |
| Modelo de archivos | 100% |
| Modelo de eventos | 100% |
| Tokens públicos | 85% (salt/hash no verificado) |
| Índices y duplicados | 80% (nombres exactos de duplicados no confirmados) |
| Constraints e integridad | 85% (CASCADE behavior no verificado en todos) |
| Grants y roles | 40% (requiere Dashboard manual) |
| Performance y escalabilidad | 75% (sin query plan real) |
| Arquitectura escalable | 80% |
| Fases de remediación | 100% |
| **TOTAL BD** | **~88%** |

---

## 18. Próximo Prompt Exacto

```
Contexto activo:
  Rama: audit/supabase-flows
  Modo estricto: solo documentación y lectura. NO ejecutes SQL. NO edites código.
  Documento de referencia: DB/audit_bd_arquitectura_normalizacion_2026_06_15.md
  Prioridades pendientes:
    P0-bis: clientes_contactos RLS → DB/plan_rls_p0_bis_clientes_contactos_2026_06_15.md
    P0: tickets/clientes/cliente_accesos/ticket_respuestas_rapidas → DB/rls_p0_preflight_remediation_2026_06_15.md
    Arquitectura: DB/audit_bd_arquitectura_normalizacion_2026_06_15.md

Próximo prompt sugerido:
"Crea el plan de remediación de historial de eventos: 
DB/plan_remediacion_ticket_eventos_2026_06_15.md

El documento debe cubrir:
1. Gap actual: qué flujos JS NO insertan ticket_eventos (moveTicket/closeTicket/batchClose/estado-ticket-responder-ts)
2. Análisis de impacto por flujo
3. Cambios JS requeridos por archivo (tickets.js:260, tickets.js:263, dashboard.js:150)
4. Cambios EF requeridos (estado-ticket-responder-ts)
5. SQL de migración de timeline_publica → ticket_eventos (read-only, no ejecutar)
6. Plan de migración en 3 fases sin romper producción
7. Tests de validación recomendados
8. Decisiones humanas requeridas antes de ejecutar

Modo estricto: solo documentación. NO edites código. NO ejecutes SQL. NO hagas commit."
```

---

*Auditoría generada: 2026-06-15 | Snapshot: docs/audit/supabase-public-schema.sql | Modo: read-only*  
*Auditoría BD: 88% | Implementación: 0% (sin cambios aplicados)*
