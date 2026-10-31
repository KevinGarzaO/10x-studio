-- Telemetría: errores (con su video de Clarity) y flujos críticos (tiempos, abandono y frustración).
--
-- Corre MANUAL en el editor SQL de Supabase, DESPUÉS de web-analytics-migration.sql y clarity-migration.sql. Es idempotente.
--
-- Decisiones de diseño (frente al diseño original):
--   * `session_id` NO es llave foránea de analytics_sessions: un error puede llegar antes de que la sesión se haya guardado, y una
--     llave foránea haría que ese error (justo el más interesante: el de la primera carga) se perdiera. Las funciones de abajo
--     comprueban que la sesión exista y sea de ese mismo navegador; si no, el error se guarda sin sesión en vez de perderse.
--   * `user_id` y `client_id` salen de la SESIÓN que ya tenemos (nunca de lo que diga el navegador), igual que el resto de la analítica.
--   * No se copia la dirección del video en cada error: se une al leer con analytics_clarity_links, así siempre es la más reciente
--     (el enlace llega unos segundos después de abrir la sesión, a veces después del error).
--   * Los flujos llevan un `flow_id` por intento: sin él no se puede saber cuántos intentos se completaron frente a cuántos se abandonaron.
--   * El abandono no depende de que el navegador alcance a avisar: un intento sin cierre tras 30 minutos cuenta como abandonado.
--   * Todo excluye al equipo, las cuentas de prueba y los robots (se filtra por analytics_real_sessions).

-- ------------------------------------------------------------------------------------------------
-- 1. Errores
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_error_logs (
  id                  bigserial    PRIMARY KEY,
  session_id          uuid,
  user_id             text,
  client_id           text,
  path                text         NOT NULL,
  error_name          varchar(150) NOT NULL,
  error_message       text         NOT NULL,
  stack_trace         text,
  -- El stack ya separado: [{ "file": "/_next/static/chunks/app.js", "fn": "onClick", "line": 12, "col": 30 }, ...]
  frames              jsonb,
  -- Agrupa lo que es "el mismo error": nombre + mensaje sin números/ids + primer lugar del stack.
  fingerprint         text         NOT NULL,
  error_source        varchar(20)  NOT NULL DEFAULT 'frontend' CHECK (error_source IN ('frontend', 'backend', 'api')),
  browser_info        text,
  context             jsonb,
  -- En qué segundo de la sesión pasó: para saltar al momento del fallo en el video.
  seconds_into_session int,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_error_logs_created_idx     ON analytics_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_error_logs_fingerprint_idx ON analytics_error_logs (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_error_logs_session_idx     ON analytics_error_logs (session_id);
CREATE INDEX IF NOT EXISTS analytics_error_logs_user_idx        ON analytics_error_logs (user_id);

ALTER TABLE analytics_error_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_error_logs FROM PUBLIC, anon, authenticated;

-- Guarda un error. Devuelve false si lo descartó (el mismo error del mismo navegador en el último minuto: así un error
-- dentro de un ciclo no llena la tabla).
--   p = { session_id?, client_id?, path, name, message, stack?, frames?, fingerprint, source?, browser_info?, context? }
CREATE OR REPLACE FUNCTION analytics_record_error(p jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_session uuid;
  v_user    text;
  v_started timestamptz;
  v_client  text := NULLIF(p->>'client_id', '');
BEGIN
  IF COALESCE(p->>'fingerprint', '') = '' OR COALESCE(p->>'name', '') = '' THEN RETURN false; END IF;

  IF v_client IS NOT NULL AND EXISTS (
    SELECT 1 FROM analytics_error_logs
    WHERE fingerprint = p->>'fingerprint' AND client_id = v_client AND created_at > now() - interval '1 minute'
  ) THEN
    RETURN false;
  END IF;

  -- La sesión solo se liga si existe y es de ese mismo navegador; de ahí sale la cuenta (nunca del navegador).
  IF NULLIF(p->>'session_id', '') IS NOT NULL THEN
    SELECT s.session_id, s.user_id::text, s.created_at INTO v_session, v_user, v_started
    FROM analytics_sessions s
    WHERE s.session_id = (p->>'session_id')::uuid AND s.client_id = v_client;
  END IF;
  -- Un error del SERVIDOR (no pasa por el navegador) puede traer la cuenta de quien hacía la petición.
  IF v_user IS NULL AND p->>'source' = 'backend' THEN v_user := NULLIF(p->>'server_user_id', ''); END IF;

  INSERT INTO analytics_error_logs (session_id, user_id, client_id, path, error_name, error_message, stack_trace, frames, fingerprint, error_source, browser_info, context, seconds_into_session)
  VALUES (
    v_session, v_user, v_client,
    COALESCE(NULLIF(p->>'path', ''), '/'),
    left(p->>'name', 150),
    left(COALESCE(p->>'message', ''), 2000),
    left(p->>'stack', 8000),
    CASE WHEN jsonb_typeof(p->'frames') = 'array' THEN p->'frames' END,
    left(p->>'fingerprint', 120),
    CASE WHEN p->>'source' IN ('frontend', 'backend', 'api') THEN p->>'source' ELSE 'frontend' END,
    left(p->>'browser_info', 200),
    CASE WHEN jsonb_typeof(p->'context') = 'object' THEN p->'context' END,
    CASE WHEN v_started IS NOT NULL THEN GREATEST(0, extract(epoch FROM now() - v_started))::int END
  );
  RETURN true;
END;
$$;

-- Los errores agrupados (el mismo error en la misma página), los más frecuentes primero, con el video del más reciente que lo tenga.
CREATE OR REPLACE FUNCTION analytics_error_summary(p_days int DEFAULT 7, p_limit int DEFAULT 50)
RETURNS TABLE (
  fingerprint text, error_name text, error_message text, path text, error_source text,
  occurrences int, people_affected int, first_seen timestamptz, last_seen timestamptz,
  stack_trace text, frames jsonb, sample_session_id uuid, clarity_url text, seconds_into_session int
)
LANGUAGE sql STABLE AS $$
  WITH e AS (
    SELECT * FROM analytics_error_logs
    WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND (session_id IS NULL OR session_id IN (SELECT session_id FROM analytics_real_sessions))
  ),
  agg AS (
    SELECT e.fingerprint AS fp, COUNT(*)::int AS occ, COUNT(DISTINCT COALESCE(e.user_id, e.client_id))::int AS people,
           MIN(e.created_at) AS first_at, MAX(e.created_at) AS last_at
    FROM e GROUP BY e.fingerprint
  ),
  latest AS (SELECT DISTINCT ON (e.fingerprint) e.* FROM e ORDER BY e.fingerprint, e.created_at DESC),
  video AS (
    SELECT DISTINCT ON (e.fingerprint) e.fingerprint AS fp, e.session_id AS sid, l.clarity_session_url AS url, e.seconds_into_session AS secs
    FROM e JOIN analytics_clarity_links l ON l.session_id = e.session_id
    ORDER BY e.fingerprint, e.created_at DESC
  )
  SELECT agg.fp, latest.error_name::text, latest.error_message, latest.path, latest.error_source::text,
         agg.occ, agg.people, agg.first_at, agg.last_at,
         latest.stack_trace, latest.frames, video.sid, video.url, video.secs
  FROM agg JOIN latest ON latest.fingerprint = agg.fp LEFT JOIN video ON video.fp = agg.fp
  ORDER BY agg.occ DESC, agg.last_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- ------------------------------------------------------------------------------------------------
-- 2. Flujos críticos
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_flow_metrics (
  id               bigserial   PRIMARY KEY,
  flow_id          uuid        NOT NULL,
  session_id       uuid,
  user_id          text,
  client_id        text,
  flow_name        varchar(50) NOT NULL CHECK (flow_name ~ '^[a-z][a-z0-9_]{1,49}$'),
  step_name        varchar(50) NOT NULL CHECK (step_name ~ '^[a-z][a-z0-9_]{0,49}$'),
  step_order       int         NOT NULL CHECK (step_order BETWEEN 0 AND 50),
  path             text,
  -- Cuánto pasó desde el paso anterior (lo que tardó la persona) y cuánto tardó la app en responder en ESTE paso.
  duration_ms      int         NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  load_time_ms     int         NOT NULL DEFAULT 0 CHECK (load_time_ms >= 0),
  status           varchar(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'dropped_off', 'error')),
  -- El paso con el que termina el intento con éxito (completeFlow).
  is_final         boolean     NOT NULL DEFAULT false,
  rage_clicks      int         NOT NULL DEFAULT 0,
  -- Lenta (más de 2500 ms de carga) o con rage clicks: lo decide el servidor, no el navegador.
  has_frustration  boolean     NOT NULL DEFAULT false,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_flow_metrics_flow_idx    ON analytics_flow_metrics (flow_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_flow_metrics_run_idx     ON analytics_flow_metrics (flow_id);
CREATE INDEX IF NOT EXISTS analytics_flow_metrics_session_idx ON analytics_flow_metrics (session_id);
CREATE INDEX IF NOT EXISTS analytics_flow_metrics_created_idx ON analytics_flow_metrics (created_at DESC);

ALTER TABLE analytics_flow_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_flow_metrics FROM PUBLIC, anon, authenticated;

-- Un número que llega como texto, acotado a [0, tope]: lo que no sea un número (o sea enorme) no hace fallar el guardado.
CREATE OR REPLACE FUNCTION analytics_clamp_int(p_value text, p_max int) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_value ~ '^-?[0-9]{1,15}(\.[0-9]+)?$' THEN GREATEST(0, LEAST(p_value::numeric, p_max))::int ELSE 0 END;
$$;

-- Guarda un paso de un flujo.
--   p = { flow_id, session_id?, client_id?, flow_name, step_name, step_order, path?, duration_ms?, load_time_ms?, status?, is_final?, rage_clicks?, error_message? }
CREATE OR REPLACE FUNCTION analytics_record_flow_step(p jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_session uuid;
  v_user    text;
  v_client  text := NULLIF(p->>'client_id', '');
  v_load    int  := analytics_clamp_int(p->>'load_time_ms', 600000);
  v_rage    int  := analytics_clamp_int(p->>'rage_clicks', 1000);
BEGIN
  IF NULLIF(p->>'flow_id', '') IS NULL OR NULLIF(p->>'flow_name', '') IS NULL OR NULLIF(p->>'step_name', '') IS NULL THEN RETURN false; END IF;

  IF NULLIF(p->>'session_id', '') IS NOT NULL THEN
    SELECT s.session_id, s.user_id::text INTO v_session, v_user
    FROM analytics_sessions s
    WHERE s.session_id = (p->>'session_id')::uuid AND s.client_id = v_client;
  END IF;

  INSERT INTO analytics_flow_metrics (flow_id, session_id, user_id, client_id, flow_name, step_name, step_order, path, duration_ms, load_time_ms, status, is_final, rage_clicks, has_frustration, error_message)
  VALUES (
    (p->>'flow_id')::uuid, v_session, v_user, v_client,
    p->>'flow_name', p->>'step_name', analytics_clamp_int(p->>'step_order', 50),
    left(NULLIF(p->>'path', ''), 300),
    analytics_clamp_int(p->>'duration_ms', 86400000),
    v_load,
    CASE WHEN p->>'status' IN ('completed', 'dropped_off', 'error') THEN p->>'status' ELSE 'completed' END,
    COALESCE(p->>'is_final' = 'true', false),
    v_rage,
    (v_load > 2500 OR v_rage >= 1),
    left(p->>'error_message', 500)
  );
  RETURN true;
END;
$$;

-- Un intento de flujo por fila: cómo terminó. Sin cierre y de hace más de 30 minutos = abandonado.
CREATE OR REPLACE VIEW analytics_flow_runs AS
SELECT m.flow_id, m.flow_name,
       MIN(m.created_at) AS started_at,
       MAX(m.created_at) AS last_step_at,
       (array_agg(m.session_id) FILTER (WHERE m.session_id IS NOT NULL))[1] AS session_id,
       COALESCE((array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL))[1], (array_agg(m.client_id) FILTER (WHERE m.client_id IS NOT NULL))[1]) AS person,
       SUM(m.duration_ms)::int AS total_duration_ms,
       AVG(NULLIF(m.load_time_ms, 0))::int AS avg_load_ms,
       bool_or(m.has_frustration) AS has_frustration,
       CASE
         WHEN bool_or(m.is_final AND m.status = 'completed') THEN 'completed'
         WHEN bool_or(m.status = 'error') THEN 'error'
         WHEN bool_or(m.status = 'dropped_off') OR MAX(m.created_at) < now() - interval '30 minutes' THEN 'dropped_off'
         ELSE 'in_progress'
       END AS outcome
FROM analytics_flow_metrics m
WHERE m.session_id IS NULL OR m.session_id IN (SELECT session_id FROM analytics_real_sessions)
GROUP BY m.flow_id, m.flow_name;

-- Tablero por flujo: intentos, personas, cierre, abandono, tiempos y fallos técnicos.
CREATE OR REPLACE FUNCTION analytics_flow_summary(p_days int DEFAULT 30)
RETURNS TABLE (
  flow_name text, runs_started int, people_started int, runs_completed int, people_completed int,
  runs_dropped int, runs_error int, runs_in_progress int,
  completion_rate_pct numeric, dropoff_rate_pct numeric,
  avg_duration_ms int, avg_load_time_ms int, frustrated_runs int
)
LANGUAGE sql STABLE AS $$
  WITH r AS (SELECT * FROM analytics_flow_runs WHERE started_at >= now() - make_interval(days => GREATEST(p_days, 1)))
  SELECT r.flow_name::text,
         COUNT(*)::int,
         COUNT(DISTINCT r.person)::int,
         COUNT(*) FILTER (WHERE r.outcome = 'completed')::int,
         COUNT(DISTINCT r.person) FILTER (WHERE r.outcome = 'completed')::int,
         COUNT(*) FILTER (WHERE r.outcome = 'dropped_off')::int,
         COUNT(*) FILTER (WHERE r.outcome = 'error')::int,
         COUNT(*) FILTER (WHERE r.outcome = 'in_progress')::int,
         -- Los que siguen en curso no cuentan ni como cierre ni como abandono todavía.
         ROUND(100.0 * COUNT(*) FILTER (WHERE r.outcome = 'completed') / NULLIF(COUNT(*) FILTER (WHERE r.outcome <> 'in_progress'), 0), 1),
         ROUND(100.0 * COUNT(*) FILTER (WHERE r.outcome = 'dropped_off') / NULLIF(COUNT(*) FILTER (WHERE r.outcome <> 'in_progress'), 0), 1),
         ROUND(AVG(r.total_duration_ms) FILTER (WHERE r.outcome = 'completed'))::int,
         ROUND(AVG(r.avg_load_ms))::int,
         COUNT(*) FILTER (WHERE r.has_frustration)::int
  FROM r GROUP BY r.flow_name ORDER BY COUNT(*) DESC;
$$;

-- Paso a paso de cada flujo: cuántos intentos llegan a cada paso, cuántos siguieron a uno posterior (el resto se quedó ahí),
-- cuánto tardan, cuántos fallan o se frustran. El paso "abandoned" que manda el navegador al irse NO es un paso que la persona
-- haya elegido: se deja fuera para que no parezca que siguió.
CREATE OR REPLACE FUNCTION analytics_flow_steps(p_days int DEFAULT 30)
RETURNS TABLE (
  flow_name text, step_name text, step_order int, reached int, continued int, is_final boolean,
  avg_duration_ms int, avg_load_time_ms int, errors int, frustrated int, rage_clicks int
)
LANGUAGE sql STABLE AS $$
  WITH m AS (
    SELECT * FROM analytics_flow_metrics
    WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND step_name <> 'abandoned'
      AND (session_id IS NULL OR session_id IN (SELECT session_id FROM analytics_real_sessions))
  ),
  run_max AS (SELECT flow_id, MAX(step_order) AS mx FROM m GROUP BY flow_id)
  SELECT m.flow_name::text, m.step_name::text, m.step_order,
         COUNT(DISTINCT m.flow_id)::int,
         COUNT(DISTINCT m.flow_id) FILTER (WHERE run_max.mx > m.step_order)::int,
         bool_or(m.is_final),
         ROUND(AVG(m.duration_ms))::int,
         ROUND(AVG(NULLIF(m.load_time_ms, 0)))::int,
         COUNT(*) FILTER (WHERE m.status = 'error')::int,
         COUNT(*) FILTER (WHERE m.has_frustration)::int,
         COALESCE(SUM(m.rage_clicks), 0)::int
  FROM m JOIN run_max ON run_max.flow_id = m.flow_id
  GROUP BY m.flow_name, m.step_name, m.step_order
  ORDER BY m.flow_name, m.step_order, m.step_name;
$$;

-- ------------------------------------------------------------------------------------------------
-- 3. Permisos: solo el backend (y el rol de solo lectura del MCP, ver packages/mcp-analytics/README.md).
-- ------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION analytics_record_error(jsonb)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_record_flow_step(jsonb)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_clamp_int(text, int)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_error_summary(int, int)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_flow_summary(int)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_flow_steps(int)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON analytics_flow_runs                             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION analytics_record_error(jsonb)       TO service_role;
GRANT EXECUTE ON FUNCTION analytics_record_flow_step(jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION analytics_clamp_int(text, int)      TO service_role;
GRANT EXECUTE ON FUNCTION analytics_error_summary(int, int)   TO service_role;
GRANT EXECUTE ON FUNCTION analytics_flow_summary(int)         TO service_role;
GRANT EXECUTE ON FUNCTION analytics_flow_steps(int)           TO service_role;
GRANT SELECT ON analytics_flow_runs                           TO service_role;
