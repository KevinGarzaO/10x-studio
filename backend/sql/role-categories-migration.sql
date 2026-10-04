-- ============================================
-- Categorías de rol: administración, finanzas y recursos humanos - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr completa.
--
-- Qué hace:
--   1. classify_role_category(): una función que dice a qué categoría de rol
--      pertenece una vacante, y que ahora conoce recursos_humanos, administracion y
--      finanzas. Sus reglas se generan desde backend/services/scraper/role-rules.ts,
--      que es donde se prueban.
--   2. El trigger del scraper deja de tener las reglas escritas dentro y usa esa
--      función. Corrige dos defectos del clasificador anterior:
--        - buscaba pedazos de palabra ("ios" dentro de "positions"), y clasificaba un
--          Senior Accountant como móvil; ahora son palabras completas;
--        - miraba todo el texto; ahora solo cuenta el TÍTULO (el cuerpo daba roles
--          equivocados: "Account Executive" como fullstack, "Sales Engineer" como devops).
--   3. Reclasifica lo que ya existe: las vacantes en espera y las ya publicadas. Solo
--      se toca role_category (ni nivel ni skills).
--
-- Las categorías de las PERSONAS (users.role_category) no se tocan.
-- Para que los skills de administración y finanzas aparezcan al elegir esos roles,
-- corre también skills-role-categories-migration.sql.
-- ============================================


-- ============================================
-- BLOQUE 1 — La función de clasificación
-- ============================================

-- Las expresiones van entre $re$...$re$ para que sus barras invertidas se tomen
-- tal cual sin importar la configuración de la base. \m y \M son los límites de
-- palabra de PostgreSQL.
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


-- ============================================
-- BLOQUE 2 — El trigger del scraper usa esa función
-- ============================================

-- El trigger sigue enlazado: CREATE OR REPLACE conserva sus disparadores.
CREATE OR REPLACE FUNCTION classify_scraper_post()
RETURNS TRIGGER AS $$
DECLARE
  computed_skills jsonb;
BEGIN
  -- seniority_level
  NEW.seniority_level := CASE
    WHEN NEW.text ILIKE '%senior%' OR NEW.text ILIKE '%sr.%' OR NEW.text ILIKE '% lead %' THEN 'senior'
    WHEN NEW.text ILIKE '%junior%' OR NEW.text ILIKE '%jr.%' OR NEW.text ILIKE '%trainee%' OR NEW.text ILIKE '%intern%' OR NEW.text ILIKE '%becari%' THEN 'junior'
    ELSE 'semi_senior'
  END;

  -- role_category: la regla vive en classify_role_category() (palabras completas y
  -- por título primero), la misma que usa el relleno de abajo.
  NEW.role_category := classify_role_category(NEW.text);

  -- skills
  SELECT COALESCE(jsonb_agg(skill), '[]'::jsonb) INTO computed_skills FROM (
    SELECT unnest(ARRAY[
      CASE WHEN NEW.text ILIKE '%react%' THEN 'react' END,
      CASE WHEN NEW.text ILIKE '%typescript%' THEN 'typescript' END,
      CASE WHEN NEW.text ILIKE '%next.js%' OR NEW.text ILIKE '%nextjs%' THEN 'nextjs' END,
      CASE WHEN NEW.text ILIKE '%python%' THEN 'python' END,
      CASE WHEN NEW.text ILIKE '%node%' THEN 'nodejs' END,
      CASE WHEN NEW.text ILIKE '%aws%' THEN 'aws' END,
      CASE WHEN NEW.text ILIKE '%docker%' THEN 'docker' END,
      CASE WHEN NEW.text ILIKE '%kubernetes%' THEN 'kubernetes' END,
      CASE WHEN NEW.text ILIKE '%sql%' THEN 'sql' END,
      CASE WHEN NEW.text ILIKE '%golang%' OR NEW.text ILIKE '% go %' THEN 'golang' END,
      CASE WHEN NEW.text ILIKE '%machine learning%' OR NEW.text ILIKE '%inteligencia artificial%' OR NEW.text ILIKE '% ai %' THEN 'ia' END,
      CASE WHEN NEW.text ILIKE '%figma%' THEN 'figma' END,
      CASE WHEN NEW.text ILIKE '%adobe xd%' OR NEW.text ILIKE '%illustrator%' OR NEW.text ILIKE '%photoshop%' THEN 'adobe-suite' END,
      CASE WHEN NEW.text ILIKE '%sketch%' THEN 'sketch' END,
      CASE WHEN NEW.text ILIKE '%seo%' THEN 'seo' END,
      CASE WHEN NEW.text ILIKE '%google ads%' OR NEW.text ILIKE '%sem %' THEN 'google-ads' END,
      CASE WHEN NEW.text ILIKE '%google analytics%' THEN 'google-analytics' END,
      CASE WHEN NEW.text ILIKE '%hubspot%' THEN 'hubspot' END,
      CASE WHEN NEW.text ILIKE '%salesforce%' THEN 'salesforce' END,
      CASE WHEN NEW.text ILIKE '%zendesk%' THEN 'zendesk' END,
      CASE WHEN NEW.text ILIKE '%intercom%' THEN 'intercom' END,
      CASE WHEN NEW.text ILIKE '%excel%' THEN 'excel' END,
      CASE WHEN NEW.text ILIKE '%canva%' THEN 'canva' END,
      CASE WHEN NEW.text ILIKE '%java%' AND NEW.text NOT ILIKE '%javascript%' THEN 'java' END,
      CASE WHEN NEW.text ILIKE '%c#%' OR NEW.text ILIKE '%.net%' THEN 'dotnet' END,
      CASE WHEN NEW.text ILIKE '%ruby%' THEN 'ruby' END,
      CASE WHEN NEW.text ILIKE '%php%' THEN 'php' END,
      CASE WHEN NEW.text ILIKE '%swift%' THEN 'swift' END,
      CASE WHEN NEW.text ILIKE '%kotlin%' THEN 'kotlin' END,
      CASE WHEN NEW.text ILIKE '%angular%' THEN 'angular' END,
      CASE WHEN NEW.text ILIKE '%vue%' THEN 'vue' END,
      CASE WHEN NEW.text ILIKE '%graphql%' THEN 'graphql' END,
      CASE WHEN NEW.text ILIKE '%postgres%' THEN 'postgresql' END,
      CASE WHEN NEW.text ILIKE '%mongodb%' THEN 'mongodb' END,
      CASE WHEN NEW.text ILIKE '%terraform%' THEN 'terraform' END,
      CASE WHEN NEW.text ILIKE '%gcp%' OR NEW.text ILIKE '%google cloud%' THEN 'gcp' END,
      CASE WHEN NEW.text ILIKE '%azure%' THEN 'azure' END
    ]) AS skill
  ) t WHERE skill IS NOT NULL;

  NEW.skills := computed_skills;

  -- spam (OR'd with whatever was already set — never downgrades an explicit true)
  NEW.is_spam := COALESCE(NEW.is_spam, false) OR (
    LENGTH(NEW.text) < 50 OR NEW.text ILIKE '%channel created%' OR NEW.text ILIKE '%joined the group%'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- BLOQUE 3 — Reclasificar lo que ya existe
-- ============================================

-- Vacantes en espera (solo role_category: no dispara el trigger, que escucha `text`).
UPDATE scraper_posts
   SET role_category = classify_role_category(text)
 WHERE post_type = 'vacancy'
   AND role_category IS DISTINCT FROM classify_role_category(text);

-- Vacantes ya publicadas que vienen del scraper (las nativas no se tocan).
UPDATE community_posts
   SET role_category = classify_role_category(coalesce(original_text, content, title))
 WHERE type = 'job'
   AND is_scraper_post = true
   AND role_category IS DISTINCT FROM classify_role_category(coalesce(original_text, content, title));


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- Cuántas vacantes publicadas hay por categoría:
-- SELECT coalesce(role_category, '(sin clasificar)') AS categoria, count(*)
--   FROM community_posts WHERE type = 'job' GROUP BY 1 ORDER BY 2 DESC;
-- Qué cayó en las categorías nuevas:
-- SELECT role_category, title FROM community_posts
--  WHERE type = 'job' AND role_category IN ('recursos_humanos','administracion','finanzas')
--  ORDER BY role_category, title;
-- Ya no debe haber un "Accountant" como mobile:
-- SELECT title, role_category FROM community_posts WHERE title ILIKE '%accountant%';
