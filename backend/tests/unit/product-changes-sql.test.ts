import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

/**
 * La bitácora de cambios (backend/sql/product-changes-migration.sql) contra un Postgres de verdad (PGlite), con las migraciones reales
 * de analítica debajo. Comprueba que "antes y después" cuenta cada lado donde debe y que avisa cuando hay poco o mucho mezclado.
 */
const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('product-changes-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  const session = (n: number, client: string, daysAgo: number, engaged: boolean, user: string | null = null) =>
    db.query(
      `INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, is_engaged, created_at) VALUES ($1,$2,$3,'/',$4, now() - ($5 || ' days')::interval)`,
      [uuid(100 + n), client, user, engaged, String(daysAgo)],
    )
  const change = (title: string, daysAgo: number, extra = '') =>
    db.query(`INSERT INTO product_changes (title, shipped_at) VALUES ($1, now() - ($2 || ' days')::interval)`, [title, String(daysAgo)])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'clarity-migration.sql', 'telemetry-migration.sql', 'web-analytics-segments-migration.sql', 'product-changes-migration.sql']) await db.exec(read(file))
    await db.exec(read('product-changes-migration.sql')) // idempotente
  }, 90000)

  afterAll(async () => { await db?.close() })

  it('rejects a bad kind, a too-short title and a repeated commit', async () => {
    await expect(db.query(`INSERT INTO product_changes (title, kind) VALUES ('Cambio válido', 'otra-cosa')`)).rejects.toThrow()
    await expect(db.query(`INSERT INTO product_changes (title) VALUES ('ab')`)).rejects.toThrow()
    await db.query(`INSERT INTO product_changes (title, commit_sha, source) VALUES ('Con commit', 'abc123', 'git')`)
    await expect(db.query(`INSERT INTO product_changes (title, commit_sha, source) VALUES ('Mismo commit', 'abc123', 'git')`)).rejects.toThrow()
    await db.exec(`DELETE FROM product_changes`)
  })

  it('counts each side of the change apart and only real engaged people', async () => {
    await db.exec(`INSERT INTO users (id, user_kind) VALUES ('${uuid(1)}', 'user'), ('${uuid(2)}', 'superadmin')`)
    // medición desde hace 9 días
    await session(0, 'client-start-0', 9, false)
    // ANTES del cambio (hace 3 días): una persona activa y un visitante que se fue
    await session(1, 'client-aaaa-1', 5, true)
    await session(2, 'client-bbbb-2', 4, false)
    // DESPUÉS: dos personas activas (una con dos sesiones el mismo día) y el equipo, que no cuenta
    await session(3, 'client-cccc-3', 2, true)
    await session(4, 'client-cccc-3', 2, true)
    await session(5, 'client-dddd-4', 1, true)
    await session(6, 'client-team', 1, true, uuid(2))
    await change('Nuevo feed', 3)

    const [row] = await q(`SELECT * FROM analytics_change_impact(7, 10)`)
    expect(row.title).toBe('Nuevo feed')
    expect(row.before_sessions).toBe(3) // la de inicio, la activa y la que se fue
    expect(row.before_active_person_days).toBe(1)
    expect(row.after_sessions).toBe(3) // el equipo no se cuenta
    expect(row.after_active_person_days).toBe(2) // dos personas, la repetida cuenta una vez ese día
    expect(row.after_new_active).toBe(2)
    expect(row.after_complete).toBe(false) // pasaron 3 de 7 días
    expect(Number(row.after_calendar_days)).toBeGreaterThan(2.9)
    expect(Number(row.after_calendar_days)).toBeLessThan(3.1)
    expect(row.nearby_changes).toBe(0)
  })

  it('does not count measurement days before the tracking existed', async () => {
    await change('Cambio antiguo', 8)
    const rows = await q(`SELECT * FROM analytics_change_impact(7, 10) ORDER BY shipped_at`)
    const old = rows[0]
    expect(old.title).toBe('Cambio antiguo')
    // la ventana de antes (hace 15 a 8 días) cae casi toda antes de que existiera la medición (9 días)
    expect(Number(old.before_tracked_days)).toBeLessThan(1.5)
    expect(Number(old.before_calendar_days)).toBeGreaterThan(6.9)
    expect(old.after_complete).toBe(true)
  })

  it('tells how many other changes landed in the same window', async () => {
    await change('Otro cercano', 2)
    const rows = await q(`SELECT title, nearby_changes FROM analytics_change_impact(7, 10)`)
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.nearby_changes]))
    expect(byTitle['Nuevo feed']).toBe(2) // el antiguo (5 días antes) y el cercano (1 día después)
    expect(byTitle['Otro cercano']).toBe(2)
  })

  it('limits the list and can start from a date', async () => {
    expect((await q(`SELECT * FROM analytics_change_impact(7, 1)`)).length).toBe(1)
    expect((await q(`SELECT * FROM analytics_change_impact(7, 10, now() - interval '5 days')`)).length).toBe(2)
  })

  it('counts new real accounts apart from the browsing numbers and leaves the tables closed to anon', async () => {
    await db.exec(`INSERT INTO users (id, user_kind, created_at) VALUES ('${uuid(9)}', 'user', now() - interval '1 day')`)
    const [row] = await q(`SELECT * FROM analytics_change_impact(7, 10, now() - interval '3.5 days') ORDER BY shipped_at LIMIT 1`)
    expect(row.after_registrations).toBe(2) // la cuenta real de la prueba anterior y esta; el superadmin no cuenta
    const rls = await q(`SELECT relrowsecurity FROM pg_class WHERE relname = 'product_changes'`)
    expect(rls[0].relrowsecurity).toBe(true)
  })
})
