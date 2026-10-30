import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { siteUrl } from '../../../services/linkedin/vacancy-publisher'
import { nextPublication } from '../../../services/analytics/schedule'
import { readAll } from '../../../services/analytics/read'
import { ttlCache } from '../../../services/analytics/cache'
import { loadAlerts } from '../../../services/analytics/alerts-data'
import { loadMatchingOverview } from '../../../services/analytics/matching-data'
import {
  acquisitionBySource,
  buildOverview,
  dayKey,
  groupPerformance,
  hourOf,
  pct,
  postPerformance,
  retention,
  activePeople,
  countsAsPerson,
  type PersonRow,
  topLandingPages,
  uniqueVisitors,
  vacancyEngagement,
  periodStart,
  periodSpanMs,
  type LinkedInPostRow,
  type UserRow,
  type VacancyEventRow,
  type VisitRow,
} from '../../../services/analytics/metrics'

const router = Router()

// Cada consulta lee miles de filas: se guarda un minuto (y `?fresh=1` la vuelve a calcular).
router.use(ttlCache(60_000, (path) => path === '/me'))

/**
 * El panel de analítica de AvoTalent. Todo lo que cuelga de aquí se monta detrás de
 * `studioAuth()`: solo una persona con sesión y permiso de superadmin llega a estas rutas.
 *
 * Aquí solo se LEEN filas y se pasan por las cuentas de services/analytics/metrics.ts, que es
 * donde está la definición de cada número.
 */

const PERIODS = [1, 7, 30, 90] // 1 = las últimas 24 horas
const periodOf = (req: Request) => {
  const days = parseInt(String(req.query.days ?? '30'), 10)
  return PERIODS.includes(days) ? days : 30
}

const realUsers = (since: string) =>
  readAll<UserRow & { user_kind: string }>((from, to) =>
    supabase
      .from('users')
      .select('id, created_at, profile_completed, user_kind, signup_source, signup_medium, signup_campaign, signup_content')
      .eq('is_test_account', false)
      .not('is_scraper_profile', 'is', true)
      .in('user_kind', ['user', 'company'])
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
router.get('/me', async (req, res) => {
  const userId = (req as Request & { userId?: string }).userId
  const { data } = userId
    ? await supabase.from('users').select('username, display_name, photo_url, email').eq('id', userId).maybeSingle()
    : { data: null }
  res.json({ ok: true, user: data ? { username: data.username ?? null, displayName: data.display_name ?? null, photoUrl: data.photo_url ?? null, email: data.email ?? null } : null })
})

/** El match: qué tan bien encajan las vacantes con la gente que hay, con el mismo motor de "Para ti". */
router.get('/matching', handle('match', async (_req, res) => {
  res.json(await loadMatchingOverview())
}))

/** Las alarmas: lo que se rompió o está por romperse y conviene enterarse hoy. */
router.get('/alerts', handle('alarmas', async (_req, res) => {
  res.json({ alerts: await loadAlerts() })
}))

/** Vacantes: cuánta gente abre cada una, cuánta pulsa "Postularse" y cuánta la guarda. */
router.get('/vacancies', handle('vacantes', async (req, res) => {
  const days = periodOf(req)
  const since = periodStart(days).toISOString()

  const events = await readAll<VacancyEventRow>((from, to) =>
    supabase.from('vacancy_events').select('vacancy_slug, event, visitor_id').gte('created_at', since).range(from, to),
  ).catch((error: Error) => {
    // La tabla aún no existe: se dice, en lugar de mostrar ceros que parecerían reales.
    if (/vacancy_events/.test(error.message)) return null
    throw error
  })
  if (events === null) return res.json({ ready: false })

  const saved = await readAll<{ source_id: string }>((from, to) =>
    supabase.from('user_vacancy_history').select('source_id').eq('is_saved', true).gte('saved_at', since).range(from, to),
  )
  const shown = await supabase.from('user_vacancy_history').select('*', { count: 'exact', head: true }).gte('seen_at', since)

  const engagement = vacancyEngagement(events)
  const top = engagement.byVacancy.slice(0, 15)

  const { data: posts } = top.length > 0
    ? await supabase.from('community_posts').select('id, slug, title, company, role_category').in('slug', top.map((row) => row.slug))
    : { data: [] as { id: string; slug: string; title: string; company: string | null; role_category: string | null }[] }
  const bySlug = new Map((posts ?? []).map((post) => [post.slug, post]))
  const savedCount = new Map<string, number>()
  for (const row of saved) savedCount.set(row.source_id, (savedCount.get(row.source_id) ?? 0) + 1)

  res.json({
    ready: true,
    days,
    totals: { ...engagement, byVacancy: undefined, saved: saved.length, recommendationsShown: shown.count ?? 0 },
    top: top.map((row) => {
      const post = bySlug.get(row.slug)
      return { ...row, title: post?.title ?? row.slug, company: post?.company ?? null, role: post?.role_category ?? null, saved: post ? savedCount.get(post.id) ?? 0 : 0 }
    }),
  })
}))

/** Resumen: los números de arriba del panel, con su comparación contra el periodo anterior. */
router.get('/overview', handle('resumen', async (req, res) => {
  const days = periodOf(req)
  const since = new Date(periodStart(days).getTime() - periodSpanMs(days)).toISOString()
  const [visits, users, posts] = await Promise.all([visitsSince(since), realUsers(since), linkedinPosts(since)])

  const overview = buildOverview({ visits, users, posts, days })

  const activeSince = new Date(Date.now() - 45 * 86400000).toISOString()
  const [{ count: totalUsers }, { count: activeVacancies }, { count: queued }, { data: lastIngested }, { data: lastPublished }, { data: cycle }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_test_account', false).not('is_scraper_profile', 'is', true).in('user_kind', ['user', 'company']),
    supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('type', 'job').gte('created_at', activeSince),
    supabase.from('scraper_posts').select('*', { count: 'exact', head: true }).eq('post_type', 'vacancy').eq('synced_to_community', false),
    supabase.from('scraper_posts').select('created_at').eq('post_type', 'vacancy').order('created_at', { ascending: false }).limit(1),
    supabase.from('community_posts').select('created_at').eq('type', 'job').order('created_at', { ascending: false }).limit(1),
    supabase.from('scraper_cycle_state').select('cycle_started_at').eq('id', 1).limit(1),
  ])

  res.json({
    ...overview,
    totals: { users: totalUsers ?? 0, activeVacancies: activeVacancies ?? 0, queuedVacancies: queued ?? 0, lastIngestedAt: lastIngested?.[0]?.created_at ?? null,
      // La última que salió al feed (el scraper trae lotes cada 15 días y el feed los publica 20 por día) y cuándo toca el siguiente lote.
      lastPublishedAt: lastPublished?.[0]?.created_at ?? null,
      nextScrapeAt: cycle?.[0]?.cycle_started_at ? new Date(Date.parse(cycle[0].cycle_started_at) + 15 * 86400000).toISOString() : null },
  })
}))

/** LinkedIn: el estado del publicador y el rendimiento de cada publicación. */
router.get('/linkedin', handle('linkedin', async (req, res) => {
  const days = periodOf(req)
  const since = new Date(periodStart(days).getTime()).toISOString()

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
  const since = periodStart(days).toISOString()
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

/** Usuarios: las cuentas reales, con su origen, cómo entraron y su última actividad. Con búsqueda y páginas. */
const PROVIDERS = ['email', 'github', 'linkedin']

router.get('/users', handle('usuarios', async (req, res) => {
  const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? '25'), 10) || 25, 1), 100)
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1)
  const provider = PROVIDERS.includes(String(req.query.provider)) ? String(req.query.provider) : null
  // Lo que se teclea va dentro de un filtro de PostgREST: sin comas, paréntesis ni comodines que lo rompan.
  const q = String(req.query.q ?? "").replace(/[,()%*]/g, ' ').replace(/\\/g, ' ').trim().slice(0, 60)

  const real = () => supabase.from('users')

  // Los totales y los desgloses salen de TODAS las cuentas reales (solo las columnas necesarias); la tabla, de una página.
  const everyone = readAll<{ user_kind: string; role_category: string | null; signup_source: string | null; profile_completed: boolean | null; provider: string | null }>((from, to) =>
    real()
      .select('user_kind, role_category, signup_source, profile_completed, provider')
      .eq('is_test_account', false)
      .not('is_scraper_profile', 'is', true)
      .in('user_kind', ['user', 'company'])
      .range(from, to),
  )

  let pageQuery = real()
    .select('id, username, display_name, email, photo_url, user_kind, profile_completed, role_category, seniority, location, provider, signup_source, signup_content, created_at', { count: 'exact' })
    .eq('is_test_account', false)
    .not('is_scraper_profile', 'is', true)
    .in('user_kind', ['user', 'company'])
  if (provider) pageQuery = pageQuery.eq('provider', provider)
  if (q) pageQuery = pageQuery.or(`display_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`)
  const pageRows = pageQuery.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)

  const [all, { data, error, count }] = await Promise.all([everyone, pageRows])
  if (error) throw new Error(error.message)

  const users = data ?? []
  const activity = users.length > 0 ? await supabase.from('user_activity_daily').select('user_id, day').in('user_id', users.map((user) => user.id)) : { data: [], error: null }
  const lastActive = new Map<string, string>()
  for (const row of activity.data ?? []) if (row.day > (lastActive.get(row.user_id) ?? '')) lastActive.set(row.user_id, row.day)

  const count_ = (key: (user: (typeof all)[number]) => string | null) => {
    const counts = new Map<string, number>()
    for (const user of all) {
      const value = key(user)
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
  }

  res.json({
    total: all.length,
    completed: all.filter((user) => user.profile_completed).length,
    matching: count ?? users.length,
    page,
    pageSize,
    activityTracked: !activity.error,
    byKind: count_((user) => user.user_kind),
    byRole: count_((user) => user.role_category),
    bySource: count_((user) => user.signup_source ?? '(directo)'),
    byProvider: count_((user) => user.provider ?? 'email'),
    users: users.map((user) => ({ ...user, lastActive: lastActive.get(user.id) ?? null })),
  })
}))

/** Retención: actividad diaria, semanal y mensual, y cohortes por semana de registro. */
router.get('/retention', handle('retención', async (_req, res) => {
  const since = new Date(Date.now() - 60 * 86400000)
  const activity = await supabase.from('user_activity_daily').select('user_id, day').gte('day', dayKey(since.toISOString())).limit(50000)

  // La tabla aún no existe: se dice en lugar de mostrar ceros que parecerían reales.
  if (activity.error) return res.json({ ready: false })

  const rows = (activity.data ?? []) as { user_id: string; day: string }[]
  const ids = [...new Set(rows.map((row) => row.user_id))]
  const found = ids.length
    ? await supabase.from('users').select('id, username, display_name, photo_url, user_kind, created_at, profile_completed, is_test_account, is_scraper_profile').in('id', ids).limit(1000)
    : { data: [] as PersonRow[], error: null }
  const people = (found.data ?? []) as PersonRow[]

  // Las cifras cuentan solo personas reales: ni pruebas, ni scraper, ni el equipo que mira este panel.
  const counted = new Set(people.filter(countsAsPerson).map((person) => person.id))
  const users = await realUsers(since.toISOString())

  res.json({
    ready: true,
    ...retention({ activity: rows.filter((row) => counted.has(row.user_id)), users }),
    // La tabla muestra solo personas reales: ni el equipo, ni las pruebas, ni el scraper.
    people: activePeople({ activity: rows.filter((row) => counted.has(row.user_id)), people: people.filter(countsAsPerson) }),
  })
}))

export default router
