import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server'
import type { Queryable } from '../src/queries'

/**
 * El servidor MCP completo (un cliente MCP de verdad, en memoria) contra un Postgres de verdad (PGlite) con las migraciones
 * reales de analítica y de Clarity. Comprueba las tres herramientas y que no se filtre nada de más.
 */
const sqlDir = path.join(__dirname, '../../../backend/sql')
const read = (name: string) => fs.readFileSync(path.join(sqlDir, name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('servidor MCP de analítica', () => {
  let pg: PGlite
  let client: Client
  const db: Queryable = { query: async (text, params) => ({ rows: (await pg.query<any>(text, params as any[])).rows }) }

  const call = async (name: string, args: Record<string, unknown>) => {
    const result: any = await client.callTool({ name, arguments: args })
    const text = result.content?.[0]?.text ?? ''
    return { isError: !!result.isError, text, json: result.isError ? null : JSON.parse(text) }
  }

  beforeAll(async () => {
    pg = new PGlite()
    await pg.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await pg.exec(`CREATE TABLE users (id uuid PRIMARY KEY, email text, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-detail-migration.sql', 'clarity-migration.sql', 'telemetry-migration.sql', 'web-analytics-segments-migration.sql', 'product-changes-migration.sql']) await pg.exec(read(file))

    const ana = uuid(1)
    await pg.exec(`INSERT INTO users (id, email) VALUES ('${ana}', 'ana@example.com')`)
    const session = (n: number, clientId: string, o: { user?: string; entry?: string; exit?: string; engaged?: boolean; converted?: boolean } = {}) =>
      pg.query(
        `INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, exit_path, is_engaged, has_conversion, duration_seconds, page_views_count, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,40,2, now() - interval '1 day')`,
        [uuid(100 + n), clientId, o.user ?? null, o.entry ?? '/', o.exit ?? '/', o.engaged ?? true, o.converted ?? false],
      )
    await session(1, 'client-aaaa-1', { entry: '/empleos/dotnet', exit: '/empleos/dotnet', engaged: true })
    await session(2, 'client-aaaa-2', { entry: '/empleos/dotnet', exit: '/empleos/dotnet', engaged: true })
    await session(3, 'client-aaaa-3', { entry: '/empleos/dotnet', exit: '/vacantes/x', converted: true })
    await session(4, 'client-aaaa-4', { user: ana, entry: '/vacantes/x', exit: '/signup' })

    // errores (2 del mismo tipo en la sesión de ana, que tiene video) y un flujo completo y otro abandonado
    await pg.exec(`INSERT INTO analytics_error_logs (session_id, user_id, client_id, path, error_name, error_message, fingerprint, frames, seconds_into_session) VALUES
      ('${uuid(104)}', '${ana}', 'client-aaaa-4', '/vacantes/x', 'TypeError', 'x is undefined', 'fp-a', '[{"file":"/app.js","fn":"render","line":12,"col":3}]', 42),
      (NULL, NULL, 'client-zzzz-9', '/vacantes/x', 'TypeError', 'x is undefined', 'fp-a', NULL, NULL),
      (NULL, NULL, 'client-yyyy-8', '/signup', 'ApiError', 'HTTP 502 POST /api/community/auth/signup', 'fp-b', NULL, NULL)`)
    await pg.exec(`INSERT INTO analytics_flow_metrics (flow_id, session_id, client_id, flow_name, step_name, step_order, path, duration_ms, load_time_ms, is_final, status, has_frustration) VALUES
      ('10000000-0000-4000-8000-000000000001', '${uuid(104)}', 'client-aaaa-4', 'auth_register', 'start', 0, '/signup', 0, 400, false, 'completed', false),
      ('10000000-0000-4000-8000-000000000001', '${uuid(104)}', 'client-aaaa-4', 'auth_register', 'submit', 1, '/signup', 5000, 3000, false, 'completed', true),
      ('10000000-0000-4000-8000-000000000001', '${uuid(104)}', 'client-aaaa-4', 'auth_register', 'success', 2, '/signup', 500, 0, true, 'completed', false),
      ('10000000-0000-4000-8000-000000000002', NULL, 'client-bbbb-2', 'auth_register', 'start', 0, '/signup', 0, 300, false, 'completed', false),
      ('10000000-0000-4000-8000-000000000002', NULL, 'client-bbbb-2', 'auth_register', 'abandoned', 1, '/signup', 900, 0, false, 'dropped_off', false)`)
    await pg.exec(`INSERT INTO analytics_clarity_links (session_id, clarity_session_url) VALUES ('${uuid(104)}', 'https://clarity.microsoft.com/player/abc123/xyz987/sess42')`)
    await pg.exec(`INSERT INTO analytics_clarity_metrics (day, path, sessions, page_views, rage_clicks_count, dead_clicks_count, quick_backs_count, avg_scroll_depth) VALUES
      ((NOW() AT TIME ZONE 'America/Monterrey')::date, '/empleos/dotnet', 50, 70, 9, 14, 6, 40.5),
      ((NOW() AT TIME ZONE 'America/Monterrey')::date - 1, '/empleos/dotnet', 50, 70, 3, 4, 2, 44.5),
      ((NOW() AT TIME ZONE 'America/Monterrey')::date, '/vacantes/x', 100, 120, 1, 2, 0, 80),
      ((NOW() AT TIME ZONE 'America/Monterrey')::date - 40, '/empleos/dotnet', 10, 10, 99, 99, 99, 1)`)

    await pg.exec(`INSERT INTO product_changes (title, kind, area, shipped_at) VALUES ('Nuevo registro más corto', 'feature', 'auth', now() - interval '12 hours')`)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createServer(db, { clarityProjectId: 'abc123' }).connect(serverTransport)
    client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientTransport)
  }, 90000)

  afterAll(async () => {
    await client?.close()
    await pg?.close()
  })

  it('exposes the three tools, all read-only', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(['get_change_log', 'get_clarity_frustration_data', 'get_error_logs_with_clarity_video', 'get_flow_performance_analysis', 'get_funnel_dropoffs', 'get_user_session_recording'])
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
  })

  it('get_funnel_dropoffs: the funnel, where non-converting sessions end, and how each entry page converts', async () => {
    const { json } = await call('get_funnel_dropoffs', { days: 7, limit: 5 })
    expect(json.days).toBe(7)
    expect(json.funnel.length).toBeGreaterThan(0)
    // las sesiones sin conversión terminan 2 en /empleos/dotnet (activas) y 1 en /signup
    const dotnetExit = json.exitPaths.find((row: any) => row.path === '/empleos/dotnet')
    expect(dotnetExit).toMatchObject({ sessions: 2, people: 2, engagedSessions: 2 })
    expect(json.exitPaths.find((row: any) => row.path === '/signup').sessions).toBe(1)
    const entry = json.entryPages.find((row: any) => row.path === '/empleos/dotnet')
    expect(entry.sessions).toBe(3)
    expect(entry.conversions).toBe(1)
    // agregado: nadie identificado
    expect(JSON.stringify(json)).not.toMatch(/ana@example|client-aaaa/)
  })

  it('get_clarity_frustration_data: exact path with its daily trend and rates per 100 sessions, and the period cuts old days', async () => {
    const { json } = await call('get_clarity_frustration_data', { path: '/empleos/dotnet', days: 7 })
    expect(json.pages).toHaveLength(1)
    expect(json.pages[0]).toMatchObject({ path: '/empleos/dotnet', daysWithData: 2, sessions: 100, rageClicks: 12, deadClicks: 18, quickBacks: 8, ragePer100Sessions: 12, deadPer100Sessions: 18 })
    expect(json.pages[0].avgScrollDepth).toBe(42.5)
    expect(json.daily.map((day: any) => day.rageClicks)).toEqual([3, 9])
    expect(json.note).toBeNull()
  })

  it('get_clarity_frustration_data: a prefix with * and the worst pages without a path; an unknown path says why it is empty', async () => {
    const prefix = await call('get_clarity_frustration_data', { path: '/emp*', days: 7 })
    expect(prefix.json.pages.map((row: any) => row.path)).toEqual(['/empleos/dotnet'])
    expect(prefix.json.daily).toEqual([])

    const worst = await call('get_clarity_frustration_data', { days: 7 })
    expect(worst.json.pages.map((row: any) => row.path)).toEqual(['/empleos/dotnet', '/vacantes/x'])

    const none = await call('get_clarity_frustration_data', { path: '/no-existe', days: 7 })
    expect(none.json.pages).toEqual([])
    expect(none.json.note).toContain('Sin datos de Clarity')
  })

  it('get_clarity_frustration_data: a % or _ in the path is searched literally and a path without "/" is refused', async () => {
    const literal = await call('get_clarity_frustration_data', { path: '/%*', days: 7 })
    expect(literal.json.pages).toEqual([])
    const bad = await call('get_clarity_frustration_data', { path: 'empleos', days: 7 })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('"/"')
  })

  it('get_user_session_recording: finds the account by id or email, lists its sessions and how to open the recording, without exposing the email', async () => {
    const byEmail = await call('get_user_session_recording', { email: 'ANA@example.com' })
    expect(byEmail.json.found).toBe(true)
    expect(byEmail.json.user.id).toBe(uuid(1))
    expect(byEmail.json.sessions).toHaveLength(1)
    expect(byEmail.json.sessions[0]).toMatchObject({ sessionId: uuid(104), entryPath: '/vacantes/x', exitPath: '/signup', converted: false, clarityUrl: 'https://clarity.microsoft.com/player/abc123/xyz987/sess42' })
    expect(byEmail.json.clarity.dashboardUrl).toBe('https://clarity.microsoft.com/projects/view/abc123/dashboard')
    expect(byEmail.json.clarity.customUserId).toBe(uuid(1))
    expect(byEmail.text).not.toContain('ana@example.com')

    const byId = await call('get_user_session_recording', { user_id: uuid(1), limit: 1 })
    expect(byId.json.sessions).toHaveLength(1)
  })

  it('get_user_session_recording: an unknown person is "not found", and an invalid or missing id is an error, not a crash', async () => {
    expect((await call('get_user_session_recording', { user_id: uuid(999) })).json).toMatchObject({ found: false, sessions: [] })
    expect((await call('get_user_session_recording', {})).isError).toBe(true)
    const result: any = await client.callTool({ name: 'get_user_session_recording', arguments: { user_id: 'not-a-uuid' } })
    expect(result.isError).toBe(true)
  })

  it('get_error_logs_with_clarity_video: groups the same error, counts people, and brings the video and the second where it failed', async () => {
    const { json } = await call('get_error_logs_with_clarity_video', { days: 7 })
    expect(json.totalOccurrences).toBe(3)
    const [top, other] = json.errors
    expect(top).toMatchObject({ name: 'TypeError', path: '/vacantes/x', occurrences: 2, peopleAffected: 2, clarityUrl: 'https://clarity.microsoft.com/player/abc123/xyz987/sess42', secondsIntoSession: 42 })
    expect(top.topFrames).toEqual([{ file: '/app.js', fn: 'render', line: 12, col: 3 }])
    expect(other).toMatchObject({ name: 'ApiError', occurrences: 1, clarityUrl: null })
    const byPath = await call('get_error_logs_with_clarity_video', { path: '/signup' })
    expect(byPath.json.errors.map((row: any) => row.name)).toEqual(['ApiError'])
    expect((await call('get_error_logs_with_clarity_video', { path: 'signup' })).isError).toBe(true)
  })

  it('get_flow_performance_analysis: completion, drop-off, timings, steps with the loss to the next one, and Clarity on the pages of the flow', async () => {
    const { json } = await call('get_flow_performance_analysis', { days: 7, flow: 'auth_register' })
    expect(json.flows).toHaveLength(1)
    const flow = json.flows[0]
    expect(flow).toMatchObject({ flow: 'auth_register', runsStarted: 2, runsCompleted: 1, completionRatePct: 50, dropoffRatePct: 50, avgDurationMs: 5500, frustratedRuns: 1 })
    // start: 2 intentos y 1 siguió (se pierde 50 %); submit: 1 y siguió; success es el final; "abandoned" no es un paso
    expect(flow.steps.map((step: any) => [step.step, step.reached, step.lossToNextPct])).toEqual([['start', 2, 50], ['submit', 1, 0], ['success', 1, null]])
    expect(flow.clarityOnItsPages).toEqual([{ path: '/signup', rageClicks: 0, deadClicks: 0, sessions: 0 }])
    expect((await call('get_flow_performance_analysis', { flow: 'Bad Flow' })).isError).toBe(true)
    expect((await call('get_flow_performance_analysis', { days: 7, flow: 'job_application' })).json.flows).toEqual([])
  })

  it('get_change_log: each change with its before/after per day, its comparability and the reminder that it proves no cause', async () => {
    const { json } = await call('get_change_log', { windowDays: 7 })
    expect(json.windowDays).toBe(7)
    expect(json.changes).toHaveLength(1)
    expect(json.changes[0]).toMatchObject({ title: 'Nuevo registro más corto', kind: 'feature', area: 'auth', confidence: 'pendiente' })
    expect(json.changes[0].sessionsPerDay.after).not.toBeNull()
    expect(json.note).toContain('NO prueba')
    expect((await call('get_change_log', { windowDays: 5 })).isError).toBe(true)
  })

  it('the read-only role from the README can run every tool and cannot write (the documented SQL is tested, not just written)', async () => {
    const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8')
    const block = readme.match(/```sql\r?\n([\s\S]*?)```/)![1]
    await pg.exec(block)

    const asReader: Queryable = {
      query: async (text, params) => {
        await pg.exec('SET ROLE avo_mcp_reader')
        try {
          return { rows: (await pg.query<any>(text, params as any[])).rows }
        } finally {
          await pg.exec('RESET ROLE')
        }
      },
    }
    const { getFunnelDropoffs, getClarityFrustration, getUserSessionRecording } = await import('../src/queries')
    expect((await getFunnelDropoffs(asReader, { days: 7 })).exitPaths.length).toBeGreaterThan(0)
    expect((await getClarityFrustration(asReader, { days: 7 })).pages.length).toBeGreaterThan(0)
    const telemetry = await import('../src/telemetry-queries')
    expect((await telemetry.getErrorLogsWithClarityVideo(asReader, { days: 7 })).errors.length).toBeGreaterThan(0)
    expect((await telemetry.getFlowPerformanceAnalysis(asReader, { days: 7 })).flows.length).toBeGreaterThan(0)
    expect((await telemetry.getChangeLog(asReader, { windowDays: 7 })).changes.length).toBe(1)
    expect((await getUserSessionRecording(asReader, { email: 'ana@example.com' })).found).toBe(true)

    await pg.exec('SET ROLE avo_mcp_reader')
    await expect(pg.exec("UPDATE analytics_clarity_metrics SET rage_clicks_count = 0")).rejects.toThrow()
    await expect(pg.exec('SELECT password FROM pg_authid')).rejects.toThrow()
    await pg.exec('RESET ROLE')
  })
})
