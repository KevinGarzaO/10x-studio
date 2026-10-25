-- ============================================
-- Imagen de portada de las publicaciones - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr.
--
-- Por qué: ahora los miembros pueden publicar una discusión con imagen de portada. La imagen se sube al
-- almacenamiento propio (bucket "images", carpeta "community/") y aquí se guarda su dirección.
-- Sin esta columna las publicaciones siguen funcionando, pero se guardan sin portada.
-- ============================================

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Verificación:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'image_url';
