-- ============================================
-- Actividad diaria de los usuarios (retención) - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Por qué: `users` solo guarda cuándo se creó la cuenta, no cuándo volvió. Sin eso no se puede
-- medir la retención (cuánta gente regresa) ni cuántas personas usan AvoTalent cada día, semana o
-- mes. Esos datos NO se pueden reconstruir después: lo que hoy no se anota, se pierde. Por eso
-- conviene aplicar esta migración cuanto antes, aunque el panel todavía no la muestre.
--
-- Qué guarda: una fila por persona y día en que hizo cualquier petición con sesión (el backend la
-- escribe solo, una vez por persona al día). No guarda qué hizo ni desde dónde: solo que estuvo.
-- ============================================

CREATE TABLE IF NOT EXISTS user_activity_daily (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- El día en hora de Monterrey, que es como se lee el panel.
  day           DATE NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS user_activity_daily_day_idx ON user_activity_daily (day);

-- Como el resto: solo el backend la lee y la escribe.
ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_activity_daily FROM anon, authenticated;

-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT count(*) FROM user_activity_daily;                        -- crece con el uso
-- SELECT has_table_privilege('anon', 'public.user_activity_daily', 'SELECT');  -- false
