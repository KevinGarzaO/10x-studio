-- Embudo de postulación con tres cortes (para el panel de Telemetry y el agente de producto).
-- Corre DESPUÉS de web-analytics-migration.sql y web-analytics-detail-migration.sql. Se puede correr más de una vez.
--
-- Por cada combinación de dispositivo (móvil / escritorio / tablet) y de quién es (con cuenta / sin cuenta), cuenta PERSONAS distintas
-- (analytics_real_sessions.person_key: sin equipo, pruebas ni robots) que:
--   * abrieron una vacante                      (click_view_job_detail)
--   * llegaron a ver el botón «Postularse»       (apply_button_seen: el botón entró en pantalla; solo desde que se midió)
--   * tocaron «Postularse»                       (click_start_apply)
--   * salieron al sitio de la empresa            (click_external_apply: solo con cuenta)
-- «Sin cuenta» y «con cuenta» salen de la sesión donde pasó el evento. Una persona se cuenta una vez por grupo.
CREATE OR REPLACE FUNCTION analytics_apply_funnel(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (device text, audience text, viewers int, saw_button int, clicked int, left_site int)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(s.device_category::text, 'desconocido') AS device,
         CASE WHEN s.user_id IS NULL THEN 'sin_cuenta' ELSE 'con_cuenta' END AS audience,
         COUNT(DISTINCT s.person_key) FILTER (WHERE e.event_name = 'click_view_job_detail')::int AS viewers,
         COUNT(DISTINCT s.person_key) FILTER (WHERE e.event_name = 'apply_button_seen')::int     AS saw_button,
         COUNT(DISTINCT s.person_key) FILTER (WHERE e.event_name = 'click_start_apply')::int     AS clicked,
         COUNT(DISTINCT s.person_key) FILTER (WHERE e.event_name = 'click_external_apply')::int  AS left_site
  FROM analytics_events e
  JOIN analytics_real_sessions s ON s.session_id = e.session_id
  WHERE e.created_at >= p_from AND e.created_at < p_to
    AND e.event_name IN ('click_view_job_detail', 'apply_button_seen', 'click_start_apply', 'click_external_apply')
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;
GRANT EXECUTE ON FUNCTION analytics_apply_funnel(timestamptz, timestamptz) TO service_role;
