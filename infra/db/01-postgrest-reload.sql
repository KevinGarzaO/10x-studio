-- PostgREST guarda en memoria el catálogo de tablas y funciones. Supabase le avisa solo cada vez que cambia el esquema; en una base Postgres propia
-- (Railway) hay que hacerlo. Este archivo instala el aviso AUTOMÁTICO: cualquier CREATE / ALTER / DROP (por el corredor de migraciones o pegado a mano)
-- dispara `NOTIFY pgrst, 'reload schema'` y PostgREST se actualiza solo. Se corre UNA vez por base nueva, con el usuario dueño (postgres). Idempotente.
--
-- Sin esto, una tabla o función nueva responde 404 (PGRST202/PGRST205) por la API hasta que se reinicie PostgREST.
CREATE OR REPLACE FUNCTION pgrst_ddl_watch() RETURNS event_trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;

CREATE OR REPLACE FUNCTION pgrst_drop_watch() RETURNS event_trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;

DROP EVENT TRIGGER IF EXISTS pgrst_ddl_watch;
CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE FUNCTION pgrst_ddl_watch();
DROP EVENT TRIGGER IF EXISTS pgrst_drop_watch;
CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop EXECUTE FUNCTION pgrst_drop_watch();
