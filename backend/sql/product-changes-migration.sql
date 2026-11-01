-- Bitácora de cambios del producto: qué se cambió y cuándo, para poder medir ANTES y DESPUÉS de cada cambio.
--
-- Corre MANUAL en el editor SQL de Supabase, DESPUÉS de web-analytics-migration.sql, web-analytics-segments-migration.sql y
-- telemetry-migration.sql (usa sus vistas y tablas). Es idempotente.
--
-- Sin esto no se puede saber si una feature funcionó: los números suben y bajan solos (un sábado, una publicación de LinkedIn) y, sin
-- la fecha exacta de cada cambio, nadie (ni el agente de producto de E) puede compararlo con lo que pasaba antes. Es el "historial" que
-- le da sentido a los datos. Se llena de tres maneras (ver backend/services/analytics/changes.ts):
--   * `npm run log-changes`  trae de git lo que se subió (feat / fix / perf...), con la fecha del commit.
--   * `npm run log-change`   agrega a mano lo que no es un commit: un interruptor que se prendió en Railway, un cambio de horario...
--   * el servidor, al arrancar tras un despliegue de Railway, anota el commit desplegado con la hora REAL del despliegue.
--
-- IMPORTANTE para leer los números: "antes y después" NO prueba que el cambio fue la causa. Cada fila trae cuántos otros cambios cayeron
-- cerca (`nearby_changes`) y cuántos días con medición hay de cada lado, para no sacar conclusiones con poco o con mezclado.

CREATE TABLE IF NOT EXISTS product_changes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipped_at      timestamptz NOT NULL DEFAULT now(),
  title           text        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 300),
  description     text,
  kind            text        NOT NULL DEFAULT 'feature' CHECK (kind IN ('feature', 'fix', 'experiment', 'config', 'content', 'chore')),
  area            text        NOT NULL DEFAULT 'general' CHECK (area ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- Qué número se espera que se mueva (texto libre: "registros", "personas activas", "errores del feed"...).
  expected_metric text,
  commit_sha      text        UNIQUE,
  source          text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'git', 'deploy')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_changes_shipped_idx ON product_changes (shipped_at DESC);

ALTER TABLE product_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON product_changes FROM PUBLIC, anon, authenticated;

-- Las cifras de una ventana de tiempo [p_from, p_to): una sola fila.
--   sessions        sesiones de personas reales (sin equipo, pruebas ni robots)
--   active_person_days  (persona, día) con al menos una sesión activa: dividido entre los días medidos es el promedio de personas activas por día
--   new_active      personas activas cuya primera visita (o cuenta) cae dentro de la ventana
--   registrations   cuentas reales nuevas (esto viene de `users`, así que tiene historia más larga que la medición)
--   errors          errores registrados (telemetría)
--   tracked_days    días de la ventana que ya tenían medición de sesiones (la medición nueva empezó el 30 de octubre de 2026)
--   calendar_days   días de la ventana que ya transcurrieron (hasta ahora)
CREATE OR REPLACE FUNCTION analytics_window_metrics(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (sessions int, active_person_days int, new_active int, registrations int, errors int, tracked_days numeric, calendar_days numeric)
LANGUAGE sql STABLE AS $$
  WITH first_seen AS (
    SELECT s.person_key, LEAST(MIN(s.created_at), COALESCE(MIN(u.created_at), 'infinity'::timestamptz)) AS first_at
    FROM analytics_real_sessions s LEFT JOIN users u ON u.id::text = s.person_key
    GROUP BY s.person_key
  ),
  w AS (
    SELECT person_key, is_engaged, day_mty FROM analytics_real_sessions WHERE created_at >= p_from AND created_at < p_to
  ),
  since AS (SELECT MIN(created_at) AS started FROM analytics_sessions)
  SELECT
    (SELECT COUNT(*) FROM w)::int,
    (SELECT COUNT(*) FROM (SELECT DISTINCT person_key, day_mty FROM w WHERE is_engaged) d)::int,
    (SELECT COUNT(DISTINCT w.person_key) FROM w JOIN first_seen f ON f.person_key = w.person_key WHERE w.is_engaged AND f.first_at >= p_from AND f.first_at < p_to)::int,
    (SELECT COUNT(*) FROM users u
      WHERE u.created_at >= p_from AND u.created_at < p_to
        AND NOT COALESCE(u.is_test_account, false) AND NOT COALESCE(u.is_scraper_profile, false) AND COALESCE(u.user_kind, 'user') = 'user')::int,
    (SELECT COUNT(*) FROM analytics_error_logs e
      WHERE e.created_at >= p_from AND e.created_at < p_to
        AND (e.session_id IS NULL OR e.session_id IN (SELECT session_id FROM analytics_real_sessions)))::int,
    COALESCE((SELECT GREATEST(0, EXTRACT(epoch FROM (LEAST(p_to, now()) - GREATEST(p_from, since.started))) / 86400.0) FROM since), 0)::numeric,
    GREATEST(0, EXTRACT(epoch FROM (LEAST(p_to, now()) - p_from)) / 86400.0)::numeric;
$$;

-- Cada cambio con lo que pasó en los `p_window_days` días ANTES y en los `p_window_days` DESPUÉS (la ventana de después se corta en "ahora").
-- `after_complete` dice si ya pasaron los días completos de la ventana de después.
-- `nearby_changes` es cuántos OTROS cambios cayeron dentro de la ventana completa (antes + después): cuanto más haya, menos se le puede atribuir a este.
CREATE OR REPLACE FUNCTION analytics_change_impact(p_window_days int DEFAULT 7, p_limit int DEFAULT 100, p_since timestamptz DEFAULT NULL)
RETURNS TABLE (
  id uuid, shipped_at timestamptz, title text, description text, kind text, area text, expected_metric text, source text, commit_sha text,
  before_sessions int, before_active_person_days int, before_new_active int, before_registrations int, before_errors int, before_tracked_days numeric, before_calendar_days numeric,
  after_sessions int,  after_active_person_days int,  after_new_active int,  after_registrations int,  after_errors int,  after_tracked_days numeric,  after_calendar_days numeric,
  after_complete boolean, nearby_changes int
)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT * FROM product_changes
    WHERE p_since IS NULL OR product_changes.shipped_at >= p_since
    ORDER BY product_changes.shipped_at DESC
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT c.id, c.shipped_at, c.title, c.description, c.kind, c.area, c.expected_metric, c.source, c.commit_sha,
         b.sessions, b.active_person_days, b.new_active, b.registrations, b.errors, b.tracked_days, b.calendar_days,
         a.sessions, a.active_person_days, a.new_active, a.registrations, a.errors, a.tracked_days, a.calendar_days,
         c.shipped_at + make_interval(days => GREATEST(p_window_days, 1)) <= now(),
         (SELECT COUNT(*)::int FROM product_changes o
           WHERE o.id <> c.id
             AND o.shipped_at > c.shipped_at - make_interval(days => GREATEST(p_window_days, 1))
             AND o.shipped_at < c.shipped_at + make_interval(days => GREATEST(p_window_days, 1)))
  FROM c
  CROSS JOIN LATERAL analytics_window_metrics(c.shipped_at - make_interval(days => GREATEST(p_window_days, 1)), c.shipped_at) b
  CROSS JOIN LATERAL analytics_window_metrics(c.shipped_at, c.shipped_at + make_interval(days => GREATEST(p_window_days, 1))) a
  ORDER BY c.shipped_at DESC;
$$;

REVOKE ALL ON FUNCTION analytics_window_metrics(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_change_impact(int, int, timestamptz)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_window_metrics(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_change_impact(int, int, timestamptz)     TO service_role;
