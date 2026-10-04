-- ============================================
-- Regla de negocio: una vacante solo entra al feed si está ligada a los catálogos
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
-- Requiere vacancy-enrichment-migration.sql (para que el scraper ya mande las vacantes
-- analizadas) y la tabla skills.
--
-- La regla (definida en backend/services/vacancies/publish-rule.ts, y probada allí) es:
--   * título, empresa y enlace para postularse;
--   * un ROL del catálogo (y no "otro");
--   * al menos un SKILL, y todos del catálogo.
-- El nivel, la modalidad y la ubicación no son obligatorios.
--
-- El código ya la hace cumplir al ingresar (scraper), al promover al feed (sync) y al
-- crear una vacante a mano (API). Este trigger es la última barrera: aunque algún
-- camino, un script o un INSERT directo se la salte, la base no deja guardar una
-- vacante sin esos datos.
--
-- Es solo al INSERTAR a propósito. Las vacantes que ya están publicadas y no cumplen
-- siguen funcionando (votos, comentarios) mientras se limpian con
-- `npm run clean-vacancies`; con un CHECK, cualquier UPDATE de una de ellas fallaría.
-- ============================================

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

DROP TRIGGER IF EXISTS enforce_vacancy_linkage_trigger ON community_posts;
CREATE TRIGGER enforce_vacancy_linkage_trigger
  BEFORE INSERT ON community_posts
  FOR EACH ROW EXECUTE FUNCTION enforce_vacancy_linkage();


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- Debe FALLAR con "vacancy_not_linked: no_role" (y no deja rastro, se deshace sola):
-- DO $$ BEGIN
--   INSERT INTO community_posts (title, content, type, company, source_url, skills)
--   VALUES ('Prueba', 'x', 'job', 'Acme', 'https://x.com', '["python"]'::jsonb);
-- END $$;
--
-- Cuántas vacantes publicadas hoy NO cumplen la regla (se limpian con npm run clean-vacancies):
-- SELECT count(*) FROM community_posts
--  WHERE type = 'job'
--    AND (role_category IS NULL OR jsonb_typeof(skills) IS DISTINCT FROM 'array' OR jsonb_array_length(skills) < 1
--         OR btrim(coalesce(company, '')) = '');
