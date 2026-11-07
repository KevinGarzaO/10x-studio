-- El registro con LinkedIn / GitHub por proveedor (diagnostico del registro, 6 nov 2026). Corre DESPUES de web-analytics-migration.sql y
-- web-analytics-detail-migration.sql. Se puede correr mas de una vez. No cambia tablas: solo agrega una funcion.
--
-- Cuenta PERSONAS (analytics_real_sessions.person_key). Dos eventos del sitio:
--   auth_provider_click   la persona toco el boton de un proveedor (provider, surface, in_app)
--   auth_provider_return  como volvio (provider, outcome: success | denied | error | no_session | sync_failed | network, reason)
-- Una fila por proveedor, tipo de dispositivo y navegador interno (kind = 'provider'), y una por motivo de regreso fallido (kind = 'reason').
--   clicked    personas que tocaron el boton
--   succeeded  de esas, las que volvieron con sesion
--   denied     las que volvieron porque el proveedor nego o cancelo
--   failed     las que volvieron con otro error (del proveedor o nuestro)
--   no_return  las que tocaron y NUNCA volvieron en el periodo: se quedaron en el proveedor o cerraron antes (la perdida que no deja rastro)
-- Un clic sin regreso no se distingue de un cierre voluntario: se lee como perdida, no como falla.
CREATE OR REPLACE FUNCTION analytics_provider_funnel(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (kind text, provider text, device text, in_app text, label text, clicked int, succeeded int, denied int, failed int, no_return int)
LANGUAGE sql STABLE AS $$
  WITH ev AS (
    SELECT s.person_key, COALESCE(s.device_category::text, 'desconocido') AS device, e.event_name,
           COALESCE(e.event_params->>'provider', 'desconocido') AS provider,
           COALESCE(e.event_params->>'in_app', 'sin_dato') AS in_app,
           e.event_params->>'outcome' AS outcome, e.event_params->>'reason' AS reason
    FROM analytics_events e
    JOIN analytics_real_sessions s ON s.session_id = e.session_id
    WHERE e.created_at >= p_from AND e.created_at < p_to
      AND e.event_name IN ('auth_provider_click', 'auth_provider_return')
  ),
  clicks AS (
    SELECT DISTINCT person_key, provider, device, in_app FROM ev WHERE event_name = 'auth_provider_click'
  ),
  rets AS (
    SELECT person_key, provider,
           BOOL_OR(outcome = 'success') AS ok,
           BOOL_OR(outcome = 'denied') AS denied,
           BOOL_OR(outcome IN ('error', 'no_session', 'sync_failed', 'network')) AS failed
    FROM ev WHERE event_name = 'auth_provider_return' GROUP BY person_key, provider
  ),
  by_provider AS (
    SELECT 'provider'::text AS kind, c.provider, c.device, c.in_app, ''::text AS label,
           COUNT(*)::int AS clicked,
           COUNT(*) FILTER (WHERE r.ok)::int AS succeeded,
           COUNT(*) FILTER (WHERE r.denied AND NOT COALESCE(r.ok, false))::int AS denied,
           COUNT(*) FILTER (WHERE r.failed AND NOT COALESCE(r.ok, false) AND NOT COALESCE(r.denied, false))::int AS failed,
           COUNT(*) FILTER (WHERE r.person_key IS NULL)::int AS no_return
    FROM clicks c LEFT JOIN rets r ON r.person_key = c.person_key AND r.provider = c.provider
    GROUP BY c.provider, c.device, c.in_app
  ),
  by_reason AS (
    SELECT 'reason'::text, e.provider, 'todos'::text, 'todos'::text, COALESCE(e.reason, e.outcome),
           0, 0, 0, COUNT(DISTINCT e.person_key)::int, 0
    FROM ev e WHERE e.event_name = 'auth_provider_return' AND e.outcome IN ('denied', 'error', 'no_session', 'sync_failed', 'network')
    GROUP BY e.provider, COALESCE(e.reason, e.outcome)
  )
  SELECT * FROM by_provider UNION ALL SELECT * FROM by_reason
  ORDER BY 1, 6 DESC, 2, 3;
$$;
GRANT EXECUTE ON FUNCTION analytics_provider_funnel(timestamptz, timestamptz) TO service_role;
