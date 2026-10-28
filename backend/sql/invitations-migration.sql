-- ============================================
-- Invitaciones por correo (lista de contactos) - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Por qué:
--   invitations       una fila por persona de la lista (correo, nombre, de qué lista salió, su lugar en la cola y
--                     su código para medir el registro). Se llena con `npm run import-invitations`.
--   invitation_sends  una fila por correo enviado (primera o segunda invitación): estado, id en Resend y último
--                     evento (entregado, abierto, clic, rebote…).
-- Las tablas nacen con RLS activo y sin acceso para anon/authenticated: solo el backend las lee y escribe.
-- ============================================

CREATE TABLE IF NOT EXISTS invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Va en el enlace de cada correo (utm_content) para saber quién se registró desde cuál invitación.
  code          TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  first_name    TEXT,
  -- 'substack' (suscriptores de la newsletter) o 'lista' (el resto).
  source        TEXT NOT NULL,
  -- Lugar en la cola: menor primero.
  position      INTEGER NOT NULL,
  -- Se deja de escribir a quien rebotó o marcó spam.
  suppressed    BOOLEAN NOT NULL DEFAULT false,
  suppressed_reason TEXT,
  -- Cuando la persona se registra (por el enlace o con el mismo correo).
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_position_idx ON invitations (position);

CREATE TABLE IF NOT EXISTS invitation_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  -- 1 = primera invitación, 2 = la última.
  step          SMALLINT NOT NULL CHECK (step IN (1, 2)),
  -- La fila se crea 'pending' ANTES de enviar: el UNIQUE impide mandar dos veces el mismo paso.
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  resend_id     TEXT,
  last_event    TEXT,
  last_event_at TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, step)
);

CREATE INDEX IF NOT EXISTS invitation_sends_created_idx ON invitation_sends (created_at DESC);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_sends ENABLE ROW LEVEL SECURITY;

-- Verificación:
-- SELECT count(*) FROM invitations;
-- SELECT step, status, count(*) FROM invitation_sends GROUP BY 1, 2;
