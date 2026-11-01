# 011 — Velocidad: medir el servidor y las pantallas del feed y la vacante

Estado: **construido el 1 nov 2026**. Falta activarlo: correr `backend/sql/api-timing-migration.sql` en Supabase (editor SQL; no depende de otras migraciones y se puede correr más de una vez).

## Lo pedido

Punto D del sprint de noviembre («Velocidad real»). Se platicó el 1 de noviembre y el dueño respondió:

> «de momento el más lento es el feed y el de las vacantes, y lo del registro haz el que baste para ayudarnos a mejorarlo»

Es decir: las dos pantallas lentas son el **feed** y la **vacante**, y el registro de tiempos debe ser el mínimo que alcance para decidir qué mejorar (un resumen, no el detalle).

## Decisiones

- **Primero medir, después acelerar.** Hoy solo se medía el tiempo de carga de los pasos de los flujos críticos. No se sabía cuánto tarda cada ruta ni cuál es la lenta, y acelerar sin eso es adivinar.
- **Resumen por hora, no peticiones sueltas.** Por hora, método y ruta se guardan: peticiones, errores (5xx), tiempo total, la más lenta y cuántas cayeron en cada uno de ocho rangos (hasta 50, 100, 250, 500, 1000, 2500, 5000 ms y más). De los rangos se estiman la **mediana** y el **p95** («hasta N ms»). No se guardan direcciones con parámetros, ni personas, ni cuerpos. Se conservan 30 días.
- **La ruta es la que declaró Express** (`/api/community/posts/:id`), no la dirección pedida: las vacantes no se cuentan una por una y lo que no coincide con ninguna ruta (robots buscando huecos) es un solo renglón.
- **Medir no estorba.** El resumen vive en memoria y se manda cada minuto; si la base no contesta o falta la migración, el servidor sigue y reintenta (con tope de memoria). No se miden `/api/analytics/*` (latidos y envíos de medición) ni las OPTIONS.
- **Navegador.** «Ver el feed» (hasta las primeras tarjetas) y «Ver una vacante» (hasta mostrarla) son dos flujos nuevos que usan la infraestructura de los flujos críticos: aparecen en Flujos críticos con su tiempo, su abandono (se fue antes de verla lista) y su frustración (más de 2.5 s). El paso de inicio lleva el tiempo de carga completa de la página cuando es la primera de la visita (el caso de quien llega desde LinkedIn).
- **Pantalla**: Tráfico web > **Velocidad** (`/panel/trafico/velocidad`, `GET /api/admin/analytics/performance?days=1|7|30`), con un cuadro aparte para las rutas del feed y la vacante y la tabla de todas las rutas (buscable).

## Para activarlo

1. Supabase (editor SQL): `api-timing-migration.sql`.
2. Después del despliegue, dejarlo correr 2 o 3 días con uso real.
3. Leer Tráfico web > Velocidad (rutas con más tiempo total y con p95 mayor a 1 s) y Flujos críticos > Ver el feed / Ver una vacante. Con eso se decide qué corregir primero.

## Pruebas

`backend/tests/unit/api-timing.test.ts` (rangos, suma por hora, reintento, tope de memoria, el middleware por ruta declarada, y la migración contra Postgres real con PGlite) y `apps/community/tests/page-timing.test.tsx`.
