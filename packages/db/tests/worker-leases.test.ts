import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { lintMigration } from '../src/migrate'

const FILE = '202611131400_worker_leases.sql'
const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', FILE), 'utf8')

describe('worker_leases migration', () => {
  let pg: PGlite
  const acquire = async (holder: string, ttl = 60) => (await pg.query<{ ok: boolean }>('SELECT worker_lease_acquire($1, $2, $3) AS ok', ['crons', holder, ttl])).rows[0].ok
  const expire = () => pg.exec(`UPDATE worker_leases SET expires_at = now() - interval '1 second' WHERE name = 'crons'`)

  beforeEach(async () => {
    pg = new PGlite()
    // PGlite no trae los roles de Supabase: se crean para que los GRANT/REVOKE del archivo corran como en la base real.
    await pg.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;')
    await pg.exec(sql)
  })

  it('passes the migration linter (the BEGIN of the plpgsql body is not a transaction)', () => {
    expect(lintMigration({ name: FILE, sql })).toEqual([])
  })

  it('the first one takes it and a second one is refused while it is valid', async () => {
    expect(await acquire('a')).toBe(true)
    expect(await acquire('b')).toBe(false)
  })

  it('the holder renews it; renewing does not let anybody else in', async () => {
    expect(await acquire('a')).toBe(true)
    expect(await acquire('a')).toBe(true)
    expect(await acquire('b')).toBe(false)
  })

  it('when it expires (the holder died) another process takes it, and the old one is refused', async () => {
    await acquire('a')
    await expire()
    expect(await acquire('b')).toBe(true)
    expect(await acquire('a')).toBe(false)
  })

  it('releasing lets the next one in at once, and a stranger cannot release it', async () => {
    await acquire('a')
    await pg.query('SELECT worker_lease_release($1, $2)', ['crons', 'intruso'])
    expect(await acquire('b')).toBe(false)
    await pg.query('SELECT worker_lease_release($1, $2)', ['crons', 'a'])
    expect(await acquire('b')).toBe(true)
  })

  it('refuses a ttl outside 5 to 600 seconds', async () => {
    await expect(acquire('a', 1)).rejects.toThrow(/ttl/)
    await expect(acquire('a', 100000)).rejects.toThrow(/ttl/)
  })

  it('different lease names are independent', async () => {
    await acquire('a')
    expect((await pg.query<{ ok: boolean }>('SELECT worker_lease_acquire($1, $2, 60) AS ok', ['otro', 'b'])).rows[0].ok).toBe(true)
  })

  it('is closed to anon and authenticated, open to service_role', async () => {
    const privilege = async (role: string) => (await pg.query<{ ok: boolean }>(`SELECT has_function_privilege($1, 'worker_lease_acquire(text,text,integer)', 'EXECUTE') AS ok`, [role])).rows[0].ok
    expect(await privilege('anon')).toBe(false)
    expect(await privilege('authenticated')).toBe(false)
    expect(await privilege('service_role')).toBe(true)
  })
})
