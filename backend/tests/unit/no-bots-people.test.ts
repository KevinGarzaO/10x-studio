import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('web-analytics-no-bots-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string) => (await db.query<any>(text)).rows

  const session = (n: number, client: string, o: { city: string; user?: string | null; engaged?: boolean }) =>
    db.query(
      `INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, country, city, screen_resolution, is_engaged, is_new_visitor)
       VALUES ($1,$2,$3,'/','US',$4,'1920x1080',$5,true)`,
      [uuid(100 + n), client, o.user ?? null, o.city, o.engaged ?? true],
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-detail-migration.sql', 'web-analytics-bots-migration.sql', 'web-analytics-summary-migration.sql', 'web-analytics-segments-migration.sql', 'web-analytics-no-bots-migration.sql']) await db.exec(read(file))
    await db.exec(read('web-analytics-no-bots-migration.sql')) // idempotente
    await db.exec(`INSERT INTO users (id, user_kind) VALUES ('${uuid(1)}', 'user')`)
    await session(1, 'c-bot-1', { city: 'Ashburn' })
    await session(2, 'c-bot-2', { city: 'Des Moines' })
    await session(3, 'c-real', { city: 'Monterrey' })
    await session(4, 'c-acct', { city: 'Ashburn', user: uuid(1) }) // vive en un centro de datos pero tiene cuenta: nunca se marca
  }, 90000)
  afterAll(async () => { await db?.close() })

  it('leaves the probable bots out of active and new active people, and keeps every registered account', async () => {
    const [row] = await q(`SELECT * FROM analytics_visitors_summary(now() - interval '1 day', now() + interval '1 minute')`)
    expect(row.active).toBe(2) // la persona real y la cuenta, no los 2 bots
    expect(row.new_active).toBe(2)
    expect(row.sessions).toBe(2)
    const [seg] = await q(`SELECT * FROM analytics_segments(now() - interval '1 day', now() + interval '1 minute', 'all')`)
    expect(seg.people).toBe(2)
    expect(seg.new_active).toBe(2)
  })

  it('does not delete anything: the raw count is still in the sessions and in the bot summary', async () => {
    expect((await q(`SELECT COUNT(*)::int AS n FROM analytics_sessions`))[0].n).toBe(4)
    const rows = await q(`SELECT * FROM analytics_bot_summary(now() - interval '1 day', now() + interval '1 minute')`)
    expect(rows.find((r: any) => r.dimension === 'total' && r.label === 'todas')).toMatchObject({ sessions: 4, people: 4 })
    expect(rows.find((r: any) => r.dimension === 'total' && r.label === 'probables')).toMatchObject({ sessions: 2, people: 2 })
    // ninguna cuenta registrada marcada como bot
    expect((await q(`SELECT COUNT(*)::int AS n FROM analytics_likely_bot_sessions f JOIN analytics_sessions s USING (session_id) WHERE s.user_id IS NOT NULL`))[0].n).toBe(0)
  })

  it('is reversible: removing a city from the list brings those visits back', async () => {
    await db.exec(`DELETE FROM analytics_datacenter_places WHERE city = 'Des Moines'`)
    const [row] = await q(`SELECT * FROM analytics_visitors_summary(now() - interval '1 day', now() + interval '1 minute')`)
    expect(row.active).toBe(3)
  })
})
