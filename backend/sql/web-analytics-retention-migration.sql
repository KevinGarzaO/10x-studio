-- Analítica web: retención con LA distinción de personas (pantalla "Tráfico web > Retención").
--
-- Corre MANUAL en el editor SQL de Supabase, después de web-analytics-migration.sql. Es idempotente. Solo agrega una función.
-- No toca la Retención anterior (/panel/retencion, que lee user_activity_daily): esta es otra medición, sobre las sesiones nuevas.
--
-- Una persona (person_key: su cuenta si ya la reconocimos y, si no, su navegador) está ACTIVA un día si ese día tuvo una sesión
-- activa (10 s con la pestaña visible, 2 páginas o un evento clave). VOLVIÓ si estuvo activa en un día posterior al de su
-- primera visita (o al de su cuenta, si es más vieja que la medición). Los días son de Monterrey.

CREATE OR REPLACE FUNCTION analytics_people_activity(p_days int DEFAULT 30, p_limit int DEFAULT 1000)
RETURNS TABLE (
  person_key text, is_registered boolean, first_day date, is_new boolean,
  days_active int, return_days int, last_active date, active_days date[]
)
LANGUAGE sql STABLE AS $$
  WITH first_seen AS (
    SELECT s.person_key,
           (LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AT TIME ZONE 'America/Monterrey')::date AS first_day,
           bool_or(s.user_id IS NOT NULL) AS registered
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  active AS (
    SELECT r.person_key, r.day_mty AS d
    FROM analytics_real_sessions r
    WHERE r.is_engaged AND r.day_mty >= analytics_period_start(p_days)
    GROUP BY r.person_key, r.day_mty
  )
  SELECT a.person_key, f.registered, f.first_day, f.first_day >= analytics_period_start(p_days),
         COUNT(*)::int,
         COUNT(*) FILTER (WHERE a.d > f.first_day)::int,
         MAX(a.d),
         array_agg(a.d ORDER BY a.d) FILTER (WHERE a.d >= (NOW() AT TIME ZONE 'America/Monterrey')::date - 13)
  FROM active a JOIN first_seen f ON f.person_key = a.person_key
  GROUP BY a.person_key, f.registered, f.first_day
  ORDER BY COUNT(*) DESC, MAX(a.d) DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION analytics_people_activity(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_people_activity(int, int) TO service_role;
