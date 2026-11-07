-- La ventana de registro que sale sobre una vacante (el «muro»), paso por paso: quién la ve, qué botón toca y quién se registra, por tipo de
-- dispositivo y por si la página se abrió dentro de la app de otra red (LinkedIn, Facebook...). Corre DESPUÉS de web-analytics-migration.sql y
-- web-analytics-detail-migration.sql. Se puede correr más de una vez.
--
-- Cuenta PERSONAS (analytics_real_sessions.person_key: sin equipo, pruebas ni robots). Una persona se cuenta en el grupo donde VIO la ventana
-- (dispositivo y tipo de navegador). `in_app` viene del evento auth_wall_shown: los eventos anteriores a que se midiera dicen «sin_dato».
-- `registered` = la persona tuvo un registro (user_registration_success) en el periodo, sin importar el orden: la ventana es por donde casi
-- todo el mundo se registra, pero alguien pudo registrarse por otro camino.
CREATE OR REPLACE FUNCTION analytics_wall_funnel(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (device text, in_app text, saw int, clicked int, clicked_linkedin int, clicked_github int, clicked_email int, registered int)
LANGUAGE sql STABLE AS $$
  WITH ev AS (
    SELECT s.person_key, COALESCE(s.device_category::text, 'desconocido') AS device, e.event_name,
           COALESCE(e.event_params->>'in_app', 'sin_dato') AS in_app, e.event_params->>'method' AS method
    FROM analytics_events e
    JOIN analytics_real_sessions s ON s.session_id = e.session_id
    WHERE e.created_at >= p_from AND e.created_at < p_to
      AND e.event_name IN ('auth_wall_shown', 'auth_wall_click', 'user_registration_success')
  ),
  walls AS (
    -- el grupo de cada persona: el de la última vez que vio la ventana
    SELECT DISTINCT ON (person_key) person_key, device, in_app FROM ev WHERE event_name = 'auth_wall_shown' ORDER BY person_key
  ),
  clicks AS (
    SELECT person_key,
           BOOL_OR(method = 'linkedin') AS linkedin,
           BOOL_OR(method = 'github') AS github,
           BOOL_OR(method IN ('signup', 'login')) AS email
    FROM ev WHERE event_name = 'auth_wall_click' GROUP BY person_key
  ),
  regs AS (SELECT DISTINCT person_key FROM ev WHERE event_name = 'user_registration_success')
  SELECT w.device, w.in_app,
         COUNT(*)::int,
         COUNT(c.person_key)::int,
         COUNT(*) FILTER (WHERE c.linkedin)::int,
         COUNT(*) FILTER (WHERE c.github)::int,
         COUNT(*) FILTER (WHERE c.email)::int,
         COUNT(r.person_key)::int
  FROM walls w
  LEFT JOIN clicks c ON c.person_key = w.person_key
  LEFT JOIN regs r ON r.person_key = w.person_key
  GROUP BY w.device, w.in_app
  ORDER BY 3 DESC;
$$;
GRANT EXECUTE ON FUNCTION analytics_wall_funnel(timestamptz, timestamptz) TO service_role;
