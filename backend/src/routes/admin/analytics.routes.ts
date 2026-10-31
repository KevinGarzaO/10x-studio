import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { siteUrl } from '../../../services/linkedin/vacancy-publisher'
import { nextPublication } from '../../../services/analytics/schedule'
import { readAll } from '../../../services/analytics/read'
import { ttlCache } from '../../../services/analytics/cache'
import { emptySegment, isMissingMigration, loadSegments, trackingSince, SEGMENT_GROUPS, type SegmentCounts, type SegmentGroup } from '../../../services/analytics/segments'
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

/** Una fila de segmentos del periodo [from, to), o ceros si nadie entró (un periodo sin gente es un cero real). */
const segmentOf = (rows: SegmentCounts[] | null, label: string): SegmentCounts | null => (rows === null ? null : rows[0] ?? emptySegment(label))

/** Si la medición empezó después de que el periodo arrancó, las cifras están incompletas: lo de antes no se puede recuperar. */
const isPartial = (since: string | null, from: Date) => since === null || Date.parse(since) > from.getTime()

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
 * Vacantes con LA distinción: de las personas que abrieron cada vacante, cuántas están registradas y cuántas no, cuántas son nuevas o
 * recurrentes, y cuántas de las nuevas son activas o solo pasaron (backend/sql/web-analytics-segments-migration.sql). La fila con
 * `slug: null` es el total (personas distintas). `null` si esa medición aún no existe: entonces se cae a la cuenta anterior.
 */
async function vacanciesBySegments(days: number) {
  const now = new Date()
  const from = periodStart(days, now)
  const to = new Date(now.getTime() + 1)
  const { data, error } = await supabase.rpc('analytics_vacancy_segments', { p_from: from.toISOString(), p_to: to.toISOString(), p_limit: 100 })
  if (error) {
    if (isMissingMigration(error.message)) return null
    throw new Error(error.message)
  }

  type Row = { slug: string | null; viewers: number; viewers_active: number; viewers_new: number; viewers_new_active: number; viewers_returning: number; viewers_registered: number; viewers_anonymous: number; applicants: number; applicants_active: number }
  const rows = (data ?? []) as Row[]
  const total = rows.find((row) => row.slug === null)
  const perVacancy = rows.filter((row) => row.slug !== null) as (Row & { slug: string })[]

  const since = from.toISOString()
  const saved = await readAll<{ source_id: string }>((start, end) =>
    supabase.from('user_vacancy_history').select('source_id').eq('is_saved', true).gte('saved_at', since).range(start, end),
  )
  const shown = await supabase.from('user_vacancy_history').select('*', { count: 'exact', head: true }).gte('seen_at', since)
  const { data: posts } = perVacancy.length > 0
    ? await supabase.from('community_posts').select('id, slug, title, company, role_category').in('slug', perVacancy.map((row) => row.slug))
    : { data: [] as { id: string; slug: string; title: string; company: string | null; role_category: string | null }[] }
  const bySlug = new Map((posts ?? []).map((post) => [post.slug, post]))
  const savedCount = new Map<string, number>()
  for (const row of saved) savedCount.set(row.source_id, (savedCount.get(row.source_id) ?? 0) + 1)

  const shape = (row: Row | undefined) => ({
    viewers: row?.viewers ?? 0,
    viewersActive: row?.viewers_active ?? 0,
    viewersVisitOnly: (row?.viewers ?? 0) - (row?.viewers_active ?? 0),
    viewersNew: row?.viewers_new ?? 0,
    viewersNewActive: row?.viewers_new_active ?? 0,
    viewersNewVisitOnly: (row?.viewers_new ?? 0) - (row?.viewers_new_active ?? 0),
    viewersReturning: row?.viewers_returning ?? 0,
    viewersRegistered: row?.viewers_registered ?? 0,
    viewersAnonymous: row?.viewers_anonymous ?? 0,
    applicants: row?.applicants ?? 0,
    applicantsActive: row?.applicants_active ?? 0,
    // De las personas ACTIVAS que abrieron, cuántas pulsaron Postularse.
    applyRatePct: pct(row?.applicants_active ?? 0, row?.viewers_active ?? 0),
  })

  const trackedSince = await trackingSince()
  return {
    ready: true as const,
    source: 'segments' as const,
    days,
    trackingSince: trackedSince,
    partial: isPartial(trackedSince, from),
    totals: { ...shape(total), vacancies: perVacancy.length, saved: saved.length, recommendationsShown: shown.count ?? 0 },
    top: perVacancy.map((row) => {
      const post = bySlug.get(row.slug)
      return { slug: row.slug, title: post?.title ?? row.slug, company: post?.company ?? null, role: post?.role_category ?? null, ...shape(row), saved: post ? savedCount.get(post.id) ?? 0 : 0 }
    }),
  }
}

/** Vacantes: cuánta gente activa abre cada una, cuánta pulsa "Postularse" y cuánta la guarda. */
router.get('/vacancies', handle('vacantes', async (req, res) => {
  const days = periodOf(req)
  const bySegments = await vacanciesBySegments(days)
  if (bySegments) return res.json(bySegments)

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
 * Los visitantes del resumen, con LA distinción (nuevas / recurrentes, activas / solo visita, registradas / anónimas) y la conversión
 * sobre las nuevas activas. Salen de la analítica web propia (backend/sql/web-analytics-segments-migration.sql). Si esa medición aún
 * no existe, `ready: false` y el panel lo dice.
 *
 * La comparación contra el periodo anterior solo se da si la medición ya existía entonces: si no, sería comparar contra ceros.
 */
async function visitorsTraffic(days: number, bucketDays: string[]) {
  const now = new Date()
  const to = new Date(now.getTime() + 1)
  const from = periodStart(days, now)
  const previousFrom = new Date(from.getTime() - periodSpanMs(days))

  const [current, previous, linkedin, series, since] = await Promise.all([
    loadSegments('all', from, to, 1),
    loadSegments('all', previousFrom, from, 1),
    loadSegments('linkedin', from, to, 1),
    supabase.rpc('analytics_visitors_series', { p_from: from.toISOString(), p_to: to.toISOString(), p_bucket: days === 1 ? 'hour' : 'day' }),
    trackingSince(),
  ])
  if (series.error) {
    if (isMissingMigration(series.error.message)) return { ready: false as const }
    throw new Error(series.error.message)
  }
  const now_ = segmentOf(current, 'Todo el sitio')
  if (!now_) return { ready: false as const }
  const before = segmentOf(previous, 'Todo el sitio')

  const byBucket = new Map(((series.data ?? []) as { bucket: string; active: number; new_active: number }[]).map((row) => [row.bucket, row]))
  return {
    ready: true as const,
    trackingSince: since,
    // El periodo está incompleto si la medición empezó después de que el periodo arrancó.
    partial: isPartial(since, from),
    segments: now_,
    linkedinActive: segmentOf(linkedin, 'LinkedIn')?.active ?? 0,
    vs: since !== null && Date.parse(since) <= previousFrom.getTime() && before
      ? { active: change(now_.active, before.active), newActive: change(now_.newActive, before.newActive) }
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

/** Suma varias filas de segmentos (por ejemplo, las publicaciones de un mismo rol). Una persona que visitó dos publicaciones cuenta en las dos. */
function sumSegments(label: string, rows: SegmentCounts[]): SegmentCounts {
  const total = emptySegment(label)
  for (const row of rows) {
    total.visits += row.visits; total.people += row.people; total.active += row.active
    total.newPeople += row.newPeople; total.newActive += row.newActive; total.newVisitOnly += row.newVisitOnly
    total.returningPeople += row.returningPeople; total.returningActive += row.returningActive; total.returningVisitOnly += row.returningVisitOnly
    total.registered += row.registered; total.registeredActive += row.registeredActive
    total.anonymous += row.anonymous; total.anonymousActive += row.anonymousActive; total.registeredNew += row.registeredNew
  }
  total.conversionPct = pct(total.registeredNew, total.newActive)
  return total
}

/** LinkedIn: el estado del publicador y el rendimiento de cada publicación, con LA distinción de personas. */
router.get('/linkedin', handle('linkedin', async (req, res) => {
  const days = periodOf(req)
  const since = new Date(periodStart(days).getTime()).toISOString()
  const now = new Date()
  const from = periodStart(days, now)
  const to = new Date(now.getTime() + 1)

  const [perPost, whole, trackedSince] = await Promise.all([loadSegments('linkedin_post', from, to, 500), loadSegments('linkedin', from, to, 1), trackingSince()])
  const segmented = perPost !== null && whole !== null
  const [posts, visits, users, { data: profile }] = await Promise.all([
    linkedinPosts(since),
    // Sin la medición nueva: la cuenta anterior, por navegador y sin saber si hizo algo. El panel lo avisa.
    segmented ? Promise.resolve([] as VisitRow[]) : visitsSince(since),
    realUsers(since),
    supabase.from('linkedin_profiles').select('first_name, last_name, headline, photo_url, connected_at, expires_at').not('access_token', 'is', null).order('connected_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const expiresAt = profile?.expires_at ?? null
  const failed = posts.filter((post) => post.status === 'failed').length
  const status = {
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
  }

  if (!segmented) {
    const performance = postPerformance({ posts, visits, users })
    return res.json({
      days,
      source: 'legacy',
      status,
      totals: { published: performance.length, failed, visitors: performance.reduce((sum, post) => sum + post.visitors, 0), signups: performance.reduce((sum, post) => sum + post.signups, 0) },
      posts: performance,
      byRole: groupPerformance(performance, (post) => post.role),
      byHour: groupPerformance(performance, (post) => (post.publishedAt ? `${String(hourOf(post.publishedAt)).padStart(2, '0')}:00` : null)),
      byCompany: groupPerformance(performance, (post) => post.company).slice(0, 10),
    })
  }

  const bySlug = new Map(perPost.map((row) => [row.label, row]))
  const published = posts
    .filter((post) => post.status === 'published')
    .map((post) => ({
      slug: post.vacancy_slug,
      company: post.company,
      role: post.role_category,
      publishedAt: post.published_at,
      linkedinPostId: post.linkedin_post_id,
      segments: (post.vacancy_slug ? bySlug.get(post.vacancy_slug) : undefined) ?? emptySegment(post.vacancy_slug ?? '—'),
    }))
    .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''))

  // Comparar grupos de distinto tamaño: personas por publicación.
  const group = (keyOf: (post: (typeof published)[number]) => string | null) => {
    const groups = new Map<string, typeof published>()
    for (const post of published) {
      const key = keyOf(post)
      if (key !== null) groups.set(key, [...(groups.get(key) ?? []), post])
    }
    return [...groups.entries()]
      .map(([key, rows]) => ({ key, posts: rows.length, segments: sumSegments(key, rows.map((row) => row.segments)), peoplePerPost: Math.round((rows.reduce((sum, row) => sum + row.segments.people, 0) / rows.length) * 10) / 10 }))
      .sort((a, b) => b.peoplePerPost - a.peoplePerPost)
  }

  res.json({
    days,
    source: 'segments',
    trackingSince: trackedSince,
    partial: isPartial(trackedSince, from),
    status,
    totals: { published: published.length, failed, segments: segmentOf(whole, 'LinkedIn') },
    posts: published,
    byRole: group((post) => post.role),
    byHour: group((post) => (post.publishedAt ? `${String(hourOf(post.publishedAt)).padStart(2, '0')}:00` : null)),
    byCompany: group((post) => post.company).slice(0, 10),
  })
}))

/** Adquisición: de dónde llega la gente y por dónde avanza hasta quedarse, con LA distinción de personas. */
router.get('/acquisition', handle('adquisición', async (req, res) => {
  const days = periodOf(req)
  const since = periodStart(days).toISOString()
  const now = new Date()
  const from = periodStart(days, now)
  const to = new Date(now.getTime() + 1)

  const [channels, landing, whole, trackedSince] = await Promise.all([loadSegments('channel', from, to, 200), loadSegments('landing', from, to, 50), loadSegments('all', from, to, 1), trackingSince()])
  const segmented = channels !== null && landing !== null && whole !== null
  const [visits, users] = await Promise.all([segmented ? Promise.resolve([] as VisitRow[]) : visitsSince(since), realUsers(since)])

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
  const completed = users.filter((user) => user.profile_completed).length

  if (!segmented) {
    // Sin la medición nueva: la cuenta anterior, por navegador y sin saber si hizo algo. El panel lo avisa.
    const visitors = uniqueVisitors(visits)
    return res.json({
      days,
      source: 'legacy',
      sources: acquisitionBySource({ visits, users }),
      landingPages: topLandingPages(visits, 10),
      funnel: [
        { step: 'Visitantes', count: visitors, pctOfPrevious: null },
        { step: 'Se registraron', count: users.length, pctOfPrevious: pct(users.length, visitors) },
        { step: 'Completaron su perfil', count: completed, pctOfPrevious: pct(completed, users.length) },
        { step: 'Volvieron otro día', count: returned, pctOfPrevious: returned === null ? null : pct(returned, completed || users.length) },
      ],
    })
  }

  const all = segmentOf(whole, 'Todo el sitio')!
  res.json({
    days,
    source: 'segments',
    trackingSince: trackedSince,
    partial: isPartial(trackedSince, from),
    totals: all,
    channels,
    landing,
    // Cada paso en PERSONAS: de todas las que entraron, a las activas, a las nuevas activas, a las que se registraron.
    funnel: [
      { step: 'Personas que entraron', count: all.people, pctOfPrevious: null },
      { step: 'Activas (hicieron algo)', count: all.active, pctOfPrevious: pct(all.active, all.people) },
      { step: 'Nuevas activas', count: all.newActive, pctOfPrevious: pct(all.newActive, all.active) },
      { step: 'Se registraron (de las nuevas activas)', count: all.registeredNew, pctOfPrevious: pct(all.registeredNew, all.newActive) },
      { step: 'Completaron su perfil (cuentas del periodo)', count: completed, pctOfPrevious: pct(completed, users.length) },
      { step: 'Volvieron otro día (cuentas del periodo)', count: returned, pctOfPrevious: returned === null ? null : pct(returned, completed || users.length) },
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

const webPeriod = (req: Request) => {
  const requested = parseInt(String(req.query.days ?? '30'), 10)
  return WEB_PERIODS.includes(requested) ? requested : 30
}

/** Si las funciones SQL aún no existen (falta una migración) se dice, en lugar de mostrar ceros que parecerían reales. */
const missingMigration = isMissingMigration

/** El rango de un periodo pedido: desde su inicio hasta ahora. */
const webRange = (days: number) => {
  const now = new Date()
  return { from: periodStart(days, now), to: new Date(now.getTime() + 1) }
}

/**
 * Un desglose (canal, página de entrada, idioma, dispositivo, sistema, navegador, pantalla, zona horaria, país, región, ciudad, sitio
 * de origen...) con LA distinción de personas en cada fila. Pueden pedirse varios de una vez: `?list=language,device_category`.
 */
router.get('/web/segments', handle('desgloses web', async (req, res) => {
  const wanted = String(req.query.list ?? req.query.group ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  if (wanted.length === 0 || wanted.length > 8 || wanted.some((item) => !(SEGMENT_GROUPS as readonly string[]).includes(item))) {
    return res.status(400).json({ error: 'Desgloses no válidos', allowed: SEGMENT_GROUPS })
  }
  const days = webPeriod(req)
  const { from, to } = webRange(days)
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100'), 10) || 100, 1), 500)
  const [results, trackedSince] = await Promise.all([Promise.all(wanted.map((group) => loadSegments(group as SegmentGroup, from, to, limit))), trackingSince()])
  if (results.some((result) => result === null)) return res.json({ ready: false })
  res.json({
    ready: true,
    days,
    trackingSince: trackedSince,
    partial: isPartial(trackedSince, from),
    groups: Object.fromEntries(wanted.map((group, index) => [group, results[index]])),
  })
}))

/** Mapa: las ciudades con sus coordenadas, y los países y regiones con la misma distinción. */
router.get('/web/geo', handle('geografía web', async (req, res) => {
  const days = webPeriod(req)
  const { from, to } = webRange(days)
  const [points, countries, regions] = await Promise.all([
    supabase.rpc('analytics_geo_points', { p_days: days }),
    loadSegments('country', from, to, 250),
    loadSegments('region', from, to, 250),
  ])
  if (points.error) {
    if (missingMigration(points.error.message)) return res.json({ ready: false })
    throw new Error(points.error.message)
  }
  if (countries === null || regions === null) return res.json({ ready: false })
  res.json({ ready: true, days, points: points.data ?? [], countries, regions })
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

/** Los enlaces a la grabación de Clarity de estas sesiones. Si la tabla aún no existe (falta la migración) simplemente no hay enlaces. */
async function clarityUrlsOf(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('analytics_clarity_links').select('session_id, clarity_session_url').in('session_id', ids)
  if (error) return new Map()
  return new Map((data ?? []).map((row: { session_id: string; clarity_session_url: string }) => [row.session_id, row.clarity_session_url]))
}

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
  const [names, videos] = await Promise.all([namesOf(rows), clarityUrlsOf(rows.map((row) => String(row.session_id)))])
  res.json({
    ready: true,
    page,
    pageSize,
    total: count ?? rows.length,
    sessions: rows.map((row) => ({ ...row, user: row.user_id ? names.get(row.user_id) ?? null : null, clarity_url: videos.get(String(row.session_id)) ?? null })),
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
  const [names, videos] = await Promise.all([namesOf([session as SessionRow]), clarityUrlsOf([id])])
  res.json({
    ready: true,
    session: { ...session, user: session.user_id ? names.get(session.user_id) ?? null : null, clarity_url: videos.get(id) ?? null },
    pageViews: views.data ?? [],
    events: events.data ?? [],
    otherSessions: others.data ?? [],
  })
}))

/**
 * Retención de la medición nueva (Tráfico web > Retención). No sustituye a /retention (que lee user_activity_daily): usa las
 * sesiones nuevas y la misma distinción de personas. Activa = tuvo una sesión activa ese día; volvió = estuvo activa un día
 * después del de su primera visita (o de su cuenta).
 */
router.get('/web/retention', handle('retención web', async (req, res) => {
  const days = webPeriod(req)
  const [active, cohorts, people, trackedSince] = await Promise.all([
    supabase.rpc('analytics_active_users', { p_days: days }),
    supabase.rpc('analytics_retention_cohorts', { p_weeks: 8 }),
    supabase.rpc('analytics_people_activity', { p_days: days, p_limit: 1000 }),
    trackingSince(),
  ])
  const failed = [active, cohorts, people].find((result) => result.error)
  if (failed?.error) {
    if (missingMigration(failed.error.message)) return res.json({ ready: false })
    throw new Error(failed.error.message)
  }

  const rows = (people.data ?? []) as { person_key: string; is_registered: boolean; first_day: string; is_new: boolean; days_active: number; return_days: number; last_active: string; active_days: string[] | null }[]
  const registeredIds = rows.filter((row) => row.is_registered).map((row) => row.person_key)
  const found = registeredIds.length
    ? await supabase.from('users').select('id, username, display_name, photo_url, profile_completed').in('id', registeredIds).limit(1000)
    : { data: [] as { id: string; username: string | null; display_name: string | null; photo_url: string | null; profile_completed: boolean | null }[] }
  const byId = new Map((found.data ?? []).map((user) => [user.id, user]))

  const today = dayKey(new Date().toISOString())
  const list = rows.map((row) => {
    const user = byId.get(row.person_key)
    return {
      key: row.person_key,
      registered: row.is_registered,
      username: user?.username ?? null,
      displayName: user?.display_name ?? null,
      photoUrl: user?.photo_url ?? null,
      profileCompleted: user?.profile_completed ?? null,
      isNew: row.is_new,
      firstDay: row.first_day,
      daysActive: row.days_active,
      returnDays: row.return_days,
      lastActive: row.last_active,
      activeToday: row.last_active === today,
      activeDays: row.active_days ?? [],
    }
  })

  // "Podían volver" son las personas cuya primera visita fue antes de hoy: las de hoy aún no tuvieron un día después.
  const eligible = list.filter((person) => person.firstDay < today)
  const returned = eligible.filter((person) => person.returnDays > 0)
  const daily = (active.data ?? []) as { day: string; dau: number; wau: number; mau: number }[]
  const latest = daily[daily.length - 1]

  const byWeek = new Map<string, { week: string; size: number; retained: { offset: number; count: number; pct: number | null }[] }>()
  for (const row of (cohorts.data ?? []) as { cohort_week: string; cohort_size: number; week_offset: number; retained: number; retained_pct: number | null }[]) {
    const entry = byWeek.get(row.cohort_week) ?? { week: row.cohort_week, size: row.cohort_size, retained: [] }
    entry.retained.push({ offset: row.week_offset, count: row.retained, pct: row.retained_pct })
    byWeek.set(row.cohort_week, entry)
  }

  const from = webRange(days).from
  res.json({
    ready: true,
    days,
    trackingSince: trackedSince,
    partial: isPartial(trackedSince, from),
    summary: {
      dau: latest?.dau ?? 0,
      wau: latest?.wau ?? 0,
      mau: latest?.mau ?? 0,
      stickinessPct: latest && latest.mau > 0 ? Math.round((latest.dau / latest.mau) * 1000) / 10 : null,
      activePeople: list.length,
      newActive: list.filter((person) => person.isNew).length,
      returningActive: list.filter((person) => !person.isNew).length,
      eligible: eligible.length,
      returned: returned.length,
      returnRatePct: pct(returned.length, eligible.length),
    },
    daily,
    people: list,
    cohorts: [...byWeek.values()],
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
