import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { Db, checksum, isMigrationName, lintMigration, loadApplied, markBaseline, plan, runMigrations } from '../src/migrate'

function dbOf(pg: PGlite): Db {
  const run = async (text: string, params?: unknown[]) => {
    if (params && params.length) return { rows: (await pg.query(text, params)).rows as never[] }
    const results = await pg.exec(text)
    return { rows: (results[results.length - 1]?.rows ?? []) as never[] }
  }
  return {
    query: run as Db['query'],
    async tx(fn) {
      await pg.exec('BEGIN')
      try {
        const out = await fn(run as Db['query'])
        await pg.exec('COMMIT')
        return out
      } catch (error) {
        await pg.exec('ROLLBACK')
        throw error
      }
    },
  }
}

const file = (name: string, sql: string) => ({ name, sql })
const A = file('202611130900_create_a.sql', 'CREATE TABLE a (id int);')
const B = file('202611131000_create_b.sql', 'CREATE TABLE b (id int);\nINSERT INTO b VALUES (1);')

describe('names and lint', () => {
  it('accepts only AAAAMMDDHHMM_nombre.sql', () => {
    expect(isMigrationName('202611130900_create_a.sql')).toBe(true)
    for (const bad of ['create_a.sql', '2026111309_a.sql', '202611130900_A.sql', '202611130900_a.txt', '202611130900-a.sql']) expect(isMigrationName(bad)).toBe(false)
  })
  it('rejects BEGIN/COMMIT, commands that cannot run in a transaction, and empty files', () => {
    expect(lintMigration(file('202611130900_x.sql', 'BEGIN;\nCREATE TABLE x();\nCOMMIT;')).length).toBeGreaterThan(0)
    expect(lintMigration(file('202611130900_x.sql', 'CREATE INDEX CONCURRENTLY i ON t(a);')).length).toBeGreaterThan(0)
    expect(lintMigration(file('202611130900_x.sql', '   \n')).length).toBeGreaterThan(0)
    expect(lintMigration(file('202611130900_x.sql', '-- BEGIN en un comentario no cuenta\nCREATE TABLE x();'))).toEqual([])
  })
})

describe('plan', () => {
  it('lists pending in name order, skips applied, flags drift and vanished files', () => {
    const applied = [{ name: A.name, checksum: checksum(A.sql), baseline: false }]
    expect(plan([B, A], applied, []).pending.map((f) => f.name)).toEqual([B.name])
    expect(plan([file(A.name, 'CREATE TABLE a (id bigint);'), B], applied, []).drifted).toEqual([A.name])
    expect(plan([B], applied, []).missing).toEqual([A.name])
  })
  it('baseline rows are never pending, drifted or missing', () => {
    const applied = [{ name: 'old-migration.sql', checksum: null, baseline: true }]
    const result = plan([A], applied, ['old-migration.sql'])
    expect(result.missing).toEqual([])
    expect(result.drifted).toEqual([])
    expect(result.pending.map((f) => f.name)).toEqual([A.name])
  })
})

describe('runMigrations (real Postgres via PGlite)', () => {
  let pg: PGlite
  let db: Db
  beforeEach(async () => { pg = new PGlite(); db = dbOf(pg) })

  it('applies pending ones in order, records the checksum, and a second run does nothing', async () => {
    const first = await runMigrations(db, [B, A], [])
    expect(first.applied).toEqual([A.name, B.name])
    expect((await pg.query('SELECT count(*)::int AS n FROM b')).rows[0]).toEqual({ n: 1 })
    const rows = await loadApplied(db)
    expect(rows.map((r) => r.name)).toEqual([A.name, B.name])
    expect(rows[0].checksum).toBe(checksum(A.sql))
    expect((await runMigrations(db, [A, B], [])).applied).toEqual([])
  })

  it('tells PostgREST to reload its schema after applying something, and not on a no-op', async () => {
    const seen: string[] = []
    const watching = { ...db, query: (async (text: string, params?: unknown[]) => { seen.push(text); return db.query(text, params) }) as Db['query'] }
    await runMigrations(watching, [A], [])
    expect(seen.some((text) => /NOTIFY pgrst/i.test(text))).toBe(true)
    seen.length = 0
    await runMigrations(watching, [A], [])
    expect(seen.some((text) => /NOTIFY pgrst/i.test(text))).toBe(false)
  })

  it('dry run lists but changes nothing', async () => {
    const result = await runMigrations(db, [A], [], { dryRun: true })
    expect(result).toEqual({ applied: [A.name], dryRun: true })
    await expect(pg.query('SELECT 1 FROM a')).rejects.toThrow()
  })

  it('a failing migration is undone completely and later ones do not run', async () => {
    const bad = file('202611131100_bad.sql', 'CREATE TABLE c (id int);\nSELECT * FROM no_such_table;')
    const after = file('202611131200_after.sql', 'CREATE TABLE d (id int);')
    await expect(runMigrations(db, [A, bad, after], [])).rejects.toThrow()
    expect((await loadApplied(db)).map((r) => r.name)).toEqual([A.name])
    await expect(pg.query('SELECT 1 FROM c')).rejects.toThrow()
    await expect(pg.query('SELECT 1 FROM d')).rejects.toThrow()
  })

  it('refuses to run when an applied migration was edited', async () => {
    await runMigrations(db, [A], [])
    await expect(runMigrations(db, [file(A.name, 'CREATE TABLE a (id bigint);')], [])).rejects.toThrow(/cambió/)
  })

  it('refuses invalid files before touching anything', async () => {
    await expect(runMigrations(db, [A, file('mala.sql', 'select 1')], [])).rejects.toThrow(/inválidas/i)
    await expect(pg.query('SELECT 1 FROM a')).rejects.toThrow()
  })

  it('marks the baseline once; marking again adds nothing', async () => {
    expect(await markBaseline(db, ['x.sql', 'y.sql'])).toBe(2)
    expect(await markBaseline(db, ['x.sql', 'y.sql', 'z.sql'])).toBe(1)
    const rows = await loadApplied(db)
    expect(rows.every((r) => r.baseline)).toBe(true)
  })
})
