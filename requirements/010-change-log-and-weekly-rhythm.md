# 010 — Bitácora de cambios y Ritmo de la semana

Estado: **construido el 1 nov 2026**. Falta activarlo: correr en Supabase (editor SQL, en este orden y después de las migraciones de analítica web, segmentos y telemetría) `backend/sql/product-changes-migration.sql` y `backend/sql/web-analytics-rhythm-migration.sql`. Las dos se pueden correr más de una vez.

## Lo pedido (1 de noviembre de 2026)

> «podemos empezar a hacer el 0, ya que es 1 de noviembre y también antes del 0 el que habíamos dicho para el agente de jefe de producto, que es lo de los cambios como medición de cambios»

Dos piezas, en este orden:

1. **Bitácora de cambios** (la base que necesita el agente de jefe de producto, E de diciembre): qué se cambió y cuándo, para medir qué pasó antes y después. Se empieza ya para que haya ~2 meses de historia cuando arranque E.
2. **0 de noviembre, «Ritmo de la semana»**: medir los días y las horas flojas (texto completo en `BACKLOG.md`, punto 0).

## Bitácora de cambios

- **Tabla `product_changes`** (`shipped_at`, título, tipo, área, qué número se esperaba mover, `commit_sha` único, origen `manual | git | deploy`). Cerrada a anon/authenticated (RLS).
- **Se llena de tres maneras**: (a) al arrancar el backend tras un despliegue de Railway, `recordDeployFromEnv()` anota el commit con la hora REAL del despliegue (usa `RAILWAY_GIT_COMMIT_SHA` y `RAILWAY_GIT_COMMIT_MESSAGE`; no hace nada fuera de Railway; si ese commit ya estaba traído de git, corrige su hora); (b) `npm run log-changes` (en `backend/`) trae de git lo que se subió; sin `--apply` solo lo muestra; (c) `npm run log-change -- "Qué cambió" --kind config --area email --expects "registros"` para lo que no es un commit (un interruptor en Railway, un cambio de horario...).
- **Qué commits cuentan**: solo `feat`, `fix` y `perf` (lo que la gente ve). `docs`, `test`, `chore`, `refactor` y merges no mueven los números y se ignoran. El alcance del commit (`fix(feed): ...`) se vuelve el área.
- **Antes/después en SQL, una sola definición**: `analytics_window_metrics(desde, hasta)` y `analytics_change_impact(ventana, límite, desde)`. Por cada cambio compara 3, 7 o 14 días antes con otros tantos después: sesiones, personas activas por día, personas nuevas activas, registros (de `users`, que tiene más historia) y errores. Lo usan el panel y el MCP.
- **Honestidad**: antes/después **no prueba una causa**. Cada fila dice cuántos días MEDIDOS hay de cada lado (la medición de sesiones empezó el 30 de octubre de 2026) y cuántos otros cambios cayeron en la misma ventana (`nearbyChanges`), y da una etiqueta: `comparable`, `mezclado` (3 o más cambios cerca), `sin_base` (menos de 2 días medidos antes) o `pendiente` (aún no pasa un día de medición después). Los promedios se dividen entre días medidos, nunca entre días que aún no existían; si no hay días, queda «—», no un cero.
- **Panel**: Tráfico web > **Cambios** (`/panel/trafico/cambios`, API `GET /api/admin/analytics/changes?window=3|7|14`).
- **MCP**: herramienta nueva `get_change_log` (`windowDays`, `sinceDays`, `limit`). El rol de solo lectura del README ahora también puede leer `product_changes`, las dos funciones nuevas y las columnas `is_test_account` e `is_scraper_profile` de `users` (el README se prueba contra Postgres real).

## Ritmo de la semana

- **Mapa de calor** `analytics_rhythm_heatmap(días)`: personas activas por día de la semana y hora de Monterrey, como **promedio por vez que pasó esa hora**. Solo cuentan horas completas desde que existe la medición: las horas anteriores al 30 de octubre a las 14:13 no son «horas sin gente», no existen, y la hora en curso tampoco cuenta. Una hora medida sin gente (cero real) se ve distinta a una nunca medida (rayas).
- **Una fila por día** `analytics_rhythm_days(días)`: personas activas, nuevas, **las que ya tenían cuenta** (nuestra gente que volvió), origen de cada persona activa (LinkedIn, correo, directo, otro; el de su primera sesión activa del día; suman el total), solo visita (ruido), sesiones y registros.
- **Contra su normal** (`services/analytics/rhythm.ts`, reglas puras y probadas): cada día se compara con la **mediana del mismo día de la semana** en las últimas 4 semanas, y solo si hay **al menos 3**; mientras no, dice «aún no hay base». **Día flojo** = por debajo de la mitad de su normal, y su normal es de al menos 4 personas (la mitad de 3 es ruido). El primer día de la medición (empezó a media jornada) y el día en curso nunca se juzgan ni sirven de muestra. Con la medición del 30 de octubre, las primeras bases completas llegan hacia la tercera semana de noviembre.
- **Qué se publicó cada día** en la misma fila: publicaciones de LinkedIn (de 4 al día, todos los días), correos enviados (`email_quota`) y cambios de la bitácora. Cada fuente es tolerante: si su tabla no existe, queda en cero.
- **Panel**: Tráfico web > **Ritmo de la semana** (`/panel/trafico/ritmo`, API `GET /api/admin/analytics/web/rhythm?days=7|30|90`). Se actualiza sola cada 10 s como el resto.
- **Queda para diciembre (F)**: la alarma de «día muerto» a media tarde, el resumen semanal y las activaciones para traer a nuestra gente.

## Pruebas

- `backend/tests/unit/product-changes-sql.test.ts` y `rhythm-sql.test.ts`: las migraciones reales contra Postgres (PGlite).
- `backend/tests/unit/product-changes.test.ts` y `rhythm.test.ts`: reglas puras, el registro del despliegue y las rutas.
- `packages/mcp-analytics/tests/server.test.ts`: `get_change_log` y el rol de solo lectura.

## Para activarlo

1. Supabase (editor SQL): `product-changes-migration.sql` y `web-analytics-rhythm-migration.sql`. Si ya usas el rol `avo_mcp_reader`, vuelve a correr el bloque SQL del README del MCP para darle los permisos nuevos.
2. Traer el historial: `cd backend && npm run log-changes -- --since 2026-10-30` (revisa la lista) y luego `-- --apply`.
3. Desde el siguiente despliegue en Railway cada commit `feat`/`fix`/`perf` se anota solo con su hora real. Para lo que no es un commit, `npm run log-change`.
