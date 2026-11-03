import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { buildApplyFunnel } from '../../services/analytics/apply-funnel'

const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('analytics_apply_funnel (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  const session = (n: number, client: string, device: string, user: string | null = null) =>
    db.query(`INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, device_category, is_engaged) VALUES ($1,$2,$3,'/',$4,true)`, [uuid(100 + n), client, user, device])
  const event = (n: number, name: string) =>
    db.query(`INSERT INTO analytics_events (session_id, event_name) VALUES ($1,$2)`, [uuid(100 + n), name])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-detail-migration.sql', 'apply-funnel-migration.sql']) await db.exec(read(file))
    await db.exec(read('apply-funnel-migration.sql')) // idempotente
  }, 90000)
  afterAll(async () => { await db?.close() })

  it('counts distinct people per device and per account, step by step, and leaves the team out', async () => {
    await db.exec(`INSERT INTO users (id, user_kind) VALUES ('${uuid(1)}', 'user'), ('${uuid(2)}', 'superadmin')`)
    // móvil sin cuenta: ve la vacante, ve el botón y lo toca (dos sesiones de la misma persona cuentan una vez)
    await session(1, 'client-mobile-1', 'mobile'); for (const name of ['click_view_job_detail', 'apply_button_seen', 'click_start_apply']) await event(1, name)
    await session(2, 'client-mobile-1', 'mobile'); await event(2, 'click_view_job_detail')
    // móvil sin cuenta: ve la vacante y nunca llega al botón
    await session(3, 'client-mobile-2', 'mobile'); await event(3, 'click_view_job_detail')
    // escritorio con cuenta: llega hasta salir al sitio de la empresa
    await session(4, 'client-desk-1', 'desktop', uuid(1)); for (const name of ['click_view_job_detail', 'apply_button_seen', 'click_start_apply', 'click_external_apply']) await event(4, name)
    // el equipo no cuenta
    await session(5, 'client-team', 'desktop', uuid(2)); await event(5, 'click_view_job_detail'); await event(5, 'click_start_apply')

    const rows = await q(`SELECT * FROM analytics_apply_funnel(now() - interval '1 day', now() + interval '1 minute')`)
    expect(rows).toEqual([
      { device: 'desktop', audience: 'con_cuenta', viewers: 1, saw_button: 1, clicked: 1, left_site: 1 },
      { device: 'mobile', audience: 'sin_cuenta', viewers: 2, saw_button: 1, clicked: 1, left_site: 0 },
    ])
  })

  it('respects the time window', async () => {
    expect(await q(`SELECT * FROM analytics_apply_funnel(now() + interval '1 hour', now() + interval '2 hours')`)).toEqual([])
  })
})

describe('buildApplyFunnel', () => {
  const rows = [
    { device: 'desktop', audience: 'con_cuenta' as const, viewers: 10, saw_button: 10, clicked: 4, left_site: 4 },
    { device: 'mobile', audience: 'sin_cuenta' as const, viewers: 40, saw_button: 8, clicked: 2, left_site: 0 },
  ]
  it('adds up, cuts by device and by account, and gives rates only when there is someone to divide by', () => {
    const funnel = buildApplyFunnel(rows, 7)
    expect(funnel.total).toMatchObject({ viewers: 50, clicked: 6, clickRate: 12 })
    expect(funnel.byDevice.find((row) => row.device === 'mobile')).toMatchObject({ viewers: 40, sawButtonRate: 20, clickRate: 5 })
    expect(funnel.byAudience.find((row) => row.audience === 'con_cuenta')).toMatchObject({ leftSite: 4, clickRate: 40 })
    expect(buildApplyFunnel([], 7).total.clickRate).toBeNull()
    expect(funnel.notes.length).toBeGreaterThan(0)
  })
})
