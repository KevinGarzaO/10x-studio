-- Microsoft Clarity: las métricas de frustración por página (rage clicks, dead clicks, quickbacks y scroll).
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente. No depende de las migraciones de analítica web.
--
-- Clarity NO nos deja pedir el historial: su API de exportación (https://www.clarity.ms/export-data/api/v1/project-live-insights)
-- solo entrega las últimas 24 h, máximo 10 llamadas al día por proyecto y 1000 filas. Por eso se guarda UNA FILA POR DÍA Y PÁGINA:
-- un cron diario (services/analytics/clarity.ts) la llena y así queda historia propia para cruzarla con el embudo.
--
-- `day` es el día de Monterrey en que se hizo la consulta (cubre las 24 h anteriores a ese momento).
-- `path` es la ruta sin dominio ni parámetros (/vacantes/mi-vacante).

CREATE TABLE IF NOT EXISTS analytics_clarity_metrics (
  day               date        NOT NULL,
  path              text        NOT NULL,
  sessions          int         NOT NULL DEFAULT 0,
  page_views        int         NOT NULL DEFAULT 0,
  rage_clicks_count int         NOT NULL DEFAULT 0,
  dead_clicks_count int         NOT NULL DEFAULT 0,
  quick_backs_count int         NOT NULL DEFAULT 0,
  avg_scroll_depth  numeric(5,2),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, path)
);

CREATE INDEX IF NOT EXISTS analytics_clarity_metrics_path_idx ON analytics_clarity_metrics (path, day DESC);

-- Igual que el resto de tablas: cerrada a la llave pública. Solo el backend (service_role) y el servidor MCP (rol de solo lectura) la leen.
ALTER TABLE analytics_clarity_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_clarity_metrics FROM PUBLIC, anon, authenticated;
