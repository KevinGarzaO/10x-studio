-- ============================================
-- Ampliación del catálogo de skills - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr; ON CONFLICT DO NOTHING no duplica nada.
-- Agrega 45 skills nuevos (37 -> 82) y sus alias, sin tocar los existentes.
-- Un skill nuevo aparece en la app de inmediato (el catálogo es un dato), pero su
-- examen no se habilita hasta que tenga preguntas en el banco.
--
-- Para quitar uno antes de correrlo, borra su línea en el bloque 1 y sus alias en el 2.
-- ============================================

-- ============================================
-- BLOQUE 1 — Skills
-- ============================================

INSERT INTO skills (name, label) VALUES
  -- Tecnología
  ('javascript', 'JavaScript'),
  ('html-css', 'HTML/CSS'),
  ('git', 'Git'),
  ('linux', 'Linux'),
  ('csharp', 'C#'),
  ('cpp', 'C++'),
  ('rust', 'Rust'),
  ('react-native', 'React Native'),
  ('flutter', 'Flutter'),
  ('redis', 'Redis'),
  ('kafka', 'Kafka'),
  ('spark', 'Apache Spark'),
  ('ci-cd', 'CI/CD'),
  ('test-automation', 'Automatización de pruebas'),
  ('tableau', 'Tableau'),
  ('power-bi', 'Power BI'),
  ('jira', 'Jira'),
  ('sap', 'SAP'),
  -- Administración y finanzas
  ('accounting', 'Contabilidad'),
  ('financial-analysis', 'Análisis financiero'),
  ('budgeting', 'Presupuestos'),
  ('quickbooks', 'QuickBooks'),
  ('payroll', 'Nómina'),
  ('recruiting', 'Reclutamiento y selección'),
  ('human-resources', 'Recursos humanos'),
  ('project-management', 'Gestión de proyectos'),
  ('agile-scrum', 'Scrum / Agile'),
  ('business-administration', 'Administración de empresas'),
  ('procurement', 'Compras y proveedores'),
  -- Diseño
  ('ui-ux-design', 'Diseño UI/UX'),
  ('graphic-design', 'Diseño gráfico'),
  ('design-systems', 'Design Systems'),
  ('video-editing', 'Edición de video'),
  ('motion-graphics', 'Motion graphics'),
  ('webflow', 'Webflow'),
  -- Marketing
  ('social-media', 'Redes sociales'),
  ('content-marketing', 'Marketing de contenidos'),
  ('copywriting', 'Copywriting'),
  ('email-marketing', 'Email marketing'),
  ('meta-ads', 'Meta Ads'),
  ('growth-marketing', 'Growth marketing'),
  ('wordpress', 'WordPress'),
  ('shopify', 'Shopify'),
  ('product-management', 'Product management'),
  ('customer-service', 'Atención al cliente')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- BLOQUE 2 — Alias
-- (las variantes que no coinciden ya con el nombre o la etiqueta)
-- ============================================

INSERT INTO skill_aliases (alias_key, skill_name) VALUES
  ('js', 'javascript'),
  ('ecmascript', 'javascript'),
  ('es6', 'javascript'),
  ('html', 'html-css'),
  ('css', 'html-css'),
  ('html5', 'html-css'),
  ('css3', 'html-css'),
  ('github', 'git'),
  ('gitlab', 'git'),
  ('controldeversiones', 'git'),
  ('ubuntu', 'linux'),
  ('bash', 'linux'),
  ('cplusplus', 'cpp'),
  ('rn', 'react-native'),
  ('dart', 'flutter'),
  ('apachekafka', 'kafka'),
  ('pyspark', 'spark'),
  ('databricks', 'spark'),
  ('jenkins', 'ci-cd'),
  ('githubactions', 'ci-cd'),
  ('integracioncontinua', 'ci-cd'),
  ('selenium', 'test-automation'),
  ('cypress', 'test-automation'),
  ('playwright', 'test-automation'),
  ('jest', 'test-automation'),
  ('qa', 'test-automation'),
  ('testing', 'test-automation'),
  ('confluence', 'jira'),
  ('atlassian', 'jira'),
  ('sapfico', 'sap'),
  ('saps4hana', 'sap'),
  ('contable', 'accounting'),
  ('contador', 'accounting'),
  ('finanzas', 'financial-analysis'),
  ('finance', 'financial-analysis'),
  ('fpa', 'financial-analysis'),
  ('presupuesto', 'budgeting'),
  ('budget', 'budgeting'),
  ('planeacionfinanciera', 'budgeting'),
  ('contpaqi', 'quickbooks'),
  ('contpaq', 'quickbooks'),
  ('nominas', 'payroll'),
  ('reclutamiento', 'recruiting'),
  ('recruiter', 'recruiting'),
  ('talentacquisition', 'recruiting'),
  ('seleccion', 'recruiting'),
  ('rrhh', 'human-resources'),
  ('hr', 'human-resources'),
  ('peopleoperations', 'human-resources'),
  ('pmp', 'project-management'),
  ('projectmanager', 'project-management'),
  ('scrum', 'agile-scrum'),
  ('agile', 'agile-scrum'),
  ('kanban', 'agile-scrum'),
  ('administracion', 'business-administration'),
  ('administrativo', 'business-administration'),
  ('asistenteadministrativo', 'business-administration'),
  ('officeadministration', 'business-administration'),
  ('compras', 'procurement'),
  ('purchasing', 'procurement'),
  ('supplychain', 'procurement'),
  ('cadenadesuministro', 'procurement'),
  ('uiux', 'ui-ux-design'),
  ('ux', 'ui-ux-design'),
  ('ui', 'ui-ux-design'),
  ('uxdesign', 'ui-ux-design'),
  ('uidesign', 'ui-ux-design'),
  ('productdesign', 'ui-ux-design'),
  ('prototipado', 'ui-ux-design'),
  ('sistemasdediseno', 'design-systems'),
  ('designsystem', 'design-systems'),
  ('premiere', 'video-editing'),
  ('premierepro', 'video-editing'),
  ('davinciresolve', 'video-editing'),
  ('capcut', 'video-editing'),
  ('finalcut', 'video-editing'),
  ('aftereffects', 'motion-graphics'),
  ('animacion', 'motion-graphics'),
  ('motiondesign', 'motion-graphics'),
  ('framer', 'webflow'),
  ('rrss', 'social-media'),
  ('communitymanager', 'social-media'),
  ('contenidos', 'content-marketing'),
  ('redaccionpublicitaria', 'copywriting'),
  ('redactor', 'copywriting'),
  ('mailchimp', 'email-marketing'),
  ('klaviyo', 'email-marketing'),
  ('newsletter', 'email-marketing'),
  ('facebookads', 'meta-ads'),
  ('instagramads', 'meta-ads'),
  ('metaadsmanager', 'meta-ads'),
  ('growth', 'growth-marketing'),
  ('growthhacking', 'growth-marketing'),
  ('performancemarketing', 'growth-marketing'),
  ('woocommerce', 'wordpress'),
  ('tiendaonline', 'shopify'),
  ('productmanager', 'product-management'),
  ('gestiondeproducto', 'product-management'),
  ('servicioalcliente', 'customer-service'),
  ('customersuccess', 'customer-service'),
  ('illustrator', 'adobe-suite'),
  ('indesign', 'adobe-suite'),
  ('lightroom', 'adobe-suite'),
  ('sem', 'google-ads'),
  ('ppc', 'google-ads'),
  ('googleanalytics4', 'google-analytics'),
  ('ga4', 'google-analytics')
ON CONFLICT (alias_key) DO NOTHING;

-- ============================================
-- Verificación
-- ============================================
SELECT (SELECT count(*) FROM skills) AS skills, (SELECT count(*) FROM skill_aliases) AS aliases;
-- Debe dar skills = 82
