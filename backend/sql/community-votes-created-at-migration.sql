-- Fecha de cada voto de la comunidad (medicion de participacion por semana, 7 nov 2026).
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente. La tabla community_votes no guardaba CUANDO se dio cada voto, asi que no se
-- podia saber en que semana participo cada persona. Los votos que ya existian quedan con la fecha de hoy (al 7 de noviembre de 2026 no habia
-- ningun voto de cuentas reales, asi que no se pierde ningun dato).
ALTER TABLE community_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS community_votes_created_idx ON community_votes (created_at);
