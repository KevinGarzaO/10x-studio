-- ============================================
-- Company claims (parte 2 del requerimiento de cuentas) - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr completa.
--
-- Qué resuelve: hoy las empresas son filas que creó el scraper y nadie puede
-- entrar como una. Esto permite que una persona reclame la empresa (o la cree)
-- subiendo documentos legales, que el superadmin revise, y que al aprobarse la
-- cuenta de esa persona pase a ser de tipo empresa y quede ligada a ella.
--
-- Como en la parte 1, el cambio de tipo de cuenta NO se hace desde la
-- aplicación: la aprobación corre aquí, con approve_company_claim().
-- ============================================


-- ============================================
-- BLOQUE 1 — Vínculo entre una cuenta y su empresa
-- ============================================

-- A qué empresa pertenece esta cuenta. Hoy lo usa el solicitante aprobado;
-- la parte 3 (miembros) hará crecer esto a varias personas por empresa.
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Quién reclamó esta empresa. Mientras sea NULL, la empresa no tiene dueño y
-- el scraper la sigue administrando.
ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id) WHERE company_id IS NOT NULL;


-- ============================================
-- BLOQUE 2 — Reclamos y sus documentos
-- ============================================

CREATE TABLE IF NOT EXISTS company_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quién reclama. Al aprobarse, esta cuenta pasa a ser de tipo empresa.
  claimant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- La empresa existente que se reclama. NULL cuando la empresa no existe
  -- todavía y hay que crearla al aprobar.
  company_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  company_name TEXT NOT NULL CHECK (btrim(company_name) <> '' AND company_name = btrim(company_name)),
  -- Persona moral (12) o física con actividad empresarial (13).
  rfc TEXT NOT NULL CHECK (rfc = upper(btrim(rfc)) AND rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  website TEXT CHECK (website IS NULL OR website = btrim(website)),
  description TEXT CHECK (description IS NULL OR (btrim(description) <> '' AND description = btrim(description))),
  company_size TEXT CHECK (company_size IS NULL OR company_size IN ('1-10', '11-50', '51-200', '201-1000', '1000+')),
  industry TEXT CHECK (industry IS NULL OR (btrim(industry) <> '' AND industry = btrim(industry))),
  location TEXT CHECK (location IS NULL OR (btrim(location) <> '' AND location = btrim(location))),
  logo_url TEXT,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT CHECK (
    rejection_reason IS NULL
    OR (btrim(rejection_reason) <> '' AND rejection_reason = btrim(rejection_reason))
  ),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mismos candados que las propuestas de skills: una decisión tomada a mano
  -- no puede dejar el reclamo en un estado imposible.
  CONSTRAINT company_claims_rejection_needs_reason
    CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)),
  CONSTRAINT company_claims_review_matches_status
    CHECK ((status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))
);

-- Una persona no puede tener dos reclamos abiertos a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS company_claims_one_pending_per_user
  ON company_claims (claimant_id) WHERE status = 'pending';

-- Una empresa se reclama UNA sola vez: ni dos personas a la vez, ni otra
-- después de que ya tiene dueño.
CREATE UNIQUE INDEX IF NOT EXISTS company_claims_one_live_per_company
  ON company_claims (company_user_id)
  WHERE company_user_id IS NOT NULL AND status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_company_claims_status ON company_claims (status);

-- Los documentos viven en el bucket privado; aquí solo queda su referencia y,
-- cuando se borran al decidir, la constancia de qué se revisó.
CREATE TABLE IF NOT EXISTS company_claim_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES company_claims(id) ON DELETE CASCADE,
  -- existence: acta constitutiva o constancia de situación fiscal
  -- identity:  identificación oficial del solicitante
  -- representation: poder notarial o carta poder
  kind TEXT NOT NULL CHECK (kind IN ('existence', 'identity', 'representation')),
  storage_path TEXT,
  file_name TEXT NOT NULL CHECK (btrim(file_name) <> ''),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Se marca al borrar el archivo tras la decisión: el reclamo conserva el
  -- registro de qué tipo de documento se revisó, sin el documento.
  purged_at TIMESTAMPTZ,
  CONSTRAINT company_claim_documents_path_or_purged
    CHECK ((storage_path IS NULL) = (purged_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_company_claim_documents_claim
  ON company_claim_documents (claim_id);


-- ============================================
-- BLOQUE 3 — Decisiones del superadmin (editor SQL)
-- ============================================

-- Aprobar un reclamo: la cuenta del solicitante pasa a tipo empresa y queda
-- ligada a la empresa; la empresa deja de ser del scraper.
-- Las vacantes NO se mueven: ya pertenecen a la fila de la empresa.
CREATE OR REPLACE FUNCTION approve_company_claim(
  p_claim_id UUID,
  p_reviewed_by UUID
) RETURNS UUID AS $$
DECLARE
  v_claim company_claims%ROWTYPE;
  v_company_id UUID;
  v_slug TEXT;
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
           location = coalesce(v_claim.location, location)
     WHERE id = v_company_id;
  ELSE
    -- Empresa nueva: se crea su cuenta, sin login propio (la persona entra con
    -- la suya, que queda ligada abajo).
    INSERT INTO users (username, company_slug, account_type, display_name, bio, website, photo_url, location, claimed_by)
    VALUES (
      v_slug || '-' || substr(md5(random()::text), 1, 6),
      v_slug,
      'company',
      v_claim.company_name,
      v_claim.description,
      v_claim.website,
      v_claim.logo_url,
      v_claim.location,
      v_claim.claimant_id
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

CREATE OR REPLACE FUNCTION reject_company_claim(
  p_claim_id UUID,
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

  SELECT status INTO v_status FROM company_claims WHERE id = p_claim_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'claim_not_found: %', p_claim_id;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'claim_already_decided: %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_reviewed_by AND is_superadmin) THEN
    RAISE EXCEPTION 'not_superadmin: solo un superadmin decide reclamos';
  END IF;

  UPDATE company_claims
     SET status = 'rejected',
         rejection_reason = v_reason,
         reviewed_by = p_reviewed_by,
         reviewed_at = now()
   WHERE id = p_claim_id;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION approve_company_claim(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reject_company_claim(UUID, TEXT, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION approve_company_claim(UUID, UUID) FROM anon;
    REVOKE EXECUTE ON FUNCTION reject_company_claim(UUID, TEXT, UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION approve_company_claim(UUID, UUID) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION reject_company_claim(UUID, TEXT, UUID) FROM authenticated;
  END IF;
END $$;

-- Lo que el superadmin abre para revisar: pendientes, con quién reclama, qué
-- empresa y cuántos documentos subió.
CREATE OR REPLACE VIEW pending_company_claims AS
  SELECT c.id,
         c.company_name,
         c.rfc,
         c.created_at,
         claimant.username AS claimant_username,
         claimant.email AS claimant_email,
         company.username AS company_username,
         count(d.id) FILTER (WHERE d.purged_at IS NULL) AS documents
    FROM company_claims c
    JOIN users claimant ON claimant.id = c.claimant_id
    LEFT JOIN users company ON company.id = c.company_user_id
    LEFT JOIN company_claim_documents d ON d.claim_id = c.id
   WHERE c.status = 'pending'
   GROUP BY c.id, c.company_name, c.rfc, c.created_at,
            claimant.username, claimant.email, company.username
   ORDER BY c.created_at;


-- ============================================
-- BLOQUE 4 — Bucket privado de documentos
--
-- Los documentos legales NO son públicos: solo el solicitante (a través del
-- backend) y el superadmin los ven, y se borran al decidir el reclamo.
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-docs', 'company-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT * FROM pending_company_claims;
-- SELECT id, public FROM storage.buckets WHERE id = 'company-docs';  -- public = false
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'users' AND column_name IN ('company_id','claimed_by');
