-- Mis postulaciones: a qué vacantes salió cada persona a postularse y qué pasó después.
--
-- Corre MANUAL en el editor SQL de Supabase (no depende de otras migraciones). Es idempotente.
--
-- Por qué existe: el formulario de postulación es del sitio de la empresa (Greenhouse, Lever, Workable...), no de AvoTalent, así que
-- NO podemos ver si alguien se postuló. Lo que sí podemos es preguntárselo al volver («¿Ya te postulaste a X?»), guardar la respuesta,
-- mostrar «Postulada» en el feed y en el detalle, listarlas en «Mis postulaciones» y dar seguimiento unos días después. Eso además es
-- el único dato real de postulaciones completas (lo dice la persona; no es algo que veamos nosotros).
--
-- OJO: sin llaves foráneas y sin llave compuesta a propósito (igual que vacancy_matches y match_alerts): una llave entre users y
-- community_posts vuelve ambiguo el embed `author:users(...)` de community_posts (error PGRST201) y se caería el feed.

CREATE TABLE IF NOT EXISTS vacancy_applications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  vacancy_id  uuid        NOT NULL,
  -- Cómo se veía la vacante al salir: si luego cambia o se borra, la lista de la persona no se queda vacía.
  vacancy_slug text,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  company     text,
  -- El sitio al que salió (solo el dominio, para mostrarlo: «te llevamos al sitio oficial de ...»).
  apply_host  text,
  -- clicked   salió al sitio de la empresa y todavía no contestó
  -- not_yet   dijo «todavía no me postulo» (queda como pendiente de postular)
  -- applied   dijo «sí, ya me postulé»
  -- interview / offer / rejected   cómo va, lo actualiza la persona
  status      text        NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked', 'not_yet', 'applied', 'interview', 'offer', 'rejected')),
  -- «Más tarde»: no volver a preguntar antes de esta hora.
  remind_at   timestamptz,
  clicked_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  applied_at  timestamptz,
  -- Para no repetir el seguimiento (aviso dentro de la app y correo).
  followup_notified_at timestamptz,
  followup_emailed_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, vacancy_id)
);

CREATE INDEX IF NOT EXISTS vacancy_applications_user_idx   ON vacancy_applications (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS vacancy_applications_status_idx ON vacancy_applications (status, applied_at);

-- Solo el backend la lee y la escribe (la persona nunca habla con la base directamente).
ALTER TABLE vacancy_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vacancy_applications FROM PUBLIC, anon, authenticated;
