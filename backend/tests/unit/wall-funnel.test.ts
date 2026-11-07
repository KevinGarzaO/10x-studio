import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { buildWallFunnel } from '../../services/analytics/wall-funnel'

const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('analytics_wall_funnel (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  const session = (n: number, client: string, device: string) =>
    db.query(`INSERT INTO analytics_sessions (session_id, client_id, entry_path, device_category, is_engaged) VALUES ($1,$2,'/',$3,true)`, [uuid(100 + n), client, device])
  const event = (n: number, name: string, params: Record<string, unknown> = {}) =>
    db.query(`INSERT INTO analytics_events (session_id, event_name, event_params) VALUES ($1,$2,$3::jsonb)`, [uuid(100 + n), name, JSON.stringify(params)])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-detail-migration.sql', 'wall-funnel-migration.sql']) await db.exec(read(file))
    await db.exec(read('wall-funnel-migration.sql')) // idempotente
  }, 90000)
  afterAll(async () => { await db?.close() })

  it('counts people per device and in-app browser: who saw the wall, who tapped which button, who registered', async () => {
    // móvil dentro de la app de LinkedIn: la ve, toca LinkedIn y no se registra
    await session(1, 'c-app-1', 'mobile'); await event(1, 'auth_wall_shown', { in_app: 'linkedin' }); await event(1, 'auth_wall_click', { method: 'linkedin', in_app: 'linkedin' })
    // móvil dentro de la app de LinkedIn: solo la ve
    await session(2, 'c-app-2', 'mobile'); await event(2, 'auth_wall_shown', { in_app: 'linkedin' })
    // móvil en el navegador normal: la ve, toca el correo y se registra (dos sesiones de la misma persona cuentan una vez)
    await session(3, 'c-web-1', 'mobile'); await event(3, 'auth_wall_shown', { in_app: 'no' }); await event(3, 'auth_wall_click', { method: 'signup', in_app: 'no' })
    await session(4, 'c-web-1', 'mobile'); await event(4, 'user_registration_success'); await event(4, 'auth_wall_shown', { in_app: 'no' })
    // escritorio: la ve, toca GitHub y se registra
    await session(5, 'c-desk-1', 'desktop'); await event(5, 'auth_wall_shown', { in_app: 'no' }); await event(5, 'auth_wall_click', { method: 'github', in_app: 'no' }); await event(5, 'user_registration_success')
    // un evento viejo, de antes de medir el navegador interno
    await session(6, 'c-old', 'desktop'); await event(6, 'auth_wall_shown')

    const rows = await q(`SELECT * FROM analytics_wall_funnel(now() - interval '1 day', now() + interval '1 minute')`)
    const get = (device: string, inApp: string) => rows.find((row) => row.device === device && row.in_app === inApp)
    expect(get('mobile', 'linkedin')).toMatchObject({ saw: 2, clicked: 1, clicked_linkedin: 1, clicked_github: 0, clicked_email: 0, registered: 0 })
    expect(get('mobile', 'no')).toMatchObject({ saw: 1, clicked: 1, clicked_email: 1, registered: 1 })
    expect(get('desktop', 'no')).toMatchObject({ saw: 1, clicked: 1, clicked_github: 1, registered: 1 })
    expect(get('desktop', 'sin_dato')).toMatchObject({ saw: 1, clicked: 0, registered: 0 })
  })

  it('reads it: totals, by device and by in-app browser, with the percentages', async () => {
    const rows = await q(`SELECT * FROM analytics_wall_funnel(now() - interval '1 day', now() + interval '1 minute')`)
    const funnel = buildWallFunnel(rows, 7)
    expect(funnel.total).toMatchObject({ saw: 5, clicked: 3, registered: 2, clickPct: 60, registerPct: 40 })
    expect(funnel.byDevice.find((row) => row.device === 'mobile')).toMatchObject({ saw: 3, registered: 1, registerPct: 33.3 })
    expect(funnel.byInApp.find((row) => row.inApp === 'linkedin')).toMatchObject({ saw: 2, registered: 0, registerPct: 0, clickToRegisterPct: 0 })
    expect(buildWallFunnel([], 7).total.registerPct).toBeNull()
  })
})
