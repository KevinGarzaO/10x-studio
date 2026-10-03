-- ============================================
-- Perfil completo y cuentas de prueba en el registro - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr completa.
-- Requiere user-classification-migration.sql (user_kind, is_test_account).
--
-- Qué hace:
--   1. users.profile_completed: dice si la cuenta ya completó su perfil. Es una
--      columna GENERADA, así que la base la mantiene sola y nunca queda vieja:
--      cuando alguien llena lo que falta, cambia a true en el mismo UPDATE.
--   2. Las cuentas de prueba se marcan solas al crearse (is_test_account), sin
--      importar por dónde nazcan: el registro, un test, un script.
--   3. Una empresa que se crea al aprobar un reclamo hereda si su dueño es de
--      prueba, y una empresa reclamada por una cuenta de prueba se marca también.
--   4. user_counts ahora separa los perfiles completos de los incompletos.
-- ============================================


-- ============================================
-- BLOQUE 1 — profile_completed
-- ============================================

-- Misma regla que usa la app para mandar a onboarding (apps/community/lib/profile-gate.ts):
--   * toda cuenta necesita foto;
--   * una empresa no necesita nada más (sus datos viven en su reclamo);
--   * un candidato necesita además título, rol, nivel, ubicación, modalidad y
--     al menos un skill. Que los skills sean del catálogo ya lo garantiza el
--     trigger validate_candidate_skills.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN GENERATED ALWAYS AS (
  CASE
    WHEN coalesce(btrim(photo_url), '') = '' THEN false
    WHEN account_type = 'company' THEN true
    ELSE coalesce(btrim(title), '') <> ''
     AND coalesce(btrim(role_category), '') <> ''
     AND coalesce(btrim(seniority), '') <> ''
     AND coalesce(btrim(location), '') <> ''
     AND coalesce(btrim(work_modality), '') <> ''
     AND coalesce(array_length(skills, 1), 0) > 0
  END
) STORED;

CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users (profile_completed);


-- ============================================
-- BLOQUE 2 — Cuentas de prueba, marcadas al nacer
-- ============================================

-- Solo al INSERTAR: una marca puesta a mano después nunca se pisa. Para agregar
-- un patrón nuevo basta con extender las condiciones de aquí abajo.
--   * usernames de los tests: e2e-*, exam-questions-e2e*, t001-*..t999-*, claimed-owner-*
--   * correos: e2e-*, exam-questions-e2e*, con "+test" o de dominios reservados
--     para pruebas (example.com/org/net, *.test, test.local)
CREATE OR REPLACE FUNCTION mark_test_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_test_account IS NOT TRUE AND (
       lower(coalesce(NEW.username, '')) ~ '^(e2e-|exam-questions-e2e|t[0-9]{3}-|claimed-owner-)'
    OR lower(coalesce(NEW.email, ''))    ~ '^(e2e-|exam-questions-e2e)'
    OR lower(coalesce(NEW.email, ''))    ~ '\+test@'
    OR lower(coalesce(NEW.email, ''))    ~ '@(example\.(com|org|net)|test\.local|[a-z0-9.-]+\.test)$'
  ) THEN
    NEW.is_test_account := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mark_test_account_trigger ON users;
CREATE TRIGGER mark_test_account_trigger
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION mark_test_account();

-- Lo que ya existe y encaja con esos patrones, por si se creó antes del trigger.
UPDATE users
   SET is_test_account = true
 WHERE is_test_account = false
   AND (
        lower(coalesce(username, '')) ~ '^(e2e-|exam-questions-e2e|t[0-9]{3}-|claimed-owner-)'
     OR lower(coalesce(email, ''))    ~ '^(e2e-|exam-questions-e2e)'
   );


-- ============================================
-- BLOQUE 3 — Aprobar un reclamo respeta lo real y lo de prueba
-- ============================================

-- Idéntica a la de company-claims-migration.sql salvo por is_test_account:
--  * la empresa NUEVA hereda la marca de quien la reclama;
--  * una empresa YA existente se marca de prueba si la reclama una cuenta de
--    prueba, pero nunca se desmarca.
CREATE OR REPLACE FUNCTION approve_company_claim(
  p_claim_id UUID,
  p_reviewed_by UUID
) RETURNS UUID AS $$
DECLARE
  v_claim company_claims%ROWTYPE;
  v_company_id UUID;
  v_slug TEXT;
  v_test BOOLEAN;
BEGIN
  SELECT * INTO v_claim FROM company_claims WHERE id = p_claim_id;

  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION 'claim_not_found: %', p_claim_id;
  END IF;

  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'claim_already_decided: %', v_claim.status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_reviewed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin decide reclamos';
  END IF;

  SELECT is_test_account INTO v_test FROM users WHERE id = v_claim.claimant_id;

  v_slug := regexp_replace(lower(btrim(v_claim.company_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');

  PERFORM set_config('avotalent.privileged_change', 'on', true);

  IF v_claim.company_user_id IS NOT NULL THEN
    -- Reclamo de una empresa que ya existe: se le pone dueño y sale del scraper.
    v_company_id := v_claim.company_user_id;

    IF EXISTS (SELECT 1 FROM users WHERE id = v_company_id AND claimed_by IS NOT NULL) THEN
      RAISE EXCEPTION 'company_already_claimed: %', v_company_id;
    END IF;

    UPDATE users
       SET claimed_by = v_claim.claimant_id,
           is_scraper_profile = false,
           display_name = coalesce(display_name, v_claim.company_name),
           bio = coalesce(v_claim.description, bio),
           website = coalesce(v_claim.website, website),
           photo_url = coalesce(v_claim.logo_url, photo_url),
           location = coalesce(v_claim.location, location),
           is_test_account = is_test_account OR coalesce(v_test, false)
     WHERE id = v_company_id;
  ELSE
    -- Empresa nueva: se crea su cuenta, sin login propio (la persona entra con
    -- la suya, que queda ligada abajo).
    INSERT INTO users (username, company_slug, account_type, display_name, bio, website, photo_url, location, claimed_by, is_test_account)
    VALUES (
      v_slug || '-' || substr(md5(random()::text), 1, 6),
      v_slug,
      'company',
      v_claim.company_name,
      v_claim.description,
      v_claim.website,
      v_claim.logo_url,
      v_claim.location,
      v_claim.claimant_id,
      coalesce(v_test, false)
    )
    RETURNING id INTO v_company_id;
  END IF;

  -- La cuenta del solicitante pasa a tipo empresa y queda ligada.
  UPDATE users
     SET account_type = 'company',
         company_id = v_company_id
   WHERE id = v_claim.claimant_id;

  INSERT INTO account_type_changes (user_id, from_type, to_type, reason, changed_by)
  VALUES (
    v_claim.claimant_id,
    'candidate',
    'company',
    'Reclamo de empresa aprobado: ' || v_claim.company_name,
    p_reviewed_by
  );

  UPDATE company_claims
     SET status = 'approved',
         company_user_id = v_company_id,
         reviewed_by = p_reviewed_by,
         reviewed_at = now()
   WHERE id = p_claim_id;

  PERFORM set_config('avotalent.privileged_change', 'off', true);

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION approve_company_claim(UUID, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION approve_company_claim(UUID, UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION approve_company_claim(UUID, UUID) FROM authenticated;
  END IF;
END $$;


-- ============================================
-- BLOQUE 4 — user_counts con perfil completo
-- ============================================

-- Cambia sus columnas, por eso se recrea en vez de reemplazarla.
DROP VIEW IF EXISTS user_counts;
CREATE VIEW user_counts AS
  SELECT user_kind,
         is_test_account,
         profile_completed,
         count(*) AS total
    FROM users
   GROUP BY user_kind, is_test_account, profile_completed
   ORDER BY user_kind, is_test_account, profile_completed;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON user_counts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON user_counts FROM authenticated;
  END IF;
END $$;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT * FROM user_counts;
-- SELECT username, user_kind, is_test_account, profile_completed FROM users
--  WHERE user_kind <> 'company' ORDER BY created_at;
-- -- kgarzaortiz debe salir con profile_completed = true; Panshibe, false.
