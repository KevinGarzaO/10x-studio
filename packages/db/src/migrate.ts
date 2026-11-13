import { createHash } from 'crypto'

/**
 * Corredor de migraciones SQL. Hasta hoy cada SQL se pegaba a mano en el editor de Supabase y nadie sabía qué base tenía cuáles. Aquí:
 *
 *  - Las migraciones NUEVAS viven en `migrations/` con nombre `AAAAMMDDHHMM_nombre.sql` (12 dígitos de fecha y hora, guion bajo, nombre en
 *    minúsculas). Se aplican en orden de nombre, cada una en UNA transacción, y quedan anotadas en la tabla `app_migrations` con su huella.
 *  - Las migraciones VIEJAS (`backend/sql/*.sql`, ya aplicadas a mano en producción) forman la LÍNEA BASE (`baseline.json`): se dan por
 *    aplicadas y NUNCA se vuelven a correr.
 *  - Una migración ya aplicada no puede editarse: si su huella cambia, el corredor se detiene (se corrige con una migración nueva).
 *  - Una migración nueva no puede llevar BEGIN/COMMIT (el corredor ya la envuelve) ni comandos que no corren dentro de una transacción.
 *  - Dos corredores al mismo tiempo no se pisan: un candado de la base lo impide.
 */
export interface Db {
  /** Una consulta suelta (fuera de transacción). */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
  /** Corre `fn` en una transacción: si lanza, todo se deshace. */
  tx<T>(fn: (q: Db['query']) => Promise<T>): Promise<T>
}

export interface MigrationFile { name: string; sql: string }
export interface Applied { name: string; checksum: string | null; baseline: boolean }

const NAME = /^(\d{12})_[a-z0-9][a-z0-9_-]*\.sql$/
export const isMigrationName = (name: string): boolean => NAME.test(name)
export const checksum = (sql: string): string => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')

/** Problemas que hacen una migración nueva inaceptable (se revisan antes de tocar la base). */
export function lintMigration(file: MigrationFile): string[] {
  const problems: string[] = []
  if (!isMigrationName(file.name)) problems.push('el nombre debe ser AAAAMMDDHHMM_nombre.sql (minúsculas)')
  // Se quitan comentarios y cuerpos entre signos de dólar ($$ ... $$): el BEGIN de una función plpgsql no es una transacción.
  const code = file.sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '')
  if (/^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\b/im.test(code)) problems.push('no lleva BEGIN/COMMIT: el corredor ya la envuelve en una transacción')
  if (/\bCREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\b|\bVACUUM\b|\bALTER\s+SYSTEM\b|\bCREATE\s+DATABASE\b/i.test(code)) problems.push('contiene un comando que no puede correr dentro de una transacción')
  if (file.sql.trim().length === 0) problems.push('está vacía')
  return problems
}

export interface Plan {
  pending: MigrationFile[]
  /** Aplicadas cuyo contenido cambió después: hay que parar. */
  drifted: string[]
  /** Anotadas como aplicadas pero que ya no existen en `migrations/` (alguien las borró). */
  missing: string[]
  /** Archivos con nombre inválido o con problemas. */
  invalid: { name: string; problems: string[] }[]
}

export function plan(files: MigrationFile[], applied: Applied[], baseline: string[]): Plan {
  const byName = new Map(applied.map((row) => [row.name, row]))
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
  const invalid = sorted.map((file) => ({ name: file.name, problems: lintMigration(file) })).filter((entry) => entry.problems.length > 0)
  const invalidNames = new Set(invalid.map((entry) => entry.name))
  const pending: MigrationFile[] = []
  const drifted: string[] = []
  for (const file of sorted) {
    if (invalidNames.has(file.name)) continue
    const row = byName.get(file.name)
    if (!row) pending.push(file)
    else if (row.checksum && row.checksum !== checksum(file.sql)) drifted.push(file.name)
  }
  const present = new Set(files.map((file) => file.name))
  const baselineSet = new Set(baseline)
  const missing = applied.filter((row) => !row.baseline && !baselineSet.has(row.name) && !present.has(row.name)).map((row) => row.name)
  return { pending, drifted, missing, invalid }
}

export const TABLE_SQL = `CREATE TABLE IF NOT EXISTS app_migrations (
  name        TEXT PRIMARY KEY,
  checksum    TEXT,
  baseline    BOOLEAN NOT NULL DEFAULT false,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER
);
ALTER TABLE app_migrations ENABLE ROW LEVEL SECURITY;`
const LOCK_KEY = 872_004_113

export async function loadApplied(db: Db): Promise<Applied[]> {
  await db.query(TABLE_SQL)
  const { rows } = await db.query<{ name: string; checksum: string | null; baseline: boolean }>('SELECT name, checksum, baseline FROM app_migrations ORDER BY name')
  return rows
}

/** Anota la línea base: las migraciones viejas se dan por aplicadas. Idempotente. Devuelve cuántas anotó. */
export async function markBaseline(db: Db, names: string[]): Promise<number> {
  await db.query(TABLE_SQL)
  let added = 0
  await db.tx(async (q) => {
    for (const name of names) {
      const result = await q<{ name: string }>('INSERT INTO app_migrations (name, checksum, baseline) VALUES ($1, NULL, true) ON CONFLICT (name) DO NOTHING RETURNING name', [name])
      added += result.rows.length
    }
  })
  return added
}

export interface RunResult { applied: string[]; dryRun: boolean }

export async function runMigrations(db: Db, files: MigrationFile[], baseline: string[], options: { dryRun?: boolean } = {}): Promise<RunResult> {
  const applied = await loadApplied(db)
  const result = plan(files, applied, baseline)
  if (result.invalid.length) throw new Error(`Migraciones inválidas:\n${result.invalid.map((entry) => `  ${entry.name}: ${entry.problems.join('; ')}`).join('\n')}`)
  if (result.drifted.length) throw new Error(`Estas migraciones ya se aplicaron y su contenido cambió (no se editan; crea una nueva): ${result.drifted.join(', ')}`)
  if (result.missing.length) throw new Error(`Hay migraciones aplicadas que ya no están en el repositorio: ${result.missing.join(', ')}`)
  if (options.dryRun) return { applied: result.pending.map((file) => file.name), dryRun: true }

  const done: string[] = []
  for (const file of result.pending) {
    const started = Date.now()
    await db.tx(async (q) => {
      await q('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY])
      // Otro corredor pudo aplicarla mientras esperábamos el candado.
      const again = await q<{ name: string }>('SELECT name FROM app_migrations WHERE name = $1', [file.name])
      if (again.rows.length) return
      await q(file.sql)
      await q('INSERT INTO app_migrations (name, checksum, duration_ms) VALUES ($1, $2, $3)', [file.name, checksum(file.sql), Date.now() - started])
      done.push(file.name)
    })
  }
  return { applied: done, dryRun: false }
}
