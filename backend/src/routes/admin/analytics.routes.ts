import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { siteUrl } from '../../../services/linkedin/vacancy-publisher'
import { nextPublication } from '../../../services/analytics/schedule'
import { readAll } from '../../../services/analytics/read'
import { ttlCache } from '../../../services/analytics/cache'
import { dailyQuota, daysUntilNextBatch, nextBatchFrom } from '../../../services/scraper/quota'
import { loadAlerts } from '../../../services/analytics/alerts-data'
import { loadMatchingOverview } from '../../../services/analytics/matching-data'
import {
  acquisitionBySource,
  buildOverview,
  change,
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
router.use(ttlCache(60_000, (path) => path === '/me' || path === '/web/live' || path.startsWith('/web/sessions')))

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

/**
 * Las visitas de personas ACTIVAS del periodo (una por sesión activa, con su origen y si la persona es nueva), de la analítica
 * web propia. Es lo que cuentan Adquisición y LinkedIn: así un "visitante" es una persona que hizo algo en el sitio y la conversión
 * se mide sobre las nuevas. `null` si esa medición aún no existe (falta backend/sql/web-analytics-active-people-migration.sql).
 */
async function activeVisits(from: Date, to: Date): Promise<VisitRow[] | null> {
  const rows: VisitRow[] = []
  for (let start = 0; start < 20000; start += 1000) {
    const { data, error } = await supabase
      .rpc('analytics_active_visits', { p_from: from.toISOString(), p_to: to.toISOString() })
      .range(start, start + 999)
    if (error) {
      if (/function|does not exist|schema cache|analytics_|relation/i.test(error.message)) return null
      throw new Error(error.message)
    }
    for (const row of (data ?? []) as { person_key: string; is_new: boolean; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; entry_path: string | null; created_at: string }[]) {
      rows.push({ visitor_id: row.person_key, source: row.utm_source, medium: row.utm_medium, campaign: row.utm_campaign, content: row.utm_content, landing_path: row.entry_path, created_at: row.created_at, is_new: row.is_new })
    }
    if (!data || data.length < 1000) break
  }
  return rows
}

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

/**
 * Vacantes en PERSONAS ACTIVAS: cuántas personas con una sesión activa abrieron cada vacante y cuántas pulsaron "Postularse"
 * (una persona cuenta una sola vez por vacante). Sale de la analítica web propia (backend/sql/web-analytics-active-people-migration.sql).
 * `null` si esa medición todavía no existe: entonces se cae a la cuenta anterior, por navegador, y se avisa.
 */
async function vacanciesByActivePeople(days: number) {
  const now = new Date()
  const from = periodStart(days, now)
  const to = new Date(now.getTime() + 1)
  const [people, totals] = await Promise.all([
    supabase.rpc('analytics_vacancy_people', { p_from: from.toISOString(), p_to: to.toISOString(), p_limit: 100 }),
    supabase.rpc('analytics_vacancy_totals', { p_from: from.toISOString(), p_to: to.toISOString() }),
  ])
  const failed = [people, totals].find((result) => result.error)
  if (failed?.error) {
    if (/function|does not exist|schema cache|analytics_|relation/i.test(failed.error.message)) return null
    throw new Error(failed.error.message)
  }

  const rows = (people.data ?? []) as { slug: string; viewers: number; applicants: number }[]
  const total = ((totals.data ?? [])[0] ?? { tracking_since: null, viewers: 0, applicants: 0, vacancies: 0 }) as { tracking_since: string | null; viewers: number; applicants: number; vacancies: number }

  const since = from.toISOString()
  const saved = await readAll<{ source_id: string }>((start, end) =>
    supabase.from('user_vacancy_history').select('source_id').eq('is_saved', true).gte('saved_at', since).range(start, end),
  )
  const shown = await supabase.from('user_vacancy_history').select('*', { count: 'exact', head: true }).gte('seen_at', since)
  const { data: posts } = rows.length > 0
    ? await supabase.from('community_posts').select('id, slug, title, company, role_category').in('slug', rows.map((row) => row.slug))
    : { data: [] as { id: string; slug: string; title: string; company: string | null; role_category: string | null }[] }
  const bySlug = new Map((posts ?? []).map((post) => [post.slug, post]))
  const savedCount = new Map<string, number>()
  for (const row of saved) savedCount.set(row.source_id, (savedCount.get(row.source_id) ?? 0) + 1)

  const trackingSince = total.tracking_since
  return {
    ready: true as const,
    source: 'people' as const,
    days,
    trackingSince,
    // Si la medición empezó después de que el periodo arrancó, las cifras están incompletas.
    partial: !trackingSince || Date.parse(trackingSince) > from.getTime(),
    totals: {
      viewers: total.viewers,
      applicants: total.applicants,
      vacancies: total.vacancies,
      applyRatePct: pct(total.applicants, total.viewers),
      saved: saved.length,
      recommendationsShown: shown.count ?? 0,
    },
    top: rows.map((row) => {
      const post = bySlug.get(row.slug)
      return {
        slug: row.slug,
        title: post?.title ?? row.slug,
        company: post?.company ?? null,
        role: post?.role_category ?? null,
        viewers: row.viewers,
        applicants: row.applicants,
        applyRatePct: pct(row.applicants, row.viewers),
        saved: post ? savedCount.get(post.id) ?? 0 : 0,
      }
    }),
  }
}

/** Vacantes: cuánta gente activa abre cada una, cuánta pulsa "Postularse" y cuánta la guarda. */
router.get('/vacancies', handle('vacantes', async (req, res) => {
  const days = periodOf(req)
  const byPeople = await vacanciesByActivePeople(days)
  if (byPeople) return res.json(byPeople)

  // Sin la analítica propia: la cuenta anterior, por navegador y sin saber si hizo algo. El panel lo avisa.
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
  const top = engagement.byVacancy.slice(0, 100)

  const { data: posts } = top.length > 0
    ? await supabase.from('community_posts').select('id, slug, title, company, role_category').in('slug', top.map((row) => row.slug))
    : { data: [] as { id: string; slug: string; title: string; company: string | null; role_category: string | null }[] }
  const bySlug = new Map((posts ?? []).map((post) => [post.slug, post]))
  const savedCount = new Map<string, number>()
  for (const row of saved) savedCount.set(row.source_id, (savedCount.get(row.source_id) ?? 0) + 1)

  res.json({
    ready: true,
    source: 'legacy',
    days,
    totals: { ...engagement, byVacancy: undefined, saved: saved.length, recommendationsShown: shown.count ?? 0 },
    top: top.map((row) => {
      const post = bySlug.get(row.slug)
      return { ...row, title: post?.title ?? row.slug, company: post?.company ?? null, role: post?.role_category ?? null, saved: post ? savedCount.get(post.id) ?? 0 : 0 }
    }),
  })
}))

/**
 * Los visitantes del resumen: SOLO personas con una sesión activa (10 s con la pestaña visible, 2 páginas o un evento clave),
 * separadas en nuevas y recurrentes, y la conversión medida sobre las NUEVAS. Salen de la analítica web propia
 * (backend/sql/web-analytics-summary-migration.sql). Si esa medición aún no existe, `ready: false` y el panel lo dice.
 *
 * Una comparación contra el periodo anterior solo se da si la medición ya existía entonces: si no, sería comparar contra ceros.
 */
async function visitorsTraffic(days: number, bucketDays: string[]) {
  const now = new Date()
  const from = periodStart(days, now)
  const span = periodSpanMs(days)
  const previousFrom = new Date(from.getTime() - span)
  const hourly = days === 1

  const [current, previous, series] = await Promise.all([
    supabase.rpc('analytics_visitors_summary', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString() }),
    supabase.rpc('analytics_visitors_summary', { p_from: previousFrom.toISOString(), p_to: from.toISOString() }),
    supabase.rpc('analytics_visitors_series', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString(), p_bucket: hourly ? 'hour' : 'day' }),
  ])
  const failed = [current, previous, series].find((result) => result.error)
  if (failed?.error) {
    if (/function|does not exist|schema cache|analytics_|relation/i.test(failed.error.message)) return { ready: false as const }
    throw new Error(failed.error.message)
  }

  type Summary = { tracking_since: string | null; active: number; new_active: number; returning_active: number; registered_new: number; linkedin_active: number; sessions: number; engaged_sessions: number }
  const now_ = ((current.data ?? [])[0] ?? null) as Summary | null
  const before = ((previous.data ?? [])[0] ?? null) as Summary | null
  const trackingSince = now_?.tracking_since ?? null
  const since = trackingSince ? Date.parse(trackingSince) : null

  const byBucket = new Map(((series.data ?? []) as { bucket: string; active: number; new_active: number }[]).map((row) => [row.bucket, row]))
  return {
    ready: true as const,
    trackingSince,
    // El periodo está incompleto si la medición empezó después de que el periodo arrancó.
    partial: since === null || since > from.getTime(),
    active: now_?.active ?? 0,
    newActive: now_?.new_active ?? 0,
    returningActive: now_?.returning_active ?? 0,
    registeredNew: now_?.registered_new ?? 0,
    // Registros de gente nueva entre gente nueva activa: un recurrente que se registra no engorda la conversión.
    conversionPct: pct(now_?.registered_new ?? 0, now_?.new_active ?? 0),
    linkedinActive: now_?.linkedin_active ?? 0,
    sessions: now_?.sessions ?? 0,
    bounces: Math.max(0, (now_?.sessions ?? 0) - (now_?.engaged_sessions ?? 0)),
    vs: since !== null && since <= previousFrom.getTime() && before
      ? { active: change(now_?.active ?? 0, before.active), newActive: change(now_?.new_active ?? 0, before.new_active) }
      : { active: null, newActive: null },
    series: bucketDays.map((day) => ({ day, active: byBucket.get(day)?.active ?? 0, newActive: byBucket.get(day)?.new_active ?? 0 })),
  }
}

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

  const nextBatch = nextBatchFrom(cycle?.[0]?.cycle_started_at ? new Date(cycle[0].cycle_started_at) : null)
  const traffic = await visitorsTraffic(days, overview.series.map((point) => point.day))

  res.json({
    ...overview,
    traffic,
    totals: { users: totalUsers ?? 0, activeVacancies: activeVacancies ?? 0, queuedVacancies: queued ?? 0, lastIngestedAt: lastIngested?.[0]?.created_at ?? null,
      // La última que salió al feed (el scraper trae lotes cada 15 días y el feed los publica repartidos entre esos 15 días) y cuándo toca el siguiente lote.
      lastPublishedAt: lastPublished?.[0]?.created_at ?? null,
      nextScrapeAt: nextBatch ? nextBatch.toISOString() : null,
      // Cuántas saldrán por día para que la cola se vacíe justo cuando llegue el próximo lote.
      dailyQuota: dailyQuota({ pending: queued ?? 0, now: new Date(), nextBatchAt: nextBatch }),
      daysToNextBatch: daysUntilNextBatch(new Date(), nextBatch) },
  })
}))

/** LinkedIn: el estado del publicador y el rendimiento de cada publicación. */
router.get('/linkedin', handle('linkedin', async (req, res) => {
  const days = periodOf(req)
  const since = new Date(periodStart(days).getTime()).toISOString()

  const now = new Date()
  const active = await activeVisits(periodStart(days, now), new Date(now.getTime() + 1))
  const [posts, visits, users, { data: profile }] = await Promise.all([
    linkedinPosts(since),
    active ? Promise.resolve(active) : visitsSince(since),
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
    // `active: true` = los visitantes son personas activas y la conversión se mide sobre las nuevas.
    active: active !== null,
    totals: {
      published: performance.length,
      failed,
      visitors: performance.reduce((sum, post) => sum + post.visitors, 0),
      newVisitors: active ? performance.reduce((sum, post) => sum + (post.newVisitors ?? 0), 0) : null,
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
  const now = new Date()
  const active = await activeVisits(periodStart(days, now), new Date(now.getTime() + 1))
  const [visits, users] = await Promise.all([active ? Promise.resolve(active) : visitsSince(since), realUsers(since)])

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
  const newVisits = visits.filter((visit) => visit.is_new)
  const newVisitors = uniqueVisitors(newVisits)
  // Quienes entraron por primera vez en el periodo Y se registraron en él: la conversión se mide sobre los nuevos.
  const registeredIds = new Set(users.map((user) => user.id))
  const registeredNew = new Set(newVisits.filter((visit) => registeredIds.has(visit.visitor_id)).map((visit) => visit.visitor_id)).size

  res.json({
    days,
    // `active: true` = las cifras son de personas activas (analítica propia); si no, de navegadores (la cuenta anterior).
    active: active !== null,
    sources: acquisitionBySource({ visits, users }),
    landingPages: topLandingPages(visits, 10),
    funnel: active
      ? [
          { step: 'Visitantes activos', count: visitors, pctOfPrevious: null },
          { step: 'Nuevos', count: newVisitors, pctOfPrevious: pct(newVisitors, visitors) },
          { step: 'Se registraron (de los nuevos)', count: registeredNew, pctOfPrevious: pct(registeredNew, newVisitors) },
          { step: 'Completaron su perfil', count: completed, pctOfPrevious: pct(completed, users.length) },
          { step: 'Volvieron otro día', count: returned, pctOfPrevious: returned === null ? null : pct(returned, completed || users.length) },
        ]
      : [
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

/**
 * Tráfico web (la analítica propia, con las reglas de GA4): personas activas por día, embudo, páginas de entrada, canales
 * y cohortes. Todo sale de funciones SQL (backend/sql/web-analytics-migration.sql) que cuentan en horario de Monterrey y
 * sin el equipo, las cuentas de prueba ni el scraper. Sin la migración dice que no está lista en lugar de mostrar ceros.
 */
const WEB_PERIODS = [1, 7, 30, 90]
router.get('/web', handle('tráfico web', async (req, res) => {
  const requested = parseInt(String(req.query.days ?? '30'), 10)
  const days = WEB_PERIODS.includes(requested) ? requested : 30

  const [active, funnel, landing, channels, cohorts] = await Promise.all([
    supabase.rpc('analytics_active_users', { p_days: days }),
    supabase.rpc('analytics_funnel', { p_days: days }),
    supabase.rpc('analytics_landing_performance', { p_days: days, p_limit: 1000 }),
    supabase.rpc('analytics_channels', { p_days: days, p_limit: 1000 }),
    supabase.rpc('analytics_retention_cohorts', { p_weeks: 8 }),
  ])

  const failed = [active, funnel, landing, channels, cohorts].find((result) => result.error)
  if (failed?.error) {
    // Las funciones aún no existen (falta correr la migración): se dice, en lugar de mostrar ceros que parecerían reales.
    if (/function|does not exist|schema cache|analytics_/i.test(failed.error.message)) return res.json({ ready: false })
    throw new Error(failed.error.message)
  }

  const daily = (active.data ?? []) as { day: string; dau: number; wau: number; mau: number }[]
  const pages = (landing.data ?? []) as { entry_path: string; sessions: number; active_users: number; engagement_rate: number | null; conversions: number; conversion_rate: number | null }[]
  const sessions = pages.reduce((sum, row) => sum + row.sessions, 0)
  const conversions = pages.reduce((sum, row) => sum + row.conversions, 0)
  const latest = daily[daily.length - 1]

  // Las cohortes llegan como filas (semana, desfase): se arman como matriz, una fila por semana de adquisición.
  const byWeek = new Map<string, { week: string; size: number; retained: { offset: number; count: number; pct: number | null }[] }>()
  for (const row of (cohorts.data ?? []) as { cohort_week: string; cohort_size: number; week_offset: number; retained: number; retained_pct: number | null }[]) {
    const entry = byWeek.get(row.cohort_week) ?? { week: row.cohort_week, size: row.cohort_size, retained: [] }
    entry.retained.push({ offset: row.week_offset, count: row.retained, pct: row.retained_pct })
    byWeek.set(row.cohort_week, entry)
  }

  res.json({
    ready: true,
    days,
    summary: {
      dau: latest?.dau ?? 0,
      wau: latest?.wau ?? 0,
      mau: latest?.mau ?? 0,
      sessions,
      engagementRatePct: sessions > 0 ? Math.round((pages.reduce((sum, row) => sum + Math.round(((row.engagement_rate ?? 0) / 100) * row.sessions), 0) / sessions) * 1000) / 10 : null,
      conversions,
      conversionRatePct: sessions > 0 ? Math.round((conversions / sessions) * 1000) / 10 : null,
    },
    daily,
    funnel: funnel.data ?? [],
    landingPages: pages,
    channels: channels.data ?? [],
    cohorts: [...byWeek.values()],
  })
}))

/** Los desgloses que se pueden pedir (la misma lista cerrada que la función SQL `analytics_dimension`). */
const WEB_DIMENSIONS = [
  'language', 'device_category', 'operating_system', 'browser', 'browser_version', 'screen_resolution', 'timezone',
  'country', 'region', 'city', 'referrer_host', 'exit_path', 'visitor_type',
]

const webPeriod = (req: Request) => {
  const requested = parseInt(String(req.query.days ?? '30'), 10)
  return WEB_PERIODS.includes(requested) ? requested : 30
}

/** Si las funciones SQL aún no existen (falta una migración) se dice, en lugar de mostrar ceros que parecerían reales. */
const missingMigration = (message: string) => /function|does not exist|schema cache|analytics_|relation|column/i.test(message)

/** Un desglose: idioma, dispositivo, sistema, navegador, pantalla, zona horaria, país, región, ciudad, sitio de origen... */
router.get('/web/dimension', handle('desglose web', async (req, res) => {
  const dimension = String(req.query.dimension ?? '')
  if (!WEB_DIMENSIONS.includes(dimension)) return res.status(400).json({ error: 'Desglose no válido', allowed: WEB_DIMENSIONS })
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 500)
  const { data, error } = await supabase.rpc('analytics_dimension', { p_days: webPeriod(req), p_dimension: dimension, p_limit: limit })
  if (error) {
    if (missingMigration(error.message)) return res.json({ ready: false })
    throw new Error(error.message)
  }
  res.json({ ready: true, days: webPeriod(req), dimension, rows: data ?? [] })
}))

/** Varios desgloses de una vez (una pantalla suele necesitar cuatro o cinco). */
router.get('/web/dimensions', handle('desgloses web', async (req, res) => {
  const wanted = String(req.query.list ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  if (wanted.length === 0 || wanted.length > 8 || wanted.some((item) => !WEB_DIMENSIONS.includes(item))) {
    return res.status(400).json({ error: 'Desgloses no válidos', allowed: WEB_DIMENSIONS })
  }
  const days = webPeriod(req)
  const results = await Promise.all(wanted.map((dimension) => supabase.rpc('analytics_dimension', { p_days: days, p_dimension: dimension, p_limit: 50 })))
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    if (missingMigration(failed.error.message)) return res.json({ ready: false })
    throw new Error(failed.error.message)
  }
  res.json({ ready: true, days, dimensions: Object.fromEntries(wanted.map((dimension, index) => [dimension, results[index].data ?? []])) })
}))

/** Mapa: las ciudades con sus coordenadas y los países. */
router.get('/web/geo', handle('geografía web', async (req, res) => {
  const days = webPeriod(req)
  const [points, countries, regions] = await Promise.all([
    supabase.rpc('analytics_geo_points', { p_days: days }),
    supabase.rpc('analytics_dimension', { p_days: days, p_dimension: 'country', p_limit: 250 }),
    supabase.rpc('analytics_dimension', { p_days: days, p_dimension: 'region', p_limit: 250 }),
  ])
  const failed = [points, countries, regions].find((result) => result.error)
  if (failed?.error) {
    if (missingMigration(failed.error.message)) return res.json({ ready: false })
    throw new Error(failed.error.message)
  }
  res.json({ ready: true, days, points: points.data ?? [], countries: countries.data ?? [], regions: regions.data ?? [] })
}))

/** Cada página vista, con sus entradas y salidas. */
router.get('/web/pages', handle('páginas web', async (req, res) => {
  const days = webPeriod(req)
  const { data, error } = await supabase.rpc('analytics_pages', { p_days: days, p_limit: 1000 })
  if (error) {
    if (missingMigration(error.message)) return res.json({ ready: false })
    throw new Error(error.message)
  }
  res.json({ ready: true, days, pages: data ?? [] })
}))

/** Cada evento: cuántas veces y a cuánta gente. */
router.get('/web/events', handle('eventos web', async (req, res) => {
  const days = webPeriod(req)
  const { data, error } = await supabase.rpc('analytics_events_summary', { p_days: days })
  if (error) {
    if (missingMigration(error.message)) return res.json({ ready: false })
    throw new Error(error.message)
  }
  res.json({ ready: true, days, events: data ?? [] })
}))

const SESSION_COLUMNS =
  'session_id, user_id, client_id, person_key, entry_path, exit_path, country, region, city, latitude, longitude, device_category, operating_system, os_version, ' +
  'browser, browser_version, language, screen_resolution, timezone, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer_host, is_new_visitor, ' +
  'page_views_count, duration_seconds, is_engaged, has_conversion, created_at, last_activity_at'

type SessionRow = { user_id: string | null; [key: string]: unknown }

/** Quién es cada cuenta reconocida (las demás son visitantes anónimos). */
async function namesOf(rows: SessionRow[]): Promise<Map<string, { username: string | null; displayName: string | null; email: string | null }>> {
  const ids = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))]
  const names = new Map<string, { username: string | null; displayName: string | null; email: string | null }>()
  if (ids.length === 0) return names
  const { data } = await supabase.from('users').select('id, username, display_name, email').in('id', ids)
  for (const user of data ?? []) names.set(user.id, { username: user.username ?? null, displayName: user.display_name ?? null, email: user.email ?? null })
  return names
}

/** Ahora mismo: las sesiones con actividad en los últimos minutos y la página donde están. */
router.get('/web/live', handle('en vivo', async (req, res) => {
  const minutes = Math.min(Math.max(parseInt(String(req.query.minutes ?? '5'), 10) || 5, 1), 60)
  const since = new Date(Date.now() - minutes * 60000).toISOString()
  const { data, error } = await supabase
    .from('analytics_real_sessions')
    .select(SESSION_COLUMNS)
    .gte('last_activity_at', since)
    .order('last_activity_at', { ascending: false })
    .limit(200)
  if (error) {
    if (missingMigration(error.message)) return res.json({ ready: false })
    throw new Error(error.message)
  }
  const rows = (data ?? []) as unknown as SessionRow[]
  const names = await namesOf(rows)
  res.json({ ready: true, minutes, now: new Date().toISOString(), sessions: rows.map((row) => ({ ...row, user: row.user_id ? names.get(row.user_id) ?? null : null })) })
}))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sesión por sesión: cada entrada al sitio con todo lo que sabemos. Con búsqueda, filtros y páginas.
 * Filtros: days, q (página, ciudad, país, origen, sitio, idioma), device, country, source, engaged=1, conversion=1,
 * visitor=new|returning, person (el person_key de una persona).
 */
router.get('/web/sessions', handle('sesiones web', async (req, res) => {
  const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? '25'), 10) || 25, 1), 100)
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1)
  const since = periodStart(webPeriod(req)).toISOString()
  // Lo que se teclea va dentro de un filtro de PostgREST: sin comas, paréntesis ni comodines que lo rompan.
  const q = String(req.query.q ?? '').replace(/[,()%*]/g, ' ').replace(/\\/g, ' ').trim().slice(0, 60)

  let query = supabase.from('analytics_real_sessions').select(SESSION_COLUMNS, { count: 'exact' }).gte('created_at', since)
  const device = String(req.query.device ?? '')
  if (['desktop', 'mobile', 'tablet'].includes(device)) query = query.eq('device_category', device)
  const country = String(req.query.country ?? '').trim()
  if (/^[A-Za-z]{2}$/.test(country)) query = query.eq('country', country.toUpperCase())
  const source = String(req.query.source ?? '').trim().toLowerCase().slice(0, 100)
  if (source) query = query.eq('utm_source', source)
  if (req.query.engaged === '1') query = query.eq('is_engaged', true)
  if (req.query.conversion === '1') query = query.eq('has_conversion', true)
  if (req.query.visitor === 'new') query = query.eq('is_new_visitor', true)
  if (req.query.visitor === 'returning') query = query.eq('is_new_visitor', false)
  const person = String(req.query.person ?? '').trim()
  if (/^[A-Za-z0-9-]{8,64}$/.test(person)) query = query.eq('person_key', person)
  if (q) query = query.or(['entry_path', 'exit_path', 'city', 'country', 'utm_source', 'referrer_host', 'language'].map((column) => `${column}.ilike.%${q}%`).join(','))

  const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (error) {
    if (missingMigration(error.message)) return res.json({ ready: false })
    throw new Error(error.message)
  }
  const rows = (data ?? []) as unknown as SessionRow[]
  const names = await namesOf(rows)
  res.json({
    ready: true,
    page,
    pageSize,
    total: count ?? rows.length,
    sessions: rows.map((row) => ({ ...row, user: row.user_id ? names.get(row.user_id) ?? null : null })),
  })
}))

/** Una sesión por dentro: todos sus datos, cada página con su hora, cada evento con sus parámetros y las otras visitas de esa persona. */
router.get('/web/sessions/:id', handle('detalle de sesión', async (req, res) => {
  const id = String(req.params.id)
  if (!UUID.test(id)) return res.status(400).json({ error: 'Sesión no válida' })

  const { data: session, error } = await supabase.from('analytics_sessions').select('*').eq('session_id', id).maybeSingle()
  if (error) {
    if (missingMigration(error.message)) return res.json({ ready: false })
    throw new Error(error.message)
  }
  if (!session) return res.status(404).json({ error: 'No existe esa sesión' })

  const [views, events, others] = await Promise.all([
    supabase.from('analytics_page_views').select('id, path, query_params, created_at').eq('session_id', id).order('created_at', { ascending: true }).limit(500),
    supabase.from('analytics_events').select('id, event_name, event_params, is_conversion, created_at').eq('session_id', id).order('created_at', { ascending: true }).limit(500),
    supabase
      .from('analytics_sessions')
      .select('session_id, created_at, entry_path, exit_path, is_engaged, has_conversion, duration_seconds, page_views_count, utm_source, referrer_host')
      .neq('session_id', id)
      .or(session.user_id ? `client_id.eq.${session.client_id},user_id.eq.${session.user_id}` : `client_id.eq.${session.client_id}`)
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  const names = await namesOf([session as SessionRow])
  res.json({
    ready: true,
    session: { ...session, user: session.user_id ? names.get(session.user_id) ?? null : null },
    pageViews: views.data ?? [],
    events: events.data ?? [],
    otherSessions: others.data ?? [],
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

  // Cuántas cuentas reales hay en total: la diferencia con las que entraron desde que se mide es gente que no ha vuelto.
  const { count: totalAccounts } = await supabase.from('users').select('*', { count: 'exact', head: true })
    .eq('is_test_account', false).not('is_scraper_profile', 'is', true).in('user_kind', ['user', 'company'])

  res.json({
    ready: true,
    totalAccounts: totalAccounts ?? null,
    ...retention({ activity: rows.filter((row) => counted.has(row.user_id)), users }),
    // La tabla muestra solo personas reales: ni el equipo, ni las pruebas, ni el scraper.
    people: activePeople({ activity: rows.filter((row) => counted.has(row.user_id)), people: people.filter(countsAsPerson) }),
  })
}))

export default router
