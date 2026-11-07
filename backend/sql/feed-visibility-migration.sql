-- Vacantes ocultas del feed (decisión del fundador, 6 nov 2026, cambio B de «oferta de vacantes»).
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente.
--
-- Una vacante que no le sirve a ninguna persona real (services/vacancies/serves-someone.ts) se OCULTA del feed, de las listas y del conteo
-- de vacantes abiertas. NO se borra y NO se rompe su enlace: sigue abriendo por enlace directo (LinkedIn, correos, Google). Es reversible:
-- un trabajo diario (refreshFeedVisibility) la vuelve a mostrar en cuanto llega alguien a quien le sirva, y `npm run feed-visibility`
-- muestra qué se ocultaría antes de activarlo.
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hidden_from_feed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS community_posts_hidden_idx ON community_posts (hidden_from_feed) WHERE hidden_from_feed;
