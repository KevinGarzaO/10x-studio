-- Avisos push (Web Push) y su medición. No depende de otras migraciones; se puede correr más de una vez.
--
--   push_subscriptions  un dispositivo/navegador que aceptó recibir avisos (una persona puede tener varios).
--   push_events         lo que pasa alrededor: se mostró la invitación, aceptó/negó el permiso, se mandó, falló, lo tocó.
--
-- Sin llaves foráneas a propósito (igual que vacancy_matches: una llave hacia users vuelve ambiguos los embeds, PGRST201).
-- Las dos tablas quedan cerradas a anon/authenticated (RLS): solo el backend (service_role) las lee y escribe.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS push_events (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID,
  subscription_id   UUID,
  kind              TEXT NOT NULL CHECK (kind IN ('prompt_shown', 'prompt_dismissed', 'permission_granted', 'permission_denied', 'sent', 'failed', 'click', 'unsubscribed')),
  notification_type TEXT,
  nid               UUID,
  surface           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_events_created_idx ON push_events (created_at);
CREATE INDEX IF NOT EXISTS push_events_user_sent_idx ON push_events (user_id, created_at) WHERE kind = 'sent';
CREATE UNIQUE INDEX IF NOT EXISTS push_events_click_once_idx ON push_events (nid) WHERE kind = 'click' AND nid IS NOT NULL;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_events ENABLE ROW LEVEL SECURITY;

-- El resumen que lee el panel (una sola definición): por tipo de aviso, cuántos se mandaron, fallaron y se tocaron, y cuántas personas distintas.
CREATE OR REPLACE FUNCTION push_summary(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (kind text, notification_type text, events int, people int)
LANGUAGE sql STABLE AS $$
  SELECT e.kind, COALESCE(e.notification_type, '') AS notification_type, COUNT(*)::int, COUNT(DISTINCT e.user_id)::int
  FROM push_events e
  WHERE e.created_at >= p_from AND e.created_at < p_to
    AND (e.user_id IS NULL OR e.user_id NOT IN (SELECT id FROM users WHERE COALESCE(is_test_account, FALSE) OR COALESCE(is_scraper_profile, FALSE) OR COALESCE(user_kind, 'user') = 'superadmin'))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;
GRANT EXECUTE ON FUNCTION push_summary(timestamptz, timestamptz) TO service_role;
