-- Microsoft Clarity: las métricas de frustración por página (rage clicks, dead clicks, quickbacks y scroll).
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente. La parte de las métricas no depende de nada; la de los enlaces a las
-- grabaciones (abajo) necesita que ya exista analytics_sessions (web-analytics-migration.sql).
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

-- ------------------------------------------------------------------------------------------------
-- El enlace a la GRABACIÓN de cada sesión.
--
-- Clarity no entrega enlaces por API, pero su reproductor tiene una dirección conocida que se arma con tres datos que el
-- propio script de Clarity deja en cookies de nuestro dominio: https://clarity.microsoft.com/player/<proyecto>/<usuario>/<sesión>.
-- El navegador la arma y la manda (apps/community/lib/clarity.ts); aquí se guarda ligada a NUESTRA sesión de analítica.
-- Es una tabla aparte (y no una columna de analytics_sessions) para no tocar la vista analytics_real_sessions.
-- Solo hay video si Clarity grabó esa sesión: se muestrea, se conserva unos 30 días y no graba a quien bloquea el script.
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_clarity_links (
  session_id          uuid PRIMARY KEY,
  clarity_session_url text        NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE analytics_clarity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_clarity_links FROM PUBLIC, anon, authenticated;

-- Solo acepta la dirección del reproductor de Clarity (el panel muestra esto como un enlace: nada más debe poder entrar) y
-- solo de una sesión que exista y sea de ese mismo navegador (client_id), como los latidos.
CREATE OR REPLACE FUNCTION analytics_set_clarity_url(p_session uuid, p_client text, p_url text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF p_url IS NULL OR p_url !~ '^https://clarity\.microsoft\.com/player/[A-Za-z0-9]{1,32}/[A-Za-z0-9]{1,64}/[A-Za-z0-9]{1,64}$' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics_sessions WHERE session_id = p_session AND client_id = p_client) THEN
    RETURN false;
  END IF;
  INSERT INTO analytics_clarity_links (session_id, clarity_session_url) VALUES (p_session, p_url)
  ON CONFLICT (session_id) DO UPDATE SET clarity_session_url = EXCLUDED.clarity_session_url, updated_at = now();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION analytics_set_clarity_url(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_set_clarity_url(uuid, text, text) TO service_role;
