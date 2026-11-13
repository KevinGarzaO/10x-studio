/**
 * Respaldo de SOLO LECTURA de Supabase por su API (sin pg_dump): todas las tablas y vistas que expone la API en archivos NDJSON, el esquema que la API
 * publica (OpenAPI) y todos los archivos de Storage. Es la red de seguridad del primer día de la migración a Railway + Azure; el respaldo completo y
 * exacto (esquema, funciones, disparadores, permisos) se hace después con pg_dump (ver docs/infra/).
 *
 *   npx tsx scripts/backup-supabase-rest.ts --out "C:\Users\kevin\AvoTalent-Backups"
 *
 * Reglas:
 *  - Nunca escribe en Supabase. Solo GET.
 *  - La carpeta de destino debe quedar FUERA del repositorio: lleva datos personales (correos, nombres). Si está dentro de un repo git, el script se niega.
 *  - Verifica cada tabla: el número de filas exportadas debe igualar el conteo que dice la base; si no coincide lo escribe en el manifiesto y termina con error.
 *  - Guarda un manifiesto con conteos y huella SHA-256 de cada archivo, para comprobar después que nada se corrompió o se perdió.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { supabase } from '@avotalent/core/services/supabase.service'

const PAGE = 1000
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined }

function insideGitRepo(dir: string): boolean {
  let current = path.resolve(dir)
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return true
    const parent = path.dirname(current)
    if (parent === current) return false
    current = parent
  }
}

const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function listTables(): Promise<string[]> {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY || ''
  const res = await fetch(`${base}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`No se pudo leer el esquema de la API (${res.status})`)
  const spec: any = await res.json()
  fs.writeFileSync(path.join(outDir, 'openapi-schema.json'), JSON.stringify(spec, null, 2))
  // Las definiciones son las tablas y vistas que la API publica.
  return Object.keys(spec.definitions ?? {}).sort()
}

let outDir = ''

async function exportTable(table: string, dataDir: string): Promise<{ table: string; rows: number; expected: number | null; ok: boolean; sha256: string; error?: string }> {
  const file = path.join(dataDir, `${table}.ndjson`)
  const stream = fs.createWriteStream(file)
  let rows = 0
  let error: string | undefined
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error: readError } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
      if (readError) { error = readError.message; break }
      for (const row of data ?? []) { stream.write(JSON.stringify(row) + '\n'); rows++ }
      if (!data || data.length < PAGE) break
    }
  } catch (e) {
    error = (e as Error).message
  }
  await new Promise<void>((resolve) => stream.end(resolve))

  const { count, error: countError } = await supabase.from(table).select('*', { count: 'exact', head: true })
  const expected = countError ? null : count ?? 0
  return { table, rows, expected, ok: !error && expected !== null && rows === expected, sha256: sha256(file), ...(error ? { error } : {}) }
}

async function listObjects(bucket: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const item of data ?? []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name
      // Una carpeta no trae id; un archivo sí.
      if (item.id === null || item.id === undefined) found.push(...(await listObjects(bucket, full)))
      else found.push(full)
    }
    if (!data || data.length < PAGE) break
  }
  return found
}

async function exportStorage(storageDir: string) {
  const summary: { bucket: string; public: boolean | null; files: number; bytes: number; failed: string[] }[] = []
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`No se pudieron listar los buckets: ${error.message}`)
  for (const bucket of buckets ?? []) {
    const objects = await listObjects(bucket.name)
    let bytes = 0
    const failed: string[] = []
    for (const object of objects) {
      const target = path.join(storageDir, bucket.name, ...object.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const { data, error: downloadError } = await supabase.storage.from(bucket.name).download(object)
      if (downloadError || !data) { failed.push(object); continue }
      const buffer = Buffer.from(await data.arrayBuffer())
      fs.writeFileSync(target, buffer)
      bytes += buffer.length
    }
    summary.push({ bucket: bucket.name, public: bucket.public ?? null, files: objects.length - failed.length, bytes, failed })
  }
  return summary
}

async function main() {
  const base = arg('out')
  if (!base) throw new Error('Falta --out <carpeta fuera del repositorio>')
  if (insideGitRepo(base)) throw new Error(`La carpeta ${base} está dentro de un repositorio git. El respaldo lleva datos personales: usa una carpeta fuera del repo.`)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY en backend/.env')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  outDir = path.join(base, stamp)
  const dataDir = path.join(outDir, 'tablas')
  const storageDir = path.join(outDir, 'storage')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(storageDir, { recursive: true })

  console.log(`Respaldo en ${outDir}`)
  const tables = await listTables()
  console.log(`${tables.length} tablas/vistas publicadas por la API`)

  const results = []
  for (const table of tables) {
    const result = await exportTable(table, dataDir)
    results.push(result)
    console.log(`${result.ok ? 'OK ' : 'FALLA'} ${table.padEnd(34)} ${result.rows} / ${result.expected ?? '?'}${result.error ? ` — ${result.error}` : ''}`)
  }

  console.log('Archivos de Storage…')
  const storage = await exportStorage(storageDir)
  for (const bucket of storage) console.log(`  ${bucket.bucket}: ${bucket.files} archivos, ${(bucket.bytes / 1048576).toFixed(1)} MB${bucket.failed.length ? `, ${bucket.failed.length} fallaron` : ''}`)

  const failedTables = results.filter((result) => !result.ok)
  const manifest = {
    createdAt: new Date().toISOString(),
    source: process.env.SUPABASE_URL,
    note: 'Respaldo por la API REST (solo datos y archivos). Faltan esquema exacto, funciones, disparadores y permisos: eso lo da pg_dump.',
    tables: results,
    storage,
    ok: failedTables.length === 0 && storage.every((bucket) => bucket.failed.length === 0),
  }
  fs.writeFileSync(path.join(outDir, 'MANIFIESTO.json'), JSON.stringify(manifest, null, 2))
  console.log(manifest.ok ? '\nRESPALDO COMPLETO Y VERIFICADO.' : `\nRESPALDO CON PROBLEMAS: ${failedTables.length} tabla(s) no coinciden o fallaron. Mira MANIFIESTO.json.`)
  if (!manifest.ok) process.exit(2)
}

main().then(() => process.exit(0)).catch((error) => { console.error('ERROR:', error instanceof Error ? error.message : error); process.exit(1) })
