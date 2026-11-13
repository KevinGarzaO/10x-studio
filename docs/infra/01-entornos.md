# Los cuatro entornos de AvoTalent

Decidido el 13 de noviembre de 2026. Cada entorno es una **pila completa e independiente**: su propio proyecto, backend, base de datos, autenticación, archivos y secretos. Ningún entorno comparte base, llaves ni cuentas con otro.

| | **Local** | **Desarrollo** | **Beta** | **Producción** |
|---|---|---|---|---|
| Para qué | Programar y probar en tu máquina | Integrar y probar lo que sube el equipo | **Producto beta con personas reales invitadas** | Todo el público |
| Dónde corre | Docker en tu máquina | Proyecto Railway `avotalent-development` | Proyecto Railway `avotalent-beta` | Proyecto Railway `alert-consideration` (hoy; renombrar a `avotalent-production`) |
| Rama de git | cualquiera | `develop` | `beta` | `master` |
| `APP_ENV` | `development` | `development` | `beta` | `production` |
| Base de datos | Postgres en Docker | Postgres propio | Postgres propio | Postgres propio (el que ya existe) |
| Autenticación | GoTrue en Docker | GoTrue propio | GoTrue propio | GoTrue propio |
| Archivos | Azurite (emulador de Azure) | Cuenta de Azure propia | Cuenta de Azure propia | Cuenta de Azure propia |
| App de personas | `localhost:3002` | Vercel, dirección propia | `beta.avotalent.app` | `avotalent.app` |
| Panel de telemetría | `localhost:3000` | Vercel, propio | Vercel, propio | `telemetry.avotalent.app` |
| Datos | Inventados (semillas) | Inventados | **Reales** de sus propias personas | **Reales** |
| Correos | Buzón local (Mailpit), nunca salen | Apagados | Reales, de su propio remitente y llave | Reales |
| LinkedIn / push | Apagados | Apagados | Push propio; LinkedIn apagado | Reales |
| Apps OAuth (LinkedIn, GitHub) | Propias de prueba | Propias de prueba | Propias | Las actuales |

## Reglas que no se rompen

1. **Beta tiene datos personales reales**, así que tiene las mismas protecciones que producción: respaldo diario, acceso restringido, aviso de privacidad vigente (el mismo texto legal) y borrado en cascada de una cuenta. Sus personas son **solo las invitadas a la beta**; no se copian cuentas de producción a beta.
2. **Nunca se copian secretos de un entorno a otro** ni se duplica un entorno de producción: la copia traería llaves reales y las tareas programadas dispararían correos o publicaciones.
3. **El entorno decide lo externo** (`backend/config/app-env.ts`). Se toma de `APP_ENV` y, si falta, del nombre del entorno de Railway (cada proyecto tiene su entorno llamado `development`, `beta` o `production`), así que **producción no necesita ninguna variable nueva**. Cualquier otra cosa (tu máquina, un valor mal escrito) es `development`: todo lo externo apagado. Las tareas programadas (scraper, correos, fotos semanales, ocultado del feed, matches) corren en **beta y producción**; en **desarrollo nunca**. La publicación en el LinkedIn del fundador es **solo de producción**.
4. **Los cambios suben en orden:** `feature/*` → `develop` (despliega a Desarrollo) → `beta` (despliega a Beta, se prueba con las personas invitadas) → `master` (despliega a Producción). Las ramas `beta` y `master` quedan protegidas (solo por solicitud de cambio, con pruebas verdes).
5. **Cada entorno tiene sus propias llaves** (JWT, Resend, VAPID, OAuth, Azure, Anthropic, Gemini). Se guardan solo en las variables del proyecto de Railway/Vercel o de Azure, nunca en el repositorio ni en el chat.

## Política de variables del backend, por entorno

Lista tomada de producción (28 variables propias). «Apagado» = sin definir o con el valor que desactiva la función.

| Variable | Local | Desarrollo | Beta | Producción |
|---|---|---|---|---|
| `APP_ENV` | development | development | beta | production |
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
| Beta | `beta.avotalent.app` | `beta-telemetry.avotalent.app` | `beta-api.avotalent.app` |
| Producción | `avotalent.app` | `telemetry.avotalent.app` | la actual de Railway |

## Estado

- [x] Producción: existe (`alert-consideration`).
- [x] Desarrollo: proyecto Railway `avotalent-development`, entorno `development` (vacío).
- [x] Beta: proyecto Railway `avotalent-beta`, entorno `beta` (vacío).
- [x] El entorno `qa` que se había creado dentro del proyecto de producción se borró (estaba vacío).
- [x] `APP_ENV` en el código (`config/app-env.ts`): tareas programadas solo en beta y producción; LinkedIn solo en producción.
- [ ] Local: `infra/docker-compose.dev.yml` (borrador, sin probar; falta Azurite y Docker en la máquina).
- [ ] `APP_ENV` en producción y en el código.
- [ ] Cuentas de Azure por entorno, dominios, apps OAuth de prueba, ramas `develop` y `beta`.
