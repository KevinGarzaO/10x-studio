import { describe, it, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { PGlite } from '@electric-sql/pglite'

/**
 * La migración de analítica web (backend/sql/web-analytics-migration.sql) contra un Postgres de verdad (PGlite: Postgres
 * compilado a WASM, corre en memoria). Comprueba cada regla de GA4 donde viven: en SQL. Las pruebas van en orden y
 * comparten la misma base. La tabla de usuarios es un mínimo (solo lo que la migración lee).
 */
const sql = fs.readFileSync(path.join(__dirname, '../../sql/web-analytics-migration.sql'), 'utf8')
const detailSql = fs.readFileSync(path.join(__dirname, '../../sql/web-analytics-detail-migration.sql'), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const S = (n: number) => uuid(n)

describe('web-analytics-migration.sql (Postgres real)', () => {
  let db: PGlite
  const c = {
    query: async (text: string, params?: unknown[]) => {
      if (params && params.length) return db.query<any>(text, params)
      const results = await db.exec(text)
      return { rows: (results.length ? results[results.length - 1].rows : []) as any[] }
    },
  }
  const q = async (text: string, params?: unknown[]) => (await c.query(text, params)).rows as any[]

  beforeAll(async () => { db = new PGlite() }, 60000)
  afterAll(async () => { await db.close() })

  it('crea todo y se puede correr dos veces sin error', async () => {
    await c.query(`CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;`)
    await c.query(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user')`)
    await c.query(sql)
    await c.query(sql)
    await c.query(detailSql)
    await c.query(detailSql)
  }, 60000)


    const start = (n: number, client: string, extra: Record<string, unknown> = {}) => q(`SELECT analytics_start_session($1::jsonb) AS created`, [JSON.stringify({ session_id: S(n), client_id: client, entry_path: '/vacantes/react', device_category: 'desktop', country: 'MX', city: 'Monterrey', utm_source: 'linkedin', utm_medium: 'social', referrer_host: 'linkedin.com', ...extra })])
    const session = async (n: number) => (await q(`SELECT * FROM analytics_sessions WHERE session_id = $1`, [S(n)]))[0]

    it('abrir sesión crea la sesión y su primera vista, y reintentar no duplica', async () => {
      assert.strictEqual((await start(1, 'client-aaaa-1'))[0].created, true)
      assert.strictEqual((await start(1, 'client-aaaa-1'))[0].created, false)
      assert.strictEqual((await q(`SELECT count(*)::int n FROM analytics_page_views WHERE session_id=$1`, [S(1)]))[0].n, 1)
      const s = await session(1)
      assert.strictEqual(s.is_engaged, false)
      assert.strictEqual(s.is_new_visitor, true)
      assert.strictEqual(s.page_views_count, 1)
    })

    it('la segunda sesión del mismo navegador ya no es visitante nuevo', async () => {
      await start(2, 'client-aaaa-1')
      assert.strictEqual((await session(2)).is_new_visitor, false)
    })

    it('un latido no puede pasar del tiempo real de la sesión (un navegador que miente no infla el tiempo)', async () => {
      await q(`SELECT analytics_heartbeat($1, 'client-aaaa-1', 600)`, [S(1)])
      const s = await session(1)
      assert.ok(s.duration_seconds <= 6, `duration ${s.duration_seconds}`)
      assert.strictEqual(s.is_engaged, false)
    })

    it('10 segundos o más de tiempo activo vuelve activa la sesión', async () => {
      await q(`UPDATE analytics_sessions SET created_at = now() - interval '60 seconds' WHERE session_id = $1`, [S(1)])
      await q(`SELECT analytics_heartbeat($1, 'client-aaaa-1', 9)`, [S(1)])
      assert.strictEqual((await session(1)).is_engaged, false)
      await q(`SELECT analytics_heartbeat($1, 'client-aaaa-1', 10)`, [S(1)])
      const s = await session(1)
      assert.strictEqual(s.is_engaged, true)
      assert.strictEqual(s.duration_seconds, 10)
    })

    it('el tiempo nunca baja (una recarga manda menos segundos y no borra lo acumulado)', async () => {
      await q(`SELECT analytics_heartbeat($1, 'client-aaaa-1', 3)`, [S(1)])
      assert.strictEqual((await session(1)).duration_seconds, 10)
    })

    it('un latido de otro navegador no toca la sesión', async () => {
      await q(`UPDATE analytics_sessions SET created_at = now() - interval '60 seconds' WHERE session_id = $1`, [S(2)])
      await q(`SELECT analytics_heartbeat($1, 'client-intruso', 30)`, [S(2)])
      assert.strictEqual((await session(2)).duration_seconds, 0)
    })

    it('la segunda vista de página vuelve activa la sesión', async () => {
      await start(3, 'client-bbbb-2')
      assert.strictEqual((await session(3)).is_engaged, false)
      await q(`SELECT analytics_record_page_view($1, 'client-bbbb-2', '/saved', '{"page":"2"}')`, [S(3)])
      const s = await session(3)
      assert.strictEqual(s.page_views_count, 2)
      assert.strictEqual(s.is_engaged, true)
      assert.strictEqual(s.exit_path, '/saved')
      assert.strictEqual((await q(`SELECT count(*)::int n FROM analytics_page_views WHERE session_id=$1`, [S(3)]))[0].n, 2)
    })

    it('una vista con el navegador equivocado no se guarda', async () => {
      await q(`SELECT analytics_record_page_view($1, 'client-intruso', '/x', null)`, [S(3)])
      assert.strictEqual((await session(3)).page_views_count, 2)
    })

    it('un evento clave marca la sesión con conversión y activa; uno normal no', async () => {
      await start(4, 'client-cccc-3')
      await q(`SELECT analytics_record_event($1, 'client-cccc-3', 'scroll', '{}', false)`, [S(4)])
      let s = await session(4)
      assert.strictEqual(s.has_conversion, false)
      assert.strictEqual(s.is_engaged, false)
      await q(`SELECT analytics_record_event($1, 'client-cccc-3', 'user_registration_success', '{"method":"email"}', true)`, [S(4)])
      s = await session(4)
      assert.strictEqual(s.has_conversion, true)
      assert.strictEqual(s.is_engaged, true)
      assert.strictEqual((await q(`SELECT count(*)::int n FROM analytics_events WHERE session_id=$1`, [S(4)]))[0].n, 2)
      assert.deepStrictEqual((await q(`SELECT event_params FROM analytics_events WHERE event_name='user_registration_success'`))[0].event_params, { method: 'email' })
    })

    it('user stitching une TODAS las sesiones y eventos anónimos de ese navegador, y solo los suyos', async () => {
      const user = uuid(900)
      await q(`INSERT INTO users (id) VALUES ($1)`, [user])
      const joined = (await q(`SELECT analytics_stitch_user('client-aaaa-1', $1) AS n`, [user]))[0].n
      assert.strictEqual(joined, 2)
      assert.strictEqual((await session(1)).user_id, user)
      assert.strictEqual((await session(2)).user_id, user)
      assert.strictEqual((await session(3)).user_id, null, 'otro navegador no se toca')
      // los eventos de las sesiones unidas también
      await q(`SELECT analytics_record_event($1, 'client-aaaa-1', 'click_view_job_detail', '{}', false)`, [S(1)])
      // un segundo stitching no pisa a quien ya tiene dueño
      const other = uuid(901)
      await q(`INSERT INTO users (id) VALUES ($1)`, [other])
      assert.strictEqual((await q(`SELECT analytics_stitch_user('client-aaaa-1', $1) AS n`, [other]))[0].n, 0)
      assert.strictEqual((await session(1)).user_id, user)
    })

    it('los eventos anteriores al stitching también pasan a la persona', async () => {
      await start(5, 'client-dddd-4')
      await q(`SELECT analytics_record_event($1, 'client-dddd-4', 'click_view_job_detail', '{}', false)`, [S(5)])
      assert.strictEqual((await q(`SELECT user_id FROM analytics_events WHERE session_id=$1`, [S(5)]))[0].user_id, null)
      const user = uuid(902)
      await q(`INSERT INTO users (id) VALUES ($1)`, [user])
      await q(`SELECT analytics_stitch_user('client-dddd-4', $1)`, [user])
      assert.strictEqual((await q(`SELECT user_id FROM analytics_events WHERE session_id=$1`, [S(5)]))[0].user_id, user)
    })

    it('las funciones de lectura no son llamables por anon ni authenticated, solo por service_role', async () => {
      const rows = await q(`SELECT has_function_privilege('anon','analytics_stitch_user(text,uuid)','EXECUTE') a, has_function_privilege('authenticated','analytics_funnel(int)','EXECUTE') b, has_function_privilege('service_role','analytics_funnel(int)','EXECUTE') c`)
      assert.deepStrictEqual(rows[0], { a: false, b: false, c: true })
    })

    const uA = uuid(10), uB = uuid(11), team = uuid(12), test = uuid(13)
    const ins = async (n: number, client: string, daysAgo: number, o: Record<string, any> = {}) => {
      await c.query(
        `INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, utm_source, utm_medium, utm_campaign, referrer_host, is_engaged, has_conversion, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - ($11 || ' days')::interval)`,
        [S(n), client, o.user ?? null, o.path ?? '/vacantes/react', o.source ?? null, o.medium ?? null, o.campaign ?? null, o.ref ?? null, o.engaged ?? false, o.conv ?? false, String(daysAgo)],
      )
    }
    const ev = (n: number, name: string) => c.query(`INSERT INTO analytics_events (session_id, event_name) VALUES ($1,$2)`, [S(n), name])

    it('prepara los datos de lectura (gente real, equipo y pruebas)', async () => {
    await c.query(`DELETE FROM analytics_events; DELETE FROM analytics_page_views; DELETE FROM analytics_sessions; DELETE FROM users;`)
    await c.query(`INSERT INTO users (id, user_kind) VALUES ($1,'user'),($2,'user'),($3,'superadmin'),($4,'user')`, [uA, uB, team, test])
    await c.query(`UPDATE users SET is_test_account = true WHERE id = $1`, [test])
    await ins(21, 'c-ana', 0, { user: uA, engaged: true, source: 'linkedin', medium: 'social', campaign: 'vacante-auto', ref: 'linkedin.com' })
    await ins(22, 'c-ana', 1, { user: uA, engaged: true, source: 'linkedin', medium: 'social', campaign: 'vacante-auto', ref: 'linkedin.com' })
    await ins(23, 'c-beto', 0, { user: uB, engaged: true, path: '/' })
    await ins(24, 'c-anon1', 0, { engaged: false, path: '/' })
    await ins(25, 'c-anon2', 0, { engaged: true, path: '/vacantes/react', ref: 'google.com', conv: true })
    await ins(26, 'c-team', 0, { user: team, engaged: true })          // el equipo no cuenta
    await ins(27, 'c-test', 0, { user: test, engaged: true })          // las pruebas no cuentan
    await ins(28, 'c-viejo', 20, { engaged: true, path: '/vacantes/node' }) // hace 20 días: entra al MAU de hoy, no al WAU
    await ev(21, 'click_view_job_detail'); await ev(21, 'click_start_apply'); await ev(21, 'user_registration_success')
    await ev(23, 'click_view_job_detail')
    await ev(25, 'click_view_job_detail'); await ev(25, 'click_start_apply')
    })

    it('DAU, WAU y MAU de hoy cuentan personas distintas, sin el equipo ni las pruebas', async () => {
      const rows = await q(`SELECT * FROM analytics_active_users(30)`)
      const today = rows[rows.length - 1]
      // hoy activas: ana, beto, anon2 = 3. WAU: + (ana ayer ya cuenta) = 3. MAU: + viejo = 4.
      assert.strictEqual(today.dau, 3, `dau ${today.dau}`)
      assert.strictEqual(today.wau, 3, `wau ${today.wau}`)
      assert.strictEqual(today.mau, 4, `mau ${today.mau}`)
      assert.strictEqual(rows.length, 30)
    })

    it('el embudo da el paso a paso, el avance y el abandono', async () => {
      const rows = await q(`SELECT * FROM analytics_funnel(7)`)
      const people = rows.map((r) => r.people)
      // entraron: ana, beto, anon1, anon2 = 4; vieron detalle: ana, beto, anon2 = 3; empezaron: ana, anon2 = 2; convirtieron: ana = 1
      assert.deepStrictEqual(people, [4, 3, 2, 1])
      assert.strictEqual(Number(rows[1].from_previous_pct), 75)
      assert.strictEqual(Number(rows[1].dropoff_pct), 25)
      assert.strictEqual(Number(rows[3].from_start_pct), 25)
      assert.strictEqual(rows[0].from_previous_pct, null)
    })

    it('rendimiento por página de entrada: sesiones, activos, engagement y conversión', async () => {
      const rows = await q(`SELECT * FROM analytics_landing_performance(7)`)
      const react = rows.find((r) => r.entry_path === '/vacantes/react')
      // /vacantes/react (7 días): ana x2, anon2 = 3 sesiones, las 3 activas, 1 conversión
      assert.strictEqual(react.sessions, 3)
      assert.strictEqual(react.active_users, 2)
      assert.strictEqual(Number(react.engagement_rate), 100)
      assert.strictEqual(react.conversions, 1)
      assert.strictEqual(Number(react.conversion_rate), 33.3)
      const home = rows.find((r) => r.entry_path === '/')
      assert.strictEqual(home.sessions, 2)
      assert.strictEqual(Number(home.engagement_rate), 50)
      assert.ok(!rows.some((r) => r.entry_path === '/vacantes/node'), 'fuera del periodo')
    })

    it('atribución por canal: utm, sitio de referencia y directo', async () => {
      const rows = await q(`SELECT * FROM analytics_channels(7)`)
      const linkedin = rows.find((r) => r.source === 'linkedin')
      assert.deepStrictEqual([linkedin.medium, linkedin.campaign, linkedin.sessions], ['social', 'vacante-auto', 2])
      const google = rows.find((r) => r.source === 'google.com')
      assert.deepStrictEqual([google.medium, google.conversions], ['referral', 1])
      assert.ok(rows.some((r) => r.source === '(direct)' && r.medium === '(none)'))
    })

    it('cohortes: la semana de adquisición y quién volvió, ya con las visitas anónimas unidas a la persona', async () => {
      // Una persona anónima que vino hace 14 días y luego se registró: tras el stitching es UNA persona.
      await c.query(`DELETE FROM analytics_events; DELETE FROM analytics_page_views; DELETE FROM analytics_sessions;`)
      await ins(31, 'c-lucia', 14, { engaged: true })
      await ins(32, 'c-lucia', 0, { engaged: true })
      await c.query(`SELECT analytics_stitch_user('c-lucia', $1)`, [uA])
      await ins(33, 'c-otro', 0, { engaged: true })
      const rows = await q(`SELECT * FROM analytics_retention_cohorts(8)`)
      const byWeek: Record<string, any[]> = {}
      for (const r of rows) (byWeek[new Date(r.cohort_week).toISOString().slice(0, 10)] ||= []).push(r)
      const weeks = Object.keys(byWeek).sort()
      assert.strictEqual(weeks.length, 2, JSON.stringify(weeks))
      const first = byWeek[weeks[0]]
      assert.strictEqual(first[0].cohort_size, 1)
      assert.strictEqual(first[0].week_offset, 0)
      assert.strictEqual(first[0].retained, 1)
      // volvió 2 semanas después
      const back = first.find((r) => r.week_offset === 2)
      assert.ok(back && back.retained === 1 && Number(back.retained_pct) === 100, JSON.stringify(first))
      const mid = first.find((r) => r.week_offset === 1)
      assert.strictEqual(mid.retained, 0)
    })

    it('sin datos todo da cero o vacío, sin dividir entre cero', async () => {
      await c.query(`DELETE FROM analytics_events; DELETE FROM analytics_page_views; DELETE FROM analytics_sessions;`)
      assert.strictEqual((await q(`SELECT * FROM analytics_active_users(7)`)).every((r) => r.dau === 0), true)
      const f = await q(`SELECT * FROM analytics_funnel(7)`)
      assert.deepStrictEqual(f.map((r) => r.people), [0, 0, 0, 0])
      assert.strictEqual((await q(`SELECT * FROM analytics_landing_performance(7)`)).length, 0)
    })

    // ---------- el detalle: mapa, idioma, dispositivos, páginas y eventos ----------
    it('detalle: la sesión guarda la posición de la ciudad y el resto de lo que llega', async () => {
      await c.query(`DELETE FROM analytics_events; DELETE FROM analytics_page_views; DELETE FROM analytics_sessions; DELETE FROM users;`)
      await start(41, 'cd-1', { city: 'Monterrey', region: 'NLE', country: 'MX', latitude: '25.6866', longitude: '-100.3161', language: 'es-MX', operating_system: 'Windows', browser: 'Chrome', screen_resolution: '1920x1080', timezone: 'America/Monterrey' })
      const row = (await q(`SELECT latitude, longitude, language, screen_resolution FROM analytics_sessions WHERE session_id = $1`, [S(41)]))[0]
      assert.strictEqual(Number(row.latitude), 25.6866)
      assert.strictEqual(Number(row.longitude), -100.3161)
      assert.strictEqual(row.language, 'es-MX')
      assert.strictEqual(row.screen_resolution, '1920x1080')
    })

    it('detalle: la vista nueva también trae la posición', async () => {
      const row = (await q(`SELECT latitude FROM analytics_real_sessions WHERE session_id = $1`, [S(41)]))[0]
      assert.strictEqual(Number(row.latitude), 25.6866)
    })

    it('detalle: desglose por idioma, dispositivo, nuevo o recurrente, con engagement y duración', async () => {
      await start(42, 'cd-2', { city: 'Bogotá', country: 'CO', latitude: '4.711', longitude: '-74.0721', language: 'es-CO', device_category: 'mobile', operating_system: 'Android' })
      await start(43, 'cd-2', { city: 'Bogotá', country: 'CO', latitude: '4.711', longitude: '-74.0721', language: 'es-CO', device_category: 'mobile', operating_system: 'Android' })
      await q(`UPDATE analytics_sessions SET created_at = now() - interval '60 seconds' WHERE session_id = $1`, [S(41)])
      await q(`SELECT analytics_heartbeat($1, 'cd-1', 20)`, [S(41)])

      const lang = await q(`SELECT * FROM analytics_dimension(7, 'language')`)
      assert.deepStrictEqual(lang.map((r: any) => [r.value, r.sessions]), [['es-CO', 2], ['es-MX', 1]])
      const mx = lang.find((r: any) => r.value === 'es-MX')
      assert.strictEqual(mx.engaged, 1)
      assert.strictEqual(Number(mx.engagement_rate), 100)
      assert.strictEqual(mx.avg_duration_seconds, 20)

      const device = await q(`SELECT * FROM analytics_dimension(7, 'device_category')`)
      assert.deepStrictEqual(device.map((r: any) => [r.value, r.sessions]), [['mobile', 2], ['desktop', 1]])

      const visitor = await q(`SELECT * FROM analytics_dimension(7, 'visitor_type')`)
      assert.deepStrictEqual(Object.fromEntries(visitor.map((r: any) => [r.value, r.sessions])), { Nuevo: 2, Recurrente: 1 })
    })

    it('detalle: ciudades y países con nombre legible, y lo que no se sabe sale como (sin dato)', async () => {
      await start(44, 'cd-3', { language: null, city: null, region: null, country: null, latitude: null, longitude: null })
      const city = await q(`SELECT * FROM analytics_dimension(7, 'city')`)
      assert.strictEqual(city[0].value, 'Bogotá, CO')
      assert.ok(city.some((r: any) => r.value === 'Monterrey, MX'))
      assert.ok(city.some((r: any) => r.value === '(sin dato)'))
      const lang = await q(`SELECT * FROM analytics_dimension(7, 'language')`)
      assert.ok(lang.some((r: any) => r.value === '(sin dato)'))
    })

    it('detalle: un desglose que no está en la lista cerrada no devuelve nada (no se arma SQL con lo que llegue)', async () => {
      assert.strictEqual((await q(`SELECT * FROM analytics_dimension(7, 'user_id; DROP TABLE users')`)).length, 0)
      assert.strictEqual((await q(`SELECT * FROM analytics_dimension(7, 'client_id')`)).length, 0)
    })

    it('detalle: los puntos del mapa traen ciudad, coordenadas y cuánta gente', async () => {
      const points = await q(`SELECT * FROM analytics_geo_points(7)`)
      const bogota = points.find((r: any) => r.city === 'Bogotá')
      assert.deepStrictEqual([bogota.country, bogota.sessions, bogota.people], ['CO', 2, 1])
      assert.strictEqual(Number(bogota.latitude), 4.711)
      // una sesión sin coordenadas no puede dibujarse: no sale
      assert.ok(!points.some((r: any) => r.city === null))
    })

    it('detalle: páginas vistas con sus entradas y salidas', async () => {
      await q(`SELECT analytics_record_page_view($1, 'cd-1', '/saved', null)`, [S(41)])
      await q(`SELECT analytics_record_page_view($1, 'cd-1', '/vacantes/react', null)`, [S(41)])
      const pages = await q(`SELECT * FROM analytics_pages(7)`)
      const react = pages.find((r: any) => r.path === '/vacantes/react')
      // /vacantes/react: la entrada de 4 sesiones (41..44) + la vista de 41 al final = 5 vistas. Salidas: la de la 41 y las 3
      // sesiones de una sola página (entran y salen ahí).
      assert.strictEqual(react.views, 5)
      assert.strictEqual(react.entries, 4)
      assert.strictEqual(react.exits, 4)
      const saved = pages.find((r: any) => r.path === '/saved')
      assert.deepStrictEqual([saved.views, saved.entries, saved.exits], [1, 0, 0])
    })

    it('detalle: resumen de eventos con cuántas veces y a cuánta gente, y cuáles son clave', async () => {
      await q(`SELECT analytics_record_event($1, 'cd-1', 'click_view_job_detail', '{}', false)`, [S(41)])
      await q(`SELECT analytics_record_event($1, 'cd-2', 'click_view_job_detail', '{}', false)`, [S(42)])
      await q(`SELECT analytics_record_event($1, 'cd-2', 'click_external_apply', '{}', true)`, [S(42)])
      const events = await q(`SELECT * FROM analytics_events_summary(7)`)
      const view = events.find((r: any) => r.event_name === 'click_view_job_detail')
      assert.deepStrictEqual([view.events, view.people, view.is_conversion], [2, 2, false])
      assert.strictEqual(events.find((r: any) => r.event_name === 'click_external_apply').is_conversion, true)
    })

    it('detalle: las funciones nuevas tampoco las puede llamar anon ni authenticated', async () => {
      const row = (await q(`SELECT has_function_privilege('anon','analytics_dimension(int,text,int)','EXECUTE') a, has_function_privilege('authenticated','analytics_geo_points(int,int)','EXECUTE') b, has_function_privilege('service_role','analytics_pages(int,int)','EXECUTE') c`))[0]
      assert.deepStrictEqual(row, { a: false, b: false, c: true })
    })
})
