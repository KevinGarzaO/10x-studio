-- Reescribe las direcciones de archivos guardadas en la base: de Supabase Storage a nuestro proxy (/api/files/<contenedor>/<ruta>) que sirve Azure.
-- Se corre DESPUÉS de copiar los archivos a Azure (backend/scripts/migrate-storage-to-azure.ts) y antes de encender STORAGE_DRIVER=azure.
-- Las dos direcciones llegan por variables de psql, nunca escritas aquí:
--
--   psql "$DATABASE_URL" -v old="https://<proyecto>.supabase.co/storage/v1/object/public/" -v new="https://<backend publico>/api/files/" -f infra/db/rewrite-file-urls.sql
--
-- Es un reemplazo de texto del prefijo: lo que sigue (<contenedor>/<ruta>) es igual en los dos lados. Idempotente (la segunda vez no encuentra nada).
-- Va en una transacción; imprime cuántas filas cambió cada columna para compararlas con las de `scripts/migrate-storage-to-azure.ts --report`.
BEGIN;
SET LOCAL session_replication_role = replica; -- que los disparadores de negocio no se enteren de un cambio de texto

\echo users.photo_url
UPDATE public.users SET photo_url = replace(photo_url, :'old', :'new') WHERE photo_url LIKE :'old' || '%';
\echo community_posts.company_logo
UPDATE public.community_posts SET company_logo = replace(company_logo, :'old', :'new') WHERE company_logo LIKE :'old' || '%';
\echo community_posts.image_url
UPDATE public.community_posts SET image_url = replace(image_url, :'old', :'new') WHERE image_url LIKE :'old' || '%';
\echo content.image_url
UPDATE public.content SET image_url = replace(image_url, :'old', :'new') WHERE image_url LIKE :'old' || '%';
\echo content.html_content
UPDATE public.content SET html_content = replace(html_content, :'old', :'new') WHERE html_content LIKE '%' || :'old' || '%';
\echo posts.cover_image_url
UPDATE public.posts SET cover_image_url = replace(cover_image_url, :'old', :'new') WHERE cover_image_url LIKE :'old' || '%';
\echo user_vacancy_history.company_logo
UPDATE public.user_vacancy_history SET company_logo = replace(company_logo, :'old', :'new') WHERE company_logo LIKE :'old' || '%';
\echo scraper_sources.metadata
UPDATE public.scraper_sources SET metadata = replace(metadata::text, :'old', :'new')::jsonb WHERE metadata::text LIKE '%' || :'old' || '%';
\echo vacancy_matches.item
UPDATE public.vacancy_matches SET item = replace(item::text, :'old', :'new')::jsonb WHERE item::text LIKE '%' || :'old' || '%';

-- Lo que quede apuntando a Supabase Storage (debe ser 0 en cada columna):
\echo pendientes
SELECT 'users.photo_url' AS columna, count(*) FROM public.users WHERE photo_url LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'community_posts.company_logo', count(*) FROM public.community_posts WHERE company_logo LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'community_posts.image_url', count(*) FROM public.community_posts WHERE image_url LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'content.image_url', count(*) FROM public.content WHERE image_url LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'content.html_content', count(*) FROM public.content WHERE html_content LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'posts.cover_image_url', count(*) FROM public.posts WHERE cover_image_url LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'user_vacancy_history.company_logo', count(*) FROM public.user_vacancy_history WHERE company_logo LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'scraper_sources.metadata', count(*) FROM public.scraper_sources WHERE metadata::text LIKE '%/storage/v1/object/%'
UNION ALL SELECT 'vacancy_matches.item', count(*) FROM public.vacancy_matches WHERE item::text LIKE '%/storage/v1/object/%';
COMMIT;
