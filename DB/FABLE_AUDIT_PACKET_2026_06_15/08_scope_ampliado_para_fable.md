# Scope Ampliado para Fable — Revisión Extendida
**Fecha:** 2026-06-15  
**Complementa:** `06_prompt_final_para_fable.md`  
**Propósito:** Ampliar el alcance de la revisión más allá de RLS puntual — cubrir threat model, CIA, PII, abuso, deploy drift, rollback y riesgo de negocio.  
**Modo:** Solo documentación. Sin SQL ejecutable. Sin acceso a producción.

---

## ÍNDICE

1. [Threat Model](#1-threat-model)
2. [Matriz CIA](#2-matriz-cia)
3. [Privacidad y PII](#3-privacidad-y-pii)
4. [Abuso / Spam / Fuerza Bruta](#4-abuso--spam--fuerza-bruta)
5. [Deploy Drift](#5-deploy-drift)
6. [Pruebas por Rol](#6-pruebas-por-rol)
7. [Rollback Real](#7-rollback-real)
8. [Riesgo de Negocio](#8-riesgo-de-negocio)
9. [Preguntas Adicionales para Fable](#9-preguntas-adicionales-para-fable)
10. [Formato de Salida Solicitado a Fable](#10-formato-de-salida-solicitado-a-fable)

---

## 1. Threat Model

### Actores y vectores de ataque documentados

---

#### 1.1 Atacante anon (sin sesión, sin token)

**Qué puede hacer hoy:**
- POST a `support-submit-secure` (pública, rate limit 5/10min) — puede enviar tickets de soporte
- POST a `submit-alta` (pública, sin rate limit) — puede enviar solicitudes de alta con hasta 80MB
- POST a `submit-registro` (pública, sin rate limit) — puede enviar solicitudes de registro
- POST a `match-cliente` (pública, sin rate limit, sin auth) — puede ejecutar full scan fuzzy de clientes y obtener nombre/email/teléfono/score
- GET a `estado-ticket-ts` con folio+token — si adivina o roba un par válido, ve el portal de un ticket
- Acceso directo a buckets de Storage si policies son públicas (estado no verificado)

**Vectores de abuso:**
- Spam de formularios públicos → sobrecarga de solicitudes sin procesar
- Bruteforce de pares folio+token → acceso a portales de tickets de otros clientes
- Enumeration de clientes via `match-cliente` → extracción de base de clientes sin autenticación

**Mitigaciones actuales:**
- `support-submit-secure`: rate limit 5/10min ✅
- `submit-alta`, `submit-registro`: sin rate limit ❌
- `match-cliente`: sin rate limit, sin auth ❌
- `estado-ticket-ts`: token UNIQUE en BD, sin rate limit ❌

**Superficies no modeladas:** ¿Hay endpoints Supabase auto-generados (REST API directa sobre tablas) además de las EFs? Si `anon` tiene acceso directo al REST API de Supabase, las policies RLS son la única barrera.

---

#### 1.2 Cliente con link público (folio + token_publico)

**Qué puede hacer hoy:**
- GET a `estado-ticket-ts?folio=X&token=Y` — ver su ticket, historial público, adjuntos públicos via signed URL
- POST a `estado-ticket-responder-ts` — enviar respuesta al ticket
- Sin rate limit HTTP en ninguno de los dos endpoints

**Riesgos:**
- Token de otro cliente: si adivina folio (secuencial) y bruteforcea token → acceso al portal de otro cliente
- Token propio comprometido: si el magic link es interceptado (email), el atacante tiene acceso completo al portal por 30 días
- Sin revocación de token: no hay flujo para invalidar un token comprometido sin acceso al panel interno
- Spam de respuestas: con token válido puede enviar respuestas sin límite HTTP

**Lo que NO puede hacer:**
- Acceder al panel interno (requiere sesión de `authenticated`)
- Ver datos de otros tickets sin su propio token
- Modificar estado del ticket (solo responder)

---

#### 1.3 Usuario `authenticated` sin perfil en `perfiles`

**Descripción del estado:** Usuario con cuenta en `auth.users` (JWT válido, rol `authenticated`) pero sin fila en la tabla `perfiles`. Puede ocurrir si se crea una cuenta pero no se completa el onboarding, o si se crea manualmente una cuenta de prueba.

**Qué puede hacer hoy (con policies P0 abiertas, `qual=true`):**
- SELECT en `tickets` → ve todos los tickets de todos los clientes ✅ (policy abierta)
- SELECT en `clientes` → ve todos los clientes ✅ (policy abierta)
- SELECT en `cliente_accesos` → ve todas las credenciales AnyDesk ✅ (policy abierta)
- INSERT/UPDATE en `ticket_respuestas_rapidas` → puede crear/modificar quick replies ✅ (policy abierta)

**Qué puede hacer DESPUÉS del fix P0 (con EXISTS(perfiles)):**
- Con el patrón propuesto `EXISTS(SELECT 1 FROM perfiles WHERE id = auth.uid() AND activo=true)`:
  - Si no hay fila en `perfiles` → EXISTS devuelve false → denegado ✅
  - Si hay fila en `perfiles` con `activo=false` → EXISTS devuelve false → denegado ✅
- **Pregunta abierta para Fable:** ¿El subquery EXISTS hereda los permisos del usuario actual? Si la policy de `perfiles` permite solo `self-read`, el EXISTS sí puede leer la fila propia. Pero si no hay fila, ¿devuelve false o error?

**Vector de ataque residual:** ¿Existe alguna forma de que `authenticated sin perfil` acceda a datos si el subquery EXISTS falla con error (no con false)? ¿PostgreSQL trata los errores en USING como false o como error?

---

#### 1.4 Rol `ventas`

**Estado actual (con policies abiertas P0):**
- Ve todos los tickets de todos los clientes (mismo que admin)
- Ve todos los clientes y PII asociado
- Ve credenciales AnyDesk (cliente_accesos)
- Puede crear y modificar quick replies de cualquier cliente

**Estado propuesto post-P0 (según Opción A — ventas ve todo):**
- Ve todos los tickets: igual que admin/soporte (decisión D1 Opción A)
- Ve todos los clientes: igual que admin/soporte
- NO ve cliente_accesos (credenciales AnyDesk): bloqueado por recommendation D2
- Puede ver clientes_contactos si D3=sí

**Estado propuesto post-P0 (según Opción B — ventas solo ve asignados):**
- Board de tickets: solo muestra los asignados a `auth.uid()`
- Riesgo de UX: board vacío si no hay tickets asignados

**Superficies de abuso internas no modeladas:**
- ¿Puede `ventas` exportar datos vía el SDK en DevTools? Con el SDK en el browser, cualquier query permitida por RLS puede ejecutarse desde la consola del navegador.
- ¿`ventas` puede hacer UPDATE en tickets no asignados si hay policy UPDATE abierta?

---

#### 1.5 Rol `soporte`

**Estado actual (con policies abiertas P0):** Mismo acceso que `ventas` — ve todo.

**Estado post-P0:** Acceso full a tickets, clientes, clientes_contactos, archivos. Acceso a cliente_accesos (credenciales AnyDesk). Sin diferencia significativa vs `admin` en la mayoría de tablas.

**Superficies de riesgo interno:**
- `soporte` puede hacer INSERT en `clientes` (`dashboard.js:84`) — ¿debería poder crear clientes?
- `soporte` puede hacer UPDATE en cualquier ticket (`ticket.js:250`) — ¿sin restricción de cliente asignado?
- `soporte` puede hacer INSERT en `ticket_respuestas_rapidas` para cualquier cliente/contacto

**Pregunta para Fable:** ¿Hay alguna separación de datos necesaria entre `soporte` y `admin`? ¿O ambos deberían tener acceso total con la diferencia solo en funciones de administración del panel?

---

#### 1.6 Rol `admin`

**Estado actual y esperado post-P0:** Acceso total a todas las tablas. Sin restricciones de cliente.

**Superficies únicas de admin:**
- Puede aprobar altas y registros (vía EFs con JWT)
- Puede hacer batchClose de tickets (`dashboard.js:150`)
- Puede acceder a `client_accesos` (credenciales AnyDesk)

**Riesgo de cuenta admin comprometida:** Si una cuenta `admin` es comprometida, el atacante tiene acceso total via SDK browser + todas las EFs internas con JWT. No hay MFA documentado en el sistema. El único control es la sesión JWT de Supabase (duración no documentada en la auditoría).

---

#### 1.7 Atacante con `anon_key` (clave pública de Supabase)

**Contexto:** La `anon_key` de Supabase es pública por diseño — aparece en el JS del frontend (`PANEL/supabase.js` o similar). No es un secreto. Con la `anon_key`, cualquier persona puede hacer requests al API de Supabase del proyecto.

**Qué puede hacer con `anon_key` hoy:**
- Acceder al REST API directo de Supabase con rol `anon`
- Si RLS está bien configurado para `anon`, el daño es limitado
- Las 6 policies `dev_anon_*` ya fueron cerradas (2026-06-13) ✅

**Riesgo residual:**
- ¿Hay tablas sin RLS o con policy `anon` abierta que no se detectaron en la auditoría?
- ¿El REST API auto-generado de Supabase expone todas las tablas con policy `anon` implícita?
- ¿Hay funciones RPC en el schema público accesibles para `anon`?

**Lo que NO puede hacer con solo `anon_key`:**
- Acceder a datos con policy `authenticated` (requiere JWT de usuario válido)
- Usar EFs con JWT requerido (ticket-internal-reply, alta-aprobar, etc.)

---

#### 1.8 Atacante con acceso a magic link (email comprometido)

**Modelo:** El atacante intercepta o roba un email de magic link enviado a un usuario del staff.

**Qué obtiene:**
- Sesión JWT válida con el rol del usuario (admin/soporte/ventas)
- Duración de sesión: no documentada en la auditoría
- Acceso a todas las operaciones permitidas por el rol en el panel interno

**Mitigaciones actuales:**
- Magic links son de un solo uso (Supabase estándar) — si el usuario legítimo ya hizo click, el atacante no puede usarlo
- Sin MFA documentado

**Riesgo si el atacante lo usa antes del usuario legítimo:**
- Acceso total al panel con el rol del usuario comprometido
- Sin logs de sesión visibles (bitacora loguea acciones, no logins — no confirmado en auditoría)

**Pregunta para Fable:** ¿Supabase tiene algún mecanismo de revocación de sesión activa accesible desde la aplicación? ¿Se puede implementar logout forzado desde el panel admin?

---

#### 1.9 Atacante con acceso parcial a datos / logs

**Modelo:** Atacante con acceso de lectura parcial — por ejemplo, acceso a logs de un servidor externo, o acceso a una exportación de datos, o un empleado que copia datos antes de ser dado de baja.

**Qué puede extraer:**
- `tickets.token_publico` (en plaintext) → acceso a todos los portales de clientes durante 30 días
- `tickets.folio` (secuencial) + `token_publico` → enumerar portales de todos los tickets activos
- `clientes` PII → exportar base completa de clientes
- `cliente_accesos` → credenciales de acceso remoto de todos los clientes

**Mitigaciones recomendadas (no aplicadas):**
- Hash del `token_publico` en BD (almacenar HMAC, comparar con hash del token recibido)
- TTL agresivo de tokens de portal (7 días en lugar de 30)
- Revocación individual de token desde panel admin

---

## 2. Matriz CIA

**Escala de impacto:** Alto / Medio / Bajo  
**Estado:** A = estado actual (con policies abiertas), F = estado post-fix propuesto

---

### 2.1 `tickets`

| Dimensión | Estado A | Estado F (post-P0) | Observaciones |
|-----------|----------|-------------------|---------------|
| **Confidencialidad** | 🔴 ROTO — cualquier authenticated lee todos los tickets | 🟢 OK — solo staff con perfil activo | Con Opción B: ventas ve subset. Con Opción A: ventas ve todo |
| **Integridad** | 🟡 RIESGO — cualquier authenticated puede UPDATE (sin verificar si hay policy UPDATE abierta) | 🟡 MEDIO — UPDATE no explícitamente restringido por rol en el borrador P0 | El borrador P0 solo cubre SELECT. ¿Las policies de UPDATE siguen abiertas? |
| **Disponibilidad** | 🟢 OK — sin riesgo de borrado masivo (no hay policy DELETE documentada) | 🟢 OK | `batchClose` hace UPDATE de estado, no DELETE |

---

### 2.2 `clientes`

| Dimensión | Estado A | Estado F (post-P0) | Observaciones |
|-----------|----------|-------------------|---------------|
| **Confidencialidad** | 🔴 ROTO — PII completo (nombre, email, RFC, plan) a cualquier authenticated | 🟢 OK — solo staff con perfil activo | `dashboard.js:142` carga todo sin LIMIT — performance risk en escala |
| **Integridad** | 🟡 RIESGO — INSERT y UPDATE sin restricción de rol explícita documentada | ❓ NO AUDITADO — policies INSERT/UPDATE/DELETE no verificadas en la auditoría P0 (gap G03) | `dashboard.js:84` hace INSERT rápido; `cliente.core.js:34` hace UPDATE. Sin auditoría de escritura, el riesgo de integridad es desconocido incluso post-P0 SELECT |
| **Disponibilidad** | 🟢 OK | 🟢 OK | Sin operaciones de borrado documentadas desde browser |

---

### 2.3 `cliente_accesos`

| Dimensión | Estado A | Estado F (post-P0) | Observaciones |
|-----------|----------|-------------------|---------------|
| **Confidencialidad** | 🔴 CRÍTICO — credenciales AnyDesk, URLs de acceso remoto, usuarios y claves cifradas accesibles a cualquier authenticated | 🟢 OK — solo admin/soporte | Esta es la tabla de mayor sensibilidad de credenciales del sistema |
| **Integridad** | 🟡 RIESGO — INSERT/UPDATE sin restricción de rol explícita | ❓ NO AUDITADO — policies INSERT/UPDATE/DELETE no verificadas en la auditoría P0 (gap G03) | `ticket.js:168` hace INSERT/UPDATE de accesos AnyDesk desde el browser; sin auditoría de escritura, el riesgo sobre credenciales sigue siendo desconocido post-P0 SELECT |
| **Disponibilidad** | 🟢 OK | 🟢 OK | |

**Nota CIA especial:** `cliente_accesos.clave_cifrada` — la auditoría no documenta el mecanismo de cifrado. Si es cifrado a nivel de aplicación (antes de INSERT), la exposición via SELECT es de datos ya cifrados. Si no hay cifrado y solo "cifrado" es encoding base64 u ofuscación, la exposición es total. Pregunta crítica para Fable: ¿RLS es suficiente para una tabla de credenciales, o se recomienda cifrado a nivel de columna (pg_crypto/Vault)?

---

### 2.4 `clientes_contactos`

| Dimensión | Estado A (deny_all) | Estado F (post-P0-bis) | Observaciones |
|-----------|---------------------|----------------------|---------------|
| **Confidencialidad** | 🟢 SEGURA — nadie puede leer (pero 5 flujos de UI rotos) | 🟢 OK — solo staff con perfil | El "seguro" actual es por accidente (deny_all) |
| **Integridad** | 🟢 SEGURA (por accidente) | 🟡 RIESGO — INSERT para admin/soporte sin restricción por cliente_id | ¿Puede soporte crear contacto para cliente de otro soporte? |
| **Disponibilidad** | 🔴 ROTO — 5 flujos de UI sin acceso | 🟢 OK — flujos restaurados | P0-bis es fix de disponibilidad, no de confidencialidad |

---

### 2.5 `ticket_respuestas_rapidas`

| Dimensión | Estado A | Estado F (post-P0) | Observaciones |
|-----------|----------|-------------------|---------------|
| **Confidencialidad** | 🔴 ROTO — quick replies de todos los clientes accesibles a cualquier authenticated | 🟢 OK — solo admin/soporte (¿ventas?) | Los QRs pueden contener templates con datos de clientes específicos |
| **Integridad** | 🔴 ROTO — INSERT/UPDATE irrestricto. Cualquier authenticated modifica QRs de cualquier cliente | 🟢 OK — solo admin/soporte | El doble grupo duplicado de policies puede dejar gaps si no se auditan correctamente |
| **Disponibilidad** | 🟡 RIESGO — modificación maliciosa de QRs puede afectar flujo de respuestas de soporte | 🟢 OK | |

---

### 2.6 `archivos_ticket` / `ticket_archivos`

| Dimensión | archivos_ticket (canónico) | ticket_archivos (legacy) |
|-----------|---------------------------|--------------------------|
| **Confidencialidad** | 🟢 OK — RLS correcto según auditoría | 🔴 ROTO — SELECT `qual=true`, cualquier authenticated ve storage_paths |
| **Integridad** | 🟢 OK | 🟡 MEDIO — INSERT desde browser para admin/soporte, soft-fail oculta errores |
| **Disponibilidad** | 🟡 RIESGO — si INSERT falla DESPUÉS del storage upload, el archivo queda huérfano | 🟡 RIESGO — si INSERT en `ticket_archivos` falla (soft-fail), la referencia legacy se pierde silenciosamente |

**Gap transaccional:** El patrón de doble escritura en `ticket.js:160` no es transaccional a nivel de Storage+BD. Un crash entre el upload y el INSERT deja archivos huérfanos en Storage sin referencia en ninguna tabla. No hay compensación documentada.

---

### 2.7 `ticket_eventos` / `timeline_publica`

| Dimensión | ticket_eventos | tickets.timeline_publica (JSONB) |
|-----------|----------------|----------------------------------|
| **Confidencialidad** | ❓ NO AUDITADO — policies SELECT/INSERT/UPDATE/DELETE de `ticket_eventos` no fueron verificadas en Dashboard (gap G01); tabla leída por `estado-ticket-ts` sin JWT | 🟡 MEDIO — accesible con la policy SELECT de tickets |
| **Integridad** | 🔴 ROTO — moveTicket, closeTicket, batchClose no insertan eventos → historial incompleto | 🟡 RIESGO — JSONB append sin control de visibilidad publica/interna |
| **Disponibilidad** | 🟢 OK — tabla existe y funciona para los eventos que sí se insertan | 🟡 RIESGO — crecimiento sin límite (JSONB array, sin archivado) |

---

### 2.8 Edge Functions públicas

| EF | Confidencialidad | Integridad | Disponibilidad |
|----|-----------------|------------|----------------|
| `support-submit-secure` | 🟢 OK (rate limit activo) | 🟢 OK | 🟡 RIESGO — sin Turnstile, bots pueden saturar |
| `match-cliente` | 🔴 ROTO — expone PII de clientes sin auth | 🟢 OK (solo lectura) | 🟡 RIESGO — sin rate limit |
| `submit-alta` | 🟢 OK (datos propios del solicitante) | 🟡 RIESGO — sin validación de contenido de archivos (tipo MIME) | 🔴 ROTO — 80MB/request sin rate limit |
| `submit-registro` | 🟢 OK | 🟢 OK | 🟡 RIESGO — sin rate limit |
| `estado-ticket-ts` | 🟡 MEDIO — token en plaintext, sin RL de bruteforce | 🟢 OK | 🟢 OK |
| `estado-ticket-responder-ts` | 🟢 OK (solo escribe en ticket propio via token) | 🟡 RIESGO — sin validación de tamaño de respuesta | 🟡 RIESGO — sin rate limit HTTP |
| `quick-function` | 🔴 CRÍTICO — service_role expuesto, siempre 500 | 🔴 CRÍTICO — surface activa con bypass RLS | 🔴 ROTO — 100% error rate |
| `super-service` | 🔴 CRÍTICO — service_role público sin auth | 🔴 CRÍTICO | 🟢 OK (funciona técnicamente) |

---

### 2.9 Portal `estado.html` (folio + token)

| Dimensión | Estado actual | Observaciones |
|-----------|--------------|---------------|
| **Confidencialidad** | 🟡 MEDIO — token UNIQUE pero en plaintext, sin rate limit de bruteforce | Folio secuencial + token aleatorio = superficie de enumeración |
| **Integridad** | 🟢 OK — el cliente solo puede responder, no modificar estado del ticket | |
| **Disponibilidad** | 🟢 OK — EF funciona correctamente | Sin rate limit HTTP, pero bajo abuso esperado (token requerido) |

---

### 2.10 Formulario `soporte.html`

| Dimensión | Estado actual | Observaciones |
|-----------|--------------|---------------|
| **Confidencialidad** | 🟢 OK — datos del formulario son propios del solicitante | |
| **Integridad** | 🟡 MEDIO — sin Turnstile, bots pueden enviar tickets falsos | Rate limit mitiga parcialmente |
| **Disponibilidad** | 🟡 MEDIO — rate limit activo (5/10min) pero sin Turnstile | Bots con múltiples IPs pueden saturar el soporte |

---

### 2.11 Storage Buckets

| Bucket | Confidencialidad | Integridad | Disponibilidad |
|--------|-----------------|------------|----------------|
| `soporte_adjuntos` | ❓ DESCONOCIDO — policies no verificadas | 🟡 MEDIO — upload browser directo, sin validación de tipo documentada | 🟢 OK |
| `altas_tmp` | ❓ DESCONOCIDO | 🟢 OK — solo EF service_role sube | 🟢 OK |
| `certificados` | ❓ DESCONOCIDO — mayor riesgo (PDFs de licencias, contratos) | 🟡 MEDIO — 3 puntos de upload browser, sin validación de tipo documentada | 🟢 OK |

---

## 3. Privacidad y PII

### 3.1 Inventario de datos personales en el sistema

| Dato PII | Tabla/Campo | Quién tiene acceso ahora | Riesgo actual |
|----------|-------------|--------------------------|---------------|
| **Correos electrónicos de contactos** | `clientes_contactos.correo`, `clientes.email_contacto`, `solicitudes_registro.correo`, `tickets.correo_capturado` | Cualquier authenticated (policies abiertas P0) | 🔴 ALTO |
| **Teléfonos** | `clientes_contactos.telefono`, `clientes.telefono`, `tickets.telefono_capturado` | Cualquier authenticated | 🔴 ALTO |
| **Credenciales AnyDesk (IDs, URLs, usuarios)** | `cliente_accesos.url`, `cliente_accesos.usuario`, `cliente_accesos.clave_cifrada` | Cualquier authenticated | 🔴 CRÍTICO |
| **Contactos de clientes** | `clientes_contactos.*` — nombre, puesto, horario, teléfono, correo | Nadie (deny_all — P0-bis roto) | 🔴 FUNCIONALIDAD ROTA |
| **Archivos adjuntos de tickets** | `archivos_ticket.storage_path`, `ticket_archivos.url_archivo` | `archivos_ticket`: OK. `ticket_archivos`: cualquier authenticated | 🟡 MEDIO (legacy) |
| **Certificados y licencias de software** | Bucket `certificados` | Desconocido (policies no verificadas) | ❓ DESCONOCIDO |
| **Datos de solicitudes de alta** | `solicitudes_alta.*` — nombre, empresa, RFC, archivos | EFs service_role (no desde browser) | 🟢 OK |
| **Logs de actividad de portal** | `ticket_portal_logs.*` — eventos de acceso al portal por cliente | `ticket.js:140` — solo staff | 🟢 OK |
| **Tokens públicos de acceso al portal** | `tickets.token_publico` (plaintext, 30 días) | Cualquier authenticated con acceso a `tickets` | 🔴 ALTO |
| **Magic links de autenticación del staff** | `auth.users` (no accesible desde PANEL JS) | Solo Supabase internamente | 🟢 OK (no en schema public) |
| **RFC / razón social de clientes** | `clientes.rfc`, `clientes.nombre` | Cualquier authenticated (P0 abierto) | 🔴 ALTO |

### 3.2 Análisis de exposición por categoría

#### Correos y teléfonos

**Dónde están:**
- `clientes_contactos.correo` / `.telefono` — contactos primarios y secundarios de cada cliente
- `clientes.email_contacto` — campo legado en la tabla de clientes (duplica `clientes_contactos`)
- `tickets.correo_capturado` / `.telefono_capturado` — captura inicial del ticket
- `solicitudes_soporte.correo` / `.telefono` — formulario público

**Riesgo hoy:** Con P0 abierto, cualquier autenticado puede exportar todos los correos y teléfonos de contactos de todos los clientes. Con el borrador P0-bis y P0, solo staff con perfil activo.

**Gap adicional:** `tickets.correo_capturado` y `tickets.telefono_capturado` son columnas denormalizadas que duplican `clientes_contactos`. Incluso después de cerrar `clientes_contactos` con RLS correcto, esta información está accesible via la policy de `tickets`.

#### Credenciales AnyDesk

**Dónde están:** `cliente_accesos.url`, `cliente_accesos.usuario`, `cliente_accesos.clave_cifrada`

**Riesgo hoy:** CRÍTICO. Cualquier autenticado puede leer IDs de AnyDesk de todos los clientes. Si estas credenciales permiten conexión remota, un atacante interno (o cuenta comprometida) puede acceder a los sistemas de los clientes.

**Pregunta crítica para Fable:** ¿"clave_cifrada" es cifrado real (AES-GCM, pg_crypto) o encoding (base64/hex)? ¿Quién tiene la clave de descifrado? ¿Está en el JS del frontend?

#### Archivos adjuntos y certificados

**Flujo de acceso:**
1. Staff sube archivo → bucket de Storage
2. `archivos_ticket` o `ticket_archivos` almacenan el storage_path
3. Para ver el archivo: se genera signed URL vía `storage.createSignedUrl(path, 8*3600)` → URL temporal válida 8h

**Riesgo si bucket es público:** La signed URL es innecesaria — la URL directa del Storage es accesible. Si el path es predecible (patrón documentado: `{ticket_id}/soporte_{timestamp}_{uuid}_{nombre}`), la enumeración es difícil pero no imposible con UUID.

**Riesgo real:** La exposición es el storage_path en `ticket_archivos` (SELECT `qual=true`). Con ese path y un bucket público, cualquier autenticado podría acceder directamente sin signed URL.

#### Tokens públicos y magic links

**`token_publico`:**
- Almacenado en plaintext en `tickets.token_publico`
- Vigencia: 30 días (hardcodeado en `dashboard.js`)
- Único por ticket (índice UNIQUE confirmado)
- Con P0 abierto: cualquier autenticado puede leer todos los tokens de todos los tickets → acceso a todos los portales de clientes durante 30 días

**Magic links:**
- Generados por Supabase Auth
- Enviados por email al staff
- De uso único (Supabase estándar)
- No almacenados en schema public
- Riesgo: interceptación de email o phishing

---

## 4. Abuso / Spam / Fuerza Bruta

### 4.1 `support-submit-secure`

| Vector | Mitigación actual | Estado |
|--------|------------------|--------|
| Spam de tickets falsos | Rate limit 5/10min por IP | ✅ Activo |
| Bots automatizados | Turnstile implementado pero apagado | 🔴 Inactivo |
| Múltiples IPs (botnet) | Sin mitigación | ❌ Sin defensa |
| Payload grande (DoS) | Sin validación de tamaño documentada en EF | ❓ Desconocido |
| Adjuntos maliciosos | Sin validación de tipo MIME documentada | ❓ Desconocido |

**Pregunta para Fable:** ¿`support-submit-secure` valida el tipo MIME de los adjuntos antes de subirlos al Storage? Si un atacante sube un ejecutable renombrado como `.jpg`, ¿hay algún riesgo?

### 4.2 `match-cliente`

| Vector | Mitigación actual | Estado |
|--------|------------------|--------|
| Scraping completo de base de clientes | Sin auth, sin rate limit | 🔴 NINGUNA |
| Enumeración por nombre/email | Fuzzy match devuelve candidatos sin auth | 🔴 NINGUNA |
| Timing attack (inferir existencia de clientes) | Sin rate limit | 🔴 NINGUNA |
| Acceso desde cualquier origen (CORS `*`) | CORS permisivo | 🔴 SIN RESTRICCIÓN |

**Análisis del payload devuelto:**
```
Entrada: { nombre, empresa, correo, telefono } (cualquiera de los 4)
Salida: candidatos con { id, nombre, correo, telefono, score }
```
Con una sola llamada se puede obtener nombre+correo+teléfono de clientes reales con score de confianza. Con iteración (apellidos, empresas conocidas), un atacante puede enumerar toda la base.

### 4.3 `submit-alta`

| Vector | Mitigación actual | Estado |
|--------|------------------|--------|
| Spam de solicitudes de alta | Sin rate limit | 🔴 NINGUNA |
| Upload masivo (hasta 80MB/req) | Sin rate limit | 🔴 NINGUNA (posible DoS a `altas_tmp`) |
| Solicitudes de competidores | Sin validación de identidad | ❓ Riesgo de negocio |

**Punto específico sobre 80MB:** Si un atacante envía 100 requests simultáneos de 80MB cada uno, sube 8GB al bucket `altas_tmp`. Esto podría agotar la cuota de Storage o degradar la velocidad del servicio.

### 4.4 `submit-registro`

| Vector | Mitigación actual | Estado |
|--------|------------------|--------|
| Spam de solicitudes de registro | Sin rate limit | 🔴 NINGUNA |
| Registro con datos falsos | Sin validación de dominio de email | Sin mitigación |
| Saturación del panel de aprobación | Spam genera work queue infinita para el equipo | Riesgo operativo |

### 4.5 `estado-ticket-ts` (folio + token)

| Vector | Mitigación actual | Estado |
|--------|------------------|--------|
| Bruteforce de pares folio+token | Sin rate limit HTTP | 🔴 NINGUNA |
| Enumeración de folios (secuenciales) | Folio es texto, no siempre numérico | 🟡 DIFÍCIL pero posible |
| Acceso a token de otro cliente | Sin rate limit permite prueba masiva | 🔴 RIESGO REAL |
| Replay de token expirado | EF valida `token_publico_expira > now()` | ✅ Protegido |

**Riesgo de enumeración/fuerza bruta:** La longitud, el alfabeto y la fuente criptográfica de `token_publico` no están confirmados en la evidencia disponible. Por tanto, no puede cuantificarse su entropía ni afirmarse que sea resistente o vulnerable a fuerza bruta. El riesgo debe evaluarse inspeccionando la implementación real de `randToken()` y verificando longitud, aleatoriedad criptográfica, expiración y manejo de intentos fallidos. La ausencia de rate limit HTTP confirmado en `estado-ticket-ts` aumenta la superficie de abuso, aunque no demuestra por sí sola que el token sea adivinable.

**Gap P2 adicional:** `estado-ticket-ts` GET carece de rate limit HTTP confirmado; es una superficie distinta de `estado-ticket-responder-ts` POST y no tiene fix documentado.

### 4.6 `estado-ticket-responder-ts`

| Vector | Mitigación actual | Estado |
|--------|------------------|--------|
| Spam de respuestas con token válido | **[inferencia]** Anti-spam en BD (porcentaje) — código EF no disponible en repo local; mecanismo no confirmado | ❓ NO VERIFICADO |
| Flood HTTP (sin rate limit) | Sin rate limit HTTP | 🔴 NINGUNA |
| Payload grande en respuesta | Sin validación de tamaño documentada | ❓ Desconocido |
| Adjuntos maliciosos en respuesta del portal | No documentado si EF acepta adjuntos | ❓ Desconocido |

---

## 5. Deploy Drift

### 5.1 Qué está auditado en el repositorio

El repositorio `panel-expiriti-audit-bd` contiene documentación de auditoría, no código de producción. Lo que se puede saber del repositorio:

| Item | Fuente de verdad en repo | Confiabilidad |
|------|--------------------------|---------------|
| Schema de BD (23+ tablas) | `docs/audit/supabase-public-schema.sql` (2026-06-13) | 🟡 SNAPSHOT — puede haber cambiado |
| Código de EFs | Solo backup de `ticket-internal-reply` pre-fix | ❌ INCOMPLETO |
| RLS policies | `DB/audit_dashboard_2026_06_15.md` (SQL read-only) | 🟡 PUNTO EN EL TIEMPO |
| Commit del fix de idempotencia | `567ef9a` (2026-06-13) — `fix: harden ticket internal reply idempotency`. `f54e22b` es el backup pre-fix documental. | ✅ COMMITEADO (deploy no confirmado) |
| Fix de `tickets.js:111` Bearer token | En repo `panel-expiriti` rama `main` | ✅ COMMITEADO |
| Código JS del panel | En repo `panel-expiriti` (auditoría via grep) | 🟡 PUEDE HABER DIVERGIDO |

### 5.2 Qué requiere validar en Supabase Dashboard

**No asumir que el código del repo == lo que está en producción.**

| Item | Dónde verificar en Dashboard | Por qué puede divergir |
|------|------------------------------|----------------------|
| Lista de EFs activas | Dashboard → Edge Functions | Pueden haberse retirado o desplegado manualmente sin commit |
| Versión de `ticket-internal-reply` | Dashboard → EF → ticket-internal-reply → fecha deploy | El fix en repo no implica que se haya redesplegado |
| Versión de `quick-function` activa | Dashboard → EF → quick-function | Puede haber sido retirada manualmente |
| Versión de `super-service` activa | Dashboard → EF → super-service | Idem |
| Variables de entorno (Secrets) | Dashboard → Settings → Edge Functions → Secrets | `REQUIRE_TURNSTILE` puede haber cambiado |
| Storage policies | Dashboard → Storage → [bucket] → Policies | Solo visible en Dashboard, no en SQL |
| RLS policies actuales | Dashboard → SQL Editor → pg_policies | Pueden haber cambiado desde el snapshot |
| Extensiones instaladas | Dashboard → Database → Extensions | pg_cron puede haberse instalado manualmente |
| Realtime publications | Dashboard → Database → Replication | Pueden existir canales RT no documentados |

### 5.3 Qué NO debe asumirse como deployado

| Supuesto incorrecto | Riesgo si se asume sin verificar |
|---------------------|----------------------------------|
| "El fix de `ticket-internal-reply` está en producción" | Producción puede correr código pre-fix sin hardening de idempotencia |
| "`quick-function` ya fue retirada" | Puede seguir activa como superficie de ataque |
| "Las 6 policies dev_anon fueron realmente cerradas" | Cierre documentado pero no re-verificado en la auditoría actual |
| "Las policies RLS del snapshot (2026-06-13) son las actuales" | Pueden haber cambiado en 48h entre el snapshot y la auditoría |
| "Los buckets de Storage tienen policies seguras" | No verificado en ningún momento — estado completamente desconocido |
| "pg_cron no está instalado" | Puede haberse instalado manualmente sin documentar |

### 5.4 Edge Functions que necesitan verificación visual de versión activa

| EF | Prioridad de verificación | Qué verificar | Acción si está desactualizada |
|----|--------------------------|---------------|------------------------------|
| `ticket-internal-reply` | ALTA | Fecha de deploy posterior a 2026-06-13 | Redesplegar desde repo post-fix |
| `quick-function` | ALTA | Si aparece en la lista de EFs activas | Verificar logs → retirar del deploy |
| `super-service` | ALTA | Si aparece en la lista de EFs activas | Verificar logs → retirar del deploy |
| `support-submit-secure` | MEDIA | Que `REQUIRE_TURNSTILE=false` en Secrets coincide con el repo | Verificar y documentar |
| `estado-ticket-ts` | MEDIA | Que la versión activa no tiene cambios no commiteados | Comparar fecha deploy |
| `match-cliente` | MEDIA | Que la versión activa no tiene protecciones adicionales no documentadas | Comparar fecha deploy |
| `alta-aprobar` / `registro-aprobar` | BAJA | Versión activa correcta | Verificar |

---

## 6. Pruebas por Rol

### 6.1 Rol `admin`

**Flujos a probar post-P0-bis y P0:**

| Test | Acción | Resultado esperado |
|------|--------|-------------------|
| A01 | SELECT tickets desde sesión admin | Todos los tickets visibles |
| A02 | SELECT clientes desde sesión admin | Todos los clientes visibles |
| A03 | SELECT cliente_accesos desde sesión admin | Credenciales visibles |
| A04 | SELECT clientes_contactos desde sesión admin | Contactos visibles (post-P0-bis) |
| A05 | INSERT en clientes_contactos (admin) | Debe funcionar (policy cc_insert_staff) |
| A06 | UPDATE en clientes_contactos (admin) | Debe funcionar (policy cc_update_staff) |
| A07 | Aprobar registro en `registros.html` | No debe mostrar error de RLS |
| A08 | Ver contactos en `cliente.html` | Sección no vacía |
| A09 | Dropdown de contactos en `ticket.html` | No vacío |
| A10 | SELECT ticket_respuestas_rapidas | Debe funcionar (con policies correctas) |
| A11 | INSERT quick reply | Debe funcionar |
| A12 | SELECT ticket_archivos | Debe funcionar (legacy, P1) |

---

### 6.2 Rol `soporte`

**Flujos a probar (mismos que admin, más casos de borde):**

| Test | Acción | Resultado esperado |
|------|--------|-------------------|
| S01 | SELECT tickets | Todos visibles (mismo que admin en Opción A) |
| S02 | SELECT clientes | Todos visibles |
| S03 | SELECT cliente_accesos | Visibles (misma policy que admin) |
| S04 | SELECT clientes_contactos | Visibles (post-P0-bis) |
| S05 | UPDATE ticket (saveLog) | Debe funcionar |
| S06 | Enviar respuesta desde ticket.html (ticket-internal-reply) | EF responde OK |
| S07 | Upload adjunto en ticket.html | Sube a `soporte_adjuntos`, INSERT en `archivos_ticket` |
| S08 | Ver historial del ticket (ticket_eventos) | Muestra eventos de saveLog, NO muestra moveTicket/closeTicket (gap conocido) |

---

### 6.3 Rol `ventas`

**Flujos críticos para determinar Opción A vs Opción B (D1):**

| Test | Acción | Resultado Opción A | Resultado Opción B |
|------|--------|-------------------|-------------------|
| V01 | SELECT tickets en dashboard.js | Todos visibles | Solo asignados a auth.uid() |
| V02 | SELECT clientes | Todos visibles | Todos visibles (misma policy) |
| V03 | SELECT cliente_accesos | **BLOQUEADO** (D2=NO) | **BLOQUEADO** (D2=NO) |
| V04 | SELECT clientes_contactos | Visibles si D3=SÍ | Visibles si D3=SÍ |
| V05 | Sección AnyDesk en ticket.html | **Vacía** (bloqueada por D2) | **Vacía** |
| V06 | Dropdown de contactos en ticket.html | Visible si D3=SÍ | Visible si D3=SÍ |
| V07 | UPDATE ticket (moveTicket) | **Definir**: ¿ventas puede mover tickets? | Idem |
| V08 | Board de ventas vacío (Opción B sin asignados) | N/A | **RIESGO DE UX** |

---

### 6.4 `authenticated` sin perfil

| Test | Acción | Resultado esperado post-P0 |
|------|--------|---------------------------|
| AP01 | SELECT tickets | **BLOQUEADO** (EXISTS perfiles devuelve false) |
| AP02 | SELECT clientes | **BLOQUEADO** |
| AP03 | SELECT cliente_accesos | **BLOQUEADO** |
| AP04 | SELECT clientes_contactos | **BLOQUEADO** |
| AP05 | INSERT en cualquier tabla staff | **BLOQUEADO** |
| AP06 | Acceder al panel interno | Sesión válida pero todas las queries devuelven vacío o error |

**Resultado de UX esperado:** El usuario ve el panel pero sin datos. No hay error 403 explícito — las queries devuelven vacío (SELECT) o error de RLS (INSERT). El panel debe manejar este estado graciosamente.

---

### 6.5 `anon` (sin sesión)

| Test | Acción | Resultado esperado |
|------|--------|-------------------|
| AN01 | Acceder a `tickets.html` sin sesión | Redirigido a login (lógica JS, no RLS) |
| AN02 | POST a `support-submit-secure` | Funciona (endpoint público) |
| AN03 | POST a `match-cliente` | Funciona (endpoint público, sin auth) |
| AN04 | POST a `submit-alta` | Funciona (endpoint público) |
| AN05 | GET a `estado-ticket-ts?folio=X&token=Y` | Funciona con token válido |
| AN06 | SDK directo: `supabase.from('tickets').select()` | 0 resultados (RLS anon = sin access) |
| AN07 | SDK directo: `supabase.from('clientes').select()` | 0 resultados |

---

### 6.6 Portal con token válido (cliente legítimo)

| Test | Acción | Resultado esperado |
|------|--------|-------------------|
| PT01 | Acceso a `estado.html?folio=X&token=Y` (activo) | Carga historial del ticket |
| PT02 | Ver adjuntos del ticket | Signed URLs válidas (8h) |
| PT03 | Enviar respuesta | INSERT en ticket, respuesta visible en panel |
| PT04 | Ver eventos de ticket (ticket_eventos) | Solo eventos con `visibilidad='publica'` |
| PT05 | Acceder a ticket de otro cliente con el mismo token | **BLOQUEADO** (token es único por ticket) |
| PT06 | Usar signed URL después de 8h | **BLOQUEADO** (URL expirada — Supabase Storage) |

---

### 6.7 Portal sin token (folio correcto, token incorrecto)

| Test | Acción | Resultado esperado |
|------|--------|-------------------|
| NT01 | GET `estado-ticket-ts?folio=X&token=INCORRECTO` | EF devuelve 404 o 401 (token no existe en BD) |
| NT02 | GET `estado-ticket-ts?folio=INEXISTENTE&token=Y` | EF devuelve 404 (folio no existe) |
| NT03 | 1000 requests con tokens incorrectos (bruteforce) | **SIN PROTECCIÓN** — sin rate limit en EF |

---

### 6.8 Portal con token expirado

| Test | Acción | Resultado esperado |
|------|--------|-------------------|
| EX01 | GET `estado-ticket-ts?folio=X&token=Y` (expirado) | EF devuelve error por `token_publico_expira < now()` |
| EX02 | Token expirado pero correcto | Bloqueado correctamente por la EF |
| EX03 | Renovar token desde panel | Requiere intervención manual del staff (sin flujo automatizado) |

---

## 7. Rollback Real

### 7.1 Rollback SQL

**Estrategia:**  
Antes de ejecutar CUALQUIER script de remediación, el humano debe ejecutar el backup read-only en Dashboard:

```sql
-- EJECUTAR ANTES DE CUALQUIER FIX (solo lectura, no modifica nada)
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clientes_contactos','tickets','clientes','cliente_accesos','ticket_respuestas_rapidas')
ORDER BY tablename, policyname;
```

Guardar el resultado completo. Si el fix produce regresiones, recrear las policies antiguas.

**Rollback de P0-bis (clientes_contactos):**

```sql
-- Revertir a estado actual (deny_all)
BEGIN;
DROP POLICY IF EXISTS cc_select_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_insert_staff ON public.clientes_contactos;
DROP POLICY IF EXISTS cc_update_staff ON public.clientes_contactos;
CREATE POLICY "deny_all_clientes_contactos" ON public.clientes_contactos
  AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
COMMIT;
```

**Rollback de P0 (tickets, clientes, cliente_accesos):**

```sql
-- Revertir tickets a estado abierto (peor escenario — datos expuestos pero UI funcional)
BEGIN;
DROP POLICY IF EXISTS tickets_select_staff ON public.tickets;
CREATE POLICY "tickets_select_auth" ON public.tickets
  FOR SELECT TO authenticated USING (true);
COMMIT;
-- Idem para clientes y cliente_accesos con sus nombres originales
```

**Criterio para ejecutar rollback SQL:**
- Cualquier rol de staff (admin/soporte/ventas) no puede cargar el board de tickets → rollback inmediato
- Cualquier rol no puede crear/editar tickets → rollback inmediato
- Quick replies no cargan para admin/soporte → rollback inmediato
- La sección de contactos queda vacía para admin/soporte → rollback inmediato

**NO es criterio de rollback:**
- La sección AnyDesk queda vacía para ventas (es el comportamiento esperado si D2=NO)
- El board de ventas muestra menos tickets (es el comportamiento esperado si D1=Opción B)
- La aprobación de registros sigue mostrando error (indicaría que P0-bis no se aplicó correctamente — debuggear, no hacer rollback)

---

### 7.2 Rollback de Edge Functions

**Para EFs retiradas del deploy:**
```bash
# Si quick-function o super-service necesitan restaurarse (emergencia)
supabase functions deploy quick-function  # desde repo panel-expiriti
supabase functions deploy super-service
```

**Para `ticket-internal-reply` si el redeploy falla:**
```bash
# Backup pre-fix disponible en:
# DB/backups/functions_backup_20260613_023816/ticket-internal-reply/index.ts
supabase functions deploy ticket-internal-reply  # redesplegar con el backup pre-fix
```

**Para EFs con rate limit nuevo si genera falsos 429:**
- Ajustar el límite en el código sin tocar la BD (`rate_limit_events` no necesita cambios)
- Redesplegar la EF con el límite ajustado
- `rate_limit_events` existente no interfiere — los registros son correctos, solo el threshold cambia

---

### 7.3 Rollback de Storage

**Si se corrige una policy de Storage y se rompe el upload:**
- Revertir la policy en Dashboard → Storage → [bucket] → Policies → editar/eliminar
- Verificar con un upload de prueba desde la sesión del rol afectado
- No hay SQL de rollback — las Storage policies son configuración del Dashboard, no SQL de PostgreSQL

**Si se rompe la generación de signed URLs:**
- Verificar que el bucket sigue siendo privado (no público)
- Verificar que la sesión del staff tiene el rol correcto en `perfiles`
- Verificar que `storage.createSignedUrl()` en el JS sigue usando el path correcto

---

### 7.4 Criterio para detener remediación

**Detener inmediatamente si:**
- El board de tickets.html está completamente vacío para admin/soporte (todo el sistema inutilizable)
- La creación de tickets da error (flujo core roto)
- Los quick replies desaparecen para admin/soporte
- El formulario de soporte.html devuelve error (flujo público roto)
- El portal estado.html devuelve error con token válido (portal de clientes roto)

**Investigar antes de detener (errores esperados):**
- La sección de contactos queda vacía para ventas con D3=NO → comportamiento correcto
- La sección AnyDesk queda vacía para ventas → comportamiento correcto
- Usuarios sin perfil activo no ven datos → comportamiento correcto

---

### 7.5 Criterio para continuar si hay errores de RLS esperados

**Continuar si el error es de "datos restringidos" para el rol correcto:**
```
Error: "new row violates row-level security policy"
Contexto: INSERT de ventas en clientes_contactos (ventas no tiene INSERT policy)
Veredicto: CORRECTO — ventas no debería poder crear contactos
```

**Continuar si el SELECT devuelve 0 filas para rol no-autorizado:**
```
SELECT clientes_contactos WHERE cliente_id=X → [] (vacío para ventas si D3=NO)
Veredicto: CORRECTO — ventas no debería ver contactos sin D3=SÍ
```

**Detener y debuggear si el error es de "datos propios bloqueados" para rol autorizado:**
```
Error: "new row violates row-level security policy"
Contexto: INSERT de soporte en clientes_contactos (soporte SÍ tiene INSERT policy)
Veredicto: BUG EN EL FIX — verificar syntax del EXISTS en la policy
```

---

## 8. Riesgo de Negocio

### 8.1 Por exposición de datos

| Hallazgo | Dato expuesto | Riesgo de negocio | Prioridad |
|----------|--------------|-------------------|-----------|
| H04 `cliente_accesos` `qual=true` | Credenciales de acceso remoto AnyDesk | **Acceso no autorizado a sistemas de clientes** — pérdida de confianza inmediata, posible responsabilidad legal | 🔴 CRÍTICO |
| H02 `tickets` `qual=true` | Conversaciones de soporte de todos los clientes | **Violación de confidencialidad** — cliente A ve los problemas de cliente B | 🔴 ALTO |
| H03 `clientes` `qual=true` | PII completo de todos los clientes | **Posible violación de GDPR/LGPD** — base de clientes exportable por cualquier empleado | 🔴 ALTO |
| H10 `match-cliente` sin auth | Nombre/email/teléfono de clientes | **Exfiltración de base de clientes por terceros** | 🔴 ALTO |
| H23 `token_publico` en plaintext | Tokens de portal de todos los tickets | **Acceso a portales de clientes** si BD comprometida | 🟡 MEDIO |

### 8.2 Por ruptura de operación

| Hallazgo | Flujo roto | Impacto operativo | Prioridad |
|----------|------------|-------------------|-----------|
| H01 `clientes_contactos` deny_all | Aprobación de registros de nuevos clientes | **Bloqueo de onboarding** — no se pueden activar clientes nuevos | 🔴 CRÍTICO |
| H01 (secundario) | Ver contactos en `cliente.html` | Sección vacía — dificulta gestión de CRM | 🟡 ALTO |
| H01 (secundario) | Dropdown de contactos en `ticket.html` | Staff no puede vincular contacto a ticket | 🟡 ALTO |
| H17 `ticket_eventos` incompleto | Cambios de estado no registrados | Portal del cliente no muestra evolución del ticket — percepción de abandono | 🟡 MEDIO |
| H23 renovación de token | Token expirado | Staff debe intervenir manualmente para restaurar acceso al portal del cliente | 🟡 BAJO |

### 8.3 Por pérdida de historial

| Hallazgo | Pérdida | Impacto | Reversibilidad |
|----------|---------|---------|----------------|
| H17 `ticket_eventos` sin moveTicket/closeTicket | Todos los cambios de estado desde el board (histórico y futuro) | Sin registro canónico de cuándo se movió o cerró un ticket | Pasado: irrecuperable. Futuro: aplicable post-fix |
| H21/H22 Doble fuente de verdad | Inconsistencia entre `ticket_archivos` y `archivos_ticket`, entre `timeline_publica` y `ticket_eventos` | Riesgo de divergencia — un canal puede tener datos que el otro no | Requiere sprint de migración (P3) |
| Falta de pg_cron | `edge_idempotency` y `rate_limit_events` acumulan sin cleanup | Crecimiento indefinido — sin impacto inmediato a bajo volumen | No es pérdida de historial — es crecimiento de tablas operacionales |

### 8.4 Por spam / abuso

| Hallazgo | Abuso potencial | Impacto de negocio | Probabilidad |
|----------|----------------|-------------------|--------------|
| H14 `submit-alta` sin rate limit | Flood de solicitudes falsas de alta | Saturación del equipo de aprobación | 🟡 MEDIA |
| H15 `submit-registro` sin rate limit | Flood de solicitudes de registro falsas | Idem | 🟡 MEDIA |
| H16 Turnstile apagado | Bots generando tickets de soporte | Saturación de la cola de soporte | 🟡 MEDIA (depende de visibilidad del formulario) |
| H13 sin rate limit en responder | Spam de respuestas desde portal | Degradación de la experiencia de soporte | 🟢 BAJA (requiere token válido) |

### 8.5 Deuda técnica aceptable (sin urgencia)

| Item | Por qué es aceptable esperar |
|------|------------------------------|
| 7 índices duplicados (H24) | Overhead mínimo con <10K tickets. Eliminar en ventana de mantenimiento |
| `timeline_publica` vs `ticket_eventos` (H22) | Sistema funciona con doble fuente. Inconsistencia eventual, no inmediata |
| `ticket_archivos` vs `archivos_ticket` (H21) | Doble escritura con prioridad correcta. Migración cuando haya sprint disponible |
| God Table `tickets` (H20) | Sistema escala sin problemas a <50K tickets. Refactor en fase planificada |
| `clientes_usuarios` sin uso (H25) | Tabla preparada pero inactiva. Sin riesgo |
| CHECK constraints en `ticket_eventos` (H en §11 de BD doc) | Sin impacto de seguridad. Mejora de integridad para el futuro |

### 8.6 Deuda técnica que bloquea crecimiento

| Item | Por qué bloquea |
|------|----------------|
| `tickets` sin LIMIT en `dashboard.js:142` | Con >5,000 clientes/tickets el dashboard se vuelve inutilizable |
| Sin rate limit en `match-cliente` | Con mayor visibilidad del formulario de soporte, la extracción masiva de clientes es viable |
| `token_publico` sin hash | Si la BD es copiada (backup comprometido), todos los portales quedan expuestos durante 30 días sin revocación posible |
| Sin pg_cron en `rate_limit_events` | Con tráfico alto, la tabla crece sin límite y las queries de rate limiting se degradan |
| `ticket_eventos` incompleto | Con escala de soporte, el historial incompleto genera reclamaciones de clientes ("¿por qué no me notificaron del cambio de estado?") |
| Multi-tenant (`clientes_usuarios`) no activo | Si se incorporan socios o agentes externos, el modelo actual de "todos ven todo" se convierte en violación de privacidad entre clientes |

---

## 9. Preguntas Adicionales para Fable

### ¿Qué amenaza no estamos modelando?

Con el contexto completo de este paquete, ¿hay algún vector de ataque que el threat model no cubra? Candidatos a investigar:
- Realtime subscriptions de Supabase (canales RT no auditados)
- Funciones PostgreSQL RPC con SECURITY DEFINER (no auditadas)
- Grants directos sobre tablas que bypaseen RLS (no verificados)
- Acceso a Supabase Studio (Dashboard) con credenciales comprometidas
- Rotación de `anon_key` o `service_role_key` (¿hay mecanismo?)

### ¿Qué P0 falta?

¿La clasificación actual deja algún hallazgo en P1/P2 que debería ser P0 por su impacto real?

### ¿Qué fix podría romper producción?

De los borradores SQL propuestos, ¿cuál tiene mayor riesgo de regresión funcional? ¿Cuál requiere prueba más exhaustiva antes de ejecutarse?

### ¿Qué validación visual en Dashboard es obligatoria antes de ejecutar SQL?

Priorizar las verificaciones de Dashboard que son bloqueantes vs las que son recomendables. ¿La verificación de Storage policies es bloqueante para ejecutar P0-bis?

### ¿Qué semáforo das antes de ejecutar P0-bis?

Dado el estado documentado (deny_all en clientes_contactos, 5 flujos rotos, borrador SQL disponible, decisión D3 pendiente), ¿es seguro ejecutar P0-bis HOY solo para admin/soporte (sin ventas) y agregar ventas después?

### ¿Qué debe resolverse antes de tocar CSS/UI?

¿Qué seguridad mínima debe estar en su lugar antes de que el equipo de frontend haga cambios de UI que podrían ampliar la superficie de ataque (nuevos formularios, nuevas queries directas al SDK)?

### ¿Qué puede esperar sin riesgo real?

¿Cuáles de los items P2 y P3 pueden posponerse indefinidamente sin riesgo de seguridad activo, dado el volumen actual del sistema (<500 clientes, <10K tickets)?

### ¿Qué debe verificarse en producción antes de cualquier SQL?

Lista mínima de verificaciones en Dashboard que son prerrequisitos absolutos (no opcionales) antes de ejecutar el primer script de remediación.

---

## 10. Formato de Salida Solicitado a Fable

Por favor responde con la siguiente estructura exacta:

---

### VEREDICTO EJECUTIVO

[3-5 oraciones: estado real de seguridad del sistema, principal riesgo activo, recomendación de orden de ejecución]

---

### RIESGOS OMITIDOS

[Lista de riesgos identificados en tu revisión que no aparecen en la auditoría original. Para cada uno: nombre, descripción, severidad sugerida]

---

### CONTRADICCIONES DETECTADAS

[Lista de puntos donde la auditoría se contradice, o donde el análisis lleva a conclusiones opuestas. Para cada uno: qué dice el documento A, qué dice el documento B, tu veredicto]

---

### SEMÁFORO P0-bis (clientes_contactos)

| Criterio | Estado |
|----------|--------|
| ¿SQL borrador es lógicamente correcto? | ✅ / ⚠️ / ❌ |
| ¿Hay prerrequisito bloqueante no satisfecho? | ✅ / ⚠️ / ❌ |
| ¿Hay riesgo de regresión alto? | ✅ / ⚠️ / ❌ |
| ¿Rollback documentado y viable? | ✅ / ⚠️ / ❌ |
| **Semáforo final** | 🟢 Ejecutar / 🟡 Ejecutar con precaución / 🔴 No ejecutar |
| **Condición** | [qué debe satisfacerse primero] |

---

### SEMÁFORO P0 (tickets, clientes, cliente_accesos, ticket_respuestas_rapidas)

[Misma tabla que P0-bis]

---

### TABLA APROBAR / CORREGIR / POSPONER

| Item | Veredicto | Corrección sugerida (si aplica) |
|------|-----------|--------------------------------|
| P0-bis: SQL clientes_contactos | APROBAR / CORREGIR / POSPONER | [corrección si CORREGIR] |
| P0: Opción A vs Opción B para tickets | APROBAR / CORREGIR | [cuál opción recomiendas] |
| P0: SQL clientes | APROBAR / CORREGIR / POSPONER | |
| P0: SQL cliente_accesos | APROBAR / CORREGIR / POSPONER | |
| P0: Retirar quick-function | APROBAR / CORREGIR / POSPONER | |
| P1-3: Retirar super-service | APROBAR / CORREGIR / POSPONER | |
| P1-4: match-cliente header x-service-key | APROBAR / CORREGIR / POSPONER | |
| P2-1/2/3: Rate limits (4 endpoints) | APROBAR / CORREGIR / POSPONER | |
| P2-5: ticket_eventos en moveTicket | APROBAR / CORREGIR / POSPONER | |
| P3: Normalización God Table tickets | APROBAR / CORREGIR / POSPONER | |
| Storage: verificación visual primero | APROBAR / CORREGIR / POSPONER | |

---

### CHECKLIST MÍNIMO ANTES DE EJECUTAR CUALQUIER SQL

```
[ ] Item 1 — [descripción]
[ ] Item 2 — [descripción]
...
```

---

### CHECKLIST MÍNIMO ANTES DE CUALQUIER DEPLOY DE EF

```
[ ] Item 1 — [descripción]
[ ] Item 2 — [descripción]
...
```

---

### RANKING FINAL DE PRIORIDADES (TU ORDENAMIENTO)

[Tu orden recomendado de ejecución, con justificación breve para los casos donde difiere del orden propuesto en la auditoría]

```
1. [Item más urgente] — [razón]
2. [siguiente]
...
```

---

*Fin del scope ampliado. Este documento complementa `06_prompt_final_para_fable.md` y debe leerse junto con `01_hallazgos_criticos.md` y `03_sql_rls_a_revisar.md`.*
