import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

/**
 * Ritmo de la semana (backend/sql/web-analytics-rhythm-migration.sql) contra un Postgres de verdad (PGlite), con las migraciones reales
 * de analítica debajo. Las sesiones se ponen a horas conocidas de Monterrey en los últimos días.
 */
const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../sql', name), 'utf8')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TZ = 'America/Monterrey'

describe('web-analytics-rhythm-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows

  /** Una sesión `daysAgo` días atrás (día de Monterrey) a las `hour`:`minute` de Monterrey. */
  const session = (n: number, client: string, daysAgo: number, hour: number, o: { engaged?: boolean; user?: string; source?: string; referrer?: string } = {}) =>
    db.query(
      `INSERT INTO analytics_sessions (session_id, client_id, user_id, entry_path, is_engaged, utm_source, referrer_host, created_at)
       VALUES ($1, $2, $3, '/', $4, $5, $6,
               ((date_trunc('day', now() AT TIME ZONE '${TZ}') - ($7 || ' days')::interval) + ($8 || ' hours')::interval + interval '10 minutes') AT TIME ZONE '${TZ}')`,
      [uuid(100 + n), client, o.user ?? null, o.engaged ?? true, o.source ?? null, o.referrer ?? null, String(daysAgo), String(hour)],
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY, is_test_account boolean DEFAULT false, is_scraper_profile boolean DEFAULT false, user_kind text DEFAULT 'user', created_at timestamptz DEFAULT now())`)
    for (const file of ['web-analytics-migration.sql', 'web-analytics-rhythm-migration.sql']) await db.exec(read(file))
    await db.exec(read('web-analytics-rhythm-migration.sql')) // idempotente

    // Una cuenta real que ya existía desde hace 10 días, el equipo y una cuenta que se crea ayer.
    await db.exec(`INSERT INTO users (id, user_kind, created_at) VALUES ('${uuid(1)}', 'user', now() - interval '10 days'), ('${uuid(2)}', 'superadmin', now() - interval '10 days')`)
    await db.exec(`INSERT INTO users (id, user_kind, created_at) VALUES ('${uuid(3)}', 'user', now() - interval '1 day')`)

    // La medición empieza hace 3 días a las 0:10 (ese día queda parcial).
    await session(0, 'client-start-0', 3, 0, { engaged: false })
    // Hace 2 días: una persona activa que llegó de LinkedIn.
    await session(1, 'client-aaaa-1', 2, 9, { source: 'linkedin' })
    // Ayer a las 10: dos personas activas (LinkedIn por referencia, y directo), otra que se fue sin hacer nada, y el equipo.
    await session(2, 'client-bbbb-2', 1, 10, { referrer: 'www.linkedin.com' })
    await session(3, 'client-cccc-3', 1, 10)
    await session(4, 'client-dddd-4', 1, 10, { engaged: false })
    await session(5, 'client-team', 1, 10, { user: uuid(2) })
    // Ayer: una cuenta de hace 10 días que volvió (nuestra gente) y una que se registró ayer y entró.
    await session(6, 'client-eeee-5', 1, 15, { user: uuid(1), source: 'email' })
    await session(7, 'client-ffff-6', 1, 16, { user: uuid(3) })
  }, 90000)

  afterAll(async () => { await db?.close() })

  const days = () => q(`SELECT *, day::text AS day_text FROM analytics_rhythm_days(35)`)

  it('has one row per day from the first measured day to today, marks today and the partial first day', async () => {
    const rows = await days()
    expect(rows).toHaveLength(4)
    expect(rows[0].is_partial).toBe(true)
    expect(rows[1].is_partial).toBe(false)
    expect(rows[3].is_today).toBe(true)
    expect(rows[3].active).toBe(0)
  })

  it('counts active people apart from visits that did nothing, without the team', async () => {
    const [, twoAgo, yesterday] = await days()
    expect(twoAgo.active).toBe(1)
    expect(twoAgo.from_linkedin).toBe(1)
    // ayer: bbbb (LinkedIn), cccc (directo), eeee (correo), ffff (directo, cuenta nueva); dddd solo visitó; el equipo no cuenta
    expect(yesterday.active).toBe(4)
    expect(yesterday.visit_only).toBe(1)
    expect(yesterday.sessions).toBe(5)
    expect(yesterday.from_linkedin).toBe(1)
    expect(yesterday.from_email).toBe(1)
    expect(yesterday.from_direct).toBe(2)
    expect(yesterday.from_linkedin + yesterday.from_email + yesterday.from_direct + yesterday.from_other).toBe(yesterday.active)
  })

  it('separates new people from the ones who already had an account, and counts the registrations of the day', async () => {
    const [, , yesterday] = await days()
    // nuevas ayer: bbbb, cccc, ffff (su cuenta es de ayer); eeee ya tenía cuenta de hace 10 días
    expect(yesterday.new_active).toBe(3)
    expect(yesterday.members_active).toBe(1)
    expect(yesterday.registrations).toBe(1)
  })

  it('builds the heat map from complete hours only, with the occurrences that make an average fair', async () => {
    const [yesterday] = await q(`SELECT EXTRACT(dow FROM (now() AT TIME ZONE '${TZ}')::date - 1)::int AS dow`)
    const rows = await q(`SELECT * FROM analytics_rhythm_heatmap(35)`)
    const cell = (dow: number, hour: number) => rows.find((row) => row.dow === dow && row.hour === hour)

    // ayer a las 10: bbbb y cccc (eeee y ffff son a las 15 y 16)
    expect(cell(yesterday.dow, 10)).toMatchObject({ people: 2, occurrences: 1 })
    expect(cell(yesterday.dow, 15)).toMatchObject({ people: 1 })
    // una hora en que nadie entró sí cuenta como hora medida, con cero
    expect(cell(yesterday.dow, 12)).toMatchObject({ people: 0, occurrences: 1 })
    // la hora 0 del primer día (la medición empezó 0:10) no existe: no se inventa una hora sin gente
    const [first] = await q(`SELECT EXTRACT(dow FROM (now() AT TIME ZONE '${TZ}')::date - 3)::int AS dow`)
    expect(cell(first.dow, 0)?.occurrences ?? 0).toBe(0)
    // y las horas que aún no terminan hoy tampoco
    const [now] = await q(`SELECT EXTRACT(dow FROM now() AT TIME ZONE '${TZ}')::int AS dow, EXTRACT(hour FROM now() AT TIME ZONE '${TZ}')::int AS hour`)
    expect(cell(now.dow, now.hour)).toBeUndefined() // en 3 días de medición esa misma hora de ese día de la semana solo existe hoy, y no ha terminado
  })

  it('functions are closed to the public roles', async () => {
    const rows = await q(`SELECT has_function_privilege('anon', 'analytics_rhythm_days(int)', 'EXECUTE') AS anon, has_function_privilege('service_role', 'analytics_rhythm_days(int)', 'EXECUTE') AS service`)
    expect(rows[0]).toEqual({ anon: false, service: true })
  })
})
