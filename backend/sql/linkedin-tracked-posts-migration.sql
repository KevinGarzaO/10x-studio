-- ============================================
-- Publicaciones de LinkedIn con medición - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Qué hace:
--   1. linkedin_tracked_posts: registro de cada publicación de LinkedIn con la
--      que quieres medir resultados. Cada fila guarda un código utm_content
--      único; el link etiquetado que se genera con ese código es el que pegas
--      en la publicación.
--   2. acquisition_by_post: la vista que cruza ese registro con landing_visits
--      y users, para ver por publicación: visitantes, registros y conversión.
--      También aparecen códigos sin fila registrada (por ejemplo, las vacantes
--      automáticas que ya se publican con utm_content=<slug>).
--
-- Nota: se llama linkedin_tracked_posts (y no linkedin_posts) porque
-- linkedin_posts ya existe: guarda el historial de lo que publicaste.
--
-- Las tablas nuevas nacen con RLS activo y sin acceso para anon/authenticated
-- (como el resto: enable-rls-migration.sql): solo el backend las lee y escribe.
-- ============================================


-- ============================================
-- BLOQUE 1 — Registro de publicaciones
-- ============================================

CREATE TABLE IF NOT EXISTS linkedin_tracked_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nombre corto para el reporte ("5 tips para seniors", el primer renglón del
  -- post, etc.). Si la publicación no tiene fila, el reporte muestra el código.
  label           TEXT NOT NULL,
  -- La página a la que apunta el link (sin UTMs): lo que se re-etiqueta.
  destination_url TEXT NOT NULL,
  utm_campaign    TEXT NOT NULL DEFAULT 'linkedin-manual',
  -- Código único por publicación: es la llave que une el link con el reporte.
  utm_content     TEXT NOT NULL UNIQUE,
  -- URL de la publicación en LinkedIn, si ya la tienes (opcional).
  post_url        TEXT,
  published_at    TIMESTAMPTZ,
  -- 'manual' = registrada en el panel; 'studio' = creada al publicar desde el
  -- panel de LinkedIn.
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'studio')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_tracked_posts_created_idx ON linkedin_tracked_posts (created_at DESC);

ALTER TABLE linkedin_tracked_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON linkedin_tracked_posts FROM anon, authenticated;


-- ============================================
-- BLOQUE 2 — Reporte: visitantes, registros y conversión por publicación
-- ============================================

CREATE OR REPLACE VIEW acquisition_by_post AS
WITH contents AS (
  -- Todo código que haya traído gente: los registrados y los que aparecen solos
  -- (vacantes automáticas con utm_content=<slug>, links sueltos, etc.).
  SELECT utm_content FROM linkedin_tracked_posts
  UNION
  SELECT content FROM landing_visits WHERE content IS NOT NULL
  UNION
  SELECT signup_content FROM users WHERE signup_content IS NOT NULL
),
visits AS (
  SELECT content,
         count(DISTINCT visitor_id) AS visitors,
         count(*)                   AS visits
    FROM landing_visits
   WHERE content IS NOT NULL
   GROUP BY 1
),
signups AS (
  SELECT signup_content AS content,
         count(*)       AS signups
    FROM users
   WHERE signup_content IS NOT NULL
     AND NOT coalesce(is_test_account, false)
     AND NOT coalesce(is_scraper_profile, false)
   GROUP BY 1
)
SELECT p.label,
       c.content                    AS utm_content,
       p.destination_url,
       p.utm_campaign,
       p.post_url,
       p.published_at,
       coalesce(v.visitors, 0)      AS visitors,
       coalesce(v.visits, 0)        AS visits,
       coalesce(s.signups, 0)       AS signups,
       CASE WHEN coalesce(v.visitors, 0) > 0
            THEN round(100.0 * coalesce(s.signups, 0) / v.visitors, 1) END AS conversion_pct
  FROM contents c
  LEFT JOIN linkedin_tracked_posts p ON p.utm_content = c.content
  LEFT JOIN visits  v ON v.content = c.content
  LEFT JOIN signups s ON s.content = c.content
 ORDER BY coalesce(s.signups, 0) DESC, coalesce(v.visitors, 0) DESC, c.content;

REVOKE ALL ON acquisition_by_post FROM anon, authenticated;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT count(*) FROM linkedin_tracked_posts;              -- 0 al inicio
-- SELECT * FROM acquisition_by_post;                        -- vacío al inicio
-- SELECT has_table_privilege('anon', 'public.linkedin_tracked_posts', 'SELECT'); -- false
