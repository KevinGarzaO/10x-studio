import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

/**
 * La migración de telemetría (errores y flujos) contra un Postgres de verdad (PGlite), con las migraciones reales de analítica
 * web y de Clarity debajo. Las pruebas van en orden y comparten la base.
 */
const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const flow = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('telemetry-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'clarity-migration.sql', 'telemetry-migration.sql']) await db.exec(read(file))
    await db.exec(read('telemetry-migration.sql')) // idempotente

    await db.exec(`INSERT INTO users (id, user_kind) VALUES ('${uuid(1)}', 'user'), ('${uuid(2)}', 'superadmin')`)
    const session = (n: number, client: string, user: string | null, minutesAgo = 5) =>
      db.query(`INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, created_at) VALUES ($1,$2,$3,'/', now() - ($4 || ' minutes')::interval)`, [uuid(100 + n), client, user, String(minutesAgo)])
    await session(1, 'client-aaaa-1', uuid(1))
    await session(2, 'client-bbbb-2', null)
    await session(3, 'client-cccc-3', uuid(2)) // el equipo
    await db.exec(`INSERT INTO analytics_clarity_links (session_id, clarity_session_url) VALUES ('${uuid(101)}', 'https://clarity.microsoft.com/player/abc123/u1/s1')`)
  }, 90000)

  afterAll(async () => { await db?.close() })

  const err = (o: Record<string, unknown>) => q('SELECT analytics_record_error($1::jsonb) AS ok', [JSON.stringify({ path: '/vacantes/x', name: 'TypeError', message: 'x is undefined', fingerprint: 'fp-1', source: 'frontend', ...o })]).then((rows) => rows[0].ok)

  it('errors: the account and the second of the session come from the SESSION, never from the browser', async () => {
    expect(await err({ session_id: uuid(101), client_id: 'client-aaaa-1', user_id: 'forged', stack: 'TypeError: x\n  at f (a.js:1:2)', frames: [{ file: '/a.js', fn: 'f', line: 1, col: 2 }] })).toBe(true)
    const [row] = await q('SELECT * FROM analytics_error_logs ORDER BY id DESC LIMIT 1')
    expect(row.user_id).toBe(uuid(1))
    expect(row.session_id).toBe(uuid(101))
    expect(row.seconds_into_session).toBeGreaterThanOrEqual(299)
    expect(row.frames).toEqual([{ file: '/a.js', fn: 'f', line: 1, col: 2 }])
  })

  it('errors: a session of ANOTHER browser is not attached (the error is kept, without session)', async () => {
    await err({ session_id: uuid(101), client_id: 'client-zzzz-9', fingerprint: 'fp-2' })
    const [row] = await q(`SELECT * FROM analytics_error_logs WHERE fingerprint = 'fp-2'`)
    expect(row.session_id).toBeNull()
    expect(row.user_id).toBeNull()
  })

  it('errors: the same error from the same browser within a minute is dropped, and a bad source or shape is cleaned', async () => {
    expect(await err({ session_id: uuid(101), client_id: 'client-aaaa-1' })).toBe(false)
    expect(await err({ client_id: 'client-dddd-4', fingerprint: 'fp-3', source: 'hacker', frames: 'not-an-array', context: 'x' })).toBe(true)
    const [row] = await q(`SELECT * FROM analytics_error_logs WHERE fingerprint = 'fp-3'`)
    expect(row.error_source).toBe('frontend')
    expect(row.frames).toBeNull()
    expect(row.context).toBeNull()
    expect(await err({ fingerprint: '' })).toBe(false)
  })

  it('error summary: groups by error, counts people, brings the video of the latest occurrence that has one, and leaves the team out', async () => {
    // el mismo error (fp-1) de otra persona y del equipo
    await db.query(`INSERT INTO analytics_error_logs (session_id, user_id, client_id, path, error_name, error_message, fingerprint) VALUES ($1, NULL, 'client-bbbb-2', '/vacantes/x', 'TypeError', 'x is undefined', 'fp-1')`, [uuid(102)])
    await db.query(`INSERT INTO analytics_error_logs (session_id, user_id, client_id, path, error_name, error_message, fingerprint) VALUES ($1, $2, 'client-cccc-3', '/vacantes/x', 'TypeError', 'x is undefined', 'fp-1')`, [uuid(103), uuid(2)])
    const rows = await q('SELECT * FROM analytics_error_summary(7, 50)')
    const top = rows.find((row: any) => row.fingerprint === 'fp-1')
    expect(rows[0].fingerprint).toBe('fp-1')
    expect(top.occurrences).toBe(2) // el equipo no cuenta
    expect(top.people_affected).toBe(2)
    expect(top.clarity_url).toBe('https://clarity.microsoft.com/player/abc123/u1/s1')
    expect(top.sample_session_id).toBe(uuid(101))
    expect(rows.find((row: any) => row.fingerprint === 'fp-2').clarity_url).toBeNull()
    expect(await q('SELECT * FROM analytics_error_summary(7, 1)')).toHaveLength(1)
  })

  // ---------- flujos ----------
  const step = (flowId: string, session: number | null, client: string | null, name: string, order: number, o: Record<string, unknown> = {}) =>
    q('SELECT analytics_record_flow_step($1::jsonb) AS ok', [JSON.stringify({ flow_id: flowId, session_id: session ? uuid(100 + session) : undefined, client_id: client, flow_name: 'auth_login', step_name: name, step_order: order, ...o })]).then((rows) => rows[0].ok)

  it('flow steps: frustration is decided by the server (slow load or rage clicks), and numbers are capped', async () => {
    expect(await step(flow(1), 1, 'client-aaaa-1', 'start', 0, { load_time_ms: 300 })).toBe(true)
    expect(await step(flow(1), 1, 'client-aaaa-1', 'submit', 1, { duration_ms: 4000, load_time_ms: 2600, has_frustration: false })).toBe(true)
    expect(await step(flow(1), 1, 'client-aaaa-1', 'success', 2, { duration_ms: 900, load_time_ms: 200, is_final: true })).toBe(true)
    const rows = await q('SELECT step_name, has_frustration, user_id FROM analytics_flow_metrics WHERE flow_id = $1 ORDER BY step_order', [flow(1)])
    expect(rows.map((r: any) => r.has_frustration)).toEqual([false, true, false])
    expect(rows[0].user_id).toBe(uuid(1))
    await step(flow(9), null, 'client-eeee-5', 'start', 0, { rage_clicks: 3, load_time_ms: 99999999, duration_ms: 99999999999 })
    const [capped] = await q('SELECT * FROM analytics_flow_metrics WHERE flow_id = $1', [flow(9)])
    expect(capped.has_frustration).toBe(true)
    expect(capped.load_time_ms).toBe(600000)
    expect(capped.duration_ms).toBe(86400000)
    expect(await step(flow(9), null, null, '', 0)).toBe(false)
  })

  it('flow steps: a name that is not a flow name is refused by the database', async () => {
    await expect(step(flow(10), null, 'client-eeee-5', 'start', 0, { flow_name: 'DROP TABLE' })).rejects.toThrow()
    // un número fuera de rango o un texto en lugar de número no hace fallar el guardado: se acota
    expect(await step(flow(10), null, 'client-eeee-5', 'start', 0, { step_order: 999, load_time_ms: 'abc' })).toBe(true)
    const [row] = await q('SELECT step_order, load_time_ms FROM analytics_flow_metrics WHERE flow_id = $1', [flow(10)])
    expect(row).toEqual({ step_order: 50, load_time_ms: 0 })
    await db.query('DELETE FROM analytics_flow_metrics WHERE flow_id = $1', [flow(10)])
  })

  it('flow summary: completed, dropped (said so, or silent for 30 minutes), failed and still running, with the rates only over finished runs', async () => {
    // 2: dos pasos y se fue a propósito; 3: error; 4: sin cierre y de hace 2 horas (abandono silencioso); 5: en curso (hace 1 minuto)
    await step(flow(2), 2, 'client-bbbb-2', 'start', 0)
    await step(flow(2), 2, 'client-bbbb-2', 'submit', 1, { status: 'dropped_off', duration_ms: 1000 })
    await step(flow(3), 2, 'client-bbbb-2', 'start', 0)
    await step(flow(3), 2, 'client-bbbb-2', 'submit', 1, { status: 'error', error_message: 'Credenciales' })
    await step(flow(4), 2, 'client-bbbb-2', 'start', 0)
    await db.query(`UPDATE analytics_flow_metrics SET created_at = now() - interval '2 hours' WHERE flow_id = $1`, [flow(4)])
    await step(flow(5), 2, 'client-bbbb-2', 'start', 0)
    const [row] = await q(`SELECT * FROM analytics_flow_summary(30) WHERE flow_name = 'auth_login'`)
    // intentos: 1 (completado) + 2 + 3 + 4 + 5 + 9 (sin sesión, en curso) = 6; el 9 no tiene cierre y es reciente
    expect(row.runs_started).toBe(6)
    expect(row.runs_completed).toBe(1)
    expect(row.runs_dropped).toBe(2)
    expect(row.runs_error).toBe(1)
    expect(row.runs_in_progress).toBe(2)
    // 4 intentos terminados: 1 completado (25 %) y 2 abandonados (50 %)
    expect(Number(row.completion_rate_pct)).toBe(25)
    expect(Number(row.dropoff_rate_pct)).toBe(50)
    expect(row.avg_duration_ms).toBe(4900) // 0 + 4000 + 900 del intento completado
    expect(row.frustrated_runs).toBe(2) // el lento (1) y el de rage clicks (9)
    expect(row.people_completed).toBe(1)
  })

  it('flow steps table: how many runs reach each step', async () => {
    const rows = await q(`SELECT * FROM analytics_flow_steps(30) WHERE flow_name = 'auth_login'`)
    const by = Object.fromEntries(rows.map((r: any) => [r.step_name, r]))
    expect(by.start.reached).toBe(6)
    expect(by.submit.reached).toBe(3)
    expect(by.success.reached).toBe(1)
    expect(by.submit.errors).toBe(1)
    // "abandoned" no es un paso que la persona haya elegido: no aparece, y no cuenta como que siguió
    expect(by.abandoned).toBeUndefined()
    // de los 6 intentos que empezaron, 3 pasaron a "submit" y 3 se quedaron en "start"; el paso final no pierde a nadie
    expect(by.start.continued).toBe(3)
    expect(by.start.is_final).toBe(false)
    expect(by.success.is_final).toBe(true)
    expect(by.submit.continued).toBe(1) // el intento 1 siguió a "success"; el 2 (se fue) y el 3 (error) se quedaron
  })

  it('the team and bots are left out of the flows too', async () => {
    await step(flow(6), 3, 'client-cccc-3', 'start', 0)
    const [row] = await q(`SELECT * FROM analytics_flow_summary(30) WHERE flow_name = 'auth_login'`)
    expect(row.runs_started).toBe(6)
  })

  it('everything is closed to the public key', async () => {
    const row = (await q(`SELECT has_function_privilege('anon','analytics_record_error(jsonb)','EXECUTE') a, has_function_privilege('anon','analytics_flow_summary(int)','EXECUTE') b,
      has_function_privilege('service_role','analytics_record_flow_step(jsonb)','EXECUTE') c, has_table_privilege('anon','analytics_error_logs','SELECT') d,
      has_table_privilege('authenticated','analytics_flow_metrics','SELECT') e, has_table_privilege('anon','analytics_flow_runs','SELECT') f`))[0]
    expect(row).toEqual({ a: false, b: false, c: true, d: false, e: false, f: false })
  })
})
