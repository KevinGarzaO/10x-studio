import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

describe('email-events-migration.sql (Postgres real)', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
    const sql = fs.readFileSync(path.join(__dirname, '../../sql/email-events-migration.sql'), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // idempotente
  }, 60000)
  afterAll(async () => { await db?.close() })

  it('stores an event and refuses the same notice twice (Resend retries), without keeping any email address column', async () => {
    await db.exec(`INSERT INTO email_events (svix_id, event_type) VALUES ('msg_1', 'clicked')`)
    await expect(db.exec(`INSERT INTO email_events (svix_id, event_type) VALUES ('msg_1', 'clicked')`)).rejects.toThrow(/duplicate key/i)
    const columns = (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'email_events'`)).rows.map((row) => row.column_name)
    expect(columns).not.toEqual(expect.arrayContaining(['email']))
    expect(columns.some((name) => /mail$|^ip|agent/.test(name) && name !== 'resend_email_id')).toBe(false)
  })
})
