import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

/** push-notifications-migration.sql contra un Postgres de verdad: las tablas, el clic único por aviso y el resumen que lee el panel. */
describe('push-notifications-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows
  const ANA = '00000000-0000-4000-8000-000000000001'
  const TEAM = '00000000-0000-4000-8000-000000000002'
  const NID = '11111111-1111-4111-8111-111111111111'

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user')`)
    await db.exec(`INSERT INTO users (id, user_kind) VALUES ('${ANA}', 'user'), ('${TEAM}', 'superadmin')`)
    const sql = fs.readFileSync(path.join(__dirname, '../../sql/push-notifications-migration.sql'), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // se puede correr más de una vez
  }, 60000)
  afterAll(async () => { await db?.close() })

  it('keeps one subscription per endpoint and refuses an unknown event kind', async () => {
    await db.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.example/a', 'p', 'a')`, [ANA])
    await expect(db.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.example/a', 'p', 'a')`, [ANA])).rejects.toThrow()
    await expect(db.query(`INSERT INTO push_events (user_id, kind) VALUES ($1, 'otra-cosa')`, [ANA])).rejects.toThrow()
  })

  it('counts one click per notification, and the summary leaves the team out', async () => {
    await db.query(`INSERT INTO push_events (user_id, kind, notification_type, nid) VALUES ($1, 'sent', 'application', $2), ($1, 'click', 'application', $2)`, [ANA, NID])
    await expect(db.query(`INSERT INTO push_events (user_id, kind, notification_type, nid) VALUES ($1, 'click', 'application', $2)`, [ANA, NID])).rejects.toThrow()
    await db.query(`INSERT INTO push_events (user_id, kind) VALUES ($1, 'prompt_shown'), ($2, 'prompt_shown')`, [ANA, TEAM])

    const rows = await q(`SELECT * FROM push_summary(now() - interval '1 day', now() + interval '1 minute')`)
    expect(rows.find(row => row.kind === 'prompt_shown')).toMatchObject({ events: 1, people: 1 })
    expect(rows.find(row => row.kind === 'sent')).toMatchObject({ notification_type: 'application', events: 1 })
    expect(rows.find(row => row.kind === 'click')).toMatchObject({ events: 1 })
  })
})
