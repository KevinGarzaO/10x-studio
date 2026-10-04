-- ============================================
-- Cerrar el acceso público a la base (RLS) - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Problema: `users` (y otras tablas de `public`) NO tenían RLS, y los roles `anon` y
-- `authenticated` tenían permiso de lectura. La llave pública (anon) viaja en el
-- navegador, así que cualquiera con ella podía leer todos los usuarios: correos,
-- teléfonos, CV, etc.
--
-- Por qué es seguro cerrarlo: ningún frontend (apps/avocado, apps/community, extension)
-- usa Supabase directamente; todo pasa por el backend, que usa la llave de servicio
-- (service_role) y esa se salta RLS. Las políticas que ya existan (por ejemplo en las
-- tablas de la comunidad) no se tocan.
--
-- Qué hace:
--   1. Activa RLS en TODAS las tablas de `public`. Sin política que lo permita, anon y
--      authenticated no ven ninguna fila.
--   2. Les quita el permiso directo a anon y authenticated, en tablas, vistas y
--      secuencias (las vistas se ejecutan con los permisos de su dueño: sin esto,
--      una vista seguiría mostrando datos aunque la tabla esté cerrada).
--   3. Hace que las tablas y vistas FUTURAS nazcan cerradas.
--
-- Si algo dejara de funcionar (no debería): lo único que usa anon/authenticated es
-- el Storage de Supabase (fotos), que vive en otro esquema y no se toca aquí.
-- ============================================

-- 1. RLS en todas las tablas de public
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2. Sin permiso directo para los roles públicos
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3. Lo que se cree después también nace cerrado
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- Tablas de public SIN RLS (debe salir vacío):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
--
-- Lo que puede leer la llave pública (todo debe salir false):
-- SELECT has_table_privilege('anon', 'public.users', 'SELECT')              AS users,
--        has_table_privilege('anon', 'public.community_posts', 'SELECT')    AS posts,
--        has_table_privilege('anon', 'public.role_supply_demand', 'SELECT') AS vista;
--
-- Y de lo que ve el backend no cambia nada: abre la app y confirma que el feed, el
-- login y los perfiles cargan igual.
