-- Analítica web: LA distinción de personas, la misma en todas las pantallas del admin.
--
-- Corre MANUAL en el editor SQL de Supabase, después de web-analytics-migration.sql y web-analytics-detail-migration.sql.
-- Es idempotente. Solo agrega funciones.
--
-- Cada persona (analytics_real_sessions.person_key: su cuenta si ya la reconocimos y, si no, su navegador) se clasifica así:
--
--   NUEVA ........ su primera visita a AvoTalent (o su cuenta, si es más vieja que la medición) cae dentro del periodo.
--   RECURRENTE ... ya había entrado antes del periodo.
--       Y cada una, a su vez, es:
--   ACTIVA ....... tuvo al menos una sesión ACTIVA (10 s con la pestaña visible, 2 páginas o un evento clave).
--   SOLO VISITA .. entró y se fue sin hacer nada (no cuenta como usuario activo).
--
--   REGISTRADA ... tiene cuenta (se reconoció al registrarse o iniciar sesión). ANÓNIMA ... aún no.
--   CONVERSIÓN ... personas NUEVAS que se registraron en el periodo / personas NUEVAS ACTIVAS.
--
-- La cifra que se destaca siempre es la de personas ACTIVAS; las visitas y las "solo visita" se muestran aparte para saber
-- cuánto ruido hay, pero nunca se mezclan con los usuarios.

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
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
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
    FROM analytics_real_sessions r
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
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  ev AS (
    SELECT e.event_name, e.event_params->>'slug' AS slug, s.person_key, s.is_engaged, s.user_id
    FROM analytics_events e
    JOIN analytics_real_sessions s ON s.session_id = e.session_id
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
