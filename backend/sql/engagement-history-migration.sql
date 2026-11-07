-- Historial de compromiso por persona (8 nov 2026): una FOTO semanal por cuenta real y las fechas clave de cada una.
--
-- Corre MANUAL en el editor SQL de Supabase. Es idempotente. Hasta hoy el valor y la temperatura se calculaban al momento y NO se guardaban:
-- el pasado de esos dos no se puede reconstruir, por eso las fotos empiezan ahora y se guardan para siempre, sin sobrescribir.
--
-- PRIVACIDAD: las dos tablas cuelgan de users con ON DELETE CASCADE: si la persona borra su cuenta o ejerce sus derechos ARCO y se borra su
-- usuario, su historial se borra con ella. No se guarda el contenido de ninguna publicacion ni dato sensible: solo conteos y fechas.
-- `accepts_commercial` (acepta ofertas o contacto comercial) va SEPARADA de `accepts_news` y hoy queda NULL: aun no existe esa pregunta, pero la
-- monetizacion la va a necesitar.

CREATE TABLE IF NOT EXISTS engagement_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- semanal      la foto de cada lunes 00:00 hora de Monterrey; resume la semana que acaba de terminar (week_start = su lunes)
  -- base         la foto inicial del 7 de nov de 2026 (week_start = ese dia): sirve para seguir a «los calientes del 7 nov»
  -- reconstruida semanas pasadas rehechas con datos que si tienen fecha (actividad, publicaciones, correos); valor, enganche y temperatura NULL
  kind              TEXT NOT NULL DEFAULT 'semanal' CHECK (kind IN ('semanal', 'base', 'reconstruida')),
  week_start        DATE NOT NULL,
  cut_at            TIMESTAMPTZ NOT NULL,
  value             INT,
  engagement        INT,
  temperature       TEXT CHECK (temperature IN ('caliente', 'tibio', 'frio')),
  active_days_7     INT,
  active_weeks_4    INT,
  discussions       INT,
  comments          INT,
  votes             INT,
  replies_given     INT,
  replies_received  INT,
  emails_sent       INT,
  email_clicks      INT,
  push_clicks       INT,
  accepts_news      BOOLEAN,
  accepts_commercial BOOLEAN,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una sola foto por persona, tipo y semana: una segunda corrida el mismo lunes no la sobrescribe.
  UNIQUE (user_id, kind, week_start)
);
CREATE INDEX IF NOT EXISTS engagement_snapshots_week_idx ON engagement_snapshots (week_start, kind);

-- Fechas clave: una fila por persona. Las «primera ...» se guardan una vez y no se borran; `last_community_at` se actualiza.
CREATE TABLE IF NOT EXISTS person_key_dates (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  registered_at        TIMESTAMPTZ,
  profile_completed_at TIMESTAMPTZ,
  first_apply_tap_at   TIMESTAMPTZ,
  first_applied_at     TIMESTAMPTZ,
  first_community_at   TIMESTAMPTZ,
  last_community_at    TIMESTAMPTZ,
  -- Lo marca el fundador a mano: distingue a quien participo porque se le invito de quien lo hizo solo.
  invited_manually_at  TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Como el resto: solo el backend las lee y las escribe.
ALTER TABLE engagement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_key_dates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engagement_snapshots FROM anon, authenticated;
REVOKE ALL ON person_key_dates FROM anon, authenticated;
