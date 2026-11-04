-- Reporte semanal de LinkedIn (el Excel «Análisis conjunto» que se sube todos los lunes desde Telemetry). No depende de otras
-- migraciones; se puede correr más de una vez.
--
--   linkedin_report_uploads  cada Excel subido (con su huella, para no contarlo dos veces) y sus totales.
--   linkedin_daily           impresiones, interacciones y seguidores nuevos por día (lo más nuevo sustituye a lo anterior).
--   linkedin_post_stats      lo que LinkedIn dice de cada publicación en cada subida (una fila por publicación y subida).
--   linkedin_audience        quién ve: seguidores («publico») y quienes vieron el contenido («contenido») por empresa, ubicación, cargo...
--
-- Sin llaves foráneas (igual que el resto de tablas del panel) y cerradas a anon/authenticated: solo el backend las lee y escribe.

CREATE TABLE IF NOT EXISTS linkedin_report_uploads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by      UUID,
  file_name        TEXT,
  file_hash        TEXT NOT NULL UNIQUE,
  period_start     DATE,
  period_end       DATE,
  impressions      INT,
  members_reached  INT,
  followers_total  INT,
  posts            INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS linkedin_daily (
  day            DATE PRIMARY KEY,
  impressions    INT,
  interactions   INT,
  new_followers  INT,
  upload_id      UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS linkedin_post_stats (
  post_key                TEXT NOT NULL,
  upload_id               UUID NOT NULL,
  url                     TEXT,
  published_on            DATE,
  post_type               TEXT,
  impressions             INT,
  impressions_network_pct NUMERIC,
  impressions_outside_pct NUMERIC,
  members_reached         INT,
  followers_gained        INT,
  profile_views           INT,
  reactions               INT,
  comments                INT,
  shares                  INT,
  saves                   INT,
  sends                   INT,
  custom_button           INT,
  link_clicks             INT,
  interactions            INT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_key, upload_id)
);
CREATE INDEX IF NOT EXISTS linkedin_post_stats_upload_idx ON linkedin_post_stats (upload_id);

CREATE TABLE IF NOT EXISTS linkedin_audience (
  upload_id  UUID NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('publico', 'contenido')),
  category   TEXT NOT NULL,
  value      TEXT NOT NULL,
  pct        NUMERIC,
  rank       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (upload_id, source, category, value)
);

ALTER TABLE linkedin_report_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_daily          ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_post_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_audience       ENABLE ROW LEVEL SECURITY;
