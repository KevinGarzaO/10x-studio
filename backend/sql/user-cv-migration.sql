-- ============================================
-- CV en línea - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Agrega a `users` lo necesario para que una persona arme su CV y lo muestre en
-- línea:
--
--   cv         el CV como un documento JSON (resumen, experiencia, educación,
--              idiomas, certificaciones, proyectos). Lo valida el esquema
--              compartido (@avocado/schemas, cv.ts) en el backend.
--   cv_public  si cualquiera con el enlace puede verlo. Por defecto NO: un CV
--              nuevo es privado hasta que su dueño lo publica.
--
-- El CV puede traer teléfono y correo de contacto, así que el backend NUNCA lo
-- incluye en el perfil público: se sirve aparte, en GET /api/community/users/:username/cv,
-- y solo si cv_public es verdadero o quien pregunta es el dueño.
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS cv JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cv_public BOOLEAN NOT NULL DEFAULT false;

-- El CV es siempre un objeto, y no puede crecer sin límite (el esquema ya acota
-- cada sección; esto es la red de seguridad si algo escribiera directo en SQL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_cv_is_object') THEN
    ALTER TABLE users ADD CONSTRAINT users_cv_is_object CHECK (jsonb_typeof(cv) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_cv_max_size') THEN
    ALTER TABLE users ADD CONSTRAINT users_cv_max_size CHECK (pg_column_size(cv) < 200000);
  END IF;
END $$;


-- ============================================
-- Verificación (correr después de aplicar)
-- ============================================
-- SELECT username, cv_public, jsonb_typeof(cv) FROM users WHERE username = 'kgarzaortiz';
--
-- Privacidad: las columnas nuevas no deben poder leerse con la llave pública
-- (anon). El backend las protege, pero conviene confirmar que la política de
-- lectura de `users` no deja a cualquiera leer filas completas:
-- SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'users';
