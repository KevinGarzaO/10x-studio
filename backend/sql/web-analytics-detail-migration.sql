-- Analítica web: el detalle (mapa, idioma, dispositivos, páginas, eventos, sesión por sesión).
--
-- Corre MANUAL en el editor SQL de Supabase, DESPUÉS de web-analytics-migration.sql. Es idempotente.
--
-- Qué agrega:
--   * latitude / longitude por sesión (las manda Vercel con la ciudad; es la posición de la CIUDAD, no de la persona, y
--     no se guarda la IP) para dibujar el mapa.
--   * La vista analytics_real_sessions se vuelve a crear para incluir esas columnas.
--   * analytics_dimension: cualquier desglose (idioma, dispositivo, sistema, navegador, pantalla, zona horaria, país,
--     región, ciudad, sitio de referencia, página de salida, nuevo o recurrente) con sesiones, personas, engagement,
--     conversiones y duración promedio.
--   * analytics_geo_points: ciudades con sus coordenadas.
--   * analytics_pages: cada página vista (no solo las de entrada), con entradas y salidas.
--   * analytics_events_summary: cada evento, cuántas veces y cuánta gente.

ALTER TABLE analytics_sessions ADD COLUMN IF NOT EXISTS latitude  NUMERIC(8, 5);
ALTER TABLE analytics_sessions ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 5);
CREATE INDEX IF NOT EXISTS analytics_sessions_country_idx ON analytics_sessions (country);
CREATE INDEX IF NOT EXISTS analytics_sessions_session_activity_idx ON analytics_sessions (last_activity_at DESC);

-- Abre una sesión (ahora con la posición de la ciudad). Misma firma que antes.
CREATE OR REPLACE FUNCTION analytics_start_session(p jsonb) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_rows int;
  v_new  boolean;
BEGIN
  v_new := NOT EXISTS (SELECT 1 FROM analytics_sessions WHERE client_id = p->>'client_id');

  INSERT INTO analytics_sessions (
    session_id, client_id, entry_path, exit_path, country, region, city, latitude, longitude, device_category,
    operating_system, os_version, browser, browser_version, language, screen_resolution, timezone, utm_source,
    utm_medium, utm_campaign, utm_term, utm_content, referrer_host, is_new_visitor
  ) VALUES (
    (p->>'session_id')::uuid, p->>'client_id', p->>'entry_path', p->>'entry_path', p->>'country', p->>'region', p->>'city',
    NULLIF(p->>'latitude', '')::numeric, NULLIF(p->>'longitude', '')::numeric,
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

-- La vista con las columnas nuevas (una vista con `s.*` guarda la lista que había cuando se creó: hay que rehacerla).
DROP VIEW IF EXISTS analytics_real_sessions;
CREATE VIEW analytics_real_sessions AS
SELECT s.*, COALESCE(s.user_id::text, s.client_id) AS person_key,
       (s.created_at AT TIME ZONE 'America/Monterrey')::date AS day_mty
FROM analytics_sessions s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.user_id IS NULL
   OR (NOT COALESCE(u.is_test_account, FALSE) AND NOT COALESCE(u.is_scraper_profile, FALSE) AND COALESCE(u.user_kind, 'user') <> 'superadmin');

-- Un desglose cualquiera. El nombre del desglose va en una lista cerrada (no se arma SQL con lo que llegue).
CREATE OR REPLACE FUNCTION analytics_dimension(p_days int, p_dimension text, p_limit int DEFAULT 50)
RETURNS TABLE (value text, sessions int, people int, engaged int, engagement_rate numeric, conversions int, avg_duration_seconds int)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT person_key, is_engaged, has_conversion, duration_seconds,
           CASE p_dimension
             WHEN 'language'          THEN language
             WHEN 'device_category'   THEN device_category::text
             WHEN 'operating_system'  THEN operating_system
             WHEN 'browser'           THEN browser
             WHEN 'browser_version'   THEN CASE WHEN browser IS NULL THEN NULL ELSE browser || COALESCE(' ' || browser_version, '') END
             WHEN 'screen_resolution' THEN screen_resolution
             WHEN 'timezone'          THEN timezone
             WHEN 'country'           THEN country
             WHEN 'region'            THEN CASE WHEN region IS NULL THEN NULL ELSE COALESCE(country || ' · ', '') || region END
             WHEN 'city'              THEN CASE WHEN city IS NULL THEN NULL ELSE city || COALESCE(', ' || country, '') END
             WHEN 'referrer_host'     THEN referrer_host
             WHEN 'exit_path'         THEN exit_path
             WHEN 'visitor_type'      THEN CASE WHEN is_new_visitor THEN 'Nuevo' ELSE 'Recurrente' END
           END AS dim
    FROM analytics_real_sessions
    WHERE day_mty >= analytics_period_start(p_days)
  )
  SELECT COALESCE(NULLIF(dim, ''), '(sin dato)'),
         COUNT(*)::int,
         COUNT(DISTINCT person_key)::int,
         COUNT(*) FILTER (WHERE is_engaged)::int,
         ROUND(100.0 * COUNT(*) FILTER (WHERE is_engaged) / NULLIF(COUNT(*), 0), 1),
         COUNT(*) FILTER (WHERE has_conversion)::int,
         COALESCE(ROUND(AVG(duration_seconds))::int, 0)
  FROM base
  WHERE p_dimension IN ('language', 'device_category', 'operating_system', 'browser', 'browser_version', 'screen_resolution', 'timezone', 'country', 'region', 'city', 'referrer_host', 'exit_path', 'visitor_type')
  GROUP BY 1
  ORDER BY COUNT(*) DESC, 1
  LIMIT p_limit;
$$;

-- Las ciudades con sus coordenadas (el promedio de las sesiones de esa ciudad), para el mapa.
CREATE OR REPLACE FUNCTION analytics_geo_points(p_days int, p_limit int DEFAULT 2000)
RETURNS TABLE (country text, region text, city text, latitude numeric, longitude numeric, sessions int, people int, engaged int)
LANGUAGE sql STABLE AS $$
  SELECT s.country::text, s.region::text, s.city::text,
         ROUND(AVG(s.latitude), 4), ROUND(AVG(s.longitude), 4),
         COUNT(*)::int, COUNT(DISTINCT s.person_key)::int, COUNT(*) FILTER (WHERE s.is_engaged)::int
  FROM analytics_real_sessions s
  WHERE s.day_mty >= analytics_period_start(p_days) AND s.city IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
  GROUP BY s.country, s.region, s.city
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

-- Cada página vista (no solo la de entrada), con cuántas sesiones empezaron o terminaron en ella.
CREATE OR REPLACE FUNCTION analytics_pages(p_days int, p_limit int DEFAULT 500)
RETURNS TABLE (path text, views int, sessions int, people int, entries int, exits int)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT session_id, person_key, entry_path, exit_path FROM analytics_real_sessions WHERE day_mty >= analytics_period_start(p_days)
  ),
  v AS (
    SELECT pv.path, pv.session_id, s.person_key FROM analytics_page_views pv JOIN s ON s.session_id = pv.session_id
  )
  SELECT v.path,
         COUNT(*)::int,
         COUNT(DISTINCT v.session_id)::int,
         COUNT(DISTINCT v.person_key)::int,
         (SELECT COUNT(*)::int FROM s WHERE s.entry_path = v.path),
         (SELECT COUNT(*)::int FROM s WHERE s.exit_path = v.path)
  FROM v GROUP BY v.path ORDER BY COUNT(*) DESC LIMIT p_limit;
$$;

-- Cada evento: cuántas veces ocurrió y a cuánta gente.
CREATE OR REPLACE FUNCTION analytics_events_summary(p_days int)
RETURNS TABLE (event_name text, events int, sessions int, people int, is_conversion boolean)
LANGUAGE sql STABLE AS $$
  SELECT e.event_name::text, COUNT(*)::int, COUNT(DISTINCT e.session_id)::int, COUNT(DISTINCT s.person_key)::int, BOOL_OR(e.is_conversion)
  FROM analytics_events e
  JOIN analytics_real_sessions s ON s.session_id = e.session_id
  WHERE s.day_mty >= analytics_period_start(p_days)
  GROUP BY e.event_name
  ORDER BY COUNT(*) DESC;
$$;

-- Permisos: solo el backend.
REVOKE ALL ON FUNCTION analytics_start_session(jsonb)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_dimension(int, text, int)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_geo_points(int, int)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_pages(int, int)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_events_summary(int)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON analytics_real_sessions                               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION analytics_start_session(jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION analytics_dimension(int, text, int)       TO service_role;
GRANT EXECUTE ON FUNCTION analytics_geo_points(int, int)            TO service_role;
GRANT EXECUTE ON FUNCTION analytics_pages(int, int)                 TO service_role;
GRANT EXECUTE ON FUNCTION analytics_events_summary(int)             TO service_role;
GRANT SELECT ON analytics_real_sessions                             TO service_role;
