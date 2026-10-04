-- ============================================
-- Skills por categoría de rol - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Liga cada skill a las categorías de rol en las que tiene sentido ofrecerlo
-- (users.role_category). En el perfil, quien elige "Backend" ve primero skills de
-- backend en vez de las 82 del catálogo; sigue pudiendo escribir cualquier
-- otro o ver todos.
--
--   * role_categories vacío  -> el skill no está ligado a ningún rol todavía: solo
--     sale al buscar por texto o al ver todos.
--   * La categoría 'otro' muestra el catálogo completo, así que los skills de
--     administración y finanzas (que aún no tienen categoría propia) se ligan a ella.
--
-- Solo llena los skills que aún no tienen roles: si ajustas uno a mano, volver a
-- correr esto no lo pisa.
--
-- Un skill nuevo (incluido uno que se aprueba desde una propuesta) nace sin roles;
-- asígnaselos con:
--   UPDATE skills SET role_categories = ARRAY['backend','devops'] WHERE name = 'xyz';
-- ============================================

ALTER TABLE skills ADD COLUMN IF NOT EXISTS role_categories TEXT[] NOT NULL DEFAULT '{}';

UPDATE skills AS s
   SET role_categories = m.roles
  FROM (VALUES
  ('react', ARRAY['frontend', 'fullstack']::text[]),
  ('typescript', ARRAY['frontend', 'backend', 'fullstack']::text[]),
  ('nextjs', ARRAY['frontend', 'fullstack']::text[]),
  ('python', ARRAY['backend', 'fullstack', 'data_engineer', 'data_scientist', 'devops', 'qa']::text[]),
  ('nodejs', ARRAY['backend', 'fullstack']::text[]),
  ('aws', ARRAY['backend', 'fullstack', 'devops', 'data_engineer']::text[]),
  ('docker', ARRAY['backend', 'fullstack', 'devops', 'data_engineer']::text[]),
  ('kubernetes', ARRAY['devops', 'backend']::text[]),
  ('sql', ARRAY['backend', 'fullstack', 'data_engineer', 'data_scientist']::text[]),
  ('golang', ARRAY['backend', 'devops']::text[]),
  ('ia', ARRAY['data_scientist', 'data_engineer', 'backend', 'product']::text[]),
  ('figma', ARRAY['ux_ui', 'product', 'frontend']::text[]),
  ('adobe-suite', ARRAY['ux_ui', 'marketing']::text[]),
  ('sketch', ARRAY['ux_ui']::text[]),
  ('seo', ARRAY['marketing']::text[]),
  ('google-ads', ARRAY['marketing']::text[]),
  ('google-analytics', ARRAY['marketing', 'product', 'data_scientist']::text[]),
  ('hubspot', ARRAY['marketing', 'customer_support']::text[]),
  ('salesforce', ARRAY['marketing', 'customer_support']::text[]),
  ('zendesk', ARRAY['customer_support']::text[]),
  ('intercom', ARRAY['customer_support', 'product', 'marketing']::text[]),
  ('excel', ARRAY['marketing', 'product', 'data_scientist', 'customer_support', 'otro']::text[]),
  ('canva', ARRAY['marketing', 'ux_ui']::text[]),
  ('java', ARRAY['backend', 'fullstack', 'mobile']::text[]),
  ('dotnet', ARRAY['backend', 'fullstack']::text[]),
  ('ruby', ARRAY['backend', 'fullstack']::text[]),
  ('php', ARRAY['backend', 'fullstack']::text[]),
  ('swift', ARRAY['mobile']::text[]),
  ('kotlin', ARRAY['mobile', 'backend']::text[]),
  ('angular', ARRAY['frontend', 'fullstack']::text[]),
  ('vue', ARRAY['frontend', 'fullstack']::text[]),
  ('graphql', ARRAY['backend', 'frontend', 'fullstack']::text[]),
  ('postgresql', ARRAY['backend', 'fullstack', 'data_engineer']::text[]),
  ('mongodb', ARRAY['backend', 'fullstack', 'data_engineer']::text[]),
  ('terraform', ARRAY['devops']::text[]),
  ('gcp', ARRAY['devops', 'backend', 'data_engineer']::text[]),
  ('azure', ARRAY['devops', 'backend', 'data_engineer']::text[]),
  ('javascript', ARRAY['frontend', 'backend', 'fullstack', 'mobile', 'qa']::text[]),
  ('html-css', ARRAY['frontend', 'fullstack', 'ux_ui', 'marketing']::text[]),
  ('git', ARRAY['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data_engineer', 'data_scientist', 'qa']::text[]),
  ('linux', ARRAY['backend', 'fullstack', 'devops', 'data_engineer']::text[]),
  ('csharp', ARRAY['backend', 'fullstack', 'qa']::text[]),
  ('cpp', ARRAY['backend', 'mobile']::text[]),
  ('rust', ARRAY['backend', 'devops']::text[]),
  ('react-native', ARRAY['mobile', 'frontend']::text[]),
  ('flutter', ARRAY['mobile']::text[]),
  ('redis', ARRAY['backend', 'fullstack', 'devops']::text[]),
  ('kafka', ARRAY['backend', 'data_engineer']::text[]),
  ('spark', ARRAY['data_engineer', 'data_scientist']::text[]),
  ('ci-cd', ARRAY['devops', 'backend', 'fullstack', 'qa']::text[]),
  ('test-automation', ARRAY['qa']::text[]),
  ('tableau', ARRAY['data_scientist', 'data_engineer', 'product', 'marketing']::text[]),
  ('power-bi', ARRAY['data_scientist', 'data_engineer', 'product', 'marketing']::text[]),
  ('jira', ARRAY['qa', 'product']::text[]),
  ('sap', ARRAY['otro']::text[]),
  ('accounting', ARRAY['otro']::text[]),
  ('financial-analysis', ARRAY['otro']::text[]),
  ('budgeting', ARRAY['otro']::text[]),
  ('quickbooks', ARRAY['otro']::text[]),
  ('payroll', ARRAY['otro']::text[]),
  ('recruiting', ARRAY['otro']::text[]),
  ('human-resources', ARRAY['otro']::text[]),
  ('project-management', ARRAY['product', 'otro']::text[]),
  ('agile-scrum', ARRAY['product', 'qa', 'otro']::text[]),
  ('business-administration', ARRAY['otro']::text[]),
  ('procurement', ARRAY['otro']::text[]),
  ('ui-ux-design', ARRAY['ux_ui', 'product', 'frontend']::text[]),
  ('graphic-design', ARRAY['ux_ui', 'marketing']::text[]),
  ('design-systems', ARRAY['ux_ui', 'frontend']::text[]),
  ('video-editing', ARRAY['marketing', 'ux_ui']::text[]),
  ('motion-graphics', ARRAY['ux_ui', 'marketing']::text[]),
  ('webflow', ARRAY['frontend', 'ux_ui', 'marketing']::text[]),
  ('social-media', ARRAY['marketing']::text[]),
  ('content-marketing', ARRAY['marketing']::text[]),
  ('copywriting', ARRAY['marketing']::text[]),
  ('email-marketing', ARRAY['marketing']::text[]),
  ('meta-ads', ARRAY['marketing']::text[]),
  ('growth-marketing', ARRAY['marketing', 'product']::text[]),
  ('wordpress', ARRAY['marketing', 'frontend', 'fullstack']::text[]),
  ('shopify', ARRAY['marketing', 'frontend']::text[]),
  ('product-management', ARRAY['product']::text[]),
  ('customer-service', ARRAY['customer_support']::text[])
  ) AS m(name, roles)
 WHERE s.name = m.name
   AND s.role_categories = '{}';

-- ============================================
-- Verificación
-- ============================================
-- Skills que quedaron sin ningún rol (debería ser ninguno):
-- SELECT name FROM skills WHERE role_categories = '{}' ORDER BY name;
-- Cuántos skills ve cada rol:
-- SELECT r AS rol, count(*) FROM skills, unnest(role_categories) AS r GROUP BY r ORDER BY r;
