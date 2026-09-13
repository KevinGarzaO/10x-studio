-- ============================================
-- Skill Level Exam (002) - Migration
-- Run this in Supabase SQL Editor
--
-- Reads the question bank created by 001 (exam_questions, question_options,
-- skills) without modifying it.
-- ============================================

-- 1. Un intento de examen: quien, de que skill, cuando, y como termino.
CREATE TABLE IF NOT EXISTS skill_exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(50) NOT NULL REFERENCES skills(name),
  -- No existe el valor 'expired': un intento vencido es un estado DERIVADO
  -- (status = 'in_progress' AND expires_at < now()). Si se almacenara, habria
  -- que escribirlo desde un cron o desde un camino de lectura, y aparecería la
  -- ventana "ya vencio pero nadie lo ha marcado". Ver research.md R2.
  status VARCHAR(12) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  correct_count SMALLINT CHECK (correct_count >= 0),
  -- Se guarda por intento para que cambiar el largo del examen en el futuro no
  -- altere como se calcularon los resultados viejos.
  question_count SMALLINT NOT NULL CHECK (question_count > 0),
  level VARCHAR(12) CHECK (level IN ('basico', 'intermedio', 'avanzado')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FR-017: un candidato no puede tener dos examenes abiertos a la vez. El indice
-- parcial es la unica defensa real contra dos peticiones simultaneas (dos
-- pestañas): validar antes de insertar es una condicion de carrera.
CREATE UNIQUE INDEX IF NOT EXISTS skill_exam_attempts_one_in_progress
  ON skill_exam_attempts (user_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_skill_exam_attempts_user_skill
  ON skill_exam_attempts (user_id, skill_name);

-- 2. Las preguntas congeladas de un intento y lo que el candidato respondio.
--    Es el registro auditable que exige FR-012.
CREATE TABLE IF NOT EXISTS skill_exam_attempt_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES skill_exam_attempts(id) ON DELETE CASCADE,
  -- RESTRICT: una pregunta ya presentada en algun intento no se puede borrar,
  -- o el intento dejaria de ser reconstruible (FR-012). Hoy no rompe nada
  -- porque 001 no tiene interfaz de borrado, pero condiciona a quien la
  -- construya despues. Ver research.md R5.
  exam_question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position >= 0),
  selected_option_index SMALLINT CHECK (selected_option_index >= 0),
  -- Calculado solo en el servidor. Es la unica columna que el dispositivo del
  -- candidato nunca debe poder influir ni leer antes de terminar (FR-005, FR-007).
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ,
  UNIQUE (attempt_id, position),
  UNIQUE (attempt_id, exam_question_id)
);

-- 3. El mejor nivel alcanzado por candidato y skill. Es lo que lee el perfil
--    publico, que es el camino caliente (lo visitan empresas). Desnormalizado
--    para no calcular un maximo sobre el historial en cada visita: el orden
--    basico < intermedio < avanzado no es alfabetico. Ver research.md R4.
CREATE TABLE IF NOT EXISTS user_skill_levels (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(50) NOT NULL REFERENCES skills(name),
  level VARCHAR(12) NOT NULL CHECK (level IN ('basico', 'intermedio', 'avanzado')),
  -- Cuando alcanzo POR PRIMERA VEZ este nivel. Un reintento peor no lo mueve
  -- (FR-021).
  achieved_at TIMESTAMPTZ NOT NULL,
  source_attempt_id UUID NOT NULL REFERENCES skill_exam_attempts(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, skill_name)
);
