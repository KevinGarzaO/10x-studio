-- ============================================
-- Notificaciones, preferencias de correo y "Para ti" - Migration
-- Run this in Supabase SQL Editor (DESPUÉS de email-quota-migration.sql)
--
-- Idempotente: se puede volver a correr.
--
-- Por qué:
--   community_notifications  ya existía y nadie la usaba: ahora la llenan los comentarios, las alertas de
--                            coincidencia fuerte y los skills validados, y la campana la lee. Se agrega `meta`.
--   users.email_prefs        qué correos de "Para ti" quiere recibir cada persona (resumen semanal y alertas).
--                            Sin valor = todo encendido.
--   match_alerts             qué vacante ya se le avisó a quién (para no repetirla) y si además se mandó por correo.
--   match_emails             cada resumen o alerta enviado por correo, para respetar los topes (1 alerta al día,
--                            3 a la semana, 1 resumen a la semana) y medir.
-- Las tablas nuevas nacen con RLS activo y sin acceso para anon/authenticated: solo el backend las lee y escribe.
-- ============================================

ALTER TABLE community_notifications ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_community_notifications_recent ON community_notifications (user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_prefs JSONB NOT NULL DEFAULT '{}';

-- OJO: no usar PRIMARY KEY (user_id, vacancy_id). Con una llave compuesta entre users y community_posts, PostgREST la
-- toma como tabla "puente" y el embed `author:users(...)` de community_posts se vuelve ambiguo (error PGRST201): se cae
-- el feed y los perfiles. Por eso lleva su propio id y un UNIQUE aparte.
CREATE TABLE IF NOT EXISTS match_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vacancy_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  score      SMALLINT NOT NULL,
  -- Si además del aviso en la app se mandó por correo.
  emailed    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, vacancy_id)
);

CREATE TABLE IF NOT EXISTS match_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'digest' = resumen semanal, 'alert' = coincidencia fuerte
  kind       TEXT NOT NULL CHECK (kind IN ('digest', 'alert')),
  resend_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_emails_user_idx ON match_emails (user_id, kind, created_at DESC);

ALTER TABLE match_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_emails ENABLE ROW LEVEL SECURITY;

-- Verificación:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_prefs';
-- SELECT count(*) FROM match_alerts;
