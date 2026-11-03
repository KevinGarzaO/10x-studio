import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

/** La tabla de postulaciones (backend/sql/vacancy-applications-migration.sql) contra un Postgres de verdad (PGlite). */
const sql = fs.readFileSync(path.join(__dirname, '../../sql/vacancy-applications-migration.sql'), 'utf8')
const user = '00000000-0000-4000-8000-000000000001'
const vacancy = '00000000-0000-4000-8000-0000000000a1'

describe('vacancy-applications-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(sql)
    await db.exec(sql) // idempotente
  }, 60000)
  afterAll(async () => { await db?.close() })

  it('starts an application as "clicked" with the time of the click', async () => {
    await q(`INSERT INTO vacancy_applications (user_id, vacancy_id, title, company) VALUES ($1, $2, 'Backend Engineer', 'Stripe')`, [user, vacancy])
    const [row] = await q('SELECT * FROM vacancy_applications')
    expect(row).toMatchObject({ status: 'clicked', title: 'Backend Engineer', company: 'Stripe', remind_at: null, applied_at: null })
    expect(row.clicked_at).toBeTruthy()
  })

  it('one row per person and vacancy: a second click does not duplicate', async () => {
    await expect(q(`INSERT INTO vacancy_applications (user_id, vacancy_id, title) VALUES ($1, $2, 'Otra vez')`, [user, vacancy])).rejects.toThrow()
    // otra persona, misma vacante: sí
    await q(`INSERT INTO vacancy_applications (user_id, vacancy_id, title) VALUES ('00000000-0000-4000-8000-000000000002', $1, 'Backend Engineer')`, [vacancy])
    expect((await q('SELECT count(*)::int n FROM vacancy_applications'))[0].n).toBe(2)
  })

  it('only accepts the known statuses and a real title', async () => {
    const other = '00000000-0000-4000-8000-0000000000b2'
    await expect(q(`INSERT INTO vacancy_applications (user_id, vacancy_id, title, status) VALUES ($1, $2, 'x', 'hired')`, [user, other])).rejects.toThrow()
    await expect(q(`INSERT INTO vacancy_applications (user_id, vacancy_id, title) VALUES ($1, $2, '')`, [user, other])).rejects.toThrow()
    for (const status of ['clicked', 'not_yet', 'applied', 'interview', 'offer', 'rejected']) {
      await q(`INSERT INTO vacancy_applications (user_id, vacancy_id, title, status) VALUES ($1, gen_random_uuid(), 'x', $2)`, [user, status])
    }
  })

  it('has no foreign keys (they would make the author embed of the feed ambiguous) and is closed to the public roles', async () => {
    expect((await q(`SELECT count(*)::int n FROM pg_constraint WHERE conrelid = 'vacancy_applications'::regclass AND contype = 'f'`))[0].n).toBe(0)
    expect((await q(`SELECT relrowsecurity FROM pg_class WHERE relname = 'vacancy_applications'`))[0].relrowsecurity).toBe(true)
    expect((await q(`SELECT has_table_privilege('anon', 'vacancy_applications', 'SELECT') AS anon, has_table_privilege('authenticated', 'vacancy_applications', 'SELECT') AS auth`))[0]).toEqual({ anon: false, auth: false })
  })
})
