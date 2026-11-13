# Cómo se monta un entorno (receta probada en pre-producción y desarrollo, 13 nov 2026)

Cada entorno es un proyecto de Railway con su propia base, autenticación, puerta de enlace y APIs. Esta es la secuencia que se usó; sirve igual para producción. **Nunca se duplica un entorno de producción** y los secretos solo viven en variables de Railway.

## 0. Antes de empezar
- Proyecto de Railway del entorno (`avotalent-development`, `avotalent-beta` = staging, producción) enlazado con la CLI en una carpeta fuera del repo (`railway link -p <proyecto> -e <entorno>`).
- Cuenta de Azure del entorno (`avotalentdev`, `avotalentstaging`, `avotalentprod`): acceso público desactivado. La cadena de conexión se pone con un comando que la pide oculta, nunca en el chat.
- Secretos propios del entorno (se generan, no se copian): `JWT_SECRET` (≥ 32 caracteres), contraseña del rol `authenticator`, llaves `anon` y `service_role` (`infra/scripts/make-keys.mjs`), `ANALYTICS_PROXY_SECRET`, `EMAIL_LINK_SECRET`, `ANALYTICS_SERVICE_KEY`.

## 1. Base de datos
1. `railway add --database postgres` (Postgres 18).
2. Roles y utilidades: `infra/db/00-roles.sql`, esquema `extensions` con `pgcrypto` y `uuid-ossp`, `CREATE SCHEMA auth`, y `infra/db/01-postgrest-reload.sql` (aviso automático a PostgREST). Contraseña del rol `authenticator`.
3. Esquema `auth`: lo crea GoTrue al arrancar (paso 2).
4. Esquema `public`:
   - **Pre-producción / producción:** restaurar el respaldo exacto (`pg_dump` formato custom, esquemas `public`, `auth` y `storage`).
   - **Desarrollo / local:** solo la estructura (`pg_restore -s -n public`) y el catálogo (habilidades, preguntas de examen: tablas `skills`, `skill_aliases`, `exam_questions`, `question_options`, `analytics_datacenter_places`). **Nada de datos de personas.**
5. Migraciones: `migrate baseline --apply` (una sola vez) y `migrate up --apply` (ver `packages/db/migrations/README.md`).
6. Pre-producción: anonimizar (`infra/db/anonymize-staging.sql`) antes de abrirla a nadie.

## 2. Servicios (en este orden)
| Servicio | Imagen / arranque | Notas |
|---|---|---|
| `gotrue` | `supabase/gotrue:v2.197.0` | Misma versión de migraciones que Supabase. `GOTRUE_MAILER_AUTOCONFIRM=true` y sin servidor de correo fuera de producción. |
| `postgrest` | `postgrest/postgrest:v16.5` | `PGRST_DB_URI` con el rol `authenticator`, `PGRST_JWT_SECRET` = `JWT_SECRET`, `PGRST_DB_MAX_ROWS=1000`. |
| `gateway` | Caddy (`infra/gateway`, con Dockerfile) | Une `/rest/v1` y `/auth/v1` en una sola dirección: es la `SUPABASE_URL` del backend. |
| `api-community`, `api-telemetry` | `cd backend && node dist/<entrada>.js` | Variables: `APP_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, los 3 secretos de analítica, `STORAGE_DRIVER=azure`, `AZURE_STORAGE_CONNECTION_STRING`, `FILES_BASE_URL`, `DATABASE_URL` (referencia a la base, para el corredor), y las tres `RAILPACK_*`. |
| `workers` | `cd backend && node dist/workers.js` | Solo corren tareas en producción y con `WORKERS_ENABLED=on`; en los demás entornos queda inactivo. |

`RAILPACK_INSTALL_CMD=npx pnpm@9.3.0 install`, `RAILPACK_BUILD_CMD=npx pnpm@9.3.0 --filter backend build`. Para alcanzar un servicio privado desde tu máquina: `railway ssh --service <servicio> -- "<comando>"` (la entrada estándar no pasa: los archivos se mandan como base64 en la línea de comando).

## 3. Datos del entorno
- **Desarrollo y local:** `node dist/scripts/seed-dev.js --apply` (10 empresas, 28 personas, 1 `dev-admin`, 90 vacantes y 6 discusiones, todo inventado; `--reset` lo limpia). Necesita `SEED_PASSWORD` y solo corre con `APP_ENV=development`. Los correos usan el dominio `dev.avotalent.invalid`: los dominios `example.*` y `*.test` hacen que la base marque la cuenta como «de prueba». Después, marcar a `dev-admin` como superadmin con SQL (el permiso no se cambia desde la aplicación). Si la fila de un superadmin sembrado debe borrarse, se hace con SQL.
- **Pre-producción:** copia anonimizada; archivos: solo `images` y `company-logos` (nunca las fotos de perfil reales).

## 4. Comprobaciones al terminar
1. `GET /` y `GET /api/community/flags` en `api-community`; `GET /api/admin/analytics/overview` sin sesión da 401 en `api-telemetry`.
2. Registro e inicio de sesión; el token de la comunidad abre el panel para un superadmin (200) y da 403 a una persona normal.
3. `migrate status`: sin pendientes. Lecturas (`/stats`, `/posts?type=job`) con datos.
4. Archivos: subir, leer por `/api/files/...` y enlace firmado de un documento.
5. El servicio `workers` contesta `{ ok: true, leader: false }` y no corre nada fuera de producción.

## 6. Pantallas en Vercel (pre-producción; mismo método para desarrollo)
1. Proyecto NUEVO por pantalla (`vercel project add avotalent-staging-community`, `avotalent-staging-telemetry`). Nunca se reutiliza el de producción.
2. Ajustes del proyecto por API (`vercel api /v9/projects/<id>?teamId=<equipo> -X PATCH --input archivo.json`): `rootDirectory` (`apps/community` o `apps/avocado`), `sourceFilesOutsideRootDirectory: true`, `framework: nextjs` y `nodeVersion: 24.x` (el valor por omisión, 26.x, es inválido y rompe el build).
3. Variables (`vercel env add NOMBRE production`, valor por stdin; las secretas con `--sensitive`; una `NEXT_PUBLIC_*` que parezca llave pide `--type config` a propósito):
   - App de personas: `NEXT_PUBLIC_API_URL`, `ANALYTICS_API_URL`, `NEXT_PUBLIC_API_KEY` (identificador del navegador), `API_KEY_SERVER` (secreta), `ANALYTICS_PROXY_SECRET` (secreta), `NEXT_PUBLIC_SITE_URL`, **`NEXT_PUBLIC_TRACKING=off`** (sin esto, un entorno que no es producción usaría el Google Analytics y el Clarity de AvoTalent por omisión).
   - Panel: `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_COMMUNITY_API_URL`, `NEXT_PUBLIC_API_KEY`.
4. Despliegue por CLI desde la raíz del repositorio con el vínculo local (`.vercel/project.json`, ignorado por git; para el segundo proyecto, variables `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`): `vercel deploy --prod --yes`. El `.vercelignore` de la raíz evita subir artefactos locales (`.next`, `node_modules`...): sin él el build remoto falla con errores de fuentes.
5. Activar la protección de Vercel (Vercel Authentication) antes de compartir la dirección.
6. Las APIs del entorno necesitan una dirección pública para que Vercel las alcance (`railway domain`), con `API_KEYS` ya puestas y verificadas ANTES de abrirla.
