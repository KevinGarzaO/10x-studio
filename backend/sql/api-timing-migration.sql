-- Velocidad del servidor: cuánto tarda cada ruta de la API, resumido por hora (BACKLOG D).
--
-- Corre MANUAL en el editor SQL de Supabase. No depende de otras migraciones. Es idempotente.
--
-- Para acelerar algo primero hay que saber QUÉ es lo lento. El backend mide cada petición a /api (ruta normalizada, método,
-- duración, si falló), la va sumando en memoria y cada minuto manda el resumen a esta tabla. No se guarda ninguna petición suelta
-- ni datos de personas: solo, por hora y ruta, cuántas fueron, cuántas fallaron, cuánto tardaron en total, la más lenta y cuántas
-- cayeron en cada rango de tiempo (de ahí se estiman la mediana y el p95). Se conservan 30 días.

CREATE TABLE IF NOT EXISTS api_timing_hourly (
  hour      timestamptz NOT NULL,
  method    text        NOT NULL,
  route     text        NOT NULL,
  requests  int         NOT NULL DEFAULT 0,
  errors    int         NOT NULL DEFAULT 0,
  sum_ms    bigint      NOT NULL DEFAULT 0,
  max_ms    int         NOT NULL DEFAULT 0,
  -- cuántas peticiones tardaron: <=50, <=100, <=250, <=500, <=1000, <=2500, <=5000 y más de 5000 ms
  b0 int NOT NULL DEFAULT 0, b1 int NOT NULL DEFAULT 0, b2 int NOT NULL DEFAULT 0, b3 int NOT NULL DEFAULT 0,
  b4 int NOT NULL DEFAULT 0, b5 int NOT NULL DEFAULT 0, b6 int NOT NULL DEFAULT 0, b7 int NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, method, route)
);

ALTER TABLE api_timing_hourly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_timing_hourly FROM PUBLIC, anon, authenticated;

-- Suma un lote de resúmenes. `p` es una lista: [{ "hour": "2026-11-01T15:00:00Z", "method": "GET", "route": "/api/community/posts",
--   "requests": 12, "errors": 0, "sum_ms": 3400, "max_ms": 900, "buckets": [3,4,2,2,1,0,0,0] }, ...]
-- Lo que no tenga forma de resumen se ignora (esto nunca debe romper al servidor).
CREATE OR REPLACE FUNCTION api_timing_record(p jsonb) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  item jsonb;
  saved int := 0;
  buckets int[];
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RETURN 0; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p) LOOP
    CONTINUE WHEN jsonb_typeof(item->'buckets') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'buckets') <> 8;
    CONTINUE WHEN COALESCE(item->>'route', '') = '' OR char_length(item->>'route') > 200 OR COALESCE(item->>'method', '') !~ '^[A-Z]{3,7}$';
    CONTINUE WHEN (item->>'hour') IS NULL;
    BEGIN
      SELECT array_agg(GREATEST(0, LEAST(x::int, 1000000))) INTO buckets FROM jsonb_array_elements_text(item->'buckets') x;
      INSERT INTO api_timing_hourly AS t (hour, method, route, requests, errors, sum_ms, max_ms, b0, b1, b2, b3, b4, b5, b6, b7)
      VALUES (
        date_trunc('hour', (item->>'hour')::timestamptz), item->>'method', item->>'route',
        GREATEST(0, LEAST((item->>'requests')::int, 1000000)), GREATEST(0, LEAST((item->>'errors')::int, 1000000)),
        GREATEST(0, LEAST((item->>'sum_ms')::bigint, 100000000000)), GREATEST(0, LEAST((item->>'max_ms')::int, 600000)),
        buckets[1], buckets[2], buckets[3], buckets[4], buckets[5], buckets[6], buckets[7], buckets[8]
      )
      ON CONFLICT (hour, method, route) DO UPDATE SET
        requests = t.requests + EXCLUDED.requests, errors = t.errors + EXCLUDED.errors, sum_ms = t.sum_ms + EXCLUDED.sum_ms,
        max_ms = GREATEST(t.max_ms, EXCLUDED.max_ms),
        b0 = t.b0 + EXCLUDED.b0, b1 = t.b1 + EXCLUDED.b1, b2 = t.b2 + EXCLUDED.b2, b3 = t.b3 + EXCLUDED.b3,
        b4 = t.b4 + EXCLUDED.b4, b5 = t.b5 + EXCLUDED.b5, b6 = t.b6 + EXCLUDED.b6, b7 = t.b7 + EXCLUDED.b7;
      saved := saved + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- una fila mal formada no tumba las demás
    END;
  END LOOP;
  -- De vez en cuando se borra lo de más de 30 días (una de cada 50 llamadas, no en cada una).
  IF random() < 0.02 THEN DELETE FROM api_timing_hourly WHERE hour < now() - interval '30 days'; END IF;
  RETURN saved;
END;
$$;

-- El resumen de las últimas `p_hours` horas: una fila por método y ruta. Los rangos se devuelven sumados; la mediana y el p95 se
-- estiman en el backend (services/performance/api-timing.ts) con ellos.
CREATE OR REPLACE FUNCTION api_timing_summary(p_hours int DEFAULT 24)
RETURNS TABLE (method text, route text, requests bigint, errors bigint, sum_ms bigint, max_ms int,
               b0 bigint, b1 bigint, b2 bigint, b3 bigint, b4 bigint, b5 bigint, b6 bigint, b7 bigint)
LANGUAGE sql STABLE AS $$
  SELECT t.method, t.route, SUM(t.requests)::bigint, SUM(t.errors)::bigint, SUM(t.sum_ms)::bigint, MAX(t.max_ms)::int,
         SUM(t.b0)::bigint, SUM(t.b1)::bigint, SUM(t.b2)::bigint, SUM(t.b3)::bigint, SUM(t.b4)::bigint, SUM(t.b5)::bigint, SUM(t.b6)::bigint, SUM(t.b7)::bigint
  FROM api_timing_hourly t
  WHERE t.hour >= date_trunc('hour', now()) - make_interval(hours => GREATEST(LEAST(p_hours, 720), 1) - 1)
  GROUP BY t.method, t.route
  ORDER BY SUM(t.sum_ms) DESC;
$$;

REVOKE ALL ON FUNCTION api_timing_record(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api_timing_summary(int)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api_timing_record(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION api_timing_summary(int)  TO service_role;
