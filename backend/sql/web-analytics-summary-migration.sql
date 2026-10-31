-- Analítica web: el resumen del panel con personas ACTIVAS, nuevas y recurrentes.
--
-- Corre MANUAL en el editor SQL de Supabase, DESPUÉS de web-analytics-migration.sql y web-analytics-detail-migration.sql.
-- Es idempotente. Solo agrega funciones (no toca tablas).
--
-- Reglas:
--   * Un VISITANTE es una persona (analytics_real_sessions.person_key) con al menos una sesión ACTIVA en el periodo:
--     10 s con la pestaña visible, 2 páginas o un evento clave. Las entradas sin actividad (rebotes) no cuentan.
--   * NUEVO = su primera visita a AvoTalent cae dentro del periodo. RECURRENTE = ya había entrado antes del periodo.
--     Quien ya tenía cuenta antes (users.created_at) cuenta como recurrente aunque la medición sea más reciente que su cuenta.
--   * CONVERSIÓN DE NUEVOS = nuevos activos que se registraron en el periodo / nuevos activos. Un recurrente que se
--     registra no engorda la conversión: la conversión mide cuánto convertimos de lo que traemos nuevo.

-- Los números de un periodo [p_from, p_to). Una sola fila.
CREATE OR REPLACE FUNCTION analytics_visitors_summary(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (tracking_since timestamptz, active int, new_active int, returning_active int, registered_new int, linkedin_active int, sessions int, engaged_sessions int)
LANGUAGE sql STABLE AS $$
  WITH active_p AS (
    SELECT DISTINCT person_key FROM analytics_real_sessions WHERE is_engaged AND created_at >= p_from AND created_at < p_to
  ),
  first_seen AS (
    -- La primera vez que vimos a cada persona (o su cuenta, si es más vieja que la medición).
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  linkedin_p AS (
    SELECT DISTINCT person_key FROM analytics_real_sessions WHERE is_engaged AND utm_source = 'linkedin' AND created_at >= p_from AND created_at < p_to
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
    (SELECT COUNT(*)::int FROM analytics_real_sessions WHERE created_at >= p_from AND created_at < p_to),
    (SELECT COUNT(*)::int FROM analytics_real_sessions WHERE is_engaged AND created_at >= p_from AND created_at < p_to);
$$;

-- Personas activas y nuevas por día u hora (Monterrey). p_bucket = 'day' o 'hour'. Solo trae los cubos con datos.
CREATE OR REPLACE FUNCTION analytics_visitors_series(p_from timestamptz, p_to timestamptz, p_bucket text)
RETURNS TABLE (bucket text, active int, new_active int)
LANGUAGE sql STABLE AS $$
  WITH fmt AS (SELECT CASE WHEN p_bucket = 'hour' THEN 'YYYY-MM-DD"T"HH24' ELSE 'YYYY-MM-DD' END AS f),
  first_seen AS (
    -- La primera vez que vimos a cada persona (o su cuenta, si es más vieja que la medición).
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  hits AS (
    SELECT to_char(s.created_at AT TIME ZONE 'America/Monterrey', (SELECT f FROM fmt)) AS bucket, s.person_key
    FROM analytics_real_sessions s
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
