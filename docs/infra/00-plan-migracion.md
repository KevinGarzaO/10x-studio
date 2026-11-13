# Plan de migración: Supabase → Railway + Azure, entornos y separación del monolito

Decidido el 13 de noviembre de 2026 por el fundador. Este documento es la fuente de verdad: cada fase se marca al terminar.


## Avance (se actualiza al terminar cada paso)

**13 nov 2026**
- Railway: proyecto de AvoTalent = **`alert-consideration`** (repo `KevinGarzaO/10x-studio`). El proyecto `impartial-inspiration` es de otro producto (Cargalo) y **no se toca**; `dazzling-kindness` está vacío.
- Producción (`production`): servicios `10x-studio` (backend), `daring-success` (agente MCP) y un `Postgres` (Postgres 18) que **hoy no usa nadie** (el backend no tiene `DATABASE_URL`; solo `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`). Ese Postgres será el destino de producción. No tiene acceso desde fuera (sin TCP proxy).
- El backend de producción **no tiene `APP_ENV`**. El nombre del entorno es `production` (`RAILWAY_ENVIRONMENT_NAME`), que es lo que usará la protección de la fase 1c.
- **Creado el entorno `qa`, vacío** (no se duplicó producción) con su propia base `Postgres-zXbi` (Postgres 18). Producción no cambió. El CLI de Railway quedó ligado a **qa** a propósito, para que un comando suelto no toque producción.
- Variables del backend de producción (solo nombres): 28 propias (llaves de Resend, Clarity, Gemini, Claude, LinkedIn, VAPID, interruptores de correos y LinkedIn…). **Ninguna de estas se copia a QA**: cada una se crea a mano con un valor de prueba o se deja sin definir para que lo externo quede apagado.

**Pendiente inmediato (lo bloquea):** herramientas de cliente de PostgreSQL (`pg_dump`/`psql`) en esta máquina, la cadena de conexión de Supabase en una variable de la terminal del fundador, y activar el *TCP Proxy* temporal de la base de QA para poder restaurar desde fuera de Railway.

## Decisiones tomadas

| # | Decisión | Elegido |
|---|---|---|
| 1 | Autenticación al salir de Supabase | **GoTrue (el motor de Supabase Auth, libre) en Railway** sobre la nueva base. Las 185 cuentas, contraseñas y vínculos con LinkedIn/GitHub se conservan. |
| 2 | Capa de datos | **PostgREST delante de Postgres.** El backend sigue usando el cliente actual (751 consultas, 50 funciones) y solo cambia la dirección. Se pasa a SQL directo poco a poco **después**, ya con entornos de prueba. |
| 3 | Primer paso | **Respaldo y entornos QA/dev.** |
| 4 | Archivos | **Azure Blob Storage**, contenedores **privados**, enlaces firmados de corta duración. |

## Estado hoy (medido)

- Código atado a Supabase: 751 llamadas `.from()` en 114 archivos, 50 `.rpc()`, 71 tablas, 65 migraciones SQL (3 dependen de `auth.users`).
- Supabase Auth: solo `getUser`, `signUp`, `signInWithPassword`, `refreshSession`, `admin.updateUserById`, `admin.signOut` + OAuth (LinkedIn, GitHub).
- Storage: 4 buckets. `images` 147 archivos / 288.8 MB, `company-logos` 89 / 9.5 MB, `avatars` 126 / 14.1 MB, `company-docs` 0. Las llamadas en el código usan `avatars` e `images`; **`company-logos` también existe y hay que migrarlo** (lo escriben las funciones del scraper).
- Datos: 185 cuentas, 1 038 vacantes, ~2 400 eventos. El volumen es chico (megas).
- Un solo entorno: cada `git push` a `master` va a producción.
- **Respaldo REST hecho el 13 nov 2026** en `C:\Users\kevin\AvoTalent-Backups\<fecha>\` (fuera del repo): 87 tablas/vistas verificadas fila por fila + los 4 buckets. Es solo datos y archivos: **falta el esquema exacto, funciones, disparadores y permisos**, que da `pg_dump` (Fase 0b).

## Arquitectura destino

```
                      Vercel                         Railway (entorno: prod | qa)                      Azure
  apps/community ──────────────┐
  apps/telemetry (panel) ──────┤        ┌──────────────┐   ┌─────────────┐
                               ├──────► │ api-community│──►│  gateway    │──► /rest/v1 → PostgREST ─► Postgres (Railway)
  agentes (MCP, LinkedIn) ─────┤        │ api-telemetry│   │ (Caddy)     │──► /auth/v1 → GoTrue ────►   (mismo Postgres)
                               │        └──────────────┘   └─────────────┘
                               │        ┌──────────────┐                              Blob Storage (privado)
                               └──────► │ workers      │ (crons: scraper, correos, LinkedIn, fotos…) ─► avatars · images · company-logos · company-docs
                                        └──────────────┘
```

`supabase-js` espera **una sola dirección** con `/rest/v1` y `/auth/v1`: por eso el `gateway` (Caddy) las enruta a PostgREST y GoTrue. `SUPABASE_URL` pasa a apuntar al gateway y `SUPABASE_SERVICE_KEY` a un JWT firmado con el secreto nuevo.

## Fases (cada una se puede revertir)

### Fase 0 — Respaldo (hoy)
- [x] 0a. Respaldo REST de solo lectura y verificado (`backend/scripts/backup-supabase-rest.ts`).
- [ ] 0b. Respaldo exacto con `pg_dump` (esquemas `public` y `auth`, funciones, disparadores, RLS). **Necesita:** la cadena de conexión de la base (Supabase → Project Settings → Database → Connection string, modo *Session/Direct*) puesta en una variable de entorno **en tu terminal**, nunca en el chat; y las herramientas de cliente de PostgreSQL (`pg_dump`, `psql`) instaladas.
- [ ] 0c. Copia del respaldo a un lugar seguro y privado (Azure Blob, contenedor `backups`, cifrado).

### Fase 1 — Entornos (hoy y mañana)
- [ ] 1a. **dev (local):** `infra/docker-compose.dev.yml` levanta Postgres + PostgREST + GoTrue + gateway + Mailpit. Necesita **Docker Desktop** (no está instalado en esta máquina).
- [ ] 1b. **qa (Railway):** entorno nuevo con **su propia** base, **vacío** al inicio y luego con datos anonimizados del respaldo. **Nunca** duplicar producción tal cual: copiaría las variables y el QA dispararía crons, correos y publicaciones de LinkedIn contra datos reales.
- [ ] 1c. **Protección por entorno:** variable `APP_ENV` (`development` | `qa` | `production`). Fuera de `production`: sin crons, sin correos, sin LinkedIn, sin push. Se implementa **después** de confirmar el nombre real del entorno de producción en Railway (`RAILWAY_ENVIRONMENT_NAME`), para que producción no se quede sin crons por accidente.
- [ ] 1d. **Vercel:** las vistas previas por rama ya existen; apuntarlas al backend de QA, no al de producción.
- [ ] 1e. Flujo: `feature/*` → PR → pruebas automáticas → despliegue a QA → revisión → `master` (producción). Protección de la rama `master`.

### Fase 2 — Base de datos a Railway (ensayo en QA primero)
1. Postgres en el entorno QA de Railway; crear los roles `anon`, `authenticated`, `service_role` y `authenticator` (`infra/db/00-roles.sql`).
2. GoTrue arranca y **crea su propio esquema `auth`**; luego se restauran los datos de `auth` (usuarios, identidades, contraseñas) **con la misma versión de GoTrue** que tiene Supabase hoy (se lee de `auth.schema_migrations`). Riesgo principal de la fase: diferencia de versión.
3. Restaurar `public` desde `pg_dump`; PostgREST; gateway.
4. Verificar: conteo por tabla igual al manifiesto del respaldo; las pruebas del backend pasan contra QA; inicio de sesión con correo, LinkedIn y GitHub; un recorrido completo (registrar, completar perfil, postular).
5. **Producción:** ventana de mantenimiento corta (la base es chica: minutos), mismo procedimiento ya ensayado, `SUPABASE_URL`/llaves cambian a la dirección nueva, comprobación y, **si algo falla, vuelta atrás cambiando las variables a Supabase** (que se queda intacto y encendido durante una semana como red de seguridad).

### Fase 3 — Archivos a Azure Blob
1. Cuenta de almacenamiento en Azure con **acceso público desactivado**, contenedores `avatars`, `images`, `company-logos`, `company-docs`, `backups`; cifrado en reposo (por defecto) y TLS obligatorio.
2. Acceso del backend por **identidad administrada** (si el backend corre en Azure) o por cadena de conexión/SAS **en variables de entorno de Railway** con permisos mínimos; nunca en el código.
3. Un módulo único `backend/services/storage/` (interfaz: subir, bajar, enlace firmado, borrar) reemplaza las 9 llamadas a `supabase.storage`. Los avatares y logos que se muestran públicamente salen por enlaces firmados de vida corta o por un CDN con firma.
4. Copia de los archivos existentes (312 MB) con verificación de huella SHA-256 contra el respaldo, y **reescritura de las URLs** guardadas en la base (`photo_url`, `company_logo`, `image_url`).
5. Mantener Supabase Storage una semana de respaldo.

### Fase 4 — Separar el monolito (después de la Fase 2)
Servicios dentro del mismo repositorio (monorepo con pnpm), cada uno con su despliegue:

| Servicio | Qué contiene hoy en `backend/` | Notas |
|---|---|---|
| `services/api-community` | rutas `/api/community/*`, auth de la comunidad, push, aplicaciones, feed | API pública de la app |
| `services/api-telemetry` | rutas `/api/admin/analytics/*`, recolección `/api/analytics/*`, webhook de Resend | puede escalar aparte; la recolección es la más pesada |
| `services/workers` | `cron.service.ts`, scraper, correos, LinkedIn, fotos semanales, ocultado del feed, matches | **un solo** proceso con los crons: acaba con el riesgo de doble disparo con varias réplicas de la API |
| `services/agents` | agente de LinkedIn (semana 1), futuros agentes | su propio tope de gasto y llaves |
| `packages/db` | cliente de datos, tipos, **corredor de migraciones** (hoy se pegan a mano en Supabase) | |
| `packages/*` ya existentes | `schemas`, `mcp-analytics` | |
| `apps/community` | app de personas (Vercel) | |
| `apps/telemetry` | el panel de telemetría | hoy vive en `apps/avocado` mezclado con el estudio viejo |
| `apps/studio` (archivo) | el estudio de contenido viejo (`(dashboard)`) | ya no está en la navegación: se archiva o se retira |

Orden: primero extraer `packages/db` y el corredor de migraciones; luego `workers`; luego dividir la API en las dos; al final el panel. **Una pieza por vez, cada una desplegada y estable antes de la siguiente.**

## Riesgos y cómo se controlan

| Riesgo | Control |
|---|---|
| Pérdida de datos | Respaldo REST verificado (hecho) + `pg_dump` + Supabase intacto una semana |
| QA que dispara correos o publica en LinkedIn | QA se crea **vacío y con variables explícitas**; `APP_ENV` apaga lo externo |
| Diferencia de versión de GoTrue (cuentas inválidas) | Misma versión que Supabase; ensayo con las 185 cuentas en QA antes de producción |
| Cambio de llaves JWT (sesiones activas se cierran) | Aviso previo; las personas inician sesión de nuevo una vez |
| Caída durante el corte | Ventana corta, ensayada, con vuelta atrás por variables |
| Secretos expuestos | Solo en variables de Railway/Azure; nunca en el repo ni en el chat; rotar la llave de servicio de Supabase al terminar |

## Pasos del fundador (uno por uno, en este orden)

1. En tu terminal: `railway login` (se abre el navegador). Después me avisas y yo conecto el CLI al proyecto.
2. Instalar **Docker Desktop** y las herramientas de cliente de PostgreSQL (para `pg_dump`).
3. Poner la cadena de conexión de Supabase en una variable de tu terminal (te doy el comando exacto; no la pegues en el chat).
4. Crear la cuenta de almacenamiento de Azure (te doy los valores exactos) y pasarme **solo el nombre** de la cuenta, no las claves.
5. Decidir la ventana de mantenimiento de producción (propuesta: madrugada de un domingo, de 20 a 40 minutos).
