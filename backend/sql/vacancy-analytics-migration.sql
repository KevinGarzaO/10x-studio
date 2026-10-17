-- ============================================
-- Reportes de oferta y demanda - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
-- Requiere user-classification-migration.sql (is_test_account) y
-- vacancy-enrichment-migration.sql (community_posts.location).
--
-- Tres vistas para ver dónde la oferta de vacantes no alcanza a la gente que tienes, y
-- al revés. Se consultan en el editor SQL; la lectura por candidato (quién no está
-- viendo buenas ofertas) está en `npm run match-report`.
--
--   role_supply_demand          por rol: candidatos reales y vacantes (total, 30 y 7 días)
--   skill_supply_demand         por skill: candidatos que lo declaran y vacantes que lo piden
--   vacancy_enrichment_coverage qué tan bien ligadas quedan las vacantes (rol, nivel, skills...)
--
-- Solo cuentan personas REALES (no cuentas de prueba ni perfiles del scraper) y
-- vacantes publicadas. Las vistas no se exponen a las llaves públicas.
-- ============================================


-- ============================================
-- BLOQUE 1 — Por rol
-- ============================================

CREATE OR REPLACE VIEW role_supply_demand AS
WITH roles(role) AS (
  VALUES ('frontend'), ('backend'), ('fullstack'), ('mobile'), ('devops'), ('data_engineer'),
         ('data_scientist'), ('qa'), ('ux_ui'), ('marketing'), ('customer_support'), ('product'),
         ('recursos_humanos'), ('administracion'), ('finanzas'), ('ventas'), ('legal'), ('otro')
),
candidates AS (
  SELECT role_category AS role, count(*) AS candidates
    FROM users
   WHERE account_type = 'candidate'
     AND NOT coalesce(is_test_account, false)
     AND NOT coalesce(is_scraper_profile, false)
     AND role_category IS NOT NULL
   GROUP BY role_category
),
vacancies AS (
  SELECT role_category AS role,
         count(*)                                                      AS vacancies_total,
         count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS vacancies_30d,
         count(*) FILTER (WHERE created_at >= now() - interval '7 days')  AS vacancies_7d,
         max(created_at)                                               AS last_vacancy_at
    FROM community_posts
   WHERE type = 'job' AND role_category IS NOT NULL
   GROUP BY role_category
)
SELECT r.role,
       coalesce(c.candidates, 0)        AS candidates,
       coalesce(v.vacancies_total, 0)   AS vacancies_total,
       coalesce(v.vacancies_30d, 0)     AS vacancies_30d,
       coalesce(v.vacancies_7d, 0)      AS vacancies_7d,
       v.last_vacancy_at,
       CASE WHEN v.last_vacancy_at IS NULL THEN NULL
            ELSE floor(extract(epoch FROM (now() - v.last_vacancy_at)) / 86400)::int
       END                              AS days_since_last_vacancy,
       -- Vacantes del último mes por cada candidato: bajo = la gente de ese rol casi no tiene qué ver.
       round(coalesce(v.vacancies_30d, 0)::numeric / nullif(coalesce(c.candidates, 0), 0), 1) AS vacancies_per_candidate,
       CASE
         WHEN coalesce(c.candidates, 0) > 0 AND coalesce(v.vacancies_30d, 0) = 0 THEN 'sin_vacantes'
         WHEN coalesce(c.candidates, 0) > 0 AND coalesce(v.vacancies_30d, 0)::numeric / c.candidates < 3 THEN 'pocas_vacantes'
         WHEN coalesce(c.candidates, 0) = 0 AND coalesce(v.vacancies_30d, 0) > 0 THEN 'sin_candidatos'
         WHEN coalesce(c.candidates, 0) = 0 THEN 'sin_actividad'
         ELSE 'ok'
       END                              AS estado
  FROM roles r
  LEFT JOIN candidates c ON c.role = r.role
  LEFT JOIN vacancies  v ON v.role = r.role
 ORDER BY (coalesce(c.candidates, 0) > 0 AND coalesce(v.vacancies_30d, 0) = 0) DESC,
          coalesce(c.candidates, 0) DESC, r.role;


-- ============================================
-- BLOQUE 2 — Por skill
-- ============================================

CREATE OR REPLACE VIEW skill_supply_demand AS
WITH declared AS (
  SELECT s AS skill, count(*) AS candidates
    FROM users u, unnest(coalesce(u.skills, '{}')) AS s
   WHERE u.account_type = 'candidate'
     AND NOT coalesce(u.is_test_account, false)
     AND NOT coalesce(u.is_scraper_profile, false)
   GROUP BY s
),
asked AS (
  SELECT skill,
         count(*)                                                         AS vacancies_total,
         count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS vacancies_30d
    FROM (
      SELECT p.created_at, jsonb_array_elements_text(p.skills) AS skill
        FROM community_posts p
       WHERE p.type = 'job' AND jsonb_typeof(p.skills) = 'array'
    ) x
   GROUP BY skill
)
SELECT s.name                           AS skill,
       s.label,
       coalesce(d.candidates, 0)        AS candidates,
       coalesce(a.vacancies_total, 0)   AS vacancies_total,
       coalesce(a.vacancies_30d, 0)     AS vacancies_30d,
       CASE
         WHEN coalesce(d.candidates, 0) > 0 AND coalesce(a.vacancies_30d, 0) = 0 THEN 'candidatos_sin_oferta'
         WHEN coalesce(d.candidates, 0) = 0 AND coalesce(a.vacancies_30d, 0) > 0 THEN 'oferta_sin_candidatos'
         WHEN coalesce(d.candidates, 0) = 0 AND coalesce(a.vacancies_30d, 0) = 0 THEN 'sin_actividad'
         ELSE 'ok'
       END                              AS estado
  FROM skills s
  LEFT JOIN declared d ON d.skill = s.name
  LEFT JOIN asked    a ON a.skill = s.name
 ORDER BY (coalesce(d.candidates, 0) > 0 AND coalesce(a.vacancies_30d, 0) = 0) DESC,
          coalesce(d.candidates, 0) DESC, coalesce(a.vacancies_30d, 0) DESC, s.name;


-- ============================================
-- BLOQUE 3 — Qué tan ligadas quedan las vacantes
-- ============================================

CREATE OR REPLACE VIEW vacancy_enrichment_coverage AS
SELECT count(*)                                                                        AS vacancies,
       round(100.0 * count(role_category)                       / nullif(count(*), 0), 1) AS pct_role,
       round(100.0 * count(seniority_level)                     / nullif(count(*), 0), 1) AS pct_seniority,
       round(100.0 * count(*) FILTER (WHERE jsonb_array_length(coalesce(skills, '[]'::jsonb)) >= 1)
                                                                / nullif(count(*), 0), 1) AS pct_skills,
       round(100.0 * count(*) FILTER (WHERE jsonb_array_length(coalesce(skills, '[]'::jsonb)) >= 3)
                                                                / nullif(count(*), 0), 1) AS pct_3_or_more_skills,
       round(100.0 * count(*) FILTER (WHERE modalidad IS NOT NULL AND modalidad <> 'No especificado')
                                                                / nullif(count(*), 0), 1) AS pct_modality,
       round(100.0 * count(location)                            / nullif(count(*), 0), 1) AS pct_location
  FROM community_posts
 WHERE type = 'job';


-- ============================================
-- Las vistas corren con permisos de su dueño y se saltan RLS: se cierran a las llaves públicas.
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON role_supply_demand, skill_supply_demand, vacancy_enrichment_coverage FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON role_supply_demand, skill_supply_demand, vacancy_enrichment_coverage FROM authenticated;
  END IF;
END $$;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- Roles con gente y sin vacantes este mes (lo primero a atender):
-- SELECT * FROM role_supply_demand;
-- Skills que tienen candidatos y ninguna oferta:
-- SELECT * FROM skill_supply_demand WHERE estado = 'candidatos_sin_oferta';
-- Qué tan bien ligadas están las vacantes:
-- SELECT * FROM vacancy_enrichment_coverage;
