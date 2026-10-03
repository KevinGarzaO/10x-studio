-- ============================================
-- Clasificación de usuarios - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr completa.
--
-- Agrega dos campos a `users` para poder contar y separar a la gente sin
-- adivinar a partir de otras columnas:
--
--   user_kind        'user' | 'company' | 'superadmin'
--                    Es una columna GENERADA: la base la calcula sola desde
--                    is_superadmin y account_type, así que no se puede
--                    desincronizar ni editar a mano. Como esas dos columnas ya
--                    solo cambian con change_account_type() / set_superadmin(),
--                    esta también queda protegida sin trabajo extra.
--
--   is_test_account  true si es una cuenta de prueba nuestra (tests, QA, cuentas
--                    del equipo); false si es una persona o empresa real.
--                    Es un dato que se marca a mano: la base no puede saber
--                    quién es "de prueba".
--
-- Las cuentas de empresa que crea el scraper NO son de prueba: son empresas
-- reales que aún nadie reclama, así que quedan en false.
-- ============================================


-- ============================================
-- BLOQUE 1 — Columnas
-- ============================================

-- Superadmin gana sobre empresa (la base ya impide que un superadmin sea empresa).
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_kind TEXT GENERATED ALWAYS AS (
  CASE
    WHEN is_superadmin THEN 'superadmin'
    WHEN account_type = 'company' THEN 'company'
    ELSE 'user'
  END
) STORED;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_kind_test ON users (user_kind, is_test_account);


-- ============================================
-- BLOQUE 2 — Marcar las cuentas de prueba que ya conocemos
-- ============================================

-- La cuenta que usan los tests de exámenes (exam-questions-e2e-admin).
UPDATE users
   SET is_test_account = true
 WHERE username LIKE 'exam-questions-e2e%'
   AND is_test_account = false;

-- Otras cuentas del equipo o de pruebas se marcan a mano, por ejemplo:
--
--   UPDATE users SET is_test_account = true WHERE username IN ('tranaformateck', 'Panshibe');
--
-- y se desmarcan igual con is_test_account = false.


-- ============================================
-- BLOQUE 3 — Conteo listo para consultar
-- ============================================

-- SELECT * FROM user_counts;
-- Una fila por tipo y por real/prueba, con su total.
CREATE OR REPLACE VIEW user_counts AS
  SELECT user_kind,
         is_test_account,
         count(*) AS total
    FROM users
   GROUP BY user_kind, is_test_account
   ORDER BY user_kind, is_test_account;

-- Las vistas de Supabase corren con permisos de su dueño y se saltan RLS. En el
-- esquema `public` quedan expuestas a las llaves `anon` y `authenticated` si no
-- se cierran, así que se restringen a la llave de servicio del backend.
-- También cubre pending_company_claims, que incluye correos de quien reclama.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON user_counts FROM anon;
    IF to_regclass('public.pending_company_claims') IS NOT NULL THEN
      REVOKE ALL ON pending_company_claims FROM anon;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON user_counts FROM authenticated;
    IF to_regclass('public.pending_company_claims') IS NOT NULL THEN
      REVOKE ALL ON pending_company_claims FROM authenticated;
    END IF;
  END IF;
END $$;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT * FROM user_counts;
-- SELECT username, user_kind, is_test_account FROM users
--  WHERE account_type = 'candidate' AND NOT coalesce(is_scraper_profile, false)
--  ORDER BY created_at;
-- -- user_kind de tu cuenta (kgarzaortiz) debe ser 'superadmin'.
