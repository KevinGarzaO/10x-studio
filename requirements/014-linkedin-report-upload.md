# 014 — Reporte semanal de LinkedIn: subir el Excel y cuadrarlo con lo que medimos

Estado: **construido el 3 nov 2026**. Falta activarlo: correr `backend/sql/linkedin-report-migration.sql` en Supabase.

## Lo pedido (3 de noviembre de 2026)

Una pantalla en Telemetry para subir el Excel «Análisis conjunto» que exporta LinkedIn (se subirá todos los lunes), que lo lea, extraiga la información y permita **cuadrar qué funciona y qué no**.

## Qué trae el Excel (y qué no)

Siete hojas: DESCUBRIMIENTO (impresiones y miembros alcanzados del año), INTERACCIÓN (impresiones e interacciones por día), PUBLICACIONES MÁS RECIENTES (detalle completo, pero solo de las 3 últimas), PUBLICACIONES PRINCIPALES (dos listas de 50: por interacciones y por impresiones, sin más detalle), SEGUIDORES (total y nuevos por día) e INFORMACIÓN DETALLADA del público y del contenido (empresa, ubicación, tamaño, nivel, cargo y sector). **El detalle por publicación (clics en el enlace, reacciones...) solo existe para las 3 más recientes**; de las demás solo hay impresiones o interacciones. Las series por día sí cubren todo el año.

## Cómo quedó

- **Subida** en Telemetry > Analítica > Reporte LinkedIn: se sube el .xlsx tal cual (hasta 8 MB, solo superadmin; `POST /api/admin/analytics/linkedin-report`). El mismo archivo no se cuenta dos veces (huella). Un archivo que no es Excel o no trae las hojas de LinkedIn se rechaza con un mensaje.
- **Lectura** (`services/analytics/linkedin-report.ts`, librería `exceljs`): las hojas se buscan por nombre sin acentos (LinkedIn corta los nombres a 31 letras) y las columnas por su encabezado, nunca por posición. Si falta una hoja avisa en vez de fallar. En las 3 recientes una celda de conteo vacía es 0; en las listas de principales el dato que no viene queda como «sin saber».
- **Se guarda** (`linkedin-report-migration.sql`): una fila por subida, las series por día (lo más nuevo sustituye), lo que LinkedIn dijo de cada publicación en cada subida y la audiencia. Todas con RLS.
- **Cuadrar**: cada publicación de LinkedIn se une con la que publicó AvoTalent por el número largo del id (`...-share-7523...` en la dirección = `urn:li:share:7523...` que guardamos al publicar). Se compara lo que LinkedIn cuenta (impresiones, clics en el enlace) con las personas que AvoTalent midió entrando con el código de esa vacante (`utm_content`) y sus registros. Resultado por publicación (`judgePost`): **cuadra**; **revisar** (llegaron más personas de las que LinkedIn dice que hicieron clic); **pierde clics** (≥ 5 clics y llegaron menos de la mitad); **sin clics** (≥ 100 impresiones y ningún clic); **sin comparar** (salió antes de la medición propia, 30 oct 2026, o LinkedIn no dio sus clics); **no es de AvoTalent** (LinkedIn la incluye pero no la publicamos nosotros).
- **Qué funciona**: por tipo de vacante (puesto), llegadas por cada 1,000 impresiones, solo con publicaciones nuestras y medidas. Y la semana (últimos 7 días completos contra los 7 anteriores: impresiones, interacciones, seguidores nuevos) y quién te sigue / quién vio el contenido.
- Lo lee también el agente de producto: métrica `linkedin_report` de `get_panel_metric` (misma ruta, `GET /api/admin/analytics/linkedin-report`).

## Para activarlo

1. Supabase: correr `backend/sql/linkedin-report-migration.sql`.
2. Cada lunes: exportar de LinkedIn «Análisis conjunto» y subirlo en Reporte LinkedIn.

## Pruebas

`backend/tests/unit/linkedin-report.test.ts`: un Excel inventado con la misma forma (no se usa ningún dato real), la lectura de cada hoja, la unión de publicaciones entre hojas, las reglas de «cuadra», el reporte y la ruta de subida.
