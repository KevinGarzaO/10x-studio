-- Eventos de los correos que llegan por el webhook de Resend (7 nov 2026): entregado, rebote, queja, clic y apertura.
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente. No guarda correos ni IPs: solo QUE paso, con que correo (id de Resend), a que
-- persona se liga (user_id o invitacion, si se pudo saber) y, en un clic, la direccion a la que hizo clic SIN parametros.
--   * Los clics suman al valor de la persona (services/analytics/people-value.ts).
--   * Las APERTURAS se guardan aparte y nunca suman: no son confiables (los programas de correo las abren solos).
--   * Un rebote o una queja de una invitacion saca a esa persona de la lista; una queja de una cuenta apaga sus correos (email_opt_out).
-- svix_id es unico: Resend reintenta los avisos y asi un mismo aviso nunca se cuenta dos veces.
CREATE TABLE IF NOT EXISTS email_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id         TEXT NOT NULL UNIQUE,
  resend_email_id TEXT,
  event_type      TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sin llaves foraneas a proposito: un correo puede ser de alguien que se borro, y la tabla no debe estorbar al webhook.
  user_id         UUID,
  invitation_id   UUID,
  kind            TEXT,
  link            TEXT,
  bounce_type     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_user_idx ON email_events (user_id, event_type);
CREATE INDEX IF NOT EXISTS email_events_email_idx ON email_events (resend_email_id);
CREATE INDEX IF NOT EXISTS email_events_time_idx ON email_events (occurred_at DESC);

-- Como el resto: solo el backend la lee y la escribe.
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_events FROM anon, authenticated;
