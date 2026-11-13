-- Arrendamiento de los procesos que corren las tareas programadas (crons). Solo UN proceso a la vez puede tenerlo: así, aunque haya varias copias de
-- la API o un despliegue deje dos copias vivas un rato, los correos y las publicaciones no se disparan dos veces.
--
-- Cómo funciona: quien quiere correr los crons pide el arrendamiento `crons` con un vencimiento (60 s) y lo renueva cada 15 s. Si otro proceso ya lo
-- tiene y no ha vencido, la petición se rechaza. Si el dueño muere, el arrendamiento vence solo y otro lo toma. Al apagarse bien, el dueño lo suelta.
--
-- Solo agrega una tabla y dos funciones; no toca nada existente. Solo el backend (llave de servicio) puede usarlas.
CREATE TABLE IF NOT EXISTS worker_leases (
  name       TEXT PRIMARY KEY,
  holder     TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE worker_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON worker_leases FROM anon, authenticated;

-- true = el arrendamiento es tuyo (lo tomaste o lo renovaste); false = lo tiene otro vigente.
CREATE OR REPLACE FUNCTION worker_lease_acquire(p_name TEXT, p_holder TEXT, p_ttl_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  got TEXT;
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 5 OR p_ttl_seconds > 600 THEN
    RAISE EXCEPTION 'ttl fuera de rango (5 a 600 segundos)';
  END IF;
  INSERT INTO worker_leases (name, holder, expires_at)
  VALUES (p_name, p_holder, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (name) DO UPDATE
    SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at, updated_at = now()
    WHERE worker_leases.holder = EXCLUDED.holder OR worker_leases.expires_at < now()
  RETURNING holder INTO got;
  RETURN coalesce(got = p_holder, false);
END;
$$;

-- Soltar el arrendamiento al apagarse: solo si todavía es tuyo. Otro proceso puede tomarlo de inmediato.
CREATE OR REPLACE FUNCTION worker_lease_release(p_name TEXT, p_holder TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE worker_leases SET expires_at = now() - interval '1 second', updated_at = now() WHERE name = p_name AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION worker_lease_acquire(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION worker_lease_release(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION worker_lease_acquire(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION worker_lease_release(TEXT, TEXT) TO service_role;
