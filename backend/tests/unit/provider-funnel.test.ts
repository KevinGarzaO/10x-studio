import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { buildProviderFunnel, type ProviderRow } from '../../services/analytics/provider-funnel'

const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('analytics_provider_funnel (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string) => (await db.query<any>(text)).rows

  const session = (n: number, client: string, device: string) =>
    db.query(`INSERT INTO analytics_sessions (session_id, client_id, entry_path, country, city, device_category, is_engaged) VALUES ($1,$2,'/','MX','Monterrey',$3,true)`, [uuid(100 + n), client, device])
  const event = (n: number, name: string, params: Record<string, unknown>) =>
    db.query(`INSERT INTO analytics_events (session_id, event_name, event_params) VALUES ($1,$2,$3)`, [uuid(100 + n), name, JSON.stringify(params)])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-detail-migration.sql', 'provider-funnel-migration.sql']) await db.exec(read(file))
    await db.exec(read('provider-funnel-migration.sql')) // idempotente

    // 1: móvil, LinkedIn, vuelve con sesión
    await session(1, 'c1', 'mobile'); await event(1, 'auth_provider_click', { provider: 'linkedin', surface: 'wall', in_app: 'no' }); await event(1, 'auth_provider_return', { provider: 'linkedin', outcome: 'success', in_app: 'no' })
    // 2: móvil, LinkedIn, dentro de la app de LinkedIn, toca y nunca vuelve
    await session(2, 'c2', 'mobile'); await event(2, 'auth_provider_click', { provider: 'linkedin', surface: 'wall', in_app: 'linkedin' })
    // 3: escritorio, GitHub, cancela
    await session(3, 'c3', 'desktop'); await event(3, 'auth_provider_click', { provider: 'github', surface: 'signup', in_app: 'no' }); await event(3, 'auth_provider_return', { provider: 'github', outcome: 'denied', reason: 'access_denied', in_app: 'no' })
    // 4: escritorio, GitHub, error del servidor al volver
    await session(4, 'c4', 'desktop'); await event(4, 'auth_provider_click', { provider: 'github', surface: 'login', in_app: 'no' }); await event(4, 'auth_provider_return', { provider: 'github', outcome: 'sync_failed', in_app: 'no' })
    // 5: toca dos veces el mismo proveedor: cuenta una persona
    await session(5, 'c5', 'desktop'); await event(5, 'auth_provider_click', { provider: 'linkedin', surface: 'signup', in_app: 'no' }); await event(5, 'auth_provider_click', { provider: 'linkedin', surface: 'signup', in_app: 'no' })
  }, 90000)
  afterAll(async () => { await db?.close() })

  it('counts people per provider, device and in-app browser: who comes back, who is denied, who fails and who is lost', async () => {
    const rows = await q(`SELECT * FROM analytics_provider_funnel(now() - interval '1 day', now() + interval '1 minute')`)
    const get = (provider: string, device: string, inApp: string) => rows.find((row: any) => row.kind === 'provider' && row.provider === provider && row.device === device && row.in_app === inApp)
    expect(get('linkedin', 'mobile', 'no')).toMatchObject({ clicked: 1, succeeded: 1, denied: 0, failed: 0, no_return: 0 })
    expect(get('linkedin', 'mobile', 'linkedin')).toMatchObject({ clicked: 1, succeeded: 0, no_return: 1 })
    expect(get('github', 'desktop', 'no')).toMatchObject({ clicked: 2, succeeded: 0, denied: 1, failed: 1, no_return: 0 })
    expect(get('linkedin', 'desktop', 'no')).toMatchObject({ clicked: 1, no_return: 1 }) // dos toques de la misma persona = 1
  })

  it('lists the reasons of the failed returns with only the code', async () => {
    const rows = await q(`SELECT * FROM analytics_provider_funnel(now() - interval '1 day', now() + interval '1 minute')`)
    const reasons = rows.filter((row: any) => row.kind === 'reason').map((row: any) => [row.provider, row.label, row.failed])
    expect(reasons).toEqual(expect.arrayContaining([['github', 'access_denied', 1], ['github', 'sync_failed', 1]]))
  })

  it('builds the panel summary with the share who made it and the share who were lost', async () => {
    const rows = (await q(`SELECT * FROM analytics_provider_funnel(now() - interval '1 day', now() + interval '1 minute')`)) as ProviderRow[]
    const funnel = buildProviderFunnel(rows, 7)
    expect(funnel.total).toMatchObject({ clicked: 5, succeeded: 1, denied: 1, failed: 1, noReturn: 2, successPct: 20, lostPct: 80 })
    expect(funnel.byProvider.find((row) => row.provider === 'github')).toMatchObject({ clicked: 2, denied: 1, failed: 1 })
    expect(funnel.byInApp.find((row) => row.inApp === 'linkedin')).toMatchObject({ clicked: 1, succeeded: 0, lostPct: 100 })
  })

  it('does not divide by zero when nobody has tapped yet', () => {
    expect(buildProviderFunnel([], 7).total).toMatchObject({ clicked: 0, successPct: null, lostPct: null })
  })
})
