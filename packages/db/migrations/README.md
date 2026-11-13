# Migraciones nuevas

Desde el 13 de noviembre de 2026 toda migración SQL **nueva** va aquí, con nombre `AAAAMMDDHHMM_nombre.sql` (fecha y hora de 12 dígitos, guion bajo, nombre en minúsculas):

```
202611140900_add_email_prefs_to_users.sql
```

Las migraciones viejas (`backend/sql/*.sql`, aplicadas a mano) ya no se tocan: forman la **línea base** (`../baseline.json`) y el corredor las da por aplicadas.

## Reglas

- **No lleves `BEGIN` ni `COMMIT`**: el corredor ya envuelve cada migración en una transacción (si algo falla, se deshace completa).
- **Nada que no corra dentro de una transacción** (`CREATE INDEX CONCURRENTLY`, `VACUUM`...). Si hace falta, se hace aparte y a mano, y se deja una nota aquí.
- **Una migración aplicada no se edita.** Si su contenido cambia, el corredor se detiene. Se corrige con una migración nueva.
- **Expandir primero, contraer después:** una migración que cambia algo debe poder convivir con el código viejo (columna nueva con valor por omisión, tabla nueva). Lo que se quita se quita en una migración posterior, cuando ya nadie lo usa.
- **Tablas nuevas:** `ENABLE ROW LEVEL SECURITY` y `REVOKE ALL ... FROM anon, authenticated` (como el resto).
- Que sea **idempotente** (`IF NOT EXISTS`) cuando se pueda: facilita repetirla en otro entorno.

## Comandos (desde `packages/db`, con `DATABASE_URL` en tu terminal)

```
npm run migrate -- status              # qué falta (no toca nada)
npm run migrate -- up                  # ensayo
npm run migrate -- up --apply          # aplica lo pendiente
npm run migrate -- baseline --apply    # una sola vez por base: anota las viejas como aplicadas
```

En producción se pide además `--confirm-production`. Cada entorno (local, desarrollo, staging, producción) lleva su propio registro en la tabla `app_migrations`.
