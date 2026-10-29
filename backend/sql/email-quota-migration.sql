-- ============================================
-- Cupo de correos de Resend (100 cada 24 horas corridas) - Migration
-- Run this in Supabase SQL Editor
--
-- Por qué: el plan gratis de Resend permite 100 correos cada 24 HORAS CORRIDAS (no por día de calendario). Cada envío
-- (recordatorios, bienvenidas, invitaciones, "Para ti" y las pruebas a mano) se anota aquí, y el cupo que queda es
-- 90 menos lo anotado en las últimas 24 horas (ver backend/services/email/budget.ts).
--
-- Esta migración también "siembra" lo que Resend ya contó antes de que existiera esta tabla (62 correos en las últimas
-- 24 horas al 28-oct-2026 21:00 Monterrey), para que el cupo de mañana ya cuente lo de hoy. Córrela UNA sola vez:
-- si la corres otra vez se duplica la siembra (mira el final para ver cómo corregirlo).
-- ============================================

CREATE TABLE IF NOT EXISTS email_quota (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'recordatorio-perfil' | 'bienvenida' | 'invitacion' | 'para-ti' | 'prueba' | 'sembrado'
  kind    TEXT NOT NULL DEFAULT 'otro'
);

CREATE INDEX IF NOT EXISTS email_quota_sent_at_idx ON email_quota (sent_at DESC);

ALTER TABLE email_quota ENABLE ROW LEVEL SECURITY;

-- Siembra: lo que Resend ya contó y esta tabla no conoce.
--   * los 26 correos originales (6 recordatorios a las 10:00 y 20 invitaciones a las 11:00 de Monterrey del 28-oct),
--     que se borraron del registro antes de reenviarlos;
--   * los 26 reenviados desde el remitente nuevo (están en email_sends / invitation_sends);
--   * unas 10 pruebas mandadas a mano.
INSERT INTO email_quota (sent_at, kind)
SELECT timestamptz '2026-10-28 16:00:00+00', 'sembrado' FROM generate_series(1, 6)
UNION ALL
SELECT timestamptz '2026-10-28 17:00:00+00', 'sembrado' FROM generate_series(1, 20)
UNION ALL
SELECT created_at, 'sembrado' FROM email_sends WHERE created_at > now() - interval '24 hours'
UNION ALL
SELECT created_at, 'sembrado' FROM invitation_sends WHERE created_at > now() - interval '24 hours'
UNION ALL
SELECT now() - interval '2 hours', 'sembrado' FROM generate_series(1, 10);

-- Verificación (debe dar cerca de 62 si la corres hoy mismo):
-- SELECT count(*) FROM email_quota WHERE sent_at > now() - interval '24 hours';
--
-- Si por error la corriste dos veces, borra la siembra y vuelve a correr SOLO el INSERT de arriba:
-- DELETE FROM email_quota WHERE kind = 'sembrado';
