import type { Queryable } from './queries'

/**
 * Las consultas de telemetría del servidor MCP: errores (con el video de Clarity) y flujos críticos.
 * Igual que el resto: SQL fijo con parámetros, solo lectura y agregado (nada de correos ni nombres).
 */

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value as number), min), max) : fallback
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places

// ------------------------------------------------------------------------------------------------
// Errores con el video de Clarity
// ------------------------------------------------------------------------------------------------

export interface ErrorLogs {
  days: number
  totalOccurrences: number
  errors: {
    name: string
    message: string
    path: string
    source: string
    occurrences: number
    peopleAffected: number
    firstSeen: string
    lastSeen: string
    /** Las primeras líneas del stack ya separadas (del código empaquetado, no del fuente). */
    topFrames: { file: string; fn: string | null; line: number | null; col: number | null }[]
    /** El video de Clarity de la sesión más reciente donde pasó (null si ninguna se grabó). */
    clarityUrl: string | null
    /** En qué segundo de esa sesión falló: para saltar a ese momento del video. */
    secondsIntoSession: number | null
  }[]
  note: string | null
}

export async function getErrorLogsWithClarityVideo(db: Queryable, input: { days?: number; limit?: number; path?: string } = {}): Promise<ErrorLogs> {
  const days = clamp(input.days, 1, 90, 7)
  const limit = clamp(input.limit, 1, 50, 15)
  const path = input.path?.trim() || null
  if (path && (path.length > 300 || !path.startsWith('/'))) throw new Error('La ruta debe empezar con "/" (por ejemplo /vacantes/mi-vacante).')

  const result = await db.query<{
    error_name: string
    error_message: string
    path: string
    error_source: string
    occurrences: number
    people_affected: number
    first_seen: string
    last_seen: string
    frames: unknown
    clarity_url: string | null
    seconds_into_session: number | null
  }>(
    `SELECT error_name, error_message, path, error_source, occurrences, people_affected, first_seen, last_seen, frames, clarity_url, seconds_into_session
     FROM analytics_error_summary($1, 200) WHERE ($2::text IS NULL OR path = $2) LIMIT $3`,
    [days, path, limit],
  )

  const iso = (value: string | Date) => new Date(value).toISOString()
  const errors = result.rows.map((row) => ({
    name: row.error_name,
    message: row.error_message,
    path: row.path,
    source: row.error_source,
    occurrences: row.occurrences,
    peopleAffected: row.people_affected,
    firstSeen: iso(row.first_seen),
    lastSeen: iso(row.last_seen),
    topFrames: (Array.isArray(row.frames) ? (row.frames as ErrorLogs['errors'][number]['topFrames']) : []).slice(0, 5),
    clarityUrl: row.clarity_url,
    secondsIntoSession: row.seconds_into_session,
  }))
  return {
    days,
    totalOccurrences: errors.reduce((sum, error) => sum + error.occurrences, 0),
    errors,
    note: errors.length === 0 ? 'Sin errores registrados en ese periodo (o falta correr telemetry-migration.sql).' : null,
  }
}

// ------------------------------------------------------------------------------------------------
// Rendimiento de los flujos críticos
// ------------------------------------------------------------------------------------------------

export interface FlowPerformance {
  days: number
  flows: {
    flow: string
    runsStarted: number
    peopleStarted: number
    runsCompleted: number
    completionRatePct: number | null
    dropoffRatePct: number | null
    runsWithTechnicalError: number
    runsInProgress: number
    avgDurationMs: number | null
    avgLoadTimeMs: number | null
    frustratedRuns: number
    steps: { step: string; order: number; reached: number; lossToNextPct: number | null; avgDurationMs: number | null; avgLoadTimeMs: number | null; errors: number; frustrated: number; rageClicks: number }[]
    /** Rage / dead clicks de Clarity en las páginas por donde pasa el flujo, para cruzar lo cuantitativo con lo visual. */
    clarityOnItsPages: { path: string; rageClicks: number; deadClicks: number; sessions: number }[]
  }[]
  note: string | null
}

export async function getFlowPerformanceAnalysis(db: Queryable, input: { days?: number; flow?: string } = {}): Promise<FlowPerformance> {
  const days = clamp(input.days, 1, 90, 30)
  const flow = input.flow?.trim() || null
  if (flow && !/^[a-z][a-z0-9_]{1,49}$/.test(flow)) throw new Error('flow no es válido (por ejemplo auth_login, auth_register, job_search_filter, job_application).')

  const [summary, steps, pages] = await Promise.all([
    db.query<Record<string, any>>('SELECT * FROM analytics_flow_summary($1) WHERE ($2::text IS NULL OR flow_name = $2)', [days, flow]),
    db.query<{ flow_name: string; step_name: string; step_order: number; reached: number; continued: number; is_final: boolean; avg_duration_ms: number | null; avg_load_time_ms: number | null; errors: number; frustrated: number; rage_clicks: number }>(
      'SELECT * FROM analytics_flow_steps($1) WHERE ($2::text IS NULL OR flow_name = $2)',
      [days, flow],
    ),
    // Las páginas donde ocurrió cada flujo, con lo que Clarity vio en ellas.
    db.query<{ flow_name: string; path: string; rage: number; dead: number; sessions: number }>(
      `SELECT f.flow_name::text AS flow_name, f.path, COALESCE(SUM(c.rage_clicks_count), 0)::int AS rage, COALESCE(SUM(c.dead_clicks_count), 0)::int AS dead, COALESCE(SUM(c.sessions), 0)::int AS sessions
       FROM (SELECT DISTINCT flow_name, path FROM analytics_flow_metrics
             WHERE path IS NOT NULL AND created_at >= now() - make_interval(days => $1) AND ($2::text IS NULL OR flow_name = $2)) f
       LEFT JOIN analytics_clarity_metrics c ON c.path = f.path AND c.day >= (NOW() AT TIME ZONE 'America/Monterrey')::date - ($1::int - 1)
       GROUP BY f.flow_name, f.path ORDER BY 3 DESC, 4 DESC`,
      [days, flow],
    ),
  ])

  const stepsOf = (name: string) => {
    const rows = steps.rows.filter((row) => row.flow_name === name).sort((a, b) => a.step_order - b.step_order)
    return rows.map((row) => {
      return {
        step: row.step_name,
        order: row.step_order,
        reached: row.reached,
        // De los intentos que llegaron a este paso, el % que no siguió a ninguno posterior (null en el paso final).
        lossToNextPct: row.is_final || row.reached === 0 ? null : round(Math.max(0, 1 - row.continued / row.reached) * 100),
        avgDurationMs: row.avg_duration_ms,
        avgLoadTimeMs: row.avg_load_time_ms,
        errors: row.errors,
        frustrated: row.frustrated,
        rageClicks: row.rage_clicks,
      }
    })
  }
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value))

  const flows = summary.rows.map((row) => ({
    flow: String(row.flow_name),
    runsStarted: row.runs_started,
    peopleStarted: row.people_started,
    runsCompleted: row.runs_completed,
    completionRatePct: num(row.completion_rate_pct),
    dropoffRatePct: num(row.dropoff_rate_pct),
    runsWithTechnicalError: row.runs_error,
    runsInProgress: row.runs_in_progress,
    avgDurationMs: row.avg_duration_ms,
    avgLoadTimeMs: row.avg_load_time_ms,
    frustratedRuns: row.frustrated_runs,
    steps: stepsOf(String(row.flow_name)),
    clarityOnItsPages: pages.rows.filter((page) => page.flow_name === row.flow_name).slice(0, 8).map((page) => ({ path: page.path, rageClicks: page.rage, deadClicks: page.dead, sessions: page.sessions })),
  }))
  return { days, flows, note: flows.length === 0 ? 'Sin intentos de flujos en ese periodo (o falta correr telemetry-migration.sql).' : null }
}
