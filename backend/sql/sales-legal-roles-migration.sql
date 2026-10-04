-- ============================================
-- Nuevos roles: Ventas y Legal - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
-- Requiere las migraciones de roles, skills, enriquecimiento, analítica y la regla de
-- vacantes (vacancy-publish-rule-migration.sql).
--
-- Por qué: la regla de negocio exige que cada vacante tenga un rol y skills del
-- catálogo. Las de ventas, legal y solutions engineering no tenían categoría de rol y
-- se descartaban (más de la mitad de lo que se eliminó fue "sin rol").
--
-- Qué hace:
--   1. Agrega 8 skills (ventas, CRM, negocio, negociación, contratos, cumplimiento,
--      derecho, privacidad) con sus alias, términos de detección y roles.
--   2. Liga Salesforce y HubSpot también al rol de ventas.
--   3. Actualiza la función que clasifica el rol por el título (ahora con ventas y
--      legal), la regla de vacantes y el reporte por rol.
--   4. Reclasifica las vacantes en espera con las reglas nuevas.
--
-- Los exámenes de los skills nuevos no se habilitan hasta que tengan preguntas.
-- ============================================

-- BLOQUE 1 — Skills y alias
INSERT INTO skills (name, label) VALUES
  ('sales', 'Ventas'),
  ('crm', 'CRM'),
  ('business-development', 'Desarrollo de negocio'),
  ('negotiation', 'Negociación'),
  ('contracts', 'Contratos'),
  ('compliance', 'Cumplimiento normativo'),
  ('corporate-law', 'Derecho'),
  ('data-privacy', 'Privacidad de datos')
ON CONFLICT (name) DO NOTHING;

INSERT INTO skill_aliases (alias_key, skill_name) VALUES
  ('ventas', 'sales'),
  ('b2b', 'sales'),
  ('prospecting', 'sales'),
  ('prospeccion', 'sales'),
  ('pipedrive', 'crm'),
  ('zohocrm', 'crm'),
  ('bizdev', 'business-development'),
  ('leadgeneration', 'business-development'),
  ('negociacion', 'negotiation'),
  ('contratos', 'contracts'),
  ('regulatory', 'compliance'),
  ('gdpr', 'data-privacy'),
  ('ccpa', 'data-privacy'),
  ('derecho', 'corporate-law'),
  ('abogado', 'corporate-law'),
  ('litigation', 'corporate-law'),
  ('privacy', 'data-privacy')
ON CONFLICT DO NOTHING;

-- BLOQUE 2 — Cómo se detectan y a qué roles pertenecen (no pisa lo ajustado a mano)
UPDATE skills AS s
   SET detect_terms = m.terms
  FROM (VALUES
  ('sales', ARRAY['sales', 'ventas', 'b2b sales', 'prospecting', 'prospección', 'cold calling', 'outbound', 'quota attainment']::text[]),
  ('crm', ARRAY['crm', 'pipedrive', 'zoho crm']::text[]),
  ('business-development', ARRAY['business development', 'desarrollo de negocio', 'lead generation', 'generación de leads']::text[]),
  ('negotiation', ARRAY['negotiation', 'negotiating', 'negociación']::text[]),
  ('contracts', ARRAY['contract drafting', 'contract negotiation', 'contract management', 'contratos']::text[]),
  ('compliance', ARRAY['compliance', 'regulatory', 'cumplimiento normativo', 'gdpr', 'sox', 'aml', 'kyc']::text[]),
  ('corporate-law', ARRAY['corporate law', 'litigation', 'derecho corporativo', 'derecho mercantil', 'derecho laboral', 'intellectual property', 'propiedad intelectual', 'paralegal', '^attorney', '^counsel', '^abogado', '^abogada']::text[]),
  ('data-privacy', ARRAY['data privacy', 'privacy law', 'ccpa', 'protección de datos', 'privacidad de datos']::text[])
  ) AS m(name, terms)
 WHERE s.name = m.name
   AND s.detect_terms = '{}';

UPDATE skills AS s
   SET role_categories = m.roles
  FROM (VALUES
  ('sales', ARRAY['ventas']::text[]),
  ('crm', ARRAY['ventas', 'marketing', 'customer_support']::text[]),
  ('business-development', ARRAY['ventas', 'marketing']::text[]),
  ('negotiation', ARRAY['ventas', 'legal', 'administracion']::text[]),
  ('contracts', ARRAY['legal', 'administracion']::text[]),
  ('compliance', ARRAY['legal', 'finanzas', 'administracion']::text[]),
  ('corporate-law', ARRAY['legal']::text[]),
  ('data-privacy', ARRAY['legal']::text[])
  ) AS m(name, roles)
 WHERE s.name = m.name
   AND s.role_categories = '{}';

UPDATE skills SET role_categories = array_append(role_categories, 'ventas') WHERE name = 'salesforce' AND NOT ('ventas' = ANY(role_categories));
UPDATE skills SET role_categories = array_append(role_categories, 'ventas') WHERE name = 'hubspot' AND NOT ('ventas' = ANY(role_categories));

-- BLOQUE 3 — La función de clasificación, con ventas y legal
CREATE OR REPLACE FUNCTION classify_role_category(p_text TEXT)
RETURNS TEXT AS $$
DECLARE
  -- El título es la primera línea, sin los # de markdown.
  v_title TEXT := lower(btrim(regexp_replace(split_part(coalesce(p_text, ''), E'\n', 1), $re$^#+\s*$re$, '')));
BEGIN
  -- Solo por el título: lo que dice qué puesto es. El cuerpo no se mira: mirarlo como
  -- respaldo asignaba roles equivocados ("Account Executive" como fullstack).
  IF v_title ~ $re$\m(full[ -]?stack)\M$re$ THEN
    RETURN 'fullstack';
  END IF;
  IF v_title ~ $re$\m(devops|sre|site reliability|platform engineer\w*|infrastructure engineer\w*|cloud engineer\w*)\M$re$ THEN
    RETURN 'devops';
  END IF;
  IF v_title ~ $re$\m(data scientist\w*|machine learning|ml engineer\w*|research scientist\w*|applied scientist\w*|data analyst\w*|ai engineer\w*|artificial intelligence|científic[oa] de datos|analista de datos)\M$re$ THEN
    RETURN 'data_scientist';
  END IF;
  IF v_title ~ $re$\m(data engineer\w*|analytics engineer\w*|ingenier[oa] de datos|ingenier[oa] de integración de datos|arquitecto de datos|desarrollador(a)? bi|etl developer\w*|big data)\M$re$ THEN
    RETURN 'data_engineer';
  END IF;
  IF v_title ~ $re$\m(qa|quality assurance|sdet|test engineer\w*|test automation|tester|ingenier[oa] de calidad|analista de calidad|analista qa)\M$re$ THEN
    RETURN 'qa';
  END IF;
  IF v_title ~ $re$\m(ios|android|react native|flutter|mobile (engineer|developer|app\w*)|desarrollador(a)? móvil)\M$re$ THEN
    RETURN 'mobile';
  END IF;
  IF v_title ~ $re$\m(front[ -]?end|ui engineer\w*|web developer\w*|desarrollador(a)? web)\M$re$ THEN
    RETURN 'frontend';
  END IF;
  IF v_title ~ $re$\m(back[ -]?end|api engineer\w*|server[ -]side)\M$re$ THEN
    RETURN 'backend';
  END IF;
  IF v_title ~ $re$\m(ux|ui|ui/ux|ux/ui|product design\w*|designer\w*|design lead|diseñador(a)?(es)?|graphic design\w*|brand design\w*|motion design\w*|illustrator|art director)\M$re$ THEN
    RETURN 'ux_ui';
  END IF;
  IF v_title ~ $re$\m(product manager\w*|product owner\w*|product lead|head of product|director of product|vp of product|product operations|product management|gerente de producto|technical product)\M$re$ THEN
    RETURN 'product';
  END IF;
  IF v_title ~ $re$\m(sales|account (executive|manager|director)s?|business development|sdr|bdr|solutions? (engineer\w*|architect\w*|consultant\w*)|pre[ -]?sales|partnerships? (manager|lead|director|executive)|channel (manager|partner\w*)|revenue operations|ventas|vendedor(a)?(es)?|ejecutiv[oa] (de cuenta|comercial|de ventas)|desarrollo de negocio|comercial)\M$re$ THEN
    RETURN 'ventas';
  END IF;
  IF v_title ~ $re$\m(recruiter\w*|recruiting|talent acquisition|talent partner\w*|sourcer\w*|human resources|recursos humanos|rrhh|hrbp|hr (business partner|manager|generalist|coordinator|specialist)|people (partner\w*|operations|ops|business partner\w*|programs?|team|experience)|compensation|payroll|nómina|nomina|reclutador(a)?(es)?|reclutamiento|employee (experience|relations)|learning (and|&) development)\M$re$ THEN
    RETURN 'recursos_humanos';
  END IF;
  IF v_title ~ $re$\m(accountant\w*|accounting|contador(a)?(es)?|contabilidad|contable|financial (analyst\w*|planning|controller\w*|reporting|accountant\w*)|finance (manager|analyst\w*|lead|director|business partner)|controller|treasury (analyst\w*|manager\w*|specialist\w*|director|lead|associate|operations)|tesorer\w*|auditor\w*|audit|tax|impuestos|accounts (payable|receivable)|revenue accounting|financial operations|financiero|finanzas)\M$re$ THEN
    RETURN 'finanzas';
  END IF;
  IF v_title ~ $re$\m(administrative|administrativ[oa]s?|administraci[oó]n|office manager|executive assistant|executive business partner|asistente|business operations|operations (manager|coordinator|specialist|analyst|associate)|procurement|compras|legal operations|contracts? (manager|specialist|administrator|analyst|coordinator|lead)|coordinador(a)?(es)?|coordinator|supply chain|logística|logistics|chief of staff)\M$re$ THEN
    RETURN 'administracion';
  END IF;
  IF v_title ~ $re$\m(counsel|attorney\w*|lawyer\w*|paralegal\w*|legal (director|manager|associate|analyst|specialist|assistant|advisor|officer|lead|affairs)|compliance|regulatory|abogad[oa]s?|jurídic[oa]s?|litigation|privacy (officer|manager|analyst|lead)|data protection|cumplimiento normativo)\M$re$ THEN
    RETURN 'legal';
  END IF;
  IF v_title ~ $re$\m(marketing|growth|seo|sem|ppc|content (writer|strategist|creator|marketing|designer)|copywriter\w*|social media|community manager|brand|demand generation|lifecycle|public relations|comunicaci\w+|mercadotecnia|publicidad|campaign\w*)\M$re$ THEN
    RETURN 'marketing';
  END IF;
  IF v_title ~ $re$\m(customer (support|success|service|experience|care)|atención al cliente|servicio al cliente|soporte|support (engineer\w*|specialist\w*|agent\w*|associate\w*)|help desk|service desk|technical support)\M$re$ THEN
    RETURN 'customer_support';
  END IF;
  IF v_title ~ $re$\m(software (engineer\w*|developer\w*|development engineer\w*)|desarrollador(a)?|programador(a)?|arquitecto de software|ingenier[oa] de software|swe|sde)\M$re$ THEN
    RETURN 'fullstack';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- BLOQUE 4 — La regla de vacantes acepta los dos roles nuevos
CREATE OR REPLACE FUNCTION enforce_vacancy_linkage()
RETURNS TRIGGER AS $$
DECLARE
  v_skill TEXT;
BEGIN
  IF NEW.type IS DISTINCT FROM 'job' THEN
    RETURN NEW;
  END IF;

  IF btrim(coalesce(NEW.title, '')) = '' THEN
    RAISE EXCEPTION 'vacancy_not_linked: no_title';
  END IF;
  IF btrim(coalesce(NEW.company, '')) = '' THEN
    RAISE EXCEPTION 'vacancy_not_linked: no_company';
  END IF;
  IF btrim(coalesce(NEW.source_url, '')) = '' THEN
    RAISE EXCEPTION 'vacancy_not_linked: no_apply_url';
  END IF;

  -- Los mismos roles que backend/services/vacancies/publish-rule.ts (todos menos 'otro').
  IF NEW.role_category IS NULL THEN
    RAISE EXCEPTION 'vacancy_not_linked: no_role';
  END IF;
  IF NEW.role_category NOT IN (
    'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data_engineer', 'data_scientist',
    'qa', 'ux_ui', 'marketing', 'customer_support', 'product',
    'recursos_humanos', 'administracion', 'finanzas', 'ventas', 'legal'
  ) THEN
    RAISE EXCEPTION 'vacancy_not_linked: unknown_role (%)', NEW.role_category;
  END IF;

  IF jsonb_typeof(NEW.skills) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.skills) < 1 THEN
    RAISE EXCEPTION 'vacancy_not_linked: no_skills';
  END IF;

  FOR v_skill IN SELECT jsonb_array_elements_text(NEW.skills) LOOP
    IF NOT EXISTS (SELECT 1 FROM skills WHERE name = v_skill) THEN
      RAISE EXCEPTION 'vacancy_not_linked: unknown_skill (%)', v_skill;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- BLOQUE 5 — El reporte por rol los incluye
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

-- BLOQUE 6 — Reclasificar las vacantes en espera
UPDATE scraper_posts
   SET role_category = classify_role_category(text)
 WHERE post_type = 'vacancy'
   AND role_category IS DISTINCT FROM classify_role_category(text);


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT role_category, count(*) FROM scraper_posts WHERE post_type = 'vacancy' GROUP BY 1 ORDER BY 2 DESC;
-- SELECT name, role_categories FROM skills WHERE 'ventas' = ANY(role_categories) OR 'legal' = ANY(role_categories);
