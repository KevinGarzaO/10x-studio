-- Analítica web propia de AvoTalent (modelo y reglas de GA4): sesiones, vistas de página y eventos.
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente (se puede correr dos veces).
-- Las escribe SOLO el backend (service role) y las lee el panel; ninguna fila sale por la API pública.
-- Va en paralelo a landing_visits / vacancy_events / user_activity_daily hasta que las cifras cuadren.
--
-- Reglas (GA4):
--   * Sesión "activa" (is_engaged) = 10 s o más con la pestaña visible, O 2 o más vistas de página, O un evento clave.
--   * Una persona es user_id si lo tiene (tras el "stitching") y si no, client_id.
--   * Los días son de Monterrey (America/Monterrey).
--
-- Sin llaves foráneas hacia users a propósito (dos referencias entre users y otra tabla rompían los embeds de
-- PostgREST con PGRST201). Las de session_id sí: son de nuestras propias tablas.

-- ------------------------------------------------------------------------------------------------
-- 1. Tipos
-- ------------------------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE analytics_device_category AS ENUM ('desktop', 'mobile', 'tablet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_id        UUID PRIMARY KEY,
  client_id         VARCHAR(64) NOT NULL,
  user_id           UUID,
  entry_path        TEXT NOT NULL,
  exit_path         TEXT,
  country           VARCHAR(100),
  region            VARCHAR(100),
  city              VARCHAR(100),
  device_category   analytics_device_category,
  operating_system  VARCHAR(50),
  os_version        VARCHAR(30),
  browser           VARCHAR(50),
  browser_version   VARCHAR(30),
  language          VARCHAR(10),
  screen_resolution VARCHAR(20),
  timezone          VARCHAR(64),
  utm_source        VARCHAR(100),
  utm_medium        VARCHAR(100),
  utm_campaign      VARCHAR(100),
  utm_term          VARCHAR(100),
  utm_content       VARCHAR(100),
  referrer_host     VARCHAR(255),
  is_new_visitor    BOOLEAN NOT NULL DEFAULT FALSE,
  page_views_count  INT NOT NULL DEFAULT 1,
  duration_seconds  INT NOT NULL DEFAULT 0,
  is_engaged        BOOLEAN NOT NULL DEFAULT FALSE,
  has_conversion    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_sessions_client_idx     ON analytics_sessions (client_id);
CREATE INDEX IF NOT EXISTS analytics_sessions_user_idx       ON analytics_sessions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_sessions_engaged_idx    ON analytics_sessions (is_engaged);
CREATE INDEX IF NOT EXISTS analytics_sessions_activity_idx   ON analytics_sessions (last_activity_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_created_idx    ON analytics_sessions (created_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_entry_idx      ON analytics_sessions (entry_path);

CREATE TABLE IF NOT EXISTS analytics_page_views (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES analytics_sessions (session_id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  query_params JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_page_views_session_idx ON analytics_page_views (session_id);
CREATE INDEX IF NOT EXISTS analytics_page_views_created_idx ON analytics_page_views (created_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES analytics_sessions (session_id) ON DELETE CASCADE,
  user_id      UUID,
  event_name   VARCHAR(100) NOT NULL,
  event_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_conversion BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx    ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_params_idx  ON analytics_events USING GIN (event_params);

-- Cerradas a la API pública (ver enable-rls-migration.sql): solo el backend, con la llave de servicio, las usa.
ALTER TABLE analytics_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events     ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------------------------
-- 3. Escritura (cada función es UNA transacción: la regla de "sesión activa" no se puede quedar a medias)
-- ------------------------------------------------------------------------------------------------

-- Abre una sesión y su primera vista de página. Idempotente: si el navegador reintenta, no duplica.
CREATE OR REPLACE FUNCTION analytics_start_session(p jsonb) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_rows int;
  v_new  boolean;
BEGIN
  v_new := NOT EXISTS (SELECT 1 FROM analytics_sessions WHERE client_id = p->>'client_id');

  INSERT INTO analytics_sessions (
    session_id, client_id, entry_path, exit_path, country, region, city, device_category, operating_system, os_version,
    browser, browser_version, language, screen_resolution, timezone, utm_source, utm_medium, utm_campaign, utm_term,
    utm_content, referrer_host, is_new_visitor
  ) VALUES (
    (p->>'session_id')::uuid, p->>'client_id', p->>'entry_path', p->>'entry_path', p->>'country', p->>'region', p->>'city',
    NULLIF(p->>'device_category', '')::analytics_device_category, p->>'operating_system', p->>'os_version',
    p->>'browser', p->>'browser_version', p->>'language', p->>'screen_resolution', p->>'timezone',
    p->>'utm_source', p->>'utm_medium', p->>'utm_campaign', p->>'utm_term', p->>'utm_content', p->>'referrer_host', v_new
  ) ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    INSERT INTO analytics_page_views (session_id, path, query_params)
    VALUES ((p->>'session_id')::uuid, p->>'entry_path', p->'query_params');
  END IF;
  RETURN v_rows = 1;
END $$;

-- Latido: los segundos con la pestaña visible. Nunca puede pasar de lo que de verdad ha durado la sesión (+5 s de
-- margen), así un navegador que miente no infla el tiempo. 10 s o más = sesión activa.
CREATE OR REPLACE FUNCTION analytics_heartbeat(p_session_id uuid, p_client_id text, p_seconds int) RETURNS void
LANGUAGE sql AS $$
  UPDATE analytics_sessions s
  SET duration_seconds = GREATEST(s.duration_seconds, LEAST(GREATEST(p_seconds, 0), (EXTRACT(EPOCH FROM (NOW() - s.created_at)))::int + 5)),
      last_activity_at = NOW(),
      is_engaged = s.is_engaged OR LEAST(GREATEST(p_seconds, 0), (EXTRACT(EPOCH FROM (NOW() - s.created_at)))::int + 5) >= 10
  WHERE s.session_id = p_session_id AND s.client_id = p_client_id;
$$;

-- Otra página en la misma sesión: 2 o más vistas = sesión activa.
CREATE OR REPLACE FUNCTION analytics_record_page_view(p_session_id uuid, p_client_id text, p_path text, p_query jsonb) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE analytics_sessions
  SET page_views_count = page_views_count + 1,
      exit_path = p_path,
      last_activity_at = NOW(),
      is_engaged = is_engaged OR (page_views_count + 1) >= 2
  WHERE session_id = p_session_id AND client_id = p_client_id;

  IF FOUND THEN
    INSERT INTO analytics_page_views (session_id, path, query_params) VALUES (p_session_id, p_path, p_query);
  END IF;
END $$;

-- Un evento. Si es clave (conversión), la sesión queda activa y con conversión. Quién decide qué es conversión es el
-- servidor (lista fija), no el navegador.
CREATE OR REPLACE FUNCTION analytics_record_event(p_session_id uuid, p_client_id text, p_name text, p_params jsonb, p_is_conversion boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_user uuid;
BEGIN
  UPDATE analytics_sessions
  SET last_activity_at = NOW(),
      has_conversion = has_conversion OR p_is_conversion,
      is_engaged = is_engaged OR p_is_conversion
  WHERE session_id = p_session_id AND client_id = p_client_id
  RETURNING user_id INTO v_user;

  IF FOUND THEN
    INSERT INTO analytics_events (session_id, user_id, event_name, event_params, is_conversion)
    VALUES (p_session_id, v_user, p_name, COALESCE(p_params, '{}'::jsonb), p_is_conversion);
  END IF;
END $$;

-- User stitching: al registrarse o iniciar sesión, TODAS las sesiones y eventos anónimos de ese navegador pasan a ser
-- de esa persona. Una sola transacción: o se unen las dos tablas o ninguna. Solo toca filas sin dueño.
CREATE OR REPLACE FUNCTION analytics_stitch_user(p_client_id text, p_user_id uuid) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_sessions int;
BEGIN
  UPDATE analytics_sessions SET user_id = p_user_id WHERE client_id = p_client_id AND user_id IS NULL;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  UPDATE analytics_events e
  SET user_id = p_user_id
  FROM analytics_sessions s
  WHERE e.session_id = s.session_id AND s.client_id = p_client_id AND e.user_id IS NULL;

  RETURN v_sessions;
END $$;

-- ------------------------------------------------------------------------------------------------
-- 4. Lectura para el panel
-- ------------------------------------------------------------------------------------------------

-- Las sesiones que cuentan: sin el equipo, sin cuentas de prueba y sin perfiles del scraper (igual que el resto del panel).
-- person_key: la persona es su user_id si ya la reconocimos y, si no, su navegador.
CREATE OR REPLACE VIEW analytics_real_sessions AS
SELECT s.*, COALESCE(s.user_id::text, s.client_id) AS person_key,
       (s.created_at AT TIME ZONE 'America/Monterrey')::date AS day_mty
FROM analytics_sessions s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.user_id IS NULL
   OR (NOT COALESCE(u.is_test_account, FALSE) AND NOT COALESCE(u.is_scraper_profile, FALSE) AND COALESCE(u.user_kind, 'user') <> 'superadmin');

-- El primer día (Monterrey) de un periodo de p_days días que termina hoy.
CREATE OR REPLACE FUNCTION analytics_period_start(p_days int) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT ((NOW() AT TIME ZONE 'America/Monterrey')::date - (GREATEST(p_days, 1) - 1));
$$;

-- DAU, WAU y MAU por día: personas distintas con al menos una sesión activa ese día / esos 7 / esos 30 días.
CREATE OR REPLACE FUNCTION analytics_active_users(p_days int DEFAULT 30)
RETURNS TABLE (day date, dau int, wau int, mau int)
LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT d::date AS d FROM generate_series(analytics_period_start(p_days), (NOW() AT TIME ZONE 'America/Monterrey')::date, '1 day') d
  ),
  active AS (
    SELECT day_mty AS d, person_key
    FROM analytics_real_sessions
    WHERE is_engaged AND day_mty >= analytics_period_start(p_days) - 29
    GROUP BY day_mty, person_key
  )
  SELECT days.d,
         (SELECT COUNT(DISTINCT person_key)::int FROM active WHERE active.d = days.d),
         (SELECT COUNT(DISTINCT person_key)::int FROM active WHERE active.d BETWEEN days.d - 6 AND days.d),
         (SELECT COUNT(DISTINCT person_key)::int FROM active WHERE active.d BETWEEN days.d - 29 AND days.d)
  FROM days ORDER BY days.d;
$$;

-- Embudo de candidatos: personas que llegan -> ven el detalle de una vacante -> empiezan a postular -> se registran
-- o completan la postulación, con el avance y el abandono entre cada paso.
CREATE OR REPLACE FUNCTION analytics_funnel(p_days int DEFAULT 30)
RETURNS TABLE (step int, label text, people int, from_previous_pct numeric, dropoff_pct numeric, from_start_pct numeric)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT session_id, person_key FROM analytics_real_sessions WHERE day_mty >= analytics_period_start(p_days)
  ),
  ev AS (
    SELECT s.person_key, e.event_name
    FROM analytics_events e JOIN s ON s.session_id = e.session_id
  ),
  steps AS (
    SELECT 1 AS step, 'Entraron al sitio (sesiones de entrada)' AS label, COUNT(DISTINCT person_key)::int AS people FROM s
    UNION ALL
    SELECT 2, 'Vieron el detalle de una vacante', COUNT(DISTINCT person_key)::int FROM ev WHERE event_name = 'click_view_job_detail'
    UNION ALL
    SELECT 3, 'Empezaron a postular o registrarse', COUNT(DISTINCT person_key)::int FROM ev WHERE event_name = 'click_start_apply'
    UNION ALL
    SELECT 4, 'Conversión: registro o postulación completada', COUNT(DISTINCT person_key)::int FROM ev WHERE event_name IN ('user_registration_success', 'application_completed')
  )
  SELECT step, label, people,
         CASE WHEN step = 1 THEN NULL ELSE ROUND(100.0 * people / NULLIF(LAG(people) OVER (ORDER BY step), 0), 1) END,
         CASE WHEN step = 1 THEN NULL ELSE ROUND(100.0 - 100.0 * people / NULLIF(LAG(people) OVER (ORDER BY step), 0), 1) END,
         ROUND(100.0 * people / NULLIF(FIRST_VALUE(people) OVER (ORDER BY step), 0), 1)
  FROM steps ORDER BY step;
$$;

-- Rendimiento por página de entrada (SEO programático).
CREATE OR REPLACE FUNCTION analytics_landing_performance(p_days int DEFAULT 30, p_limit int DEFAULT 200)
RETURNS TABLE (entry_path text, sessions int, active_users int, engagement_rate numeric, conversions int, conversion_rate numeric)
LANGUAGE sql STABLE AS $$
  SELECT s.entry_path,
         COUNT(*)::int,
         COUNT(DISTINCT s.person_key) FILTER (WHERE s.is_engaged)::int,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.is_engaged) / NULLIF(COUNT(*), 0), 1),
         COUNT(*) FILTER (WHERE s.has_conversion)::int,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.has_conversion) / NULLIF(COUNT(*), 0), 1)
  FROM analytics_real_sessions s
  WHERE s.day_mty >= analytics_period_start(p_days)
  GROUP BY s.entry_path
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

-- Atribución por canal: utm_source / utm_medium (o el sitio que nos mandó) y qué convierte.
CREATE OR REPLACE FUNCTION analytics_channels(p_days int DEFAULT 30, p_limit int DEFAULT 200)
RETURNS TABLE (source text, medium text, campaign text, referrer_host text, sessions int, active_users int, conversions int, conversion_rate numeric)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(s.utm_source, s.referrer_host, '(direct)'),
         COALESCE(s.utm_medium, CASE WHEN s.referrer_host IS NULL THEN '(none)' ELSE 'referral' END),
         COALESCE(s.utm_campaign, '(not set)'),
         COALESCE(s.referrer_host, 'direct'),
         COUNT(*)::int,
         COUNT(DISTINCT s.person_key) FILTER (WHERE s.is_engaged)::int,
         COUNT(*) FILTER (WHERE s.has_conversion)::int,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.has_conversion) / NULLIF(COUNT(*), 0), 1)
  FROM analytics_real_sessions s
  WHERE s.day_mty >= analytics_period_start(p_days)
  GROUP BY 1, 2, 3, 4
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

-- Cohortes semanales: la semana de adquisición es la de la primera sesión de la persona (ya con el stitching: la
-- primera visita anónima y el registro son la misma persona). Una persona "vuelve" la semana N si tuvo una sesión
-- activa esa semana.
CREATE OR REPLACE FUNCTION analytics_retention_cohorts(p_weeks int DEFAULT 8)
RETURNS TABLE (cohort_week date, cohort_size int, week_offset int, retained int, retained_pct numeric)
LANGUAGE sql STABLE AS $$
  WITH people AS (
    SELECT person_key, date_trunc('week', MIN(day_mty)::timestamp)::date AS cohort
    FROM analytics_real_sessions GROUP BY person_key
  ),
  recent AS (
    SELECT * FROM people WHERE cohort >= date_trunc('week', (NOW() AT TIME ZONE 'America/Monterrey'))::date - (GREATEST(p_weeks, 1) - 1) * 7
  ),
  active_weeks AS (
    SELECT DISTINCT person_key, date_trunc('week', day_mty::timestamp)::date AS wk FROM analytics_real_sessions WHERE is_engaged
  ),
  sizes AS (SELECT cohort, COUNT(*)::int AS size FROM recent GROUP BY cohort),
  offsets AS (SELECT generate_series(0, GREATEST(p_weeks, 1) - 1) AS week_offset)
  SELECT sz.cohort, sz.size, o.week_offset,
         (SELECT COUNT(*)::int FROM recent r JOIN active_weeks a ON a.person_key = r.person_key AND a.wk = r.cohort + o.week_offset * 7 WHERE r.cohort = sz.cohort),
         ROUND(100.0 * (SELECT COUNT(*) FROM recent r JOIN active_weeks a ON a.person_key = r.person_key AND a.wk = r.cohort + o.week_offset * 7 WHERE r.cohort = sz.cohort) / NULLIF(sz.size, 0), 1)
  FROM sizes sz CROSS JOIN offsets o
  WHERE sz.cohort + o.week_offset * 7 <= date_trunc('week', (NOW() AT TIME ZONE 'America/Monterrey'))::date
  ORDER BY sz.cohort DESC, o.week_offset;
$$;

-- ------------------------------------------------------------------------------------------------
-- 5. Permisos: estas funciones las llama SOLO el backend. Sin esto cualquiera con la llave pública podría
--    llamarlas por la API de Supabase (por ejemplo, unir un navegador con una cuenta ajena).
-- ------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION analytics_start_session(jsonb)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_heartbeat(uuid, text, int)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_record_page_view(uuid, text, text, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_record_event(uuid, text, text, jsonb, boolean)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_stitch_user(text, uuid)                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_active_users(int)                                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_funnel(int)                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_landing_performance(int, int)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_channels(int, int)                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_retention_cohorts(int)                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON analytics_real_sessions FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION analytics_start_session(jsonb)                                TO service_role;
GRANT EXECUTE ON FUNCTION analytics_heartbeat(uuid, text, int)                          TO service_role;
GRANT EXECUTE ON FUNCTION analytics_record_page_view(uuid, text, text, jsonb)           TO service_role;
GRANT EXECUTE ON FUNCTION analytics_record_event(uuid, text, text, jsonb, boolean)      TO service_role;
GRANT EXECUTE ON FUNCTION analytics_stitch_user(text, uuid)                             TO service_role;
GRANT EXECUTE ON FUNCTION analytics_active_users(int)                                   TO service_role;
GRANT EXECUTE ON FUNCTION analytics_funnel(int)                                         TO service_role;
GRANT EXECUTE ON FUNCTION analytics_landing_performance(int, int)                       TO service_role;
GRANT EXECUTE ON FUNCTION analytics_channels(int, int)                                  TO service_role;
GRANT EXECUTE ON FUNCTION analytics_retention_cohorts(int)                              TO service_role;
GRANT SELECT ON analytics_real_sessions TO service_role;
