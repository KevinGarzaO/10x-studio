-- ============================================
-- Provider de la cuenta en users - Migration
-- Run this in Supabase SQL Editor
--
-- Idempotente: se puede volver a correr completa.
--
-- Qué hace:
--   1. users.provider: de dónde vino la cuenta — 'email', 'github' o
--      'linkedin'. Se llena solo al crearse; el backfill corrige las cuentas
--      existentes tomando el proveedor real de auth.
--   2. El correo deja de ser único en la tabla: pasa a ser único POR
--      PROVEEDOR, porque entre email, GitHub y LinkedIn el mismo correo puede
--      existir sin que sean la misma cuenta (antes eso rompía el registro con
--      users_email_unique).
--
-- Ejecutar ANTES de reiniciar el backend con el cambio de código que llena
-- provider (el código también degrada con avisos si la migración falta, pero
-- lo ideal es aplicarla primero).
-- ============================================

-- ============================================
-- BLOQUE 1 — columna provider
-- ============================================

-- Default 'email': todo lo que ya existe y cualquier cuenta creada por script
-- sin proveedor explícito queda como cuenta de correo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'email';

-- Backfill desde auth: el proveedor real de cada cuenta. auth.users guarda en
-- raw_app_meta_data el proveedor por el que se autentica ('github',
-- 'linkedin_oidc', 'email') — el API de Auth lo llama app_metadata, pero en
-- SQL la columna es raw_app_meta_data. Las filas sin cuenta de auth (huérfanas)
-- no se tocan y quedan en 'email', lo que deja convivir a la cuenta real del
-- proveedor con ellas.
UPDATE users u
SET provider = CASE
  WHEN a.raw_app_meta_data ->> 'provider' = 'github' THEN 'github'
  WHEN a.raw_app_meta_data ->> 'provider' LIKE 'linkedin%' THEN 'linkedin'
  ELSE 'email'
END
FROM auth.users a
WHERE a.id = u.id
  AND u.provider = 'email'
  AND a.raw_app_meta_data ->> 'provider' IS NOT NULL
  AND a.raw_app_meta_data ->> 'provider' <> 'email';

-- ============================================
-- BLOQUE 2 — correo único por proveedor
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_provider_unique'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
    ALTER TABLE users ADD CONSTRAINT users_email_provider_unique UNIQUE (email, provider);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Nota: el registro por correo y el sync de OAuth ya no consultan la restricción
-- por correo solo; esta migración es la que habilita que los 3 proveedores
-- compartan correo sin chocar.
