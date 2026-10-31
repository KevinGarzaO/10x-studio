-- Analítica web: lo que se mide en el admin (vacantes, adquisición y LinkedIn), contado en PERSONAS ACTIVAS (no en vistas).
--
-- Corre MANUAL en el editor SQL de Supabase, después de web-analytics-migration.sql y web-analytics-detail-migration.sql.
-- Es idempotente. Solo agrega funciones.
--
-- Reglas:
--   * Solo cuenta a una persona si estuvo en una sesión ACTIVA (10 s con la pestaña visible, 2 páginas o un evento clave).
--     Quien abre una vacante y se va sin hacer nada no es alguien que "abrió la vacante".
--   * Cada persona cuenta UNA vez por vacante, sin importar cuántas veces la abra o pulse "Postularse".
--   * "Abrió" = evento click_view_job_detail con el slug de la vacante; "pulsó Postularse" = click_start_apply.
--     El slug viaja en los parámetros del evento (event_params->>'slug').

-- Por vacante: personas activas que la abrieron y personas activas que pulsaron Postularse.
CREATE OR REPLACE FUNCTION analytics_vacancy_people(p_from timestamptz, p_to timestamptz, p_limit int DEFAULT 200)
RETURNS TABLE (slug text, viewers int, applicants int)
LANGUAGE sql STABLE AS $$
  WITH ev AS (
    SELECT e.event_name, e.event_params->>'slug' AS slug, s.person_key
    FROM analytics_events e
    JOIN analytics_real_sessions s ON s.session_id = e.session_id
    WHERE s.is_engaged
      AND e.created_at >= p_from AND e.created_at < p_to
      AND e.event_name IN ('click_view_job_detail', 'click_start_apply')
      AND COALESCE(e.event_params->>'slug', '') <> ''
  )
  SELECT ev.slug,
         COUNT(DISTINCT ev.person_key) FILTER (WHERE ev.event_name = 'click_view_job_detail')::int,
         COUNT(DISTINCT ev.person_key) FILTER (WHERE ev.event_name = 'click_start_apply')::int
  FROM ev
  GROUP BY ev.slug
  ORDER BY 2 DESC, 3 DESC, 1
  LIMIT p_limit;
$$;

-- De todo el periodo: personas activas DISTINTAS que abrieron alguna vacante y que pulsaron Postularse en alguna.
CREATE OR REPLACE FUNCTION analytics_vacancy_totals(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (tracking_since timestamptz, viewers int, applicants int, vacancies int)
LANGUAGE sql STABLE AS $$
  WITH ev AS (
    SELECT e.event_name, e.event_params->>'slug' AS slug, s.person_key
    FROM analytics_events e
    JOIN analytics_real_sessions s ON s.session_id = e.session_id
    WHERE s.is_engaged
      AND e.created_at >= p_from AND e.created_at < p_to
      AND e.event_name IN ('click_view_job_detail', 'click_start_apply')
      AND COALESCE(e.event_params->>'slug', '') <> ''
  )
  SELECT (SELECT MIN(created_at) FROM analytics_sessions),
         (SELECT COUNT(DISTINCT person_key)::int FROM ev WHERE event_name = 'click_view_job_detail'),
         (SELECT COUNT(DISTINCT person_key)::int FROM ev WHERE event_name = 'click_start_apply'),
         (SELECT COUNT(DISTINCT slug)::int FROM ev WHERE event_name = 'click_view_job_detail');
$$;

REVOKE ALL ON FUNCTION analytics_vacancy_people(timestamptz, timestamptz, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_vacancy_totals(timestamptz, timestamptz)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_vacancy_people(timestamptz, timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_vacancy_totals(timestamptz, timestamptz)      TO service_role;

-- Las visitas ACTIVAS del periodo, una por sesión activa, con su origen y si la persona es nueva o ya había entrado antes.
-- De aquí salen las cifras de Adquisición y de LinkedIn: así "visitante" es una persona activa y la conversión se mide
-- sobre las nuevas (igual que en el Resumen). Quien ya tenía cuenta antes de la medición cuenta como recurrente.
CREATE OR REPLACE FUNCTION analytics_active_visits(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (person_key text, is_new boolean, utm_source text, utm_medium text, utm_campaign text, utm_content text, entry_path text, created_at timestamptz)
LANGUAGE sql STABLE AS $$
  WITH first_seen AS (
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  )
  SELECT s.person_key, (f.first_at >= p_from AND f.first_at < p_to), s.utm_source::text, s.utm_medium::text, s.utm_campaign::text, s.utm_content::text, s.entry_path, s.created_at
  FROM analytics_real_sessions s
  JOIN first_seen f ON f.person_key = s.person_key
  WHERE s.is_engaged AND s.created_at >= p_from AND s.created_at < p_to
  ORDER BY s.created_at;
$$;

REVOKE ALL ON FUNCTION analytics_active_visits(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_active_visits(timestamptz, timestamptz) TO service_role;
