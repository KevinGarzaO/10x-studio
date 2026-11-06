-- Posibles bots en la analítica web. NO borra ni cambia nada: solo MARCA lo que probablemente es tráfico de servidores o de revisores
-- automáticos (vistas previas de enlaces, escáneres de correo, rastreadores) para poder ver cuántas «personas nuevas activas» son reales.
-- Corre DESPUÉS de web-analytics-migration.sql y web-analytics-detail-migration.sql. Se puede correr más de una vez.
--
-- La regla (explicada para que se pueda discutir, y cambiar sin tocar el código):
--   1. La ciudad es un centro de datos conocido (tabla analytics_datacenter_places): Ashburn, Dulles, Des Moines, Council Bluffs, Boydton...
--      Ahí hay servidores, no casas ni oficinas. Se puede añadir o quitar una fila.
--   2. La pantalla tiene un tamaño típico de navegador sin cabeza (800x600 o 400x400).
--   Nunca se marca una sesión de una persona con cuenta ni una que hizo una acción clave (registro, salir a postular...): una persona real
--   que casualmente está en una de esas ciudades no se descarta.
--
-- Qué NO prueba: que una sesión no marcada sea una persona (un bot en una IP residencial pasa), ni que una marcada sea un bot al 100 %.
-- Por eso se llama «probable». Más adelante se puede sumar la señal humana (movimiento, scroll, teclas): ver `human_signal` en el sitio.

CREATE TABLE IF NOT EXISTS analytics_datacenter_places (
  country VARCHAR(100) NOT NULL,
  city    VARCHAR(100) NOT NULL,
  note    TEXT,
  PRIMARY KEY (country, city)
);
ALTER TABLE analytics_datacenter_places ENABLE ROW LEVEL SECURITY;

INSERT INTO analytics_datacenter_places (country, city, note) VALUES
  ('US', 'Ashburn',             'AWS us-east-1'),
  ('US', 'Dulles',              'AWS'),
  ('US', 'Dulles Town Center',  'AWS / revisores de enlaces'),
  ('US', 'Boydton',             'Azure East US'),
  ('US', 'Council Bluffs',      'Google Cloud'),
  ('US', 'Des Moines',          'Azure / AWS'),
  ('US', 'Moses Lake',          'Azure'),
  ('US', 'The Dalles',          'Google Cloud'),
  ('US', 'Quincy',              'Azure'),
  ('US', 'Boardman',            'AWS us-west-2'),
  ('US', 'Prineville',          'Meta'),
  ('US', 'Forest City',         'Meta'),
  ('US', 'Lenoir',              'Google Cloud')
ON CONFLICT DO NOTHING;

-- Las sesiones marcadas y por qué.
CREATE OR REPLACE VIEW analytics_likely_bot_sessions AS
SELECT s.session_id,
       CASE WHEN d.city IS NOT NULL THEN 'centro_de_datos' ELSE 'pantalla_de_servidor' END AS reason
FROM analytics_real_sessions s
LEFT JOIN analytics_datacenter_places d ON d.country = s.country AND d.city = s.city
WHERE s.user_id IS NULL
  AND NOT s.has_conversion
  AND (d.city IS NOT NULL OR s.screen_resolution IN ('800x600', '400x400'));

-- El resumen del panel: cuánto del tráfico del periodo parece de bots, y dónde.
--   dimension 'total' | 'reason' | 'country' | 'city' (estas dos solo de las sesiones marcadas).
--   people = personas distintas (cuenta o navegador); new_active = personas que entraron por primera vez y tuvieron una sesión activa.
CREATE OR REPLACE FUNCTION analytics_bot_summary(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (dimension text, label text, sessions int, people int, active_people int, new_active_people int)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT r.person_key, r.is_engaged, r.is_new_visitor, r.country, r.city, f.reason
    FROM analytics_real_sessions r
    LEFT JOIN analytics_likely_bot_sessions f ON f.session_id = r.session_id
    WHERE r.created_at >= p_from AND r.created_at < p_to
  ),
  agg AS (
    SELECT 'total'::text AS dimension, 'todas'::text AS label, s.* FROM s
    UNION ALL SELECT 'total', 'probables', s.* FROM s WHERE s.reason IS NOT NULL
    UNION ALL SELECT 'reason', s.reason, s.* FROM s WHERE s.reason IS NOT NULL
    UNION ALL SELECT 'country', COALESCE(s.country, '(sin dato)'), s.* FROM s WHERE s.reason IS NOT NULL
    UNION ALL SELECT 'city', COALESCE(s.country, '?') || ' · ' || COALESCE(s.city, '(sin dato)'), s.* FROM s WHERE s.reason IS NOT NULL
  )
  SELECT a.dimension, a.label,
         COUNT(*)::int,
         COUNT(DISTINCT a.person_key)::int,
         COUNT(DISTINCT a.person_key) FILTER (WHERE a.is_engaged)::int,
         COUNT(DISTINCT a.person_key) FILTER (WHERE a.is_engaged AND a.is_new_visitor)::int
  FROM agg a
  GROUP BY a.dimension, a.label
  ORDER BY a.dimension, 3 DESC;
$$;
GRANT EXECUTE ON FUNCTION analytics_bot_summary(timestamptz, timestamptz) TO service_role;
