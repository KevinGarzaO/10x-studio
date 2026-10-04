-- ============================================
-- Vacantes en LinkedIn + origen de los registros - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Dos cosas que van juntas, porque la segunda mide a la primera:
--
--   1. linkedin_vacancy_posts: qué vacantes se publicaron en tu LinkedIn, para no
--      repetirlas y poder ver el historial (texto, enlace, estado).
--   2. Origen de los registros (UTM): de dónde llegó cada persona.
--        - users.signup_*      el primer origen con el que llegó quien se registró.
--        - landing_visits      una fila por sesión de visita, para medir cuánta gente
--                              llega (no solo cuánta se registra) y la conversión.
--        - acquisition_by_source  la vista que cruza ambas: visitantes, registros y
--                              conversión por origen.
--
-- Las tablas nuevas nacen con RLS activo y sin acceso para anon/authenticated (como
-- el resto, ver enable-rls-migration.sql): solo el backend las lee y escribe.
-- ============================================


-- ============================================
-- BLOQUE 1 — Vacantes publicadas en LinkedIn
-- ============================================

CREATE TABLE IF NOT EXISTS linkedin_vacancy_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- La vacante se conserva en el historial aunque se elimine del feed.
  vacancy_id       UUID UNIQUE REFERENCES community_posts(id) ON DELETE SET NULL,
  vacancy_slug     TEXT,
  company          TEXT,
  role_category    TEXT,
  post_text        TEXT NOT NULL,
  post_url         TEXT NOT NULL,
  -- La fila se crea 'pending' ANTES de publicar: el UNIQUE de vacancy_id impide que dos
  -- ejecuciones publiquen la misma vacante.
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  linkedin_post_id TEXT,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS linkedin_vacancy_posts_created_idx ON linkedin_vacancy_posts (created_at DESC);

ALTER TABLE linkedin_vacancy_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON linkedin_vacancy_posts FROM anon, authenticated;


-- ============================================
-- BLOQUE 2 — Origen de los registros
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_medium       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_campaign     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_content      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_referrer     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_landing_path TEXT;

-- Una fila por sesión de visita (el navegador manda una al entrar al sitio).
CREATE TABLE IF NOT EXISTS landing_visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificador aleatorio que guarda el navegador; no identifica a nadie.
  visitor_id   TEXT NOT NULL,
  source       TEXT,
  medium       TEXT,
  campaign     TEXT,
  content      TEXT,
  referrer     TEXT,
  landing_path TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landing_visits_created_idx ON landing_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS landing_visits_visitor_idx ON landing_visits (visitor_id, created_at DESC);

ALTER TABLE landing_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON landing_visits FROM anon, authenticated;


-- ============================================
-- BLOQUE 3 — Reporte: visitantes, registros y conversión por origen
-- ============================================

CREATE OR REPLACE VIEW acquisition_by_source AS
WITH visits AS (
  SELECT coalesce(source, '(directo)') AS source,
         coalesce(medium, '-')         AS medium,
         coalesce(campaign, '-')       AS campaign,
         count(DISTINCT visitor_id)    AS visitors
    FROM landing_visits
   GROUP BY 1, 2, 3
),
signups AS (
  SELECT coalesce(signup_source, '(directo)') AS source,
         coalesce(signup_medium, '-')         AS medium,
         coalesce(signup_campaign, '-')       AS campaign,
         count(*)                             AS signups
    FROM users
   WHERE NOT coalesce(is_test_account, false)
     AND NOT coalesce(is_scraper_profile, false)
   GROUP BY 1, 2, 3
)
SELECT coalesce(v.source, s.source)     AS source,
       coalesce(v.medium, s.medium)     AS medium,
       coalesce(v.campaign, s.campaign) AS campaign,
       coalesce(v.visitors, 0)          AS visitors,
       coalesce(s.signups, 0)           AS signups,
       CASE WHEN coalesce(v.visitors, 0) > 0
            THEN round(100.0 * coalesce(s.signups, 0) / v.visitors, 1) END AS conversion_pct
  FROM visits v
  FULL JOIN signups s ON s.source = v.source AND s.medium = v.medium AND s.campaign = v.campaign
 ORDER BY coalesce(s.signups, 0) DESC, coalesce(v.visitors, 0) DESC;

REVOKE ALL ON acquisition_by_source FROM anon, authenticated;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT count(*) FROM linkedin_vacancy_posts;                 -- 0 al inicio
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'users' AND column_name LIKE 'signup_%';  -- 6 columnas
-- SELECT * FROM acquisition_by_source;                         -- vacío al inicio
-- SELECT has_table_privilege('anon', 'public.landing_visits', 'SELECT'); -- false
