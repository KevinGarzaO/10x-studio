-- ============================================
-- Enriquecimiento de vacantes - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
-- Requiere role-categories-migration.sql (classify_role_category) y
-- skills-role-categories-migration.sql (skills.role_categories).
--
-- Que cada vacante nazca LIGADA a candidatos y a empresas: rol, nivel, skills del
-- catálogo, modalidad y ubicación. El análisis lo hace el scraper al guardar cada
-- vacante (backend/services/vacancies/), sobre la descripción COMPLETA; la base solo
-- guarda el resultado y los datos que el análisis necesita:
--
--   1. skills.detect_terms     cómo se reconoce cada skill dentro de una vacante. Es un
--                              dato: para que un skill nuevo se detecte basta darle sus
--                              términos aquí, sin desplegar código.
--   2. community_posts.location  la ubicación se perdía al publicar la vacante.
--   3. El trigger del scraper deja de decidir nivel y skills (los pone el análisis; un
--      nivel que no se sabe se queda NULL en vez de "semi_senior") y solo rellena el rol
--      cuando quien guardó la fila no lo trajo.
-- ============================================


-- ============================================
-- BLOQUE 1 — Cómo se detecta cada skill
-- ============================================

-- Los términos se comparan como palabra completa. Un `=` al inicio distingue
-- mayúsculas (=React: la librería, no el verbo), y un `^` solo cuenta en el título o
-- departamento (^recruiter: en el cuerpo es ruido del proceso de selección).
ALTER TABLE skills ADD COLUMN IF NOT EXISTS detect_terms TEXT[] NOT NULL DEFAULT '{}';

-- Solo llena los skills que aún no tienen términos: lo que ajustes a mano no se pisa.
UPDATE skills AS s
   SET detect_terms = m.terms
  FROM (VALUES
  ('react', ARRAY['reactjs', 'react.js', '=React']::text[]),
  ('typescript', ARRAY['typescript']::text[]),
  ('nextjs', ARRAY['next.js', 'nextjs']::text[]),
  ('python', ARRAY['python', 'django', 'flask', 'fastapi']::text[]),
  ('nodejs', ARRAY['node.js', 'nodejs', 'node js']::text[]),
  ('aws', ARRAY['aws', 'amazon web services']::text[]),
  ('docker', ARRAY['docker']::text[]),
  ('kubernetes', ARRAY['kubernetes', 'k8s']::text[]),
  ('sql', ARRAY['sql', 'mysql', 'pl/sql', 'plsql']::text[]),
  ('golang', ARRAY['golang', 'go lang']::text[]),
  ('ia', ARRAY['machine learning', 'deep learning', 'inteligencia artificial', 'artificial intelligence', 'ai engineer', 'ai/ml', 'ml engineer', 'llm', 'llms', 'generative ai', 'genai', 'nlp']::text[]),
  ('figma', ARRAY['figma']::text[]),
  ('adobe-suite', ARRAY['photoshop', 'illustrator', 'adobe xd', 'indesign', 'adobe creative', 'lightroom']::text[]),
  ('sketch', ARRAY['=Sketch']::text[]),
  ('seo', ARRAY['seo', 'search engine optimization']::text[]),
  ('google-ads', ARRAY['google ads', 'adwords', 'ppc', '=SEM']::text[]),
  ('google-analytics', ARRAY['google analytics', 'ga4']::text[]),
  ('hubspot', ARRAY['hubspot']::text[]),
  ('salesforce', ARRAY['salesforce']::text[]),
  ('zendesk', ARRAY['zendesk']::text[]),
  ('intercom', ARRAY['intercom']::text[]),
  ('excel', ARRAY['microsoft excel', 'ms excel', 'excel avanzado', 'hojas de cálculo', 'spreadsheets', '=Excel']::text[]),
  ('canva', ARRAY['canva']::text[]),
  ('java', ARRAY['java', 'spring boot']::text[]),
  ('dotnet', ARRAY['.net', 'dotnet', 'asp.net']::text[]),
  ('ruby', ARRAY['ruby on rails', '=Ruby', '=Rails']::text[]),
  ('php', ARRAY['php', 'laravel', 'symfony']::text[]),
  ('swift', ARRAY['swiftui', '=Swift']::text[]),
  ('kotlin', ARRAY['kotlin']::text[]),
  ('angular', ARRAY['angular', 'angularjs']::text[]),
  ('vue', ARRAY['vue.js', 'vuejs', '=Vue']::text[]),
  ('graphql', ARRAY['graphql']::text[]),
  ('postgresql', ARRAY['postgresql', 'postgres']::text[]),
  ('mongodb', ARRAY['mongodb', 'mongo db']::text[]),
  ('terraform', ARRAY['terraform']::text[]),
  ('gcp', ARRAY['gcp', 'google cloud']::text[]),
  ('azure', ARRAY['azure']::text[]),
  ('javascript', ARRAY['javascript', 'ecmascript']::text[]),
  ('html-css', ARRAY['html', 'css', 'html5', 'css3']::text[]),
  ('git', ARRAY['=Git', 'github', 'gitlab', 'bitbucket', 'version control', 'control de versiones']::text[]),
  ('linux', ARRAY['linux', 'ubuntu', 'bash scripting']::text[]),
  ('csharp', ARRAY['c#', 'c sharp']::text[]),
  ('cpp', ARRAY['c++']::text[]),
  ('rust', ARRAY['=Rust']::text[]),
  ('react-native', ARRAY['react native']::text[]),
  ('flutter', ARRAY['flutter']::text[]),
  ('redis', ARRAY['redis']::text[]),
  ('kafka', ARRAY['kafka']::text[]),
  ('spark', ARRAY['apache spark', 'pyspark']::text[]),
  ('ci-cd', ARRAY['ci/cd', 'cicd', 'jenkins', 'github actions', 'gitlab ci', 'continuous integration', 'integración continua']::text[]),
  ('test-automation', ARRAY['test automation', 'automated testing', 'selenium', 'cypress', 'playwright', 'pruebas automatizadas', 'qa automation']::text[]),
  ('tableau', ARRAY['tableau']::text[]),
  ('power-bi', ARRAY['power bi', 'powerbi']::text[]),
  ('jira', ARRAY['jira', 'confluence']::text[]),
  ('sap', ARRAY['=SAP', 'sap hana', 'sap s/4hana']::text[]),
  ('accounting', ARRAY['accounting', 'accountant', 'contabilidad', 'contador', 'contable']::text[]),
  ('financial-analysis', ARRAY['financial analysis', 'financial modeling', 'financial planning', 'análisis financiero', 'fp&a']::text[]),
  ('budgeting', ARRAY['budgeting', 'budget management', 'presupuesto', 'presupuestos']::text[]),
  ('quickbooks', ARRAY['quickbooks', 'contpaqi', 'contpaq']::text[]),
  ('payroll', ARRAY['payroll', 'nómina', 'nominas']::text[]),
  ('recruiting', ARRAY['talent acquisition', 'reclutamiento', 'full-cycle recruiting', '^recruiter', '^recruiting', '^sourcer']::text[]),
  ('human-resources', ARRAY['human resources', 'recursos humanos', 'hrbp', 'people operations']::text[]),
  ('project-management', ARRAY['project management', 'project manager', 'gestión de proyectos', 'pmp']::text[]),
  ('agile-scrum', ARRAY['scrum', 'agile', 'kanban', 'metodologías ágiles']::text[]),
  ('business-administration', ARRAY['business administration', 'administración de empresas', 'office administration']::text[]),
  ('procurement', ARRAY['procurement', 'purchasing', 'compras', 'supply chain', 'cadena de suministro']::text[]),
  ('ui-ux-design', ARRAY['ui/ux', 'ux/ui', 'ux design', 'ui design', 'user experience', 'user interface', 'diseño ux', 'diseño ui']::text[]),
  ('graphic-design', ARRAY['graphic design', 'diseño gráfico']::text[]),
  ('design-systems', ARRAY['design system', 'design systems', 'sistemas de diseño']::text[]),
  ('video-editing', ARRAY['video editing', 'edición de video', 'premiere pro', 'final cut', 'davinci resolve', 'capcut']::text[]),
  ('motion-graphics', ARRAY['motion graphics', 'motion design', 'after effects']::text[]),
  ('webflow', ARRAY['webflow']::text[]),
  ('social-media', ARRAY['social media', 'redes sociales', 'community manager']::text[]),
  ('content-marketing', ARRAY['content marketing', 'marketing de contenidos']::text[]),
  ('copywriting', ARRAY['copywriting', 'copywriter', 'redacción publicitaria']::text[]),
  ('email-marketing', ARRAY['email marketing', 'mailchimp', 'klaviyo']::text[]),
  ('meta-ads', ARRAY['meta ads', 'facebook ads', 'instagram ads']::text[]),
  ('growth-marketing', ARRAY['growth marketing', 'growth hacking', 'performance marketing']::text[]),
  ('wordpress', ARRAY['wordpress', 'woocommerce']::text[]),
  ('shopify', ARRAY['shopify']::text[]),
  ('product-management', ARRAY['product management', 'gestión de producto', 'product owner']::text[]),
  ('customer-service', ARRAY['customer service', 'customer support', 'customer success', 'atención al cliente', 'servicio al cliente']::text[])
  ) AS m(name, terms)
 WHERE s.name = m.name
   AND s.detect_terms = '{}';

-- Para un skill nuevo, sin terms se detecta por su etiqueta y su nombre. Para afinarlo:
--   UPDATE skills SET detect_terms = ARRAY['mi termino', '=MiTerminoExacto'] WHERE name = 'xyz';


-- ============================================
-- BLOQUE 2 — La ubicación llega a la vacante publicada
-- ============================================

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS location TEXT;

-- Las ya publicadas la traen dentro de su texto ("**Ubicación:** Austin, TX").
UPDATE community_posts
   SET location = btrim(substring(original_text FROM $re$\*\*Ubicaci[oó]n:\*\*\s*([^\n]+)$re$))
 WHERE type = 'job'
   AND location IS NULL
   AND original_text ~ $re$\*\*Ubicaci[oó]n:\*\*$re$;


-- ============================================
-- BLOQUE 3 — El trigger del scraper deja de adivinar
-- ============================================

-- El trigger sigue enlazado (CREATE OR REPLACE conserva sus disparadores). Antes
-- recalculaba rol, nivel y skills con reglas escritas aquí, sobre el texto recortado,
-- y pisaba lo que el análisis había sacado de la descripción completa. Ahora:
--   * el rol solo se deduce si la fila llegó sin él (respaldo);
--   * nivel y skills no se tocan: los pone el análisis, y "no se sabe" es NULL.
CREATE OR REPLACE FUNCTION classify_scraper_post()
RETURNS TRIGGER AS $$
BEGIN
  NEW.role_category := COALESCE(NEW.role_category, classify_role_category(NEW.text));

  -- spam (OR'd with whatever was already set — never downgrades an explicit true)
  NEW.is_spam := COALESCE(NEW.is_spam, false) OR (
    LENGTH(NEW.text) < 50 OR NEW.text ILIKE '%channel created%' OR NEW.text ILIKE '%joined the group%'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- Cuántos skills tienen términos de detección (deben ser todos):
-- SELECT count(*) FILTER (WHERE detect_terms <> '{}') AS con_terminos, count(*) AS total FROM skills;
-- Cuántas vacantes publicadas ya tienen ubicación:
-- SELECT count(*) FILTER (WHERE location IS NOT NULL) AS con_ubicacion, count(*) AS total
--   FROM community_posts WHERE type = 'job';
