-- ============================================
-- ARREGLO URGENTE: match_alerts rompía el feed y los perfiles
-- Run this in Supabase SQL Editor
--
-- Qué pasó: match_alerts se creó con PRIMARY KEY (user_id, vacancy_id). Con esa llave compuesta entre users y
-- community_posts, PostgREST la toma como tabla "puente" y el embed `author:users(...)` de community_posts queda
-- ambiguo (error PGRST201 "more than one relationship"): GET /posts responde 500, el feed no muestra vacantes ni
-- discusiones y los perfiles salen en blanco.
--
-- Arreglo: rehacer la tabla con su propio id y un UNIQUE aparte (así ya no es una tabla puente). La tabla está vacía
-- (se creó hace unas horas y todavía no corre ninguna alerta), por eso se puede borrar sin perder nada.
-- ============================================

DROP TABLE IF EXISTS match_alerts;

CREATE TABLE match_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vacancy_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  score      SMALLINT NOT NULL,
  emailed    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, vacancy_id)
);

ALTER TABLE match_alerts ENABLE ROW LEVEL SECURITY;

-- Que la API vea el cambio de inmediato:
NOTIFY pgrst, 'reload schema';

-- Verificación (debe responder una fila, no un error):
-- SELECT id FROM community_posts LIMIT 1;
