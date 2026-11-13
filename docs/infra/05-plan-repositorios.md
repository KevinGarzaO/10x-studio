# Plan: un repositorio por pieza en la organización Avotalent

Decidido el 13 de noviembre de 2026. Los 10 repositorios ya existen, **privados y vacíos**, en https://github.com/Avotalent. Este documento dice qué va en cada uno, cómo se mueve el código con su historial, cómo se comparten `core` y `db`, y en qué orden se cambian los despliegues. Todo avance entra por pull request (regla del dueño); la **importación inicial** de cada repositorio es la única excepción, porque un repositorio vacío no tiene con qué abrir un PR.

## 1. Qué va en cada repositorio

| Repositorio | Contenido (rutas del repo actual) | Se publica / despliega |
|---|---|---|
| `avotalent-db` | `packages/db`, y `backend/sql/*.sql` como `legacy-sql/` (la línea base) | Paquete `@avotalent/db` |
| `avotalent-core` | `packages/core` (con el historial de `backend/services`, `lib`, `config`), `packages/schemas` (renombrado a `@avotalent/schemas`), y el código HTTP compartido por las APIs: `backend/middleware/*` y `backend/src/apps/base.ts` bajo `http/` | Paquetes `@avotalent/core` y `@avotalent/schemas` |
| `avotalent-api-community` | `backend/api-community.ts`, `src/apps/community.ts`, `src/routes/community/*`, `src/routes/files.routes.ts`, `src/routes/admin/exam-questions.routes.ts` | Railway |
| `avotalent-api-telemetry` | `backend/api-telemetry.ts`, `src/apps/telemetry.ts`, `src/routes/admin/*` (menos exámenes), `src/routes/analytics`, `src/routes/webhooks`, `routes/*`, `controllers/*` | Railway |
| `avotalent-workers` | `backend/workers.ts` y lo que arranque solo los crons | Railway (una copia) |
| `avotalent-agents` | Nuevo: definiciones de agentes; primero las instrucciones del jefe de producto (`docs/product-agent/`) | — (más adelante, un servicio) |
| `avotalent-mcp-analytics` | `packages/mcp-analytics` | Railway (`daring-success`) |
| `avotalent-community` | `apps/community` | Vercel |
| `avotalent-telemetry` | `apps/avocado` (se renombra: aquí ya es la raíz del repositorio) | Vercel |
| `avotalent-infra` | `docs/infra/`, `infra/`, `docs/product-agent` hasta que exista `agents`, `CLAUDE.md` raíz como guía general, y la historia de decisiones | — |

La API completa (`backend/index.ts`) **no se migra**: es la forma «todo junto» de hoy en producción y desaparece cuando producción corra con `api-community`, `api-telemetry` y `workers` por separado.

## 2. A qué repositorio va cada prueba (clasificado por sus importaciones)

| Pruebas | Repositorio |
|---|---|
| Lógica compartida: `core` (29), `core` que usan SQL (16), esquemas y servicios de examen/skills (8) | `avotalent-core` |
| SQL contra Postgres en memoria sin lógica (11) | `avotalent-db` (o `core`, donde viva la función que prueban) |
| Rutas de la comunidad (32) | `avotalent-api-community` |
| Rutas de telemetría, panel y estudio (13) | `avotalent-api-telemetry` |
| Middleware y forma de la API: `api-key`, `api-split`, `public-cache`, `require-*` (5) | `avotalent-core` (`http/`) |
| Líder, arrendamiento y crons (5) | `avotalent-workers` y `avotalent-core` |

Las pruebas dejan de apuntar al código fuente de `core` por un alias: cada repositorio instala `@avotalent/core` ya publicado.

## 3. Cómo se comparten `core` y `db`

- **GitHub Packages (npm privado de la organización).** Los paquetes son `@avotalent/db`, `@avotalent/core` y `@avotalent/schemas`. `@avocado/schemas` se renombra a `@avotalent/schemas` en todo el código.
- Versionado semántico por etiqueta (`v0.1.0`). Un cambio que cruza piezas = cambio en el paquete + versión nueva + subir la versión en el consumidor, cada paso por su PR.
- Cada repositorio consumidor lleva un `.npmrc` con `@avotalent:registry=https://npm.pkg.github.com` y `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`.
- **`NPM_TOKEN`:** un token de GitHub **solo de lectura de paquetes**, guardado como variable en Railway, Vercel y en los secretos de Actions. Es una llave más del plan de rotación de 30 días.
- Límite del plan Free: 500 MB de paquetes. Sobra: cada paquete pesa unos MB.

## 4. Cómo se mueve el código con su historial

1. Se instala `git-filter-repo` (herramienta de Python) en la máquina de trabajo.
2. Para cada repositorio se clona el actual en una carpeta temporal **fuera del repo**, se filtran las rutas con `git filter-repo --path ... --path-rename ...` (conserva los commits que tocaron esas rutas, incluidas las rutas viejas de `backend/services` para `core`), y se prueba localmente (instalar, compilar, pruebas).
3. Se sube a la organización: la rama `main` con el historial filtrado.
4. Desde ese momento los cambios van por PR en el repositorio nuevo. El repositorio viejo (`KevinGarzaO/10x-studio`) queda como origen hasta cambiar el último despliegue, y luego se archiva.

## 5. GitHub Actions (se crean junto con cada repositorio)

- **Todos:** instalar, `tsc`, pruebas, en cada PR.
- **`db` y `core`:** al poner una etiqueta `vX.Y.Z`, construir y publicar el paquete.
- **APIs y workers:** pruebas en el PR y, tras fusionar, despliegue a pre-producción; el de producción pide aprobación manual.
- **Pantallas:** igual, con el despliegue de Vercel.
- **Migraciones:** siguen siendo manuales; ningún flujo las aplica solo.

## 6. Orden de la mudanza (una pieza por vez, cada una verificada)

1. `avotalent-db` (la más chica; todos dependen de ella).
2. `avotalent-core` (+ `schemas`), publicar `v0.1.0` de ambos paquetes.
3. `avotalent-mcp-analytics` (ya es independiente).
4. `avotalent-workers`.
5. `avotalent-api-telemetry`.
6. `avotalent-api-community`.
7. `avotalent-community` y `avotalent-telemetry` (cambia la raíz del proyecto de Vercel: se prueba primero en desarrollo y pre-producción).
8. `avotalent-infra` y `avotalent-agents`.

Para cada pieza: **extraer → probar local → subir → probar en desarrollo → probar en pre-producción → recién entonces apuntar producción**. Nunca se toca producción antes de ensayar la pieza en los otros dos entornos. Vuelta atrás: el repositorio viejo sigue desplegable hasta cerrar la pieza.

## 7. Lo que necesito de ti, en su momento (uno por uno)

- Instalar la aplicación de GitHub de **Railway** y la de **Vercel** en la organización Avotalent, para que puedan construir desde los repositorios nuevos.
- Crear el token de lectura de paquetes (`NPM_TOKEN`) y ponerlo con un comando que lo pide oculto.
- Decidir si pasas a GitHub Team (para proteger ramas en repositorios privados; con Free, la regla «todo por PR» se cumple por disciplina).

## 8. Riesgos

| Riesgo | Control |
|---|---|
| Duplicar código por cortar mal | Se corta por rutas y se verifica con instalar, compilar y pruebas antes de subir |
| Versiones de `core` desalineadas entre APIs | Versiones fijas por etiqueta; cada consumidor sube la suya por PR |
| Un cambio rompe a varios repositorios | `core` y `db` publican solo con pruebas verdes; los consumidores prueban contra la versión publicada |
| Token de paquetes filtrado | Solo lectura de paquetes, en variables selladas/sensibles y rotado cada 30 días |
| Producción tocada antes de tiempo | Orden fijo: desarrollo → pre-producción → producción, por pieza |
