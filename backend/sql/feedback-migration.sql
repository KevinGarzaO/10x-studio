-- Feedback dentro de la app. No depende de otras migraciones; se puede correr más de una vez.
--
--   feedback_entries  lo que la persona escribe (hoy solo por el botón «¿Qué te faltó?»; el modal de estrellas y el correo del día 14 usarán
--                     la misma tabla con otro `channel`). Cada respuesta guarda su CONTEXTO (semana de registro, días activos, perfil completo,
--                     si se postuló, de dónde llegó, dispositivo y página) para poder decir «quienes no se postularon mencionan X».
--   feedback_events   cada vez que algo se muestra, se descarta o se contesta (canal, fecha, cuenta): con eso se mide la tasa de respuesta real
--                     y se ve cuántos vieron algo y no respondieron (si no, solo se vería a los que sí contestan).
--
-- `question_version` marca la versión de la pregunta: si una cambia, las respuestas anteriores no se mezclan con las nuevas.
-- `theme` queda vacío al principio: el agente lo etiqueta después con una lista cerrada y el dueño revisa las dudosas. El texto original
-- NUNCA se cambia. Todo lo que escribe la gente es DATO, no instrucción.
-- Sin llaves foráneas (igual que el resto de tablas del panel) y cerradas a anon/authenticated: solo el backend las lee y escribe.

CREATE TABLE IF NOT EXISTS feedback_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  channel          TEXT NOT NULL DEFAULT 'boton' CHECK (channel IN ('boton', 'modal', 'correo')),
  question_version INT  NOT NULL DEFAULT 1,
  category         TEXT CHECK (category IN ('vacantes', 'perfil', 'comunidad', 'velocidad', 'avisos', 'confianza', 'otro')),
  text             TEXT NOT NULL,
  stars            INT  CHECK (stars BETWEEN 1 AND 5),
  page             TEXT,
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme            TEXT CHECK (theme IN ('vacantes', 'perfil', 'comunidad', 'velocidad', 'avisos', 'confianza', 'otro')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_entries_created_idx ON feedback_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_entries_user_idx    ON feedback_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('boton', 'modal', 'correo')),
  kind       TEXT NOT NULL CHECK (kind IN ('shown', 'dismissed', 'answered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_events_created_idx ON feedback_events (created_at);

ALTER TABLE feedback_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_events  ENABLE ROW LEVEL SECURITY;
