-- ============================================
-- Correos a personas: baja y registro de envíos - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Por qué:
--   1. users.email_opt_out: quien pide no recibir más correos de AvoTalent. Todo envío la respeta.
--   2. email_sends: una fila por correo enviado (a quién, de qué tipo, id en Resend). Sirve para
--      no mandar dos veces el mismo correo a una persona y para medir qué pasó después.
-- La tabla nace con RLS activo y sin acceso para anon/authenticated: solo el backend la lee y escribe.
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_sends (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Qué correo es (por ejemplo 'perfil-pendiente-1'). Una persona recibe cada tipo una sola vez.
  kind       TEXT NOT NULL,
  vacancy_id UUID REFERENCES community_posts(id) ON DELETE SET NULL,
  resend_id  TEXT,
  -- La fila se crea 'pending' ANTES de enviar: el UNIQUE impide que dos ejecuciones manden el mismo correo.
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

CREATE INDEX IF NOT EXISTS email_sends_kind_idx ON email_sends (kind, created_at DESC);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

-- Verificación:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_opt_out';
-- SELECT * FROM email_sends LIMIT 1;
