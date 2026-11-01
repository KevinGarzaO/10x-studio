-- Ritmo de la semana: cuándo hay gente en AvoTalent y cuándo no (mapa de calor por día y hora + una fila por día).
--
-- Corre MANUAL en el editor SQL de Supabase, DESPUÉS de web-analytics-migration.sql (usa analytics_real_sessions y
-- analytics_period_start). Es idempotente.
--
-- Misma definición de personas que el resto del panel: una persona es su cuenta si la reconocimos y, si no, su navegador; ACTIVA =
-- tuvo una sesión activa (10 s con la pestaña visible, 2 páginas o un evento clave); no cuenta al equipo, pruebas ni robots; los días y
-- las horas son de Monterrey. Una sesión se ubica en la hora en que EMPEZÓ.
--
-- La medición de sesiones empezó el 30 de octubre de 2026 (14:13 hora de Monterrey): las horas anteriores NO cuentan como "hora sin
-- gente", simplemente no existen. Igual la hora que aún no termina: un promedio con media hora de datos engañaría.

-- Mapa de calor: para cada día de la semana (0 = domingo … 6 = sábado) y cada hora, cuántas personas activas hubo EN TOTAL y en cuántas
-- veces completas pasó esa hora en el periodo (`occurrences`). El promedio por ocurrencia (people / occurrences) se calcula al leerlo.
CREATE OR REPLACE FUNCTION analytics_rhythm_heatmap(p_days int DEFAULT 30)
RETURNS TABLE (dow int, hour int, people int, occurrences int)
LANGUAGE sql STABLE AS $$
  WITH first_session AS (
    SELECT MIN(created_at) AT TIME ZONE 'America/Monterrey' AS at FROM analytics_sessions
  ),
  now_local AS (SELECT now() AT TIME ZONE 'America/Monterrey' AS at),
  slots AS (
    -- Cada hora completa desde que existe la medición (y dentro del periodo) hasta la última hora que ya terminó.
    SELECT (d + make_interval(hours => h)) AS slot_start
    FROM first_session f, now_local n,
         generate_series(analytics_period_start(GREATEST(p_days, 1))::timestamp, date_trunc('day', n.at), interval '1 day') d,
         generate_series(0, 23) h
    WHERE f.at IS NOT NULL
      AND (d + make_interval(hours => h)) >= date_trunc('hour', f.at) + interval '1 hour'
      AND (d + make_interval(hours => h)) + interval '1 hour' <= n.at
  ),
  people AS (
    SELECT date_trunc('hour', created_at AT TIME ZONE 'America/Monterrey') AS slot_start, COUNT(DISTINCT person_key)::int AS n
    FROM analytics_real_sessions
    WHERE is_engaged
    GROUP BY 1
  )
  SELECT EXTRACT(dow FROM s.slot_start)::int, EXTRACT(hour FROM s.slot_start)::int,
         COALESCE(SUM(p.n), 0)::int, COUNT(*)::int
  FROM slots s LEFT JOIN people p ON p.slot_start = s.slot_start
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- Una fila por día de Monterrey (desde que existe la medición hasta hoy):
--   active           personas activas ese día
--   new_active       de ellas, las que eran NUEVAS (su primera visita, o su cuenta, es de ese día)
--   members_active   de ellas, las que YA tenían cuenta de un día anterior (nuestra propia gente que volvió)
--   from_linkedin / from_email / from_direct / from_other
--                    el origen de cada persona activa = el de su primera sesión activa de ese día (suman `active`)
--   visit_only       personas que entraron y se fueron sin hacer nada (ruido: nunca se cuenta como usuarios)
--   sessions         visitas del día (ruido también)
--   registrations    cuentas reales creadas ese día (viene de `users`)
--   is_partial       el primer día de la medición, que empezó a media jornada y no sirve como base
CREATE OR REPLACE FUNCTION analytics_rhythm_days(p_days int DEFAULT 35)
RETURNS TABLE (
  day date, dow int, is_today boolean, is_partial boolean,
  active int, new_active int, members_active int,
  from_linkedin int, from_email int, from_direct int, from_other int,
  visit_only int, sessions int, registrations int
)
LANGUAGE sql STABLE AS $$
  WITH first_seen AS (
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  first_day AS (SELECT (MIN(created_at) AT TIME ZONE 'America/Monterrey')::date AS d FROM analytics_sessions),
  days AS (
    SELECT gs::date AS d
    FROM first_day f, generate_series(GREATEST(analytics_period_start(GREATEST(p_days, 1)), f.d)::timestamp, (now() AT TIME ZONE 'America/Monterrey')::date::timestamp, interval '1 day') gs
    WHERE f.d IS NOT NULL
  ),
  per_person AS (
    SELECT r.day_mty AS d, r.person_key,
           BOOL_OR(r.is_engaged) AS active,
           (ARRAY_AGG(
             CASE
               WHEN r.utm_source = 'linkedin' OR r.referrer_host ILIKE '%linkedin.com' THEN 'linkedin'
               WHEN r.utm_source = 'email' OR r.utm_medium = 'email' THEN 'email'
               WHEN NULLIF(r.utm_source, '') IS NULL AND NULLIF(r.referrer_host, '') IS NULL THEN 'direct'
               ELSE 'other'
             END ORDER BY r.created_at
           ) FILTER (WHERE r.is_engaged))[1] AS origin,
           COUNT(*) AS visits
    FROM analytics_real_sessions r
    GROUP BY r.day_mty, r.person_key
  ),
  classified AS (
    SELECT p.d, p.person_key, p.active, p.origin, p.visits,
           (f.first_at >= p.d::timestamp AT TIME ZONE 'America/Monterrey' AND f.first_at < (p.d + 1)::timestamp AT TIME ZONE 'America/Monterrey') AS is_new,
           COALESCE((u.created_at AT TIME ZONE 'America/Monterrey')::date < p.d, FALSE) AS had_account
    FROM per_person p
    JOIN first_seen f ON f.person_key = p.person_key
    LEFT JOIN users u ON u.id::text = p.person_key
  )
  SELECT days.d,
         EXTRACT(dow FROM days.d)::int,
         days.d = (now() AT TIME ZONE 'America/Monterrey')::date,
         days.d = (SELECT d FROM first_day),
         COUNT(*) FILTER (WHERE c.active)::int,
         COUNT(*) FILTER (WHERE c.active AND c.is_new)::int,
         COUNT(*) FILTER (WHERE c.active AND c.had_account)::int,
         COUNT(*) FILTER (WHERE c.active AND c.origin = 'linkedin')::int,
         COUNT(*) FILTER (WHERE c.active AND c.origin = 'email')::int,
         COUNT(*) FILTER (WHERE c.active AND c.origin = 'direct')::int,
         COUNT(*) FILTER (WHERE c.active AND c.origin = 'other')::int,
         COUNT(*) FILTER (WHERE NOT c.active)::int,
         COALESCE(SUM(c.visits), 0)::int,
         (SELECT COUNT(*) FROM users u
           WHERE (u.created_at AT TIME ZONE 'America/Monterrey')::date = days.d
             AND NOT COALESCE(u.is_test_account, false) AND NOT COALESCE(u.is_scraper_profile, false) AND COALESCE(u.user_kind, 'user') = 'user')::int
  FROM days LEFT JOIN classified c ON c.d = days.d
  GROUP BY days.d
  ORDER BY days.d;
$$;

REVOKE ALL ON FUNCTION analytics_rhythm_heatmap(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_rhythm_days(int)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_rhythm_heatmap(int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_rhythm_days(int)    TO service_role;
