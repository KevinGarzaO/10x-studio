-- Anonimiza una copia de producción para usarla en PRE-PRODUCCIÓN (staging). Se corre UNA vez justo después de restaurar el respaldo y ANTES de
-- abrir ese entorno a nadie. NUNCA se corre en producción: borra sesiones y deja las cuentas sin contraseña.
--
-- Deja: la estructura, los conteos, las vacantes, las empresas, los puestos, habilidades, fechas y el uso (para que los paneles y las pruebas
-- se parezcan a producción). Quita: correos, nombres, fotos, bios, enlaces personales, CV, teléfonos, direcciones IP, dispositivos push,
-- sesiones y texto libre de feedback. Las cuentas quedan SIN contraseña: nadie entra con una cuenta real (se crea una de prueba nueva).
-- El texto público de publicaciones y comentarios no se toca (era público); si se quiere sacar, es otro paso.
--
-- Salvaguarda: aborta si la base parece producción (más de 5,000 cuentas o el parámetro app.allow_anonymize no está en 'yes').
BEGIN;
DO $$ BEGIN
  IF coalesce(current_setting('app.allow_anonymize', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Define primero: SET app.allow_anonymize = ''yes''; (solo en pre-producción).';
  END IF;
  IF (SELECT count(*) FROM auth.users) > 5000 THEN
    RAISE EXCEPTION 'Demasiadas cuentas para ser una copia de pre-produccion: no se anonimiza.';
  END IF;
END $$;

-- Las reglas de negocio de users (trigger de tipo de cuenta, etc.) no deben estorbar ni dispararse al anonimizar.
SET LOCAL session_replication_role = replica;

-- Autenticación
UPDATE auth.users SET
  email = 'persona-' || left(id::text, 8) || '@staging.invalid',
  raw_user_meta_data = jsonb_build_object('username', 'persona-' || left(id::text, 8)),
  phone = NULL,
  encrypted_password = '';
-- (identities.email es una columna generada desde identity_data)
UPDATE auth.identities SET
  identity_data = jsonb_build_object('sub', user_id::text, 'email', 'persona-' || left(user_id::text, 8) || '@staging.invalid');
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.audit_log_entries;
DELETE FROM auth.flow_state;
DELETE FROM auth.one_time_tokens;

-- Personas y empresas del producto
UPDATE public.users SET
  email = 'persona-' || left(id::text, 8) || '@staging.invalid',
  display_name = 'Persona ' || left(id::text, 4),
  name = NULL,
  handle = NULL,
  username = 'persona-' || left(id::text, 8),
  photo_url = NULL,
  bio = NULL,
  hero_text = NULL,
  website = NULL,
  github_url = NULL,
  social_links = NULL,
  portfolio_links = NULL,
  cv = DEFAULT,
  cv_public = false,
  signup_referrer = NULL
WHERE coalesce(is_scraper_profile, false) = false;
UPDATE public.users SET email = NULL WHERE is_scraper_profile = true;

UPDATE public.invitations SET email = 'invitado-' || left(md5(email), 10) || '@staging.invalid', first_name = NULL;
UPDATE public.subscribers SET email = 'suscriptor-' || left(md5(email), 10) || '@staging.invalid', name = NULL;
UPDATE public.feedback_entries SET text = 'texto anonimizado';
DELETE FROM public.push_subscriptions;
DELETE FROM public.company_claim_documents;

COMMIT;
