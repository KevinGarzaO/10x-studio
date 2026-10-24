-- ============================================
-- Vistas y clics en "Postularse" de cada vacante - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Por qué: hoy solo se sabe que alguien ENTRÓ al sitio (landing_visits) y que se le mostró una
-- vacante en "Para ti" (user_vacancy_history). No se sabe si abrió una vacante ni si intentó
-- postularse: justo lo que dice si la gente que llega encuentra algo útil.
--
-- Qué guarda: una fila cuando alguien abre la página de una vacante ('view') o pulsa "Postularse"
-- ('apply'). Guarda el navegador (visitor_id, el mismo de landing_visits), la persona si tenía
-- sesión, y de dónde venía. Los guardados ya viven en user_vacancy_history.
-- ============================================

CREATE TABLE IF NOT EXISTS vacancy_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_slug TEXT NOT NULL,
  event        TEXT NOT NULL CHECK (event IN ('view', 'apply')),
  visitor_id   TEXT NOT NULL,
  -- La persona, si tenía sesión; sin sesión queda en NULL.
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  source       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacancy_events_created_idx ON vacancy_events (created_at DESC);
CREATE INDEX IF NOT EXISTS vacancy_events_slug_idx    ON vacancy_events (vacancy_slug, event);

-- Como el resto: solo el backend la lee y la escribe.
ALTER TABLE vacancy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vacancy_events FROM anon, authenticated;

-- Verificación:
-- SELECT event, count(*) FROM vacancy_events GROUP BY 1;
-- SELECT has_table_privilege('anon', 'public.vacancy_events', 'SELECT');  -- false
