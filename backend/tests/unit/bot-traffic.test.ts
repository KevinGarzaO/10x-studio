import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { buildBotSummary } from '@avotalent/core/services/analytics/bot-traffic'

const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('web-analytics-bots-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  const session = (n: number, client: string, o: { country: string; city?: string | null; resolution?: string; engaged?: boolean; isNew?: boolean; user?: string | null; converted?: boolean }) =>
    db.query(
      `INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, country, city, screen_resolution, is_engaged, is_new_visitor, has_conversion)
       VALUES ($1,$2,$3,'/',$4,$5,$6,$7,$8,$9)`,
      [uuid(100 + n), client, o.user ?? null, o.country, o.city ?? null, o.resolution ?? '1920x1080', o.engaged ?? true, o.isNew ?? true, o.converted ?? false],
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-detail-migration.sql', 'web-analytics-bots-migration.sql']) await db.exec(read(file))
    await db.exec(read('web-analytics-bots-migration.sql')) // idempotente
    await db.exec(`INSERT INTO users (id, user_kind) VALUES ('${uuid(1)}', 'user')`)
  }, 90000)
  afterAll(async () => { await db?.close() })

  it('marks datacenter cities and headless screens, and never a person with an account or a key action', async () => {
    await session(1, 'c-dulles', { country: 'US', city: 'Dulles Town Center' })
    await session(2, 'c-dulles', { country: 'US', city: 'Dulles Town Center' }) // la misma «persona»: cuenta una vez
    await session(3, 'c-desmoines', { country: 'US', city: 'Des Moines' })
    await session(4, 'c-headless', { country: 'AR', city: 'Buenos Aires', resolution: '800x600' })
    await session(5, 'c-real-us', { country: 'US', city: 'Austin' }) // EE. UU. pero no es un centro de datos
    await session(6, 'c-real-mx', { country: 'MX', city: 'Monterrey' })
    await session(7, 'c-acct', { country: 'US', city: 'Ashburn', user: uuid(1) }) // vive en Ashburn y tiene cuenta: no se marca
    await session(8, 'c-key', { country: 'US', city: 'Ashburn', converted: true }) // hizo una acción clave: no se marca
    await session(9, 'c-visit-only', { country: 'US', city: 'Boydton', engaged: false })

    const flagged = await q(`SELECT s.client_id, f.reason FROM analytics_likely_bot_sessions f JOIN analytics_sessions s USING (session_id) ORDER BY s.client_id`)
    expect(flagged.map((row) => [row.client_id, row.reason])).toEqual([
      ['c-desmoines', 'centro_de_datos'], ['c-dulles', 'centro_de_datos'], ['c-dulles', 'centro_de_datos'], ['c-headless', 'pantalla_de_servidor'], ['c-visit-only', 'centro_de_datos'],
    ])
  })

  it('summarises how many of the new active people look like bots, and where', async () => {
    const rows = await q(`SELECT * FROM analytics_bot_summary(now() - interval '1 day', now() + interval '1 minute')`)
    const get = (dimension: string, label: string) => rows.find((row) => row.dimension === dimension && row.label === label)
    expect(get('total', 'todas')).toMatchObject({ sessions: 9, people: 8 })
    expect(get('total', 'probables')).toMatchObject({ sessions: 5, people: 4, new_active_people: 3 }) // dulles, des moines, headless (el visit-only no es activo)
    expect(get('total', 'todas').new_active_people).toBe(8 - 1) // todos menos el que solo visitó
    expect(get('city', 'US · Dulles Town Center')).toMatchObject({ sessions: 2, people: 1 })
    expect(get('country', 'US').people).toBe(3)
    expect(get('reason', 'pantalla_de_servidor')).toMatchObject({ people: 1 })

    const summary = buildBotSummary(rows, 1)
    expect(summary.newActiveBotSharePct).toBe(42.9)
    expect(summary.newActiveWithoutBots).toBe(4)
  })

  it('the list of cities can be edited without touching code', async () => {
    await db.exec(`INSERT INTO analytics_datacenter_places (country, city, note) VALUES ('US', 'Austin', 'prueba')`)
    const flagged = await q(`SELECT s.client_id FROM analytics_likely_bot_sessions f JOIN analytics_sessions s USING (session_id) WHERE s.client_id = 'c-real-us'`)
    expect(flagged).toHaveLength(1)
    await db.exec(`DELETE FROM analytics_datacenter_places WHERE city = 'Austin'`)
  })
})

describe('buildBotSummary', () => {
  it('does not divide by zero and keeps zeros when there is nothing flagged', () => {
    const summary = buildBotSummary([{ dimension: 'total', label: 'todas', sessions: 10, people: 8, active_people: 5, new_active_people: 4 }], 7)
    expect(summary.likelyBots).toEqual({ sessions: 0, people: 0, activePeople: 0, newActivePeople: 0 })
    expect(summary.newActiveBotSharePct).toBe(0)
    expect(summary.newActiveWithoutBots).toBe(4)
    expect(buildBotSummary([], 7).newActiveBotSharePct).toBeNull()
  })
})
