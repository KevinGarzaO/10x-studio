-- Analítica web: las personas SIN los probables bots (decisión del fundador, 6 nov 2026).
--
-- Corre MANUAL en el editor SQL de Supabase, DESPUÉS de web-analytics-migration.sql, web-analytics-detail-migration.sql,
-- web-analytics-bots-migration.sql, web-analytics-summary-migration.sql y web-analytics-segments-migration.sql. Es idempotente.
--
-- Qué hace: las sesiones que analytics_likely_bot_sessions marca como probable bot ya NO cuentan en «personas activas», «nuevas activas»,
-- «recurrentes» ni en la conversión (Resumen, Adquisición, LinkedIn, Vacantes y Tráfico web). NO borra nada: la tabla de sesiones queda
-- intacta, el conteo bruto sigue en analytics_bot_summary (pantalla «Posibles bots») y quitar la marca (borrar la ciudad de
-- analytics_datacenter_places) devuelve esas visitas. Una persona con cuenta nunca está marcada (ver la vista de bots), así que ninguna
-- cuenta registrada se pierde de estos números.
--
-- Lo demás (retención por cuentas, embudos, etc.) sigue leyendo analytics_real_sessions: no se cambia en este paso.

CREATE OR REPLACE VIEW analytics_human_sessions AS
SELECT r.*
FROM analytics_real_sessions r
WHERE NOT EXISTS (SELECT 1 FROM analytics_likely_bot_sessions b WHERE b.session_id = r.session_id);

-- Las personas del periodo agrupadas por lo que se pida (todo el sitio, canal, página de entrada, país, idioma, dispositivo...).
-- Una persona cuenta una vez en cada grupo donde tuvo sesiones (por eso los grupos no suman el total).
CREATE OR REPLACE FUNCTION analytics_segments(p_from timestamptz, p_to timestamptz, p_group text, p_limit int DEFAULT 200)
RETURNS TABLE (
  grp text, visits int, people int,
  new_people int, new_active int, returning_people int, returning_active int,
  registered int, registered_active int, anonymous int, anonymous_active int,
  registered_new int, active int
)
LANGUAGE sql STABLE AS $$
  WITH first_seen AS (
    -- La primera vez que vimos a cada persona (o su cuenta, si es más vieja que la medición).
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_human_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  s AS (
    SELECT r.person_key, r.is_engaged, r.user_id,
      -- La lista de grupos es cerrada: lo que llegue de fuera nunca se arma como SQL.
      CASE p_group
        WHEN 'all'               THEN 'Todo el sitio'
        WHEN 'linkedin'          THEN CASE WHEN r.utm_source = 'linkedin' THEN 'LinkedIn' END
        WHEN 'linkedin_post'     THEN CASE WHEN r.utm_source = 'linkedin' THEN r.utm_content END
        WHEN 'channel'           THEN COALESCE(r.utm_source, r.referrer_host, '(direct)') || ' / ' || COALESCE(r.utm_medium, CASE WHEN r.referrer_host IS NULL THEN '(none)' ELSE 'referral' END) || ' / ' || COALESCE(r.utm_campaign, '(not set)')
        WHEN 'landing'           THEN r.entry_path
        WHEN 'exit_path'         THEN r.exit_path
        WHEN 'language'          THEN COALESCE(NULLIF(r.language, ''), '(sin dato)')
        WHEN 'device_category'   THEN COALESCE(r.device_category::text, '(sin dato)')
        WHEN 'operating_system'  THEN COALESCE(NULLIF(r.operating_system, ''), '(sin dato)')
        WHEN 'browser_version'   THEN CASE WHEN r.browser IS NULL THEN '(sin dato)' ELSE r.browser || COALESCE(' ' || r.browser_version, '') END
        WHEN 'screen_resolution' THEN COALESCE(NULLIF(r.screen_resolution, ''), '(sin dato)')
        WHEN 'timezone'          THEN COALESCE(NULLIF(r.timezone, ''), '(sin dato)')
        WHEN 'country'           THEN COALESCE(NULLIF(r.country, ''), '(sin dato)')
        WHEN 'region'            THEN CASE WHEN r.region IS NULL THEN '(sin dato)' ELSE COALESCE(r.country || ' · ', '') || r.region END
        WHEN 'city'              THEN CASE WHEN r.city IS NULL THEN '(sin dato)' ELSE r.city || COALESCE(', ' || r.country, '') END
        WHEN 'referrer_host'     THEN COALESCE(NULLIF(r.referrer_host, ''), '(directo)')
      END AS grp
    FROM analytics_human_sessions r
    WHERE r.created_at >= p_from AND r.created_at < p_to
  ),
  per_person AS (
    SELECT s.grp, s.person_key, COUNT(*) AS visits, BOOL_OR(s.is_engaged) AS active, BOOL_OR(s.user_id IS NOT NULL) AS registered
    FROM s WHERE s.grp IS NOT NULL GROUP BY s.grp, s.person_key
  ),
  classified AS (
    SELECT p.*, (f.first_at >= p_from AND f.first_at < p_to) AS is_new, COALESCE(u.created_at >= p_from AND u.created_at < p_to, FALSE) AS signed_up
    FROM per_person p JOIN first_seen f ON f.person_key = p.person_key LEFT JOIN users u ON u.id::text = p.person_key
  )
  SELECT c.grp,
         SUM(c.visits)::int,
         COUNT(*)::int,
         (COUNT(*) FILTER (WHERE c.is_new))::int,
         (COUNT(*) FILTER (WHERE c.is_new AND c.active))::int,
         (COUNT(*) FILTER (WHERE NOT c.is_new))::int,
         (COUNT(*) FILTER (WHERE NOT c.is_new AND c.active))::int,
         (COUNT(*) FILTER (WHERE c.registered))::int,
         (COUNT(*) FILTER (WHERE c.registered AND c.active))::int,
         (COUNT(*) FILTER (WHERE NOT c.registered))::int,
         (COUNT(*) FILTER (WHERE NOT c.registered AND c.active))::int,
         (COUNT(*) FILTER (WHERE c.is_new AND c.signed_up))::int,
         (COUNT(*) FILTER (WHERE c.active))::int
  FROM classified c
  WHERE p_group IN ('all', 'linkedin', 'linkedin_post', 'channel', 'landing', 'exit_path', 'language', 'device_category', 'operating_system', 'browser_version', 'screen_resolution', 'timezone', 'country', 'region', 'city', 'referrer_host')
  GROUP BY c.grp
  ORDER BY SUM(c.visits) DESC, c.grp
  LIMIT p_limit;
$$;

-- Lo mismo para las vacantes: las personas que ABRIERON cada vacante (sean activas o no) y las que pulsaron Postularse, con la
-- misma distinción. Una persona cuenta una vez por vacante. grp NULL = todas las vacantes juntas (personas distintas).
CREATE OR REPLACE FUNCTION analytics_vacancy_segments(p_from timestamptz, p_to timestamptz, p_limit int DEFAULT 100)
RETURNS TABLE (
  slug text, viewers int, viewers_active int, viewers_new int, viewers_new_active int, viewers_returning int,
  viewers_registered int, viewers_anonymous int, applicants int, applicants_active int
)
LANGUAGE sql STABLE AS $$
  WITH first_seen AS (
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_human_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  ev AS (
    SELECT e.event_name, e.event_params->>'slug' AS slug, s.person_key, s.is_engaged, s.user_id
    FROM analytics_events e
    JOIN analytics_human_sessions s ON s.session_id = e.session_id
    WHERE e.created_at >= p_from AND e.created_at < p_to
      AND e.event_name IN ('click_view_job_detail', 'click_start_apply')
      AND COALESCE(e.event_params->>'slug', '') <> ''
  ),
  -- Una fila por persona y vacante, y otra por persona para el total (sin repetir a quien abrió varias vacantes).
  by_slug AS (
    SELECT ev.slug,
           ev.person_key,
           BOOL_OR(ev.event_name = 'click_view_job_detail') AS viewed,
           BOOL_OR(ev.event_name = 'click_start_apply') AS applied,
           BOOL_OR(ev.is_engaged) AS active,
           BOOL_OR(ev.user_id IS NOT NULL) AS registered
    FROM ev GROUP BY ev.slug, ev.person_key
  ),
  by_all AS (
    SELECT NULL::text AS slug, ev.person_key,
           BOOL_OR(ev.event_name = 'click_view_job_detail') AS viewed,
           BOOL_OR(ev.event_name = 'click_start_apply') AS applied,
           BOOL_OR(ev.is_engaged) AS active,
           BOOL_OR(ev.user_id IS NOT NULL) AS registered
    FROM ev GROUP BY ev.person_key
  ),
  merged AS (
    SELECT * FROM by_slug UNION ALL SELECT * FROM by_all
  ),
  classified AS (
    SELECT m.*, (f.first_at >= p_from AND f.first_at < p_to) AS is_new
    FROM merged m JOIN first_seen f ON f.person_key = m.person_key
  )
  SELECT c.slug,
         (COUNT(*) FILTER (WHERE c.viewed))::int,
         (COUNT(*) FILTER (WHERE c.viewed AND c.active))::int,
         (COUNT(*) FILTER (WHERE c.viewed AND c.is_new))::int,
         (COUNT(*) FILTER (WHERE c.viewed AND c.is_new AND c.active))::int,
         (COUNT(*) FILTER (WHERE c.viewed AND NOT c.is_new))::int,
         (COUNT(*) FILTER (WHERE c.viewed AND c.registered))::int,
         (COUNT(*) FILTER (WHERE c.viewed AND NOT c.registered))::int,
         (COUNT(*) FILTER (WHERE c.applied))::int,
         (COUNT(*) FILTER (WHERE c.applied AND c.active))::int
  FROM classified c
  GROUP BY c.slug
  ORDER BY (c.slug IS NULL) DESC, 2 DESC, 9 DESC, 1
  LIMIT p_limit + 1;
$$;

REVOKE ALL ON FUNCTION analytics_segments(timestamptz, timestamptz, text, int)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_vacancy_segments(timestamptz, timestamptz, int)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_segments(timestamptz, timestamptz, text, int)     TO service_role;
GRANT EXECUTE ON FUNCTION analytics_vacancy_segments(timestamptz, timestamptz, int)   TO service_role;

-- Los números de un periodo [p_from, p_to). Una sola fila.
CREATE OR REPLACE FUNCTION analytics_visitors_summary(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (tracking_since timestamptz, active int, new_active int, returning_active int, registered_new int, linkedin_active int, sessions int, engaged_sessions int)
LANGUAGE sql STABLE AS $$
  WITH active_p AS (
    SELECT DISTINCT person_key FROM analytics_human_sessions WHERE is_engaged AND created_at >= p_from AND created_at < p_to
  ),
  first_seen AS (
    -- La primera vez que vimos a cada persona (o su cuenta, si es más vieja que la medición).
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_human_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  linkedin_p AS (
    SELECT DISTINCT person_key FROM analytics_human_sessions WHERE is_engaged AND utm_source = 'linkedin' AND created_at >= p_from AND created_at < p_to
  ),
  classified AS (
    SELECT a.person_key, f.first_at FROM active_p a JOIN first_seen f ON f.person_key = a.person_key
  )
  SELECT
    (SELECT MIN(created_at) FROM analytics_sessions),
    (SELECT COUNT(*)::int FROM active_p),
    (SELECT COUNT(*)::int FROM classified WHERE first_at >= p_from AND first_at < p_to),
    (SELECT COUNT(*)::int FROM classified WHERE first_at < p_from),
    (SELECT COUNT(*)::int FROM classified c JOIN users u ON u.id::text = c.person_key
       WHERE c.first_at >= p_from AND c.first_at < p_to AND u.created_at >= p_from AND u.created_at < p_to),
    (SELECT COUNT(*)::int FROM linkedin_p),
    (SELECT COUNT(*)::int FROM analytics_human_sessions WHERE created_at >= p_from AND created_at < p_to),
    (SELECT COUNT(*)::int FROM analytics_human_sessions WHERE is_engaged AND created_at >= p_from AND created_at < p_to);
$$;

-- Personas activas y nuevas por día u hora (Monterrey). p_bucket = 'day' o 'hour'. Solo trae los cubos con datos.
CREATE OR REPLACE FUNCTION analytics_visitors_series(p_from timestamptz, p_to timestamptz, p_bucket text)
RETURNS TABLE (bucket text, active int, new_active int)
LANGUAGE sql STABLE AS $$
  WITH fmt AS (SELECT CASE WHEN p_bucket = 'hour' THEN 'YYYY-MM-DD"T"HH24' ELSE 'YYYY-MM-DD' END AS f),
  first_seen AS (
    -- La primera vez que vimos a cada persona (o su cuenta, si es más vieja que la medición).
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_human_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  hits AS (
    SELECT to_char(s.created_at AT TIME ZONE 'America/Monterrey', (SELECT f FROM fmt)) AS bucket, s.person_key
    FROM analytics_human_sessions s
    WHERE s.is_engaged AND s.created_at >= p_from AND s.created_at < p_to
    GROUP BY 1, 2
  )
  SELECT h.bucket,
         COUNT(*)::int,
         COUNT(*) FILTER (WHERE to_char(f.first_at AT TIME ZONE 'America/Monterrey', (SELECT f FROM fmt)) = h.bucket)::int
  FROM hits h JOIN first_seen f ON f.person_key = h.person_key
  GROUP BY h.bucket
  ORDER BY h.bucket;
$$;

REVOKE ALL ON FUNCTION analytics_visitors_summary(timestamptz, timestamptz)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_visitors_series(timestamptz, timestamptz, text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_visitors_summary(timestamptz, timestamptz)      TO service_role;
GRANT EXECUTE ON FUNCTION analytics_visitors_series(timestamptz, timestamptz, text) TO service_role;
