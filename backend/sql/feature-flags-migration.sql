-- Interruptores por grupo (feature flags / gatekeepers), 13 nov 2026. Corre MANUAL en el editor SQL de Supabase (despues, en cada entorno nuevo).
-- Es idempotente. Solo agrega tablas; no toca ninguna existente.
--
-- Una funcion nueva se publica APAGADA y se enciende por pasos, sin volver a desplegar:
--   off -> equipo -> beta -> p1 (1 %) -> p10 (10 %) -> p25 (25 %) -> p50 (50 %) -> todos
-- Cada paso INCLUYE a los anteriores: en «beta» la ven el equipo y las personas beta; en «p10» ademas el 10 % de todos los demas; etc.
-- «off» es el boton de emergencia: apaga la funcion para todo el mundo, incluso para quien se haya puesto a mano.
--
-- Privacidad: las tablas con personas cuelgan de users con ON DELETE CASCADE (si se borra una cuenta, se borra su pertenencia a grupos y sus
-- excepciones). No guardan nada mas que quien, que grupo y cuando.

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{2,48}$'),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 300),
  stage       TEXT NOT NULL DEFAULT 'off' CHECK (stage IN ('off', 'equipo', 'beta', 'p1', 'p10', 'p25', 'p50', 'todos')),
  -- Todo interruptor nace con una fecha de retiro: uno que nadie borra se vuelve deuda.
  retire_by   DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

-- Excepciones por persona: «allow» la ve aunque su paso no le toque; «deny» no la ve aunque le toque. (Con el paso «off» nadie la ve.)
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  flag_key   TEXT NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL CHECK (mode IN ('allow', 'deny')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flag_key, user_id)
);

-- Grupos de personas. «equipo» se reconoce solo (cuentas de superadmin y de prueba); «beta» es una lista de invitadas que marca el fundador.
CREATE TABLE IF NOT EXISTS user_groups (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_key  TEXT NOT NULL CHECK (group_key IN ('beta', 'equipo')),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by   UUID,
  PRIMARY KEY (user_id, group_key)
);

-- Cada cambio de paso queda guardado: quien, cuando, de donde a donde. No se borra.
CREATE TABLE IF NOT EXISTS feature_flag_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key   TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  from_stage TEXT,
  to_stage   TEXT NOT NULL,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS feature_flag_log_flag_idx ON feature_flag_log (flag_key, changed_at DESC);

-- Como el resto: solo el backend las lee y las escribe.
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON feature_flags, feature_flag_overrides, user_groups, feature_flag_log FROM anon, authenticated;
