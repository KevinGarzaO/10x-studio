-- ============================================
-- Corrección de términos de detección de skills - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Dos skills se detectaban donde no debían (visto en las publicaciones de LinkedIn):
--   * ui-ux-design: "user experience" suelto aparecía en "End-user Experience Platform"
--     (un Backend Engineer de Stripe salía con "Diseño UI/UX"). Ahora pide el diseño:
--     "user experience design", "ux design", etc.
--   * sales: "sales" suelto aparece en la descripción de casi cualquier empresa (un
--     Data Scientist de Figma salía con "Ventas"). Ahora cuenta solo en el título
--     (^sales) o con frases de quien vende de verdad ("sales pipeline", "prospecting"...).
--
-- A diferencia de las migraciones anteriores, ESTA sí pisa los términos que ya tienen
-- estos dos skills (los anteriores solo llenaban los vacíos).
--
-- Después de aplicarla, corre `npm run backfill-vacancies -- --refetch --apply` para
-- volver a detectar los skills de las vacantes ya publicadas.
-- ============================================

UPDATE skills SET detect_terms = ARRAY['ui/ux', 'ux/ui', 'ux design', 'ui design', 'user experience design', 'user experience designer', 'user interface design', 'diseño ux', 'diseño ui']::text[]
 WHERE name = 'ui-ux-design';

UPDATE skills SET detect_terms = ARRAY['^sales', '^ventas', 'sales experience', 'sales pipeline', 'b2b sales', 'outbound sales', 'prospecting', 'prospección', 'cold calling', 'quota attainment', 'experiencia en ventas', 'ventas b2b']::text[]
 WHERE name = 'sales';

-- Verificación:
-- SELECT name, detect_terms FROM skills WHERE name IN ('ui-ux-design', 'sales');
