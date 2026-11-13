# Los cuatro entornos de AvoTalent

Decidido el 13 de noviembre de 2026 y **revisado el mismo día**: la beta con personas reales ya no es un entorno aparte, es un **grupo de personas dentro de producción** (interruptores por grupo, `02-interruptores.md`). Es como lo hacen las apps grandes: la gente de la beta usa el producto real, con los datos reales, y ve las funciones nuevas antes que los demás. Un entorno de beta con otra base de datos tendría datos distintos y no probaría nada.

Cada entorno es una **pila completa e independiente**: su propio proyecto, backend, base de datos, autenticación, archivos y secretos. Ningún entorno comparte base, llaves ni cuentas con otro.

| | **Local** | **Desarrollo** | **Pre-producción (staging)** | **Producción** |
|---|---|---|---|---|
| Para qué | Programar y probar en tu máquina | Integrar y probar lo que sube el equipo | Ensayar una versión y una migración con una copia ANONIMIZADA de producción antes de subirla | Todo el público, **incluida la beta** (un grupo de personas) |
| Dónde corre | Docker en tu máquina | Proyecto Railway `avotalent-development` | Proyecto Railway `avotalent-beta` (se puede renombrar `avotalent-staging`; su entorno de Railway se llama `beta`) | Proyecto Railway `alert-consideration` (hoy; renombrar a `avotalent-production`) |
| Rama de git | cualquiera | `develop` | `staging` | `master` |
| `APP_ENV` | `development` | `development` | `staging` | `production` |
| Base de datos | Postgres en Docker | Postgres propio | Postgres propio (copia anonimizada con `infra/db/anonymize-staging.sql`) | Postgres propio (hoy: Supabase; ver el plan de migración) |
| Autenticación | GoTrue en Docker | GoTrue propio | GoTrue propio (autoconfirmación, sin correos) | GoTrue propio |
| Archivos | Azurite (emulador de Azure) | Cuenta de Azure propia | Cuenta de Azure propia | Cuenta de Azure propia |
| App de personas | `localhost:3002` | Vercel, dirección propia | Vercel, dirección propia (privada) | `avotalent.app` (la beta: `beta.avotalent.app` contra la API de producción, con los interruptores) |
| Datos | Inventados (semillas) | Inventados | **Anonimizados**: sin correos, nombres, fotos, CV, sesiones ni push | **Reales** |
| Correos / LinkedIn / push / scraper | Apagados | Apagados | **Apagados siempre** (no hay llaves puestas) | Reales |

## Reglas que no se rompen

1. **Pre-producción tiene una copia de producción**, así que se anonimiza ANTES de abrirla a nadie (`infra/db/anonymize-staging.sql`: cuentas sin contraseña, sin correos reales, sin sesiones). Nunca recibe llaves de Resend, LinkedIn, Clarity ni VAPID. Los respaldos con datos reales viven fuera del repositorio.
2. **Nunca se copian secretos de un entorno a otro** ni se duplica un entorno de producción: la copia traería llaves reales y las tareas programadas dispararían correos o publicaciones.
3. **El entorno decide lo externo** (`backend/config/app-env.ts`). Se toma de `APP_ENV` y, si falta, del nombre del entorno de Railway (`beta` se lee como `staging`). Cualquier otra cosa es `development`. Las tareas programadas (scraper, correos, fotos semanales, ocultado del feed, matches) y la publicación en el LinkedIn del fundador corren **solo en `production`**.
4. **Los cambios suben en orden:** `feature/*` → `develop` → `staging` → `master`. Las funciones nuevas llegan a producción **apagadas** y se encienden por pasos (equipo, beta, 1 %, 10 %, 25 %, 50 %, todos). `staging` y `master` quedan protegidas (solo por solicitud de cambio, con pruebas verdes).
5. **Cada entorno tiene sus propias llaves** (JWT, Resend, VAPID, OAuth, Azure, Anthropic, Gemini), solo en variables de Railway/Vercel/Azure, nunca en el repositorio ni en el chat.
6. **Despliegue en Railway:** el constructor nuevo (Railpack) no detecta el arranque del monorepo; el servicio del backend lleva `RAILPACK_START_CMD`, `RAILPACK_BUILD_CMD` y `RAILPACK_INSTALL_CMD` como variables (los mismos comandos de `railway.toml`). Hay que copiarlas al mudar producción.

## Política de variables del backend, por entorno

Lista tomada de producción (28 variables propias). «Apagado» = sin definir o con el valor que desactiva la función.

| Variable | Local | Desarrollo | Staging | Producción |
|---|---|---|---|---|
| `APP_ENV` | development | development | staging | production |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (hoy; después las del gateway propio) | locales | propias | propias | propias |
| `COMMUNITY_APP_URL`, `BACKEND_URL` | localhost | su dirección | su dirección | las actuales |
| `ANALYTICS_PROXY_SECRET`, `ANALYTICS_SERVICE_KEY`, `EMAIL_LINK_SECRET` | propias | propias | propias | las actuales |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | sin definir | sin definir | **propias** | las actuales |
| `WELCOME_EMAILS`, `WELCOME_FOUNDERS_EMAILS`, `PROFILE_REMINDER_EMAILS`, `INVITE_EMAILS`, `MATCH_ALERTS`, `MATCH_DIGEST` | apagado | apagado | encendidos solo los que se prueben | los actuales |
| `LINKEDIN_VACANCY_POSTS`, `LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI` | apagado | app OAuth de prueba, publicación apagada | app OAuth propia, publicación **apagada** | las actuales |
| `PUSH_NOTIFICATIONS`, `VAPID_*` | apagado | apagado | propias | las actuales |
| `FEED_HIDE_UNSERVED` | apagado | apagado | encendido para probar | `on` (actual) |
| `CLARITY_API_KEY`, `CLARITY_SYNC` | sin definir | sin definir | sin definir | las actuales |
| `GEMINI_API_KEY`, `CLAUDE_API_KEY` | sin definir o llave con tope bajo | llave propia con tope bajo | llave propia con tope bajo | las actuales |
| Azure Blob (nuevas) | Azurite | cuenta propia | cuenta propia | cuenta propia |

## Azure (archivos)

Una **cuenta de almacenamiento por entorno** (el nombre debe ser único en todo Azure, solo minúsculas y números, 3 a 24 caracteres): `avotalentdev`, `avotalentbeta`, `avotalentprod`. En cada una: acceso público **desactivado**, TLS obligatorio, contenedores privados `avatars`, `images`, `company-logos`, `company-docs` y `backups`, y una identidad o clave **solo de ese entorno**. En local se usa Azurite y no se toca Azure.

## Dominios propuestos (se confirman al crearlos)

| Entorno | App de personas | Panel | API |
|---|---|---|---|
| Desarrollo | `dev.avotalent.app` | `dev-telemetry.avotalent.app` | `dev-api.avotalent.app` |
| Staging | `staging.avotalent.app` | `staging-telemetry.avotalent.app` | `staging-api.avotalent.app` |
| Producción | `avotalent.app` (beta: `beta.avotalent.app`) | `telemetry.avotalent.app` | la actual de Railway |

## Estado (13 de noviembre de 2026)

- [x] Producción: existe (`alert-consideration`).
- [x] Desarrollo: proyecto Railway `avotalent-development`, entorno `development` (vacío).
- [x] Staging (`avotalent-beta`): Postgres 18 con el respaldo exacto de Supabase restaurado y anonimizado (conteos verificados), PostgREST v16.5, GoTrue v2.197.0 (misma versión de migraciones que Supabase), puerta de enlace Caddy y backend con `APP_ENV=staging`. Todo privado (sin dirección pública). Registro e inicio de sesión probados.
- [x] `APP_ENV` en el código (`config/app-env.ts`): tareas programadas y LinkedIn solo en producción.
- [x] Interruptores por grupo (`02-interruptores.md`).
- [ ] App de personas y panel apuntando a staging (Vercel), con dirección privada.
- [ ] Local: `infra/docker-compose.dev.yml` (borrador, sin probar; falta Azurite y Docker en la máquina).
- [ ] Cuentas de Azure por entorno, dominios, apps OAuth de prueba, ramas `develop` y `staging`.
- [ ] Mudanza de producción (ventana corta de mantenimiento, regreso por variables): `00-plan-migracion.md`.
