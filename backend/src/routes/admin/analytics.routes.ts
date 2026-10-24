import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { siteUrl } from '../../../services/linkedin/vacancy-publisher'
import { nextPublication } from '../../../services/analytics/schedule'
import {
  acquisitionBySource,
  buildOverview,
  dayKey,
  groupPerformance,
  hourOf,
  pct,
  postPerformance,
  retention,
  topLandingPages,
  uniqueVisitors,
  windowStart,
  type LinkedInPostRow,
  type UserRow,
  type VisitRow,
} from '../../../services/analytics/metrics'

const router = Router()

/**
 * El panel de analítica de AvoTalent. Todo lo que cuelga de aquí se monta detrás de
 * `studioAuth()`: solo una persona con sesión y permiso de superadmin llega a estas rutas.
 *
 * Aquí solo se LEEN filas y se pasan por las cuentas de services/analytics/metrics.ts, que es
 * donde está la definición de cada número.
 */

const PERIODS = [7, 30, 90]
const periodOf = (req: Request) => {
  const days = parseInt(String(req.query.days ?? '30'), 10)
  return PERIODS.includes(days) ? days : 30
}

/** Lee todas las filas, de mil en mil (la base entrega a lo más mil por consulta). */
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20000): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

const realUsers = (since: string) =>
  readAll<UserRow & { user_kind: string }>((from, to) =>
    supabase
      .from('users')
      .select('id, created_at, profile_completed, user_kind, signup_source, signup_medium, signup_campaign, signup_content')
      .eq('is_test_account', false)
      .not('is_scraper_profile', 'is', true)
      .in('user_kind', ['user', 'company', 'superadmin'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, to),
  )

const visitsSince = (since: string) =>
  readAll<VisitRow>((from, to) =>
    supabase
      .from('landing_visits')
      .select('visitor_id, source, medium, campaign, content, landing_path, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, to),
  )

const linkedinPosts = (since: string) =>
  readAll<LinkedInPostRow>((from, to) =>
    supabase
      .from('linkedin_vacancy_posts')
      .select('vacancy_slug, company, role_category, linkedin_post_id, status, published_at, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, to),
  )

const handle = (name: string, run: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await run(req, res)
  } catch (error) {
    console.error(`[Analytics] ${name}:`, error)
    res.status(500).json({ error: `No se pudo calcular: ${name}` })
  }
}

/** Comprueba que la sesión tenga permiso para el panel (lo usa el inicio de sesión). */
router.get('/me', (_req, res) => {
  res.json({ ok: true })
})

/** Resumen: los números de arriba del panel, con su comparación contra el periodo anterior. */
router.get('/overview', handle('resumen', async (req, res) => {
  const days = periodOf(req)
  const since = new Date(windowStart(days).getTime() - days * 86400000).toISOString()
  const [visits, users, posts] = await Promise.all([visitsSince(since), realUsers(since), linkedinPosts(since)])

  const overview = buildOverview({ visits, users, posts, days })

  const activeSince = new Date(Date.now() - 45 * 86400000).toISOString()
  const [{ count: totalUsers }, { count: activeVacancies }, { count: queued }, { data: lastIngested }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_test_account', false).not('is_scraper_profile', 'is', true).in('user_kind', ['user', 'company', 'superadmin']),
    supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('type', 'job').gte('created_at', activeSince),
    supabase.from('scraper_posts').select('*', { count: 'exact', head: true }).eq('post_type', 'vacancy').eq('synced_to_community', false),
    supabase.from('scraper_posts').select('created_at').eq('post_type', 'vacancy').order('created_at', { ascending: false }).limit(1),
  ])

  res.json({
    ...overview,
    totals: { users: totalUsers ?? 0, activeVacancies: activeVacancies ?? 0, queuedVacancies: queued ?? 0, lastIngestedAt: lastIngested?.[0]?.created_at ?? null },
  })
}))

/** LinkedIn: el estado del publicador y el rendimiento de cada publicación. */
router.get('/linkedin', handle('linkedin', async (req, res) => {
  const days = periodOf(req)
  const since = new Date(windowStart(days).getTime()).toISOString()

  const [posts, visits, users, { data: profile }] = await Promise.all([
    linkedinPosts(since),
    visitsSince(since),
    realUsers(since),
    supabase.from('linkedin_profiles').select('first_name, last_name, headline, photo_url, connected_at, expires_at').not('access_token', 'is', null).order('connected_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const performance = postPerformance({ posts, visits, users })
  const expiresAt = profile?.expires_at ?? null
  const failed = posts.filter((post) => post.status === 'failed').length

  res.json({
    days,
    status: {
      connected: !!profile,
      name: profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : null,
      headline: profile?.headline ?? null,
      photo: profile?.photo_url ?? null,
      expiresAt,
      daysLeft: expiresAt ? Math.floor((Date.parse(expiresAt) - Date.now()) / 86400000) : null,
      // El interruptor vive en el servidor: si está apagado, el cron corre pero no publica.
      publishing: process.env.LINKEDIN_VACANCY_POSTS === 'on',
      siteUrlConfigured: siteUrl() !== null,
      nextPublicationAt: nextPublication().toISOString(),
    },
    totals: {
      published: performance.length,
      failed,
      visitors: performance.reduce((sum, post) => sum + post.visitors, 0),
      signups: performance.reduce((sum, post) => sum + post.signups, 0),
    },
    posts: performance,
    byRole: groupPerformance(performance, (post) => post.role),
    byHour: groupPerformance(performance, (post) => (post.publishedAt ? `${String(hourOf(post.publishedAt)).padStart(2, '0')}:00` : null)),
    byCompany: groupPerformance(performance, (post) => post.company).slice(0, 10),
  })
}))

/** Adquisición: de dónde llega la gente y por dónde avanza hasta quedarse. */
router.get('/acquisition', handle('adquisición', async (req, res) => {
  const days = periodOf(req)
  const since = windowStart(days).toISOString()
  const [visits, users] = await Promise.all([visitsSince(since), realUsers(since)])

  // "Volvió": estuvo activa en un día posterior al de su registro. Solo se sabe si la tabla existe.
  let returned: number | null = null
  const ids = users.map((user) => user.id)
  if (ids.length > 0) {
    const activity = await supabase.from('user_activity_daily').select('user_id, day').in('user_id', ids.slice(0, 1000))
    if (!activity.error) {
      const signupDay = new Map(users.map((user) => [user.id, dayKey(user.created_at)]))
      returned = new Set((activity.data ?? []).filter((row) => row.day > (signupDay.get(row.user_id) ?? '9999')).map((row) => row.user_id)).size
    }
  }

  const visitors = uniqueVisitors(visits)
  const completed = users.filter((user) => user.profile_completed).length
  res.json({
    days,
    sources: acquisitionBySource({ visits, users }),
    landingPages: topLandingPages(visits, 10),
    funnel: [
      { step: 'Visitantes', count: visitors, pctOfPrevious: null },
      { step: 'Se registraron', count: users.length, pctOfPrevious: pct(users.length, visitors) },
      { step: 'Completaron su perfil', count: completed, pctOfPrevious: pct(completed, users.length) },
      { step: 'Volvieron otro día', count: returned, pctOfPrevious: returned === null ? null : pct(returned, completed || users.length) },
    ],
  })
}))

/** Usuarios: las cuentas reales, con su origen y su última actividad. */
router.get('/users', handle('usuarios', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1), 500)
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, email, user_kind, profile_completed, role_category, seniority, location, signup_source, signup_content, created_at')
    .eq('is_test_account', false)
    .not('is_scraper_profile', 'is', true)
    .in('user_kind', ['user', 'company', 'superadmin'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  const users = data ?? []
  const activity = users.length > 0 ? await supabase.from('user_activity_daily').select('user_id, day').in('user_id', users.map((user) => user.id)) : { data: [], error: null }
  const lastActive = new Map<string, string>()
  for (const row of activity.data ?? []) if (row.day > (lastActive.get(row.user_id) ?? '')) lastActive.set(row.user_id, row.day)

  const count = (key: (user: (typeof users)[number]) => string | null) => {
    const counts = new Map<string, number>()
    for (const user of users) {
      const value = key(user)
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
  }

  res.json({
    total: users.length,
    activityTracked: !activity.error,
    byKind: count((user) => user.user_kind),
    byRole: count((user) => user.role_category),
    bySource: count((user) => user.signup_source ?? '(directo)'),
    users: users.map((user) => ({ ...user, lastActive: lastActive.get(user.id) ?? null })),
  })
}))

/** Retención: actividad diaria, semanal y mensual, y cohortes por semana de registro. */
router.get('/retention', handle('retención', async (_req, res) => {
  const since = new Date(Date.now() - 60 * 86400000)
  const activity = await supabase.from('user_activity_daily').select('user_id, day').gte('day', dayKey(since.toISOString())).limit(50000)

  // La tabla aún no existe: se dice en lugar de mostrar ceros que parecerían reales.
  if (activity.error) return res.json({ ready: false })

  const users = await realUsers(since.toISOString())
  res.json({ ready: true, ...retention({ activity: activity.data ?? [], users }) })
}))

export default router
