-- ============================================
-- Skills por categoría de rol - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Liga cada skill a las categorías de rol en las que tiene sentido ofrecerlo
-- (users.role_category). En el perfil, quien elige "Desarrollo Backend" ve primero
-- skills de backend en vez de las 82 del catálogo; sigue pudiendo escribir
-- cualquier otro o ver todos.
--
--   * role_categories vacío -> el skill no está ligado a ningún rol todavía: solo
--     sale al buscar por texto o al ver todos.
--   * La categoría 'otro' muestra el catálogo completo, por eso ningún skill se liga
--     a ella.
--
-- El bloque 2 llena los skills que aún no tienen roles (no pisa ajustes manuales).
-- El bloque 3 reasigna a propósito los de administración, finanzas y recursos
-- humanos, que ganan categorías propias en role-categories-migration.sql.
--
-- Un skill nuevo (incluido uno que se aprueba desde una propuesta) nace sin roles;
-- asígnaselos con:
--   UPDATE skills SET role_categories = ARRAY['backend','devops'] WHERE name = 'xyz';
-- ============================================

-- BLOQUE 1 — Columna
ALTER TABLE skills ADD COLUMN IF NOT EXISTS role_categories TEXT[] NOT NULL DEFAULT '{}';

-- BLOQUE 2 — Llenar los que están vacíos
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
  ('sql', ARRAY['backend', 'fullstack', 'data_engineer', 'data_scientist', 'finanzas']::text[]),
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
  ('excel', ARRAY['marketing', 'product', 'data_scientist', 'customer_support', 'administracion', 'finanzas', 'recursos_humanos']::text[]),
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
  ('tableau', ARRAY['data_scientist', 'data_engineer', 'product', 'marketing', 'finanzas']::text[]),
  ('power-bi', ARRAY['data_scientist', 'data_engineer', 'product', 'marketing', 'finanzas']::text[]),
  ('jira', ARRAY['qa', 'product', 'administracion']::text[]),
  ('sap', ARRAY['finanzas', 'administracion']::text[]),
  ('accounting', ARRAY['finanzas']::text[]),
  ('financial-analysis', ARRAY['finanzas']::text[]),
  ('budgeting', ARRAY['finanzas', 'administracion']::text[]),
  ('quickbooks', ARRAY['finanzas', 'administracion']::text[]),
  ('payroll', ARRAY['recursos_humanos', 'finanzas', 'administracion']::text[]),
  ('recruiting', ARRAY['recursos_humanos']::text[]),
  ('human-resources', ARRAY['recursos_humanos']::text[]),
  ('project-management', ARRAY['administracion', 'product']::text[]),
  ('agile-scrum', ARRAY['product', 'qa', 'administracion']::text[]),
  ('business-administration', ARRAY['administracion']::text[]),
  ('procurement', ARRAY['administracion', 'finanzas']::text[]),
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

-- BLOQUE 3 — Reasignar administración, finanzas y recursos humanos
UPDATE skills AS s
   SET role_categories = m.roles
  FROM (VALUES
  ('sql', ARRAY['backend', 'fullstack', 'data_engineer', 'data_scientist', 'finanzas']::text[]),
  ('excel', ARRAY['marketing', 'product', 'data_scientist', 'customer_support', 'administracion', 'finanzas', 'recursos_humanos']::text[]),
  ('tableau', ARRAY['data_scientist', 'data_engineer', 'product', 'marketing', 'finanzas']::text[]),
  ('power-bi', ARRAY['data_scientist', 'data_engineer', 'product', 'marketing', 'finanzas']::text[]),
  ('jira', ARRAY['qa', 'product', 'administracion']::text[]),
  ('sap', ARRAY['finanzas', 'administracion']::text[]),
  ('accounting', ARRAY['finanzas']::text[]),
  ('financial-analysis', ARRAY['finanzas']::text[]),
  ('budgeting', ARRAY['finanzas', 'administracion']::text[]),
  ('quickbooks', ARRAY['finanzas', 'administracion']::text[]),
  ('payroll', ARRAY['recursos_humanos', 'finanzas', 'administracion']::text[]),
  ('recruiting', ARRAY['recursos_humanos']::text[]),
  ('human-resources', ARRAY['recursos_humanos']::text[]),
  ('project-management', ARRAY['administracion', 'product']::text[]),
  ('agile-scrum', ARRAY['product', 'qa', 'administracion']::text[]),
  ('business-administration', ARRAY['administracion']::text[]),
  ('procurement', ARRAY['administracion', 'finanzas']::text[])
  ) AS m(name, roles)
 WHERE s.name = m.name;

-- ============================================
-- Verificación
-- ============================================
-- Skills que quedaron sin ningún rol (debería ser ninguno):
-- SELECT name FROM skills WHERE role_categories = '{}' ORDER BY name;
-- Cuántos skills ve cada rol:
-- SELECT r AS rol, count(*) FROM skills, unnest(role_categories) AS r GROUP BY r ORDER BY r;
