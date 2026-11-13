-- Roles que el backend y el SQL del repositorio ya esperan (los migraciones hacen GRANT ... TO service_role, anon, authenticated).
-- Se corre UNA vez en una base nueva (dev, qa o producción en Railway) ANTES de restaurar el respaldo. Es idempotente.
-- PostgREST entra como `authenticator` y cambia al rol que diga el JWT (anon, authenticated o service_role).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF;
END $$;
-- La contraseña de `authenticator` se pone aparte, con un valor propio de cada entorno (no se escribe aquí):
--   ALTER ROLE authenticator WITH PASSWORD '<valor del entorno>';
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
-- Las tablas nacen cerradas a anon/authenticated (RLS activo); el backend entra con service_role.
