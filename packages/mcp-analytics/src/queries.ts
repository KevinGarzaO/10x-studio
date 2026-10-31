/**
 * Las consultas del servidor MCP. Son FIJAS (SQL escrito aquí, con parámetros): Claude nunca manda SQL, solo valores, y cada
 * valor se valida antes. Todo es de solo lectura y agregado: no devuelve correos, nombres ni a qué persona le pasó qué en el embudo.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value as number), min), max) : fallback
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places

// ------------------------------------------------------------------------------------------------
// 1. Dónde se cae la gente
// ------------------------------------------------------------------------------------------------

export interface FunnelDropoffs {
  days: number
  /** Los pasos del embudo del candidato con el avance y el abandono entre cada uno. */
  funnel: { step: number; label: string; people: number; fromPreviousPct: number | null; dropoffPct: number | null; fromStartPct: number | null }[]
  /** Dónde terminan las sesiones que NO convirtieron: las rutas con más abandono. */
  exitPaths: { path: string; sessions: number; people: number; engagedSessions: number; avgSeconds: number | null }[]
  /** Cómo convierte cada página de entrada, las de más tráfico primero. */
  entryPages: { path: string; sessions: number; activePeople: number; engagementRatePct: number | null; conversions: number; conversionRatePct: number | null }[]
}

export async function getFunnelDropoffs(db: Queryable, input: { days?: number; limit?: number } = {}): Promise<FunnelDropoffs> {
  const days = clamp(input.days, 1, 90, 30)
  const limit = clamp(input.limit, 1, 50, 15)

  const [funnel, exits, landing] = await Promise.all([
    db.query<{ step: number; label: string; people: number; from_previous_pct: string | null; dropoff_pct: string | null; from_start_pct: string | null }>('SELECT * FROM analytics_funnel($1)', [days]),
    db.query<{ path: string; sessions: number; people: number; engaged_sessions: number; avg_seconds: number | null }>(
      `SELECT COALESCE(exit_path, '(sin dato)') AS path,
              COUNT(*)::int AS sessions,
              COUNT(DISTINCT person_key)::int AS people,
              COUNT(*) FILTER (WHERE is_engaged)::int AS engaged_sessions,
              ROUND(AVG(duration_seconds))::int AS avg_seconds
       FROM analytics_real_sessions
       WHERE day_mty >= analytics_period_start($1) AND NOT has_conversion
       GROUP BY 1 ORDER BY 2 DESC LIMIT $2`,
      [days, limit],
    ),
    db.query<{ entry_path: string; sessions: number; active_users: number; engagement_rate: string | null; conversions: number; conversion_rate: string | null }>('SELECT * FROM analytics_landing_performance($1, $2)', [days, limit]),
  ])

  const num = (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value))
  return {
    days,
    funnel: funnel.rows.map((row) => ({ step: row.step, label: row.label, people: row.people, fromPreviousPct: num(row.from_previous_pct), dropoffPct: num(row.dropoff_pct), fromStartPct: num(row.from_start_pct) })),
    exitPaths: exits.rows.map((row) => ({ path: row.path, sessions: row.sessions, people: row.people, engagedSessions: row.engaged_sessions, avgSeconds: row.avg_seconds })),
    entryPages: landing.rows
      .map((row) => ({ path: row.entry_path, sessions: row.sessions, activePeople: row.active_users, engagementRatePct: num(row.engagement_rate), conversions: row.conversions, conversionRatePct: num(row.conversion_rate) }))
      .sort((a, b) => b.sessions - a.sessions),
  }
}

// ------------------------------------------------------------------------------------------------
// 2. Frustración visual (Clarity)
// ------------------------------------------------------------------------------------------------

export interface FrustrationRow {
  path: string
  daysWithData: number
  sessions: number
  pageViews: number
  rageClicks: number
  deadClicks: number
  quickBacks: number
  avgScrollDepth: number | null
  /** Por cada 100 sesiones, para comparar páginas de distinto tráfico. */
  ragePer100Sessions: number | null
  deadPer100Sessions: number | null
  quickBackPer100Sessions: number | null
}

export interface FrustrationData {
  days: number
  /** La ruta pedida (o prefijo, si terminaba en *). null = las páginas con más frustración del sitio. */
  query: string | null
  pages: FrustrationRow[]
  /** Día por día, solo cuando se pidió una ruta exacta. */
  daily: { day: string; sessions: number; rageClicks: number; deadClicks: number; quickBacks: number; avgScrollDepth: number | null }[]
  note: string | null
}

/** Escapa lo que significa algo dentro de un LIKE (% _ \) para que un prefijo se busque tal cual. */
const likePrefix = (value: string) => `${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

export async function getClarityFrustration(db: Queryable, input: { path?: string; days?: number; limit?: number } = {}): Promise<FrustrationData> {
  const days = clamp(input.days, 1, 90, 7)
  const limit = clamp(input.limit, 1, 50, 15)
  const raw = input.path?.trim() || null
  if (raw && (raw.length > 300 || !raw.startsWith('/'))) throw new Error('La ruta debe empezar con "/" (por ejemplo /empleos/dotnet). Termina en * para buscar por prefijo.')
  const prefix = raw?.endsWith('*') ? raw.slice(0, -1) : null
  const exact = raw && prefix === null ? raw : null

  const pages = await db.query<{ path: string; days_with_data: number; sessions: number; page_views: number; rage: number; dead: number; quick: number; scroll: string | null }>(
    `SELECT path, COUNT(*)::int AS days_with_data, SUM(sessions)::int AS sessions, SUM(page_views)::int AS page_views,
            SUM(rage_clicks_count)::int AS rage, SUM(dead_clicks_count)::int AS dead, SUM(quick_backs_count)::int AS quick,
            ROUND(AVG(avg_scroll_depth), 2) AS scroll
     FROM analytics_clarity_metrics
     WHERE day >= (NOW() AT TIME ZONE 'America/Monterrey')::date - ($1::int - 1)
       AND ($2::text IS NULL OR path = $2)
       AND ($3::text IS NULL OR path LIKE $3)
     GROUP BY path
     ORDER BY SUM(rage_clicks_count) + SUM(dead_clicks_count) DESC, SUM(sessions) DESC
     LIMIT $4`,
    [days, exact, prefix === null ? null : likePrefix(prefix), limit],
  )

  const per100 = (count: number, sessions: number) => (sessions > 0 ? round((count / sessions) * 100) : null)
  const rows: FrustrationRow[] = pages.rows.map((row) => ({
    path: row.path,
    daysWithData: row.days_with_data,
    sessions: row.sessions,
    pageViews: row.page_views,
    rageClicks: row.rage,
    deadClicks: row.dead,
    quickBacks: row.quick,
    avgScrollDepth: row.scroll === null ? null : Number(row.scroll),
    ragePer100Sessions: per100(row.rage, row.sessions),
    deadPer100Sessions: per100(row.dead, row.sessions),
    quickBackPer100Sessions: per100(row.quick, row.sessions),
  }))

  let daily: FrustrationData['daily'] = []
  if (exact) {
    const trend = await db.query<{ day: string; sessions: number; rage: number; dead: number; quick: number; scroll: string | null }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, sessions, rage_clicks_count AS rage, dead_clicks_count AS dead, quick_backs_count AS quick, avg_scroll_depth AS scroll
       FROM analytics_clarity_metrics
       WHERE path = $1 AND day >= (NOW() AT TIME ZONE 'America/Monterrey')::date - ($2::int - 1)
       ORDER BY day`,
      [exact, days],
    )
    daily = trend.rows.map((row) => ({ day: row.day, sessions: row.sessions, rageClicks: row.rage, deadClicks: row.dead, quickBacks: row.quick, avgScrollDepth: row.scroll === null ? null : Number(row.scroll) }))
  }

  return {
    days,
    query: raw,
    pages: rows,
    daily,
    note: rows.length === 0 ? 'Sin datos de Clarity para ese filtro: puede que la ruta no tenga tráfico en Clarity, que la sincronización diaria aún no haya corrido o que falte la migración clarity-migration.sql.' : null,
  }
}

// ------------------------------------------------------------------------------------------------
// 3. La grabación de una persona
// ------------------------------------------------------------------------------------------------

export interface UserRecordings {
  found: boolean
  user: { id: string; kind: string | null; registeredAt: string } | null
  sessions: {
    sessionId: string
    startedAt: string
    entryPath: string | null
    exitPath: string | null
    engaged: boolean
    durationSeconds: number | null
    pageViews: number | null
    converted: boolean
    source: string | null
  }[]
  /** Cómo abrir la grabación: Clarity no entrega enlaces por API, se filtra en su panel con estos ids. */
  clarity: { dashboardUrl: string | null; customUserId: string | null; howTo: string } | null
}

export async function getUserSessionRecording(db: Queryable, input: { userId?: string; email?: string; limit?: number; clarityProjectId?: string }): Promise<UserRecordings> {
  const limit = clamp(input.limit, 1, 25, 10)
  const userId = input.userId?.trim() || null
  const email = input.email?.trim().toLowerCase() || null
  if (!userId && !email) throw new Error('Manda user_id o email.')
  if (userId && !UUID.test(userId)) throw new Error('user_id no es un UUID válido.')
  if (!userId && email && !/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email)) throw new Error('email no es válido.')

  const user = await db.query<{ id: string; user_kind: string | null; created_at: string }>(
    userId ? 'SELECT id, user_kind, created_at FROM users WHERE id = $1::uuid LIMIT 1' : 'SELECT id, user_kind, created_at FROM users WHERE lower(email) = $1 LIMIT 1',
    [userId ?? email],
  )
  const found = user.rows[0]
  if (!found) return { found: false, user: null, sessions: [], clarity: null }

  const sessions = await db.query<{ session_id: string; created_at: string; entry_path: string | null; exit_path: string | null; is_engaged: boolean; duration_seconds: number | null; page_views_count: number | null; has_conversion: boolean; utm_source: string | null }>(
    `SELECT session_id, created_at, entry_path, exit_path, is_engaged, duration_seconds, page_views_count, has_conversion, utm_source
     FROM analytics_sessions WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT $2`,
    [found.id, limit],
  )

  const project = input.clarityProjectId?.trim()
  return {
    found: true,
    user: { id: found.id, kind: found.user_kind, registeredAt: new Date(found.created_at).toISOString() },
    sessions: sessions.rows.map((row) => ({
      sessionId: row.session_id,
      startedAt: new Date(row.created_at).toISOString(),
      entryPath: row.entry_path,
      exitPath: row.exit_path,
      engaged: row.is_engaged,
      durationSeconds: row.duration_seconds,
      pageViews: row.page_views_count,
      converted: row.has_conversion,
      source: row.utm_source,
    })),
    clarity: {
      dashboardUrl: project ? `https://clarity.microsoft.com/projects/view/${encodeURIComponent(project)}/dashboard` : null,
      customUserId: found.id,
      howTo:
        'Clarity no entrega el enlace de una grabación por API. Abre el proyecto > Recordings > Filters > "Custom ID" = el id de la cuenta (todas sus grabaciones) o "Custom session ID" = el sessionId de abajo (esa visita exacta). ' +
        'Solo hay grabación si Clarity la conservó (se muestrea y no guarda para siempre) y si la persona no tenía bloqueado el script.',
    },
  }
}
