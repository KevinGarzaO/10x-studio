import type { Queryable } from './queries'

/**
 * Las consultas de producto del servidor MCP: retención y cohortes, personas nuevas contra recurrentes, de dónde llegan los registros,
 * el ritmo de la semana y la velocidad del servidor. Igual que el resto: SQL fijo con parámetros, solo lectura y agregado (nunca
 * una persona, un correo ni una cuenta). Las reglas de lectura (la base de cada día, los percentiles) repiten las del backend
 * (packages/core/services/analytics/rhythm.ts y packages/core/services/performance/api-timing.ts) porque este paquete va aparte.
 */

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value as number), min), max) : fallback
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places
const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value))
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : null)
const dayText = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))

/** El inicio del periodo (primer día de Monterrey) como instante, para las funciones que reciben un rango. */
const PERIOD_START = `(analytics_period_start($1)::timestamp AT TIME ZONE 'America/Monterrey')`

// ------------------------------------------------------------------------------------------------
// Retención, cohortes y personas nuevas contra recurrentes
// ------------------------------------------------------------------------------------------------

export interface RetentionAndCohorts {
  days: number
  /** Las personas del periodo con la definición única del panel. */
  people: {
    visitors: number
    newPeople: number
    newActive: number
    returningActive: number
    visitOnly: number
    registeredNew: number
    /** Registradas nuevas ÷ nuevas activas. Una persona recurrente que se registra no cuenta. */
    conversionPct: number | null
  }
  /** Personas activas por día, por semana (7 días) y por mes (30 días). */
  activeUsers: { day: string; dau: number; wau: number; mau: number }[]
  /** De las personas activas cuya primera visita fue antes de hoy: cuántas volvieron a otro día. */
  returning: { activePeople: number; eligible: number; returned: number; returnedPct: number | null; avgActiveDays: number | null; registeredActive: number }
  /** Cada semana de llegada: cuántas personas fueron y qué % estuvo activa N semanas después. */
  cohorts: { cohortWeek: string; size: number; weeks: { offset: number; retained: number; pct: number | null }[] }[]
  note: string
}

export async function getRetentionAndCohorts(db: Queryable, input: { days?: number; weeks?: number } = {}): Promise<RetentionAndCohorts> {
  const days = clamp(input.days, 1, 90, 30)
  const weeks = clamp(input.weeks, 1, 12, 8)

  const [segments, active, cohorts, returning] = await Promise.all([
    db.query<Record<string, any>>(`SELECT * FROM analytics_segments(${PERIOD_START}, now(), 'all', 1)`, [days]),
    db.query<{ day: unknown; dau: number; wau: number; mau: number }>('SELECT * FROM analytics_active_users($1)', [days]),
    db.query<{ cohort_week: unknown; cohort_size: number; week_offset: number; retained: number; retained_pct: string | null }>('SELECT * FROM analytics_retention_cohorts($1)', [weeks]),
    db.query<Record<string, any>>(
      `SELECT COUNT(*)::int AS active_people,
              COUNT(*) FILTER (WHERE first_day < (NOW() AT TIME ZONE 'America/Monterrey')::date)::int AS eligible,
              COUNT(*) FILTER (WHERE first_day < (NOW() AT TIME ZONE 'America/Monterrey')::date AND return_days > 0)::int AS returned,
              ROUND(AVG(days_active), 1) AS avg_active_days,
              COUNT(*) FILTER (WHERE is_registered)::int AS registered_active
       FROM analytics_people_activity($1, 100000)`,
      [days],
    ),
  ])

  const all = segments.rows[0] ?? {}
  const newActive = num(all.new_active)
  const people = {
    visitors: num(all.people),
    newPeople: num(all.new_people),
    newActive,
    returningActive: num(all.returning_active),
    visitOnly: Math.max(0, num(all.people) - num(all.active)),
    registeredNew: num(all.registered_new),
    conversionPct: pct(num(all.registered_new), newActive),
  }

  const r = returning.rows[0] ?? {}
  const byCohort = new Map<string, { size: number; weeks: { offset: number; retained: number; pct: number | null }[] }>()
  for (const row of cohorts.rows) {
    const key = dayText(row.cohort_week)
    const entry = byCohort.get(key) ?? { size: num(row.cohort_size), weeks: [] }
    entry.weeks.push({ offset: num(row.week_offset), retained: num(row.retained), pct: row.retained_pct === null ? null : num(row.retained_pct) })
    byCohort.set(key, entry)
  }

  return {
    days,
    people,
    activeUsers: active.rows.map((row) => ({ day: dayText(row.day), dau: num(row.dau), wau: num(row.wau), mau: num(row.mau) })),
    returning: {
      activePeople: num(r.active_people),
      eligible: num(r.eligible),
      returned: num(r.returned),
      returnedPct: pct(num(r.returned), num(r.eligible)),
      avgActiveDays: r.avg_active_days === null || r.avg_active_days === undefined ? null : num(r.avg_active_days),
      registeredActive: num(r.registered_active),
    },
    cohorts: [...byCohort.entries()].map(([cohortWeek, value]) => ({ cohortWeek, size: value.size, weeks: value.weeks })),
    note:
      'Personas con la definición única del panel (activa = 10 s visibles, 2 páginas o un evento clave; nueva = primera visita o cuenta dentro del periodo). ' +
      'La medición de sesiones empezó el 30 de octubre de 2026: una persona "volvió" solo si estuvo activa otro día después de su primera visita, y casi nadie ha tenido tiempo de hacerlo. ' +
      'Con pocas personas, un porcentaje de retención de una cohorte es de casi nada: mira siempre el tamaño de la cohorte.',
  }
}

// ------------------------------------------------------------------------------------------------
// De dónde llegan los registros
// ------------------------------------------------------------------------------------------------

export interface SignupSources {
  days: number
  /** Cuentas reales creadas en el periodo (viene de `users`; tiene más historia que la medición de sesiones). */
  realAccountsCreated: number
  /** Por canal (origen / medio / campaña): personas nuevas activas, las que se registraron y la conversión. */
  channels: SourceRow[]
  /** Por publicación de LinkedIn (utm_content): lo mismo, de las vacantes que se publicaron. */
  linkedinPosts: SourceRow[]
  /** Todo lo que llegó de LinkedIn junto. */
  linkedinTotal: SourceRow | null
  note: string
}

interface SourceRow {
  source: string
  people: number
  newActive: number
  registeredNew: number
  conversionPct: number | null
  activePeople: number
}

const sourceRow = (row: Record<string, any>): SourceRow => ({
  source: String(row.grp),
  people: num(row.people),
  newActive: num(row.new_active),
  registeredNew: num(row.registered_new),
  conversionPct: pct(num(row.registered_new), num(row.new_active)),
  activePeople: num(row.active),
})

export async function getSignupSources(db: Queryable, input: { days?: number; limit?: number } = {}): Promise<SignupSources> {
  const days = clamp(input.days, 1, 90, 30)
  const limit = clamp(input.limit, 1, 30, 12)

  const [created, channels, posts, linkedin] = await Promise.all([
    db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE created_at >= ${PERIOD_START} AND NOT COALESCE(is_test_account, false) AND NOT COALESCE(is_scraper_profile, false) AND COALESCE(user_kind, 'user') = 'user'`,
      [days],
    ),
    db.query<Record<string, any>>(`SELECT * FROM analytics_segments(${PERIOD_START}, now(), 'channel', $2) ORDER BY new_active DESC, people DESC`, [days, limit]),
    db.query<Record<string, any>>(`SELECT * FROM analytics_segments(${PERIOD_START}, now(), 'linkedin_post', $2) ORDER BY new_active DESC, people DESC`, [days, limit]),
    db.query<Record<string, any>>(`SELECT * FROM analytics_segments(${PERIOD_START}, now(), 'linkedin', 1)`, [days]),
  ])

  return {
    days,
    realAccountsCreated: num(created.rows[0]?.n),
    channels: channels.rows.map(sourceRow),
    linkedinPosts: posts.rows.map(sourceRow),
    linkedinTotal: linkedin.rows[0] ? sourceRow(linkedin.rows[0]) : null,
    note:
      'Una persona cuenta una vez en cada canal que visitó, por eso los canales no suman el total. La conversión es registradas nuevas ÷ nuevas activas de ese canal. ' +
      'El origen sale de las sesiones (desde el 30 de octubre de 2026); las cuentas creadas antes no tienen origen aquí. "(direct)" mezcla visitas sin origen conocido, incluidas pruebas propias y robots que no se filtraron. ' +
      'Con tan pocas personas por canal, una conversión de 0 % o 100 % casi siempre es azar.',
  }
}

// ------------------------------------------------------------------------------------------------
// Ritmo de la semana
// ------------------------------------------------------------------------------------------------

const BASELINE_WEEKS = 4
const MIN_SAMPLES = 3
const SLOW_RATIO = 0.5
const MIN_BASELINE_FOR_FLAG = 4
const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export type DayStatus = 'flojo' | 'normal' | 'sin_base' | 'en_curso' | 'parcial'

export interface WeeklyRhythm {
  days: number
  days_detail: {
    day: string
    weekday: string
    active: number
    newActive: number
    /** Personas activas que ya tenían cuenta de un día anterior (nuestra gente que volvió). */
    membersActive: number
    origins: { linkedin: number; email: number; direct: number; other: number }
    visitOnly: number
    registrations: number
    /** Mediana del mismo día de la semana en las semanas anteriores; null si hay menos de 3. */
    baseline: number | null
    baselineSamples: number
    vsBaselinePct: number | null
    status: DayStatus
  }[]
  slowDays: string[]
  /** Las horas (hora de Monterrey) con más personas activas en promedio por cada vez que pasó esa hora. */
  busiestHours: { weekday: string; hour: number; averageActive: number; timesMeasured: number }[]
  note: string
}

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function getWeeklyRhythm(db: Queryable, input: { days?: number } = {}): Promise<WeeklyRhythm> {
  const days = clamp(input.days, 7, 90, 30)
  const [rows, heat] = await Promise.all([
    // Se piden también las semanas anteriores al periodo para que el primer día mostrado ya tenga su base.
    db.query<Record<string, any>>('SELECT * FROM analytics_rhythm_days($1)', [Math.max(days, 35)]),
    db.query<{ dow: number; hour: number; people: number; occurrences: number }>('SELECT * FROM analytics_rhythm_heatmap($1)', [days]),
  ])

  const all = rows.rows
  const judged = all.map((row, index) => {
    const comparable = all
      .slice(0, index)
      .filter((earlier) => earlier.dow === row.dow && !earlier.is_partial && !earlier.is_today)
      .slice(-BASELINE_WEEKS)
      .map((earlier) => num(earlier.active))
    const base = median(comparable)
    const enough = comparable.length >= MIN_SAMPLES
    const active = num(row.active)
    let status: DayStatus
    if (row.is_partial) status = 'parcial'
    else if (row.is_today) status = 'en_curso'
    else if (!enough) status = 'sin_base'
    else status = base !== null && base >= MIN_BASELINE_FOR_FLAG && active < base * SLOW_RATIO ? 'flojo' : 'normal'
    return {
      day: dayText(row.day),
      weekday: WEEKDAY[num(row.dow)],
      active,
      newActive: num(row.new_active),
      membersActive: num(row.members_active),
      origins: { linkedin: num(row.from_linkedin), email: num(row.from_email), direct: num(row.from_direct), other: num(row.from_other) },
      visitOnly: num(row.visit_only),
      registrations: num(row.registrations),
      baseline: enough && base !== null ? round(base) : null,
      baselineSamples: comparable.length,
      vsBaselinePct: enough && base !== null && base > 0 ? Math.round(((active - base) / base) * 100) : null,
      status,
    }
  })
  const shown = judged.slice(-days)

  const busiestHours = heat.rows
    .filter((cell) => num(cell.occurrences) > 0 && num(cell.people) > 0)
    .map((cell) => ({ weekday: WEEKDAY[num(cell.dow)], hour: num(cell.hour), averageActive: round(num(cell.people) / num(cell.occurrences), 2), timesMeasured: num(cell.occurrences) }))
    .sort((a, b) => b.averageActive - a.averageActive || b.timesMeasured - a.timesMeasured)
    .slice(0, 8)

  return {
    days,
    days_detail: shown,
    slowDays: shown.filter((day) => day.status === 'flojo').map((day) => day.day),
    busiestHours,
    note:
      'Cada día contra la mediana del MISMO día de la semana en las últimas 4 semanas, solo si hay al menos 3 ("sin_base" si no). Día flojo = menos de la mitad de lo normal y una normal de 4 personas o más. ' +
      'El primer día de la medición (empezó a media jornada) y el día en curso no se juzgan. Las horas son de Monterrey y una sesión cuenta en la hora en que empezó. ' +
      'El promedio por hora usa solo horas completas desde el 30 de octubre de 2026; con pocas veces medidas, es ruido.',
  }
}

// ------------------------------------------------------------------------------------------------
// Velocidad del servidor
// ------------------------------------------------------------------------------------------------

const BUCKET_LIMITS_MS = [50, 100, 250, 500, 1000, 2500, 5000]

/** El límite superior del rango donde cae la fracción `q` de las peticiones; el último rango usa el máximo. */
export function percentileMs(buckets: number[], q: number, maxMs: number): number {
  const total = buckets.reduce((sum, count) => sum + count, 0)
  if (total === 0) return 0
  const target = Math.ceil(total * q)
  let seen = 0
  for (let index = 0; index < buckets.length; index++) {
    seen += buckets[index]
    if (seen >= target) return index < BUCKET_LIMITS_MS.length ? Math.min(BUCKET_LIMITS_MS[index], Math.max(maxMs, 1)) : maxMs
  }
  return maxMs
}

export interface ServerSpeed {
  hours: number
  routes: {
    method: string
    route: string
    requests: number
    errors: number
    errorPct: number
    avgMs: number
    /** Estimados con rangos de tiempo: "hasta N ms". */
    p50Ms: number
    p95Ms: number
    maxMs: number
    totalSeconds: number
    shareOfServerTimePct: number
    slow: boolean
  }[]
  note: string
}

export async function getServerSpeed(db: Queryable, input: { days?: number; routeContains?: string; limit?: number } = {}): Promise<ServerSpeed> {
  const days = clamp(input.days, 1, 30, 1)
  const limit = clamp(input.limit, 1, 60, 15)
  const filter = (input.routeContains ?? '').trim().toLowerCase()
  if (filter && !/^[a-z0-9/_:.-]{1,60}$/.test(filter)) throw new Error('routeContains solo acepta letras, números y / _ : . - (por ejemplo "community/posts").')

  const { rows } = await db.query<Record<string, any>>('SELECT * FROM api_timing_summary($1)', [days * 24])
  const grandTotal = rows.reduce((sum, row) => sum + num(row.sum_ms), 0)

  const routes = rows
    .filter((row) => !filter || String(row.route).toLowerCase().includes(filter))
    .map((row) => {
      const requests = num(row.requests)
      const buckets = [row.b0, row.b1, row.b2, row.b3, row.b4, row.b5, row.b6, row.b7].map(num)
      const p95Ms = percentileMs(buckets, 0.95, num(row.max_ms))
      return {
        method: String(row.method),
        route: String(row.route),
        requests,
        errors: num(row.errors),
        errorPct: requests ? round((num(row.errors) / requests) * 100) : 0,
        avgMs: requests ? Math.round(num(row.sum_ms) / requests) : 0,
        p50Ms: percentileMs(buckets, 0.5, num(row.max_ms)),
        p95Ms,
        maxMs: num(row.max_ms),
        totalSeconds: round(num(row.sum_ms) / 1000),
        shareOfServerTimePct: grandTotal ? round((num(row.sum_ms) / grandTotal) * 100) : 0,
        slow: p95Ms > 1000,
      }
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, limit)

  return {
    hours: days * 24,
    routes,
    note:
      'Tiempo del servidor por ruta (desde el 1 de noviembre de 2026), ordenado por el tiempo total que consume. La mediana y el p95 son ESTIMADOS con rangos de tiempo (50, 100, 250, 500, 1000, 2500 y 5000 ms): léelos como "hasta N ms". ' +
      'Una ruta es lenta si su p95 pasa de 1 s. Esto es solo el servidor: lo que tarda la pantalla en el navegador (feed y vacante) está en get_flow_performance_analysis como view_feed y view_vacancy.',
  }
}
