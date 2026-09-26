-- ============================================
-- Account Foundation (feature 003) - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr completa.
--
-- EL ORDEN DE LOS BLOQUES IMPORTA. Los backfills (bloques 1 y 4) tienen que
-- correr ANTES de los triggers de protección (bloque 5); al revés, los
-- triggers bloquearían los propios backfills.
-- ============================================


-- ============================================
-- BLOQUE 1 — Tipo de cuenta, superadmin y slug de empresa
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'candidate';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_slug TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_type_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_account_type_check
      CHECK (account_type IN ('candidate', 'company'));
  END IF;

  -- Una cuenta de empresa nunca puede tener el permiso de superadmin (FR-007).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_superadmin_not_company_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_superadmin_not_company_check
      CHECK (NOT (is_superadmin AND account_type = 'company'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_company_slug_format_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_company_slug_format_check
      CHECK (company_slug IS NULL OR company_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;
END $$;

-- Un solo dueño por slug de empresa, y solo entre cuentas de empresa: el
-- username de una persona ya no puede secuestrar el slug (FR-028, FR-029).
CREATE UNIQUE INDEX IF NOT EXISTS users_company_slug_unique
  ON users (company_slug) WHERE account_type = 'company';

-- Backfill del tipo. El bot que publica vacantes sin empresa identificada
-- cuenta como empresa: publica, no se examina y nunca inicia sesión (FR-002).
UPDATE users
   SET account_type = 'company'
 WHERE account_type <> 'company'
   AND (scraper_source = 'company' OR id = '00000000-0000-0000-0000-000000000001');

-- Backfill del permiso: las cuentas que hoy tienen el rol 'admin' quedan como
-- superadmin, y 'admin' sale de roles, que se queda solo con las keywords del
-- scraper (FR-005, FR-006).
UPDATE users SET is_superadmin = true
 WHERE 'admin' = ANY(roles) AND account_type = 'candidate' AND is_superadmin = false;

UPDATE users SET roles = array_remove(roles, 'admin')
 WHERE 'admin' = ANY(roles);

-- Backfill del slug: hoy el username de cada empresa ya ES su slug público.
UPDATE users
   SET company_slug = username
 WHERE account_type = 'company'
   AND company_slug IS NULL
   AND username ~ '^[a-z0-9]+(-[a-z0-9]+)*$';


-- ============================================
-- BLOQUE 2 — Cambios privilegiados: registro, funciones y candados
-- ============================================

CREATE TABLE IF NOT EXISTS account_type_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_type TEXT NOT NULL CHECK (from_type IN ('candidate', 'company')),
  to_type TEXT NOT NULL CHECK (to_type IN ('candidate', 'company')),
  reason TEXT NOT NULL CHECK (btrim(reason) <> '' AND reason = btrim(reason)),
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_type_changes_actual_change CHECK (from_type <> to_type)
);

CREATE INDEX IF NOT EXISTS idx_account_type_changes_user ON account_type_changes (user_id);

CREATE TABLE IF NOT EXISTS superadmin_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> '' AND reason = btrim(reason)),
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_changes_user ON superadmin_changes (user_id);

-- El tipo de cuenta y el permiso de superadmin NO se cambian desde la
-- aplicación (FR-004, FR-005). Este trigger es lo que convierte esa regla en
-- garantía: solo pasa si la transacción activó la bandera local, y la bandera
-- solo la activan las dos funciones de abajo, cuyo EXECUTE está revocado para
-- anon y authenticated.
CREATE OR REPLACE FUNCTION guard_privileged_user_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF coalesce(current_setting('avotalent.privileged_change', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- El account_type se elige al crear (el registro crea 'candidate' por
    -- defecto, el scraper crea 'company'); lo que no se puede es cambiarlo
    -- después. Nacer con superadmin sí está prohibido (FR-030).
    IF NEW.is_superadmin THEN
      RAISE EXCEPTION 'privileged_change_blocked: is_superadmin solo se otorga con set_superadmin()';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    RAISE EXCEPTION 'privileged_change_blocked: account_type solo cambia con change_account_type()';
  END IF;

  IF NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
    RAISE EXCEPTION 'privileged_change_blocked: is_superadmin solo cambia con set_superadmin()';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_privileged_user_columns_trigger ON users;
CREATE TRIGGER guard_privileged_user_columns_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_privileged_user_columns();

-- Siempre queda al menos un superadmin, por cualquier camino: quitar el
-- permiso, convertir la cuenta en empresa o borrar la fila (FR-007).
CREATE OR REPLACE FUNCTION guard_last_superadmin()
RETURNS TRIGGER AS $$
DECLARE
  remaining INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT OLD.is_superadmin THEN RETURN OLD; END IF;
  ELSE
    IF NOT OLD.is_superadmin OR NEW.is_superadmin THEN RETURN NEW; END IF;
  END IF;

  SELECT count(*) INTO remaining FROM users WHERE is_superadmin AND id <> OLD.id;

  IF remaining = 0 THEN
    RAISE EXCEPTION 'last_superadmin: debe quedar al menos un superadmin';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_last_superadmin_trigger ON users;
CREATE TRIGGER guard_last_superadmin_trigger
  BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_last_superadmin();

-- Cambiar el tipo de una cuenta. Mientras no exista la pantalla en Avocado
-- Studio, esta función ES la operación: la corre un superadmin en el editor SQL.
CREATE OR REPLACE FUNCTION change_account_type(
  p_user_id UUID,
  p_new_type TEXT,
  p_reason TEXT,
  p_changed_by UUID
) RETURNS VOID AS $$
DECLARE
  v_from TEXT;
  v_is_superadmin BOOLEAN;
  v_username TEXT;
  v_reason TEXT := btrim(coalesce(p_reason, ''));
BEGIN
  IF p_new_type NOT IN ('candidate', 'company') THEN
    RAISE EXCEPTION 'invalid_account_type: %', p_new_type;
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required: todo cambio de tipo necesita un motivo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_changed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin puede cambiar el tipo de una cuenta';
  END IF;

  SELECT account_type, is_superadmin, username
    INTO v_from, v_is_superadmin, v_username
    FROM users WHERE id = p_user_id;

  IF v_from IS NULL THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  IF v_from = p_new_type THEN
    RAISE EXCEPTION 'same_account_type: la cuenta ya es %', p_new_type;
  END IF;

  IF p_new_type = 'company' AND v_is_superadmin THEN
    RAISE EXCEPTION 'superadmin_cannot_be_company: quita primero el permiso con set_superadmin()';
  END IF;

  PERFORM set_config('avotalent.privileged_change', 'on', true);

  UPDATE users
     SET account_type = p_new_type,
         company_slug = CASE
           WHEN p_new_type = 'company' AND v_username ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN v_username
           ELSE NULL
         END
   WHERE id = p_user_id;

  INSERT INTO account_type_changes (user_id, from_type, to_type, reason, changed_by)
  VALUES (p_user_id, v_from, p_new_type, v_reason, p_changed_by);

  PERFORM set_config('avotalent.privileged_change', 'off', true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_superadmin(
  p_user_id UUID,
  p_value BOOLEAN,
  p_reason TEXT,
  p_changed_by UUID
) RETURNS VOID AS $$
DECLARE
  v_current BOOLEAN;
  v_type TEXT;
  v_reason TEXT := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required: todo cambio de permiso necesita un motivo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_changed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin puede otorgar o quitar el permiso';
  END IF;

  SELECT is_superadmin, account_type INTO v_current, v_type FROM users WHERE id = p_user_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  IF v_current = p_value THEN
    RAISE EXCEPTION 'no_change: la cuenta ya está así';
  END IF;

  IF p_value AND v_type = 'company' THEN
    RAISE EXCEPTION 'company_cannot_be_superadmin: %', p_user_id;
  END IF;

  PERFORM set_config('avotalent.privileged_change', 'on', true);

  UPDATE users SET is_superadmin = p_value WHERE id = p_user_id;

  INSERT INTO superadmin_changes (user_id, granted, reason, changed_by)
  VALUES (p_user_id, p_value, v_reason, p_changed_by);

  PERFORM set_config('avotalent.privileged_change', 'off', true);
END;
$$ LANGUAGE plpgsql;

-- Ninguna sesión del navegador puede invocarlas, ni con la llave pública ni
-- autenticada. Quedan para postgres (editor SQL) y service_role.
REVOKE EXECUTE ON FUNCTION change_account_type(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_superadmin(UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION change_account_type(UUID, TEXT, TEXT, UUID) FROM anon;
    REVOKE EXECUTE ON FUNCTION set_superadmin(UUID, BOOLEAN, TEXT, UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION change_account_type(UUID, TEXT, TEXT, UUID) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION set_superadmin(UUID, BOOLEAN, TEXT, UUID) FROM authenticated;
  END IF;
END $$;


-- ============================================
-- BLOQUE 3 — Catálogo: alias, propuestas e interesados
-- ============================================

-- Gemelo SQL de normalizeSkillKey() de @avocado/schemas. translate() en vez de
-- la extensión unaccent, para no depender de habilitarla en Supabase.
-- Conserva + y # para que C, C++ y C# no colapsen (FR-011).
CREATE OR REPLACE FUNCTION normalize_skill_key(p_text TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
    translate(
      lower(btrim(coalesce(p_text, ''))),
      'áéíóúüñàèìòùâêîôûäëïöÁÉÍÓÚÜÑ',
      'aeiouunaeiouaeiouaeioAEIOUUN'
    ),
    '[^a-z0-9+#]', '', 'g'
  );
$$ LANGUAGE sql IMMUTABLE;

-- Un alias pertenece a un solo skill: la PK lo garantiza sin triggers.
-- Y solo puede apuntar a skills, que contiene únicamente aprobados (FR-020).
CREATE TABLE IF NOT EXISTS skill_aliases (
  alias_key TEXT PRIMARY KEY CHECK (alias_key ~ '^[a-z0-9+#]+$'),
  skill_name TEXT NOT NULL REFERENCES skills(name) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_aliases_skill ON skill_aliases (skill_name);

CREATE TABLE IF NOT EXISTS skill_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_key TEXT NOT NULL UNIQUE CHECK (normalized_key ~ '^[a-z0-9+#]+$'),
  proposed_text TEXT NOT NULL CHECK (
    btrim(proposed_text) <> '' AND proposed_text = btrim(proposed_text)
    AND char_length(proposed_text) <= 50
  ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'merged', 'rejected')),
  proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resulting_skill_name TEXT REFERENCES skills(name) ON UPDATE CASCADE ON DELETE RESTRICT,
  rejection_reason TEXT CHECK (
    rejection_reason IS NULL
    OR (btrim(rejection_reason) <> '' AND rejection_reason = btrim(rejection_reason))
  ),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  -- Estos tres CHECK son los que impiden estados inválidos cuando el superadmin
  -- edita a mano, sin pantalla que valide (FR-020).
  CONSTRAINT skill_proposals_result_matches_status
    CHECK ((status IN ('approved', 'merged')) = (resulting_skill_name IS NOT NULL)),
  CONSTRAINT skill_proposals_rejection_needs_reason
    CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)),
  CONSTRAINT skill_proposals_review_matches_status
    CHECK ((status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_skill_proposals_status ON skill_proposals (status);

CREATE TABLE IF NOT EXISTS skill_proposal_supporters (
  proposal_id UUID NOT NULL REFERENCES skill_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_proposal_supporters_user
  ON skill_proposal_supporters (user_id);

-- Alias obvios de los 37 skills del catálogo. Los que coinciden con el nombre
-- o la etiqueta ya se resuelven solos, así que aquí solo van las variantes que
-- no: abreviaturas y formas con puntuación.
INSERT INTO skill_aliases (alias_key, skill_name) VALUES
  ('reactjs', 'react'),
  ('node', 'nodejs'),
  ('next', 'nextjs'),
  ('ts', 'typescript'),
  ('py', 'python'),
  ('postgres', 'postgresql'),
  ('psql', 'postgresql'),
  ('k8s', 'kubernetes'),
  ('kube', 'kubernetes'),
  ('ml', 'ia'),
  ('machinelearning', 'ia'),
  ('ai', 'ia'),
  ('net', 'dotnet'),
  ('aspnet', 'dotnet'),
  ('gcloud', 'gcp'),
  ('googlecloud', 'gcp'),
  ('amazonwebservices', 'aws'),
  ('vuejs', 'vue'),
  ('angularjs', 'angular'),
  ('golang', 'golang'),
  ('mongo', 'mongodb'),
  ('tf', 'terraform'),
  ('ga', 'google-analytics'),
  ('adwords', 'google-ads'),
  ('adobe', 'adobe-suite'),
  ('photoshop', 'adobe-suite')
ON CONFLICT (alias_key) DO NOTHING;

-- Aprobar una propuesta: crea el skill y marca la propuesta, en una sola
-- transacción.
CREATE OR REPLACE FUNCTION approve_skill_proposal(
  p_proposal_id UUID,
  p_name TEXT,
  p_label TEXT,
  p_reviewed_by UUID
) RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
  v_text TEXT;
  v_status TEXT;
  v_name TEXT;
  v_label TEXT;
BEGIN
  SELECT normalized_key, proposed_text, status
    INTO v_key, v_text, v_status
    FROM skill_proposals WHERE id = p_proposal_id;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'proposal_not_found: %', p_proposal_id;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'proposal_already_decided: %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_reviewed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin decide propuestas';
  END IF;

  v_name := btrim(coalesce(p_name, v_key));
  v_label := btrim(coalesce(p_label, v_text));

  INSERT INTO skills (name, label) VALUES (v_name, v_label)
  ON CONFLICT (name) DO NOTHING;

  UPDATE skill_proposals
     SET status = 'approved',
         resulting_skill_name = v_name,
         reviewed_by = p_reviewed_by,
         reviewed_at = now()
   WHERE id = p_proposal_id;

  RETURN v_name;
END;
$$ LANGUAGE plpgsql;

-- Unir una propuesta a un skill existente: el texto propuesto queda como alias.
CREATE OR REPLACE FUNCTION merge_skill_proposal(
  p_proposal_id UUID,
  p_skill_name TEXT,
  p_reviewed_by UUID
) RETURNS VOID AS $$
DECLARE
  v_key TEXT;
  v_status TEXT;
BEGIN
  SELECT normalized_key, status INTO v_key, v_status
    FROM skill_proposals WHERE id = p_proposal_id;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'proposal_not_found: %', p_proposal_id;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'proposal_already_decided: %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_reviewed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin decide propuestas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM skills WHERE name = p_skill_name) THEN
    RAISE EXCEPTION 'skill_not_found: %', p_skill_name;
  END IF;

  INSERT INTO skill_aliases (alias_key, skill_name) VALUES (v_key, p_skill_name);

  UPDATE skill_proposals
     SET status = 'merged',
         resulting_skill_name = p_skill_name,
         reviewed_by = p_reviewed_by,
         reviewed_at = now()
   WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_skill_proposal(
  p_proposal_id UUID,
  p_reason TEXT,
  p_reviewed_by UUID
) RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_reason TEXT := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required: un rechazo necesita motivo';
  END IF;

  SELECT status INTO v_status FROM skill_proposals WHERE id = p_proposal_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'proposal_not_found: %', p_proposal_id;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'proposal_already_decided: %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_reviewed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin decide propuestas';
  END IF;

  UPDATE skill_proposals
     SET status = 'rejected',
         rejection_reason = v_reason,
         reviewed_by = p_reviewed_by,
         reviewed_at = now()
   WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql;

-- Lo que el superadmin abre para decidir: pendientes por interés (FR-020).
CREATE OR REPLACE VIEW pending_skill_proposals AS
  SELECT p.id,
         p.proposed_text,
         p.normalized_key,
         p.proposed_at,
         count(s.user_id) AS supporter_count
    FROM skill_proposals p
    LEFT JOIN skill_proposal_supporters s ON s.proposal_id = p.id
   WHERE p.status = 'pending'
   GROUP BY p.id, p.proposed_text, p.normalized_key, p.proposed_at
   ORDER BY count(s.user_id) DESC, p.proposed_at ASC;


-- ============================================
-- BLOQUE 4 — Conversión de los skills ya guardados (FR-015)
--
-- Reemplaza solo los que coinciden con un skill aprobado, su etiqueta o un
-- alias; los que no coinciden se quedan tal cual, para que su dueño los
-- resuelva en onboarding. Corre ANTES de los triggers del bloque 5.
-- ============================================

UPDATE users u
   SET skills = converted.skills
  FROM (
    SELECT u2.id,
           array_agg(DISTINCT coalesce(resolved.name, raw.skill)) AS skills
      FROM users u2
      CROSS JOIN LATERAL unnest(u2.skills) AS raw(skill)
      LEFT JOIN LATERAL (
        -- Mismo orden que resolveSkill() en @avocado/schemas: nombre, etiqueta,
        -- alias. Si nada coincide, se conserva el texto original.
        SELECT name FROM (
          SELECT s.name, 1 AS priority
            FROM skills s
           WHERE normalize_skill_key(s.name) = normalize_skill_key(raw.skill)
          UNION ALL
          SELECT s.name, 2 AS priority
            FROM skills s
           WHERE normalize_skill_key(s.label) = normalize_skill_key(raw.skill)
          UNION ALL
          SELECT a.skill_name, 3 AS priority
            FROM skill_aliases a
           WHERE a.alias_key = normalize_skill_key(raw.skill)
        ) AS candidates
         ORDER BY priority
         LIMIT 1
      ) AS resolved ON true
     WHERE u2.skills IS NOT NULL AND array_length(u2.skills, 1) > 0
     GROUP BY u2.id
  ) AS converted
 WHERE u.id = converted.id
   AND u.skills IS DISTINCT FROM converted.skills;


-- ============================================
-- BLOQUE 5 — Triggers de protección (AL FINAL, después de los backfills)
-- ============================================

-- El perfil de un candidato solo guarda skills del catálogo, y sin repetidos
-- (FR-012). Los perfiles que genera el scraper quedan fuera: insertan skills
-- libres tomados de publicaciones, no inician sesión y no se examinan.
CREATE OR REPLACE FUNCTION validate_candidate_skills()
RETURNS TRIGGER AS $$
DECLARE
  v_skill TEXT;
BEGIN
  IF NEW.account_type <> 'candidate' OR coalesce(NEW.is_scraper_profile, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.skills IS NULL OR array_length(NEW.skills, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF array_length(NEW.skills, 1) <> (SELECT count(DISTINCT s) FROM unnest(NEW.skills) AS s) THEN
    RAISE EXCEPTION 'duplicate_skill: no repitas un skill en el perfil';
  END IF;

  FOREACH v_skill IN ARRAY NEW.skills LOOP
    IF NOT EXISTS (SELECT 1 FROM skills WHERE name = v_skill) THEN
      RAISE EXCEPTION 'skill_not_in_catalog: %', v_skill;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_candidate_skills_trigger ON users;
CREATE TRIGGER validate_candidate_skills_trigger
  BEFORE INSERT OR UPDATE OF skills ON users
  FOR EACH ROW EXECUTE FUNCTION validate_candidate_skills();

-- Un dato obligatorio ya capturado no se vacía (FR-024, FR-027). No se puede
-- exigir con NOT NULL: las cuentas existen antes del onboarding.
CREATE OR REPLACE FUNCTION prevent_clearing_required_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_type <> 'candidate' OR coalesce(NEW.is_scraper_profile, false) THEN
    RETURN NEW;
  END IF;

  IF btrim(coalesce(OLD.photo_url, '')) <> '' AND btrim(coalesce(NEW.photo_url, '')) = '' THEN
    RAISE EXCEPTION 'required_field_cleared: photo_url';
  END IF;
  IF btrim(coalesce(OLD.title, '')) <> '' AND btrim(coalesce(NEW.title, '')) = '' THEN
    RAISE EXCEPTION 'required_field_cleared: title';
  END IF;
  IF btrim(coalesce(OLD.role_category, '')) <> '' AND btrim(coalesce(NEW.role_category, '')) = '' THEN
    RAISE EXCEPTION 'required_field_cleared: role_category';
  END IF;
  IF btrim(coalesce(OLD.seniority, '')) <> '' AND btrim(coalesce(NEW.seniority, '')) = '' THEN
    RAISE EXCEPTION 'required_field_cleared: seniority';
  END IF;
  IF btrim(coalesce(OLD.location, '')) <> '' AND btrim(coalesce(NEW.location, '')) = '' THEN
    RAISE EXCEPTION 'required_field_cleared: location';
  END IF;
  IF btrim(coalesce(OLD.work_modality, '')) <> '' AND btrim(coalesce(NEW.work_modality, '')) = '' THEN
    RAISE EXCEPTION 'required_field_cleared: work_modality';
  END IF;
  IF array_length(coalesce(OLD.skills, ARRAY[]::TEXT[]), 1) > 0
     AND array_length(coalesce(NEW.skills, ARRAY[]::TEXT[]), 1) IS NULL THEN
    RAISE EXCEPTION 'required_field_cleared: skills';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_clearing_required_profile_fields_trigger ON users;
CREATE TRIGGER prevent_clearing_required_profile_fields_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_clearing_required_profile_fields();

-- Un skill en uso no se borra ni se renombra (FR-021). El banco, los intentos y
-- los niveles ya están protegidos por sus FK; users.skills es TEXT[] y no tiene
-- FK, así que necesita este trigger.
CREATE OR REPLACE FUNCTION guard_skill_in_use()
RETURNS TRIGGER AS $$
DECLARE
  v_user TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name = OLD.name THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_user FROM users WHERE OLD.name = ANY(skills) LIMIT 1;

  IF v_user IS NOT NULL THEN
    RAISE EXCEPTION 'skill_in_use: % lo usa el perfil de %', OLD.name, v_user;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_skill_in_use_trigger ON skills;
CREATE TRIGGER guard_skill_in_use_trigger
  BEFORE DELETE OR UPDATE OF name ON skills
  FOR EACH ROW EXECUTE FUNCTION guard_skill_in_use();


-- ============================================
-- Verificación (correr después de aplicar todo)
-- ============================================
-- SELECT account_type, is_superadmin, count(*) FROM users GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT username FROM users WHERE 'admin' = ANY(roles);            -- esperado: 0 filas
-- SELECT count(*) FROM skill_aliases;                               -- > 0
-- SELECT u.username, s.skill                                        -- esperado: 0 filas (SC-001)
--   FROM users u CROSS JOIN LATERAL unnest(u.skills) AS s(skill)
--  WHERE u.account_type = 'candidate'
--    AND NOT coalesce(u.is_scraper_profile, false)
--    AND NOT EXISTS (SELECT 1 FROM skills k WHERE k.name = s.skill);
