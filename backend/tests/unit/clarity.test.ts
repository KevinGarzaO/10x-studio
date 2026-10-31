import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { normalizePath, parseClarityExport, syncClarity, fetchClarityExport, ClarityApiError } from '../../services/analytics/clarity'

const sample = [
  { metricName: 'Traffic', information: [{ totalSessionCount: '900', OS: 'Android' }] },
  { metricName: 'RageClickCount', information: [
    { sessionsCount: '40', sessionsWithMetricPercentage: 10, pagesViews: '55', subTotal: '7', Url: 'https://avotalent.app/empleos/dotnet?utm_source=x' },
    { sessionsCount: '20', sessionsWithMetricPercentage: 5, pagesViews: '25', subTotal: '1', Url: 'https://avotalent.app/' },
  ] },
  { metricName: 'DeadClickCount', information: [{ sessionsCount: '40', pagesViews: '55', subTotal: '12', Url: 'https://avotalent.app/empleos/dotnet/' }] },
  { metricName: 'QuickbackClick', information: [{ sessionsCount: '40', sessionsWithMetricPercentage: 25, Url: 'https://avotalent.app/empleos/dotnet' }] },
  { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 41.256, Url: 'https://avotalent.app/empleos/dotnet' }, { averageScrollDepth: 80, Url: 'https://avotalent.app/' }] },
]

describe('Clarity export', () => {
  it('normalizes URLs to a path without domain, query or trailing slash', () => {
    expect(normalizePath('https://avotalent.app/empleos/dotnet/?a=1#x')).toBe('/empleos/dotnet')
    expect(normalizePath('https://avotalent.app')).toBe('/')
    expect(normalizePath('/vacantes/x?y=1')).toBe('/vacantes/x')
    expect(normalizePath('not a url')).toBeNull()
    expect(normalizePath(undefined)).toBeNull()
  })

  it('turns the metric list into one row per page, merging the same page with other queries or a final slash', () => {
    const rows = parseClarityExport(sample)
    const dotnet = rows.find((row) => row.path === '/empleos/dotnet')!
    expect(dotnet).toMatchObject({ rageClicks: 7, deadClicks: 12, sessions: 40, pageViews: 55, avgScrollDepth: 41.26 })
    // sin `subTotal` se estima con el % de sesiones que lo tuvieron: 25 % de 40
    expect(dotnet.quickBacks).toBe(10)
    expect(rows.find((row) => row.path === '/')).toMatchObject({ rageClicks: 1, avgScrollDepth: 80 })
    expect(rows).toHaveLength(2)
  })

  it('accepts other spellings of the field names and ignores what it does not know', () => {
    const rows = parseClarityExport([{ metric_name: 'x' }, { metricName: 'Rage Click Count', information: [{ URL: 'https://a.com/p', SubTotal: '3', SessionsCount: '9' }, { nope: 1 }] }, { metricName: 'Other', information: [{ Url: 'https://a.com/q' }] }])
    expect(rows).toEqual([{ path: '/p', sessions: 9, pageViews: 0, rageClicks: 3, deadClicks: 0, quickBacks: 0, avgScrollDepth: null }])
    expect(parseClarityExport(null)).toEqual([])
    expect(parseClarityExport({ error: 'x' })).toEqual([])
  })
})

describe('syncClarity', () => {
  const db = () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    return { upsert, from: vi.fn(() => ({ upsert })) }
  }
  const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as unknown as typeof fetch

  it('asks for the last 24 h by URL with the token, and saves one row per page for the Monterrey day', async () => {
    const fetcher = ok(sample)
    const database = db()
    const outcome = await syncClarity({ token: 'tok', fetcher, db: database as any, now: new Date('2026-10-31T05:55:00Z') })

    expect(outcome).toEqual({ status: 'ok', paths: 2 })
    const [url, init] = (fetcher as any).mock.calls[0]
    expect(url).toContain('numOfDays=1')
    expect(url).toContain('dimension1=URL')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const [records, options] = database.upsert.mock.calls[0]
    expect(options).toEqual({ onConflict: 'day,path' })
    expect(records[0]).toMatchObject({ day: '2026-10-30', path: '/empleos/dotnet', rage_clicks_count: 7, dead_clicks_count: 12, quick_backs_count: 10 })
  })

  it('does nothing without a token, and reports quota, bad token and an empty answer without throwing', async () => {
    expect((await syncClarity({ token: '', fetcher: ok(sample) })).status).toBe('skipped')
    const quota = vi.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch
    expect(await syncClarity({ token: 't', fetcher: quota })).toMatchObject({ status: 'skipped', reason: expect.stringContaining('límite') })
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch
    expect(await syncClarity({ token: 't', fetcher: bad })).toMatchObject({ status: 'error', reason: expect.stringContaining('token') })
    expect(await syncClarity({ token: 't', fetcher: ok([]) })).toMatchObject({ status: 'skipped' })
    await expect(fetchClarityExport('t', bad)).rejects.toBeInstanceOf(ClarityApiError)
  })

  it('says the migration is missing instead of failing', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'relation "analytics_clarity_metrics" does not exist' } })
    const outcome = await syncClarity({ token: 't', fetcher: ok(sample), db: { from: () => ({ upsert }) } as any })
    expect(outcome).toMatchObject({ status: 'skipped', reason: expect.stringContaining('clarity-migration.sql') })
  })
})

describe('clarity-migration.sql (Postgres real)', () => {
  it('creates the table, can run twice, keeps one row per day and page, and is closed to the public key', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../sql/clarity-migration.sql'), 'utf8')
    const db = new PGlite()
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
    await db.exec(sql)
    await db.exec(sql)
    await db.exec(`INSERT INTO analytics_clarity_metrics (day, path, rage_clicks_count) VALUES ('2026-10-30','/a',1) ON CONFLICT (day, path) DO UPDATE SET rage_clicks_count = EXCLUDED.rage_clicks_count`)
    await db.exec(`INSERT INTO analytics_clarity_metrics (day, path, rage_clicks_count) VALUES ('2026-10-30','/a',5) ON CONFLICT (day, path) DO UPDATE SET rage_clicks_count = EXCLUDED.rage_clicks_count`)
    const rows = (await db.query<any>('SELECT * FROM analytics_clarity_metrics')).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].rage_clicks_count).toBe(5)
    const grants = (await db.query<any>(`SELECT has_table_privilege('anon','analytics_clarity_metrics','SELECT') a, has_table_privilege('authenticated','analytics_clarity_metrics','SELECT') b`)).rows[0]
    expect(grants).toEqual({ a: false, b: false })
    await db.close()
  }, 60000)
})

describe('analytics_set_clarity_url (Postgres real)', () => {
  it('saves the player address only for a session of that same browser, refuses other addresses, and updates when Clarity opens a new session', async () => {
    const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
    const db = new PGlite()
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    await db.exec(read('web-analytics-migration.sql'))
    await db.exec(read('clarity-migration.sql'))
    await db.exec(read('clarity-migration.sql'))

    const session = '00000000-0000-4000-8000-000000000001'
    await db.query(`INSERT INTO analytics_sessions (session_id, client_id, entry_path) VALUES ($1, 'client-aaaa-1', '/')`, [session])
    const call = async (sessionId: string, client: string, url: string) => (await db.query<any>('SELECT analytics_set_clarity_url($1, $2, $3) AS ok', [sessionId, client, url])).rows[0].ok
    const good = 'https://clarity.microsoft.com/player/abc123/xyz987/sess42'

    expect(await call(session, 'client-aaaa-1', good)).toBe(true)
    // de otro navegador, de una sesión que no existe o con una dirección que no es la de Clarity: no se guarda
    expect(await call(session, 'client-bbbb-2', 'https://clarity.microsoft.com/player/abc123/xyz987/other')).toBe(false)
    expect(await call('00000000-0000-4000-8000-000000000002', 'client-aaaa-1', good)).toBe(false)
    for (const url of ['https://evil.com/player/a/b/c', 'http://clarity.microsoft.com/player/a/b/c', `${good}/x`, 'https://clarity.microsoft.com/player/a/b/c?x=1', 'https://clarity.microsoft.com.evil.com/player/a/b/c']) {
      expect(await call(session, 'client-aaaa-1', url)).toBe(false)
    }
    expect((await db.query<any>('SELECT * FROM analytics_clarity_links')).rows).toHaveLength(1)

    const next = 'https://clarity.microsoft.com/player/abc123/xyz987/sess43'
    expect(await call(session, 'client-aaaa-1', next)).toBe(true)
    expect((await db.query<any>('SELECT clarity_session_url FROM analytics_clarity_links')).rows).toEqual([{ clarity_session_url: next }])

    const grants = (await db.query<any>(`SELECT has_function_privilege('anon','analytics_set_clarity_url(uuid,text,text)','EXECUTE') a, has_function_privilege('service_role','analytics_set_clarity_url(uuid,text,text)','EXECUTE') b, has_table_privilege('anon','analytics_clarity_links','SELECT') c`)).rows[0]
    expect(grants).toEqual({ a: false, b: true, c: false })
    await db.close()
  }, 60000)
})
