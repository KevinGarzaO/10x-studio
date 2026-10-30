-- "Para ti" precalculado: las mejores coincidencias de cada persona se guardan aquí y abrir el inicio solo las lee.
-- Las escribe backend/services/matching/refresh.ts (al guardar el perfil, cada 30 minutos y la primera vez).
-- Sin esta migración "Para ti" sigue funcionando, calculando en el momento (más lento).
-- Sin llave foránea a propósito: dos referencias entre users y community_posts rompían los embeds de PostgREST (PGRST201).

CREATE TABLE IF NOT EXISTS vacancy_matches (
  user_id     UUID        NOT NULL,
  source_type TEXT        NOT NULL,
  source_id   TEXT        NOT NULL,
  rank        INTEGER     NOT NULL,
  score       INTEGER     NOT NULL,
  item        JSONB       NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS vacancy_matches_user_rank_idx ON vacancy_matches (user_id, rank);

-- Una fila por persona: "ya se calculó" aunque no haya coincidencias (si no, se recalcularía en cada visita).
CREATE TABLE IF NOT EXISTS vacancy_match_state (
  user_id     UUID        PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vacancy_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacancy_match_state ENABLE ROW LEVEL SECURITY;
