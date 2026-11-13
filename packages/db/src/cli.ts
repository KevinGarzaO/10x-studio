#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'
import { Db, MigrationFile, loadApplied, markBaseline, plan, runMigrations } from './migrate'

/**
 * Corredor de migraciones por línea de comandos. Habla con Postgres DIRECTO (DATABASE_URL), no por la API.
 *
 *   npm run migrate -- status             # qué falta y qué cambió (no toca nada)
 *   npm run migrate -- up                 # ensayo: lista lo que se aplicaría
 *   npm run migrate -- up --apply         # aplica lo pendiente, una por una, cada una en su transacción
 *   npm run migrate -- baseline --apply   # anota las migraciones viejas (backend/sql) como ya aplicadas (una vez por base)
 *
 * Producción exige además --confirm-production. La cadena de conexión va en DATABASE_URL, solo en tu terminal o en las variables de Railway.
 */
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const command = args[0]
const flag = (name: string) => args.includes(`--${name}`)

function readMigrations(): MigrationFile[] {
  const dir = path.join(root, 'migrations')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort().map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }))
}
const readBaseline = (): string[] => JSON.parse(fs.readFileSync(path.join(root, 'baseline.json'), 'utf8'))

function connect(): { db: Db; end: () => Promise<void> } {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL (la cadena de conexión directa a Postgres).')
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
  const pool = new Pool({ connectionString: url, max: 2, ssl: local || process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } })
  const db: Db = {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn((text, params) => client.query(text, params as unknown[]) as never)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
  }
  return { db, end: () => pool.end() }
}

const isProduction = () => [process.env.APP_ENV, process.env.RAILWAY_ENVIRONMENT_NAME].some((value) => (value ?? '').trim().toLowerCase() === 'production')

async function main() {
  if (!['status', 'up', 'baseline'].includes(command ?? '')) {
    console.log('Uso: migrate status | up [--apply] | baseline [--apply]   (producción pide además --confirm-production)')
    process.exit(command ? 1 : 0)
  }
  const apply = flag('apply')
  if (apply && isProduction() && !flag('confirm-production')) throw new Error('Esto es PRODUCCIÓN: agrega --confirm-production si de verdad quieres aplicar.')

  const { db, end } = connect()
  try {
    const baseline = readBaseline()
    if (command === 'baseline') {
      const known = (await loadApplied(db)).filter((row) => row.baseline).length
      console.log(`Línea base: ${baseline.length} migraciones viejas; ya anotadas ${known}.`)
      if (!apply) return console.log('Ensayo: no se anotó nada (usa --apply).')
      console.log(`Anotadas ${await markBaseline(db, baseline)} nuevas.`)
      return
    }
    const files = readMigrations()
    if (command === 'status') {
      const applied = await loadApplied(db)
      const result = plan(files, applied, baseline)
      const baselineRows = applied.filter((row) => row.baseline).length
      console.log(`Línea base anotada: ${baselineRows} de ${baseline.length}${baselineRows < baseline.length ? '  <- corre: baseline --apply' : ''}`)
      console.log(`Aplicadas (nuevas): ${applied.filter((row) => !row.baseline).length}`)
      console.log(`Pendientes: ${result.pending.length}${result.pending.length ? ` -> ${result.pending.map((file) => file.name).join(', ')}` : ''}`)
      if (result.drifted.length) console.log(`CAMBIADAS después de aplicarse: ${result.drifted.join(', ')}`)
      if (result.missing.length) console.log(`FALTAN en el repositorio: ${result.missing.join(', ')}`)
      for (const entry of result.invalid) console.log(`INVÁLIDA ${entry.name}: ${entry.problems.join('; ')}`)
      if (result.drifted.length || result.missing.length || result.invalid.length) process.exitCode = 1
      return
    }
    const result = await runMigrations(db, files, baseline, { dryRun: !apply })
    if (result.dryRun) console.log(result.applied.length ? `Se aplicarían ${result.applied.length}: ${result.applied.join(', ')} (usa --apply)` : 'No hay migraciones pendientes.')
    else console.log(result.applied.length ? `Aplicadas ${result.applied.length}: ${result.applied.join(', ')}` : 'No había migraciones pendientes.')
  } finally {
    await end()
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
