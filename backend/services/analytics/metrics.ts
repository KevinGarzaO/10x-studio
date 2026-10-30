/**
 * Las cuentas del panel de analítica de AvoTalent.
 *
 * Son funciones puras sobre filas ya leídas de la base: no tocan Supabase, así se prueban y
 * así cada número del panel tiene UNA definición. Las definiciones importan:
 *
 *  - VISITANTES = navegadores distintos (`visitor_id`). Una persona que vuelve no cuenta dos
 *    veces. NO son "visitas": una visita es una entrada al sitio, y un visitante puede tener varias.
 *  - REGISTROS = cuentas reales: sin las de prueba y sin los perfiles que crea el scraper.
 *  - CONVERSIÓN = registros / visitantes (nunca registros / visitas, que la haría ver más baja).
 *  - PERFIL COMPLETO = `profile_completed`.
 *  - Los días se cuentan en hora de Monterrey, que es donde se publica y se lee el panel.
 */

/** Monterrey está en UTC-6 todo el año (México ya no usa horario de verano). */
const MONTERREY_OFFSET_MS = 6 * 3600 * 1000
const DAY_MS = 86400000

export interface VisitRow {
  visitor_id: string
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  landing_path: string | null
  created_at: string
}

export interface UserRow {
  id: string
  created_at: string
  profile_completed: boolean | null
  signup_source: string | null
  signup_medium?: string | null
  signup_campaign?: string | null
  signup_content: string | null
}

export interface LinkedInPostRow {
  vacancy_slug: string | null
  company: string | null
  role_category: string | null
  post_text?: string | null
  linkedin_post_id: string | null
  status: string
  published_at: string | null
  created_at: string
}

/** El día calendario (AAAA-MM-DD) de un instante, en hora de Monterrey. */
export function dayKey(iso: string): string {
  return new Date(Date.parse(iso) - MONTERREY_OFFSET_MS).toISOString().slice(0, 10)
}

/** La hora (0 a 23) de un instante, en hora de Monterrey. */
export function hourOf(iso: string): number {
  return new Date(Date.parse(iso) - MONTERREY_OFFSET_MS).getUTCHours()
}

/** El inicio (UTC) de la ventana de los últimos `days` días, contando el día de hoy. */
export function windowStart(days: number, now: Date = new Date()): Date {
  const today = new Date(now.getTime() - MONTERREY_OFFSET_MS)
  today.setUTCHours(0, 0, 0, 0)
  return new Date(today.getTime() - (days - 1) * DAY_MS + MONTERREY_OFFSET_MS)
}

const HOUR_MS = 3600000

/**
 * Los periodos del panel. `1` es "las últimas 24 horas": una ventana corrida que termina ahora, no el día
 * de hoy (que a las 8 am solo tendría ocho horas). Los demás son días completos de Monterrey, contando hoy.
 */
export const LAST_24_HOURS = 1

/** Cuándo empieza el periodo. */
export function periodStart(days: number, now: Date = new Date()): Date {
  return days === LAST_24_HOURS ? new Date(now.getTime() - 24 * HOUR_MS) : windowStart(days, now)
}

/** Cuánto dura el periodo, para poder compararlo con el anterior de la misma duración. */
export const periodSpanMs = (days: number): number => (days === LAST_24_HOURS ? 24 * HOUR_MS : days * DAY_MS)

/** La hora (de Monterrey) de un instante, como "2026-10-25T14". */
export const hourKey = (iso: string): string => new Date(Date.parse(iso) - MONTERREY_OFFSET_MS).toISOString().slice(0, 13)

const within = (iso: string, from: Date, to: Date) => {
  const t = Date.parse(iso)
  return t >= from.getTime() && t < to.getTime()
}

/** Navegadores distintos. */
export function uniqueVisitors(visits: Pick<VisitRow, 'visitor_id'>[]): number {
  return new Set(visits.map((visit) => visit.visitor_id)).size
}

/** Porcentaje con un decimal, o null cuando no hay base (no se inventa un 0%). */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

/** Cuánto cambió respecto al periodo anterior, en %; null si antes no había nada con qué comparar. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null
}

export interface Overview {
  days: number
  since: string
  visitors: number
  visits: number
  signups: number
  completedProfiles: number
  /** registros / visitantes */
  conversionPct: number | null
  /** Contra el periodo inmediato anterior de la misma duración. */
  vs: { visitors: number | null; signups: number | null }
  linkedin: { visitors: number; signups: number; posts: number; failedPosts: number }
  series: { day: string; visitors: number; signups: number }[]
}

export function buildOverview(input: {
  visits: VisitRow[]
  users: UserRow[]
  posts: LinkedInPostRow[]
  days: number
  now?: Date
}): Overview {
  const now = input.now ?? new Date()
  const days = input.days
  const from = periodStart(days, now)
  const previousFrom = new Date(from.getTime() - periodSpanMs(days))
  const to = new Date(now.getTime() + 1)

  const visits = input.visits.filter((visit) => within(visit.created_at, from, to))
  const previousVisits = input.visits.filter((visit) => within(visit.created_at, previousFrom, from))
  const users = input.users.filter((user) => within(user.created_at, from, to))
  const previousUsers = input.users.filter((user) => within(user.created_at, previousFrom, from))

  const visitors = uniqueVisitors(visits)
  const fromLinkedIn = visits.filter((visit) => visit.source === 'linkedin')

  // Una serie con todos los días de la ventana, también los de cero: una gráfica con huecos engaña.
  // En "24 horas" la serie es por hora (24 barras); en los demás periodos, por día.
  const hourly = days === LAST_24_HOURS
  const series = Array.from({ length: hourly ? 24 : days }, (_, index) => {
    if (hourly) {
      const hour = hourKey(new Date(now.getTime() - (23 - index) * HOUR_MS).toISOString())
      return {
        day: hour,
        visitors: uniqueVisitors(visits.filter((visit) => hourKey(visit.created_at) === hour)),
        signups: users.filter((user) => hourKey(user.created_at) === hour).length,
      }
    }
    const day = dayKey(new Date(from.getTime() + index * DAY_MS + 3600000).toISOString())
    return {
      day,
      visitors: uniqueVisitors(visits.filter((visit) => dayKey(visit.created_at) === day)),
      signups: users.filter((user) => dayKey(user.created_at) === day).length,
    }
  })

  const publishedPosts = input.posts.filter((post) => post.status === 'published' && post.published_at && within(post.published_at, from, to))

  return {
    days,
    since: from.toISOString(),
    visitors,
    visits: visits.length,
    signups: users.length,
    completedProfiles: users.filter((user) => user.profile_completed).length,
    conversionPct: pct(users.length, visitors),
    vs: {
      visitors: change(visitors, uniqueVisitors(previousVisits)),
      signups: change(users.length, previousUsers.length),
    },
    linkedin: {
      visitors: uniqueVisitors(fromLinkedIn),
      signups: users.filter((user) => user.signup_source === 'linkedin').length,
      posts: publishedPosts.length,
      failedPosts: input.posts.filter((post) => post.status === 'failed' && within(post.created_at, from, to)).length,
    },
    series,
  }
}

export interface PostPerformance {
  slug: string | null
  company: string | null
  role: string | null
  publishedAt: string | null
  linkedinPostId: string | null
  visitors: number
  signups: number
  conversionPct: number | null
}

/**
 * El rendimiento de cada publicación de LinkedIn: los visitantes que llegaron por SU enlace
 * (utm_content = la vacante, con origen linkedin) y los registros que trajo.
 */
export function postPerformance(input: { posts: LinkedInPostRow[]; visits: VisitRow[]; users: UserRow[] }): PostPerformance[] {
  return input.posts
    .filter((post) => post.status === 'published')
    .map((post) => {
      const slug = post.vacancy_slug
      const visitors = slug ? uniqueVisitors(input.visits.filter((visit) => visit.content === slug && visit.source === 'linkedin')) : 0
      const signups = slug ? input.users.filter((user) => user.signup_content === slug && user.signup_source === 'linkedin').length : 0
      return {
        slug,
        company: post.company,
        role: post.role_category,
        publishedAt: post.published_at,
        linkedinPostId: post.linkedin_post_id,
        visitors,
        signups,
        conversionPct: pct(signups, visitors),
      }
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''))
}

export interface GroupStats {
  key: string
  posts: number
  visitors: number
  signups: number
  /** Visitantes por publicación: para comparar grupos de distinto tamaño. */
  visitorsPerPost: number
  conversionPct: number | null
}

/** Agrupa el rendimiento de las publicaciones (por rol, por hora…) para ver qué funciona mejor. */
export function groupPerformance(performance: PostPerformance[], keyOf: (post: PostPerformance) => string | null): GroupStats[] {
  const groups = new Map<string, PostPerformance[]>()
  for (const post of performance) {
    const key = keyOf(post)
    if (key === null) continue
    groups.set(key, [...(groups.get(key) ?? []), post])
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const visitors = rows.reduce((sum, row) => sum + row.visitors, 0)
      const signups = rows.reduce((sum, row) => sum + row.signups, 0)
      return {
        key,
        posts: rows.length,
        visitors,
        signups,
        visitorsPerPost: Math.round((visitors / rows.length) * 10) / 10,
        conversionPct: pct(signups, visitors),
      }
    })
    .sort((a, b) => b.visitorsPerPost - a.visitorsPerPost)
}

export interface SourceRow {
  source: string
  medium: string
  campaign: string
  visitors: number
  visits: number
  signups: number
  conversionPct: number | null
}

const DIRECT = '(directo)'

/** Visitantes y registros por origen, medio y campaña. Lo que no trae origen es tráfico directo. */
export function acquisitionBySource(input: { visits: VisitRow[]; users: UserRow[] }): SourceRow[] {
  const keyOf = (source: string | null, medium: string | null, campaign: string | null) =>
    JSON.stringify([source ?? DIRECT, medium ?? '-', campaign ?? '-'])

  const rows = new Map<string, { visits: VisitRow[]; signups: number }>()
  const slot = (key: string) => {
    if (!rows.has(key)) rows.set(key, { visits: [], signups: 0 })
    return rows.get(key)!
  }

  for (const visit of input.visits) slot(keyOf(visit.source, visit.medium, visit.campaign)).visits.push(visit)
  for (const user of input.users) slot(keyOf(user.signup_source, user.signup_medium ?? null, user.signup_campaign ?? null)).signups++

  return [...rows.entries()]
    .map(([key, row]) => {
      const [source, medium, campaign] = JSON.parse(key) as [string, string, string]
      const visitors = uniqueVisitors(row.visits)
      return { source, medium, campaign, visitors, visits: row.visits.length, signups: row.signups, conversionPct: pct(row.signups, visitors) }
    })
    .sort((a, b) => b.signups - a.signups || b.visitors - a.visitors)
}

/** Las páginas por las que más gente entra. */
export function topLandingPages(visits: VisitRow[], limit = 10): { path: string; visitors: number }[] {
  const byPath = new Map<string, VisitRow[]>()
  for (const visit of visits) {
    const path = visit.landing_path || '/'
    byPath.set(path, [...(byPath.get(path) ?? []), visit])
  }
  return [...byPath.entries()]
    .map(([path, rows]) => ({ path, visitors: uniqueVisitors(rows) }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, limit)
}

export interface VacancyEventRow {
  vacancy_slug: string
  event: 'view' | 'apply'
  visitor_id: string
}

export interface VacancyEngagement {
  /** Vacantes abiertas: un navegador que abre la misma vacante dos veces cuenta una. */
  views: number
  /** Clics en "Postularse", contados igual. */
  applies: number
  /** Navegadores distintos que abrieron alguna vacante. */
  viewers: number
  /** applies / views. */
  applyRatePct: number | null
  byVacancy: { slug: string; views: number; applies: number; applyRatePct: number | null }[]
}

/**
 * Qué hace la gente con las vacantes. Todo se cuenta por navegador distinto y vacante: abrir la
 * misma vacante tres veces es una vista, y pulsar "Postularse" dos veces es un clic.
 */
export function vacancyEngagement(events: VacancyEventRow[]): VacancyEngagement {
  const pairs = (event: 'view' | 'apply') => {
    const bySlug = new Map<string, Set<string>>()
    for (const row of events) {
      if (row.event !== event) continue
      if (!bySlug.has(row.vacancy_slug)) bySlug.set(row.vacancy_slug, new Set())
      bySlug.get(row.vacancy_slug)!.add(row.visitor_id)
    }
    return bySlug
  }

  const viewed = pairs('view')
  const applied = pairs('apply')
  const sum = (map: Map<string, Set<string>>) => [...map.values()].reduce((total, set) => total + set.size, 0)
  const views = sum(viewed)
  const applies = sum(applied)

  const slugs = new Set([...viewed.keys(), ...applied.keys()])
  const byVacancy = [...slugs]
    .map((slug) => {
      const v = viewed.get(slug)?.size ?? 0
      const a = applied.get(slug)?.size ?? 0
      return { slug, views: v, applies: a, applyRatePct: pct(a, v) }
    })
    .sort((x, y) => y.views - x.views || y.applies - x.applies)

  return {
    views,
    applies,
    viewers: new Set(events.filter((row) => row.event === 'view').map((row) => row.visitor_id)).size,
    applyRatePct: pct(applies, views),
    byVacancy,
  }
}

export interface RetentionResult {
  dau: number
  wau: number
  mau: number
  /** DAU / MAU: qué parte de la gente activa del mes entra un día cualquiera. */
  stickinessPct: number | null
  /** Primer día del que hay datos de actividad: antes de él no se puede medir. */
  trackingSince: string | null
  /** Cuántos días distintos tienen datos de actividad. Con pocos, activos hoy / semana / mes coinciden. */
  trackingDays: number
  cohorts: { week: string; size: number; retained: (number | null)[] }[]
}

const weekStart = (dayIso: string): string => {
  const date = new Date(`${dayIso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

/**
 * Retención. Una persona está "activa" un día si hizo cualquier petición con sesión ese día.
 * Cohorte = semana en que se registró; el % de la semana N es cuántos de esa cohorte estuvieron
 * activos durante la semana N después de su semana de registro (semana 0 = la del registro).
 */
export function retention(input: { activity: { user_id: string; day: string }[]; users: UserRow[]; today?: string; weeks?: number }): RetentionResult {
  const today = input.today ?? dayKey(new Date().toISOString())
  const weeks = input.weeks ?? 5
  const daysBack = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10)

  const activeIn = (from: string) => new Set(input.activity.filter((row) => row.day >= from && row.day <= today).map((row) => row.user_id)).size
  const dau = new Set(input.activity.filter((row) => row.day === today).map((row) => row.user_id)).size
  const mau = activeIn(daysBack(29))

  const days = input.activity.map((row) => row.day).sort()
  const trackingSince = days[0] ?? null
  const trackingDays = new Set(days).size

  const activeWeeks = new Map<string, Set<string>>()
  for (const row of input.activity) {
    const key = weekStart(row.day)
    if (!activeWeeks.has(key)) activeWeeks.set(key, new Set())
    activeWeeks.get(key)!.add(row.user_id)
  }

  const cohortsByWeek = new Map<string, string[]>()
  for (const user of input.users) {
    const week = weekStart(dayKey(user.created_at))
    cohortsByWeek.set(week, [...(cohortsByWeek.get(week) ?? []), user.id])
  }

  const currentWeek = weekStart(today)
  const cohorts = [...cohortsByWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, weeks)
    .map(([week, ids]) => ({
      week,
      size: ids.length,
      retained: Array.from({ length: weeks }, (_, offset) => {
        const target = new Date(Date.parse(`${week}T00:00:00Z`) + offset * 7 * DAY_MS).toISOString().slice(0, 10)
        // Una semana que aún no termina, o que empezó antes de medir actividad, no se puede decir.
        if (target > currentWeek || (trackingSince && target < weekStart(trackingSince))) return null
        const active = activeWeeks.get(target)
        return pct(ids.filter((id) => active?.has(id)).length, ids.length)
      }),
    }))

  return { dau, wau: activeIn(daysBack(6)), mau, stickinessPct: pct(dau, mau), trackingSince, trackingDays, cohorts }
}

export interface PersonRow {
  id: string
  username: string | null
  display_name: string | null
  photo_url: string | null
  user_kind: string
  created_at: string
  profile_completed: boolean | null
  is_test_account?: boolean | null
  is_scraper_profile?: boolean | null
}

/**
 * Quién cuenta como "persona" en la retención: ni cuentas de prueba, ni perfiles del scraper, ni el
 * equipo (administradores). Quien mira el panel todos los días no es un usuario que "vuelve".
 */
export const countsAsPerson = (person: Pick<PersonRow, 'user_kind' | 'is_test_account' | 'is_scraper_profile'>): boolean =>
  !person.is_test_account && !person.is_scraper_profile && person.user_kind !== 'superadmin'

export interface ActivePerson {
  id: string
  username: string | null
  display_name: string | null
  photo_url: string | null
  kind: string
  createdAt: string
  profileCompleted: boolean | null
  /** Si entra en las cifras (false para el equipo, las pruebas y el scraper). */
  counted: boolean
  /** Días distintos activos en la ventana. */
  daysActive: number
  lastActive: string
  activeToday: boolean
  /** Los días (YYYY-MM-DD, de más viejo a más nuevo) en que estuvo activa: de ahí sale cuándo volvió. */
  activeDays: string[]
  /** Días distintos de actividad DESPUÉS del día de su registro: cuántas veces volvió. 0 = solo vino el día que se registró. */
  returnDays: number
}

/** Las personas con actividad en los últimos `days` días: la lista detrás de "activos hoy / 7 / 30 días". */
export function activePeople(input: { activity: { user_id: string; day: string }[]; people: PersonRow[]; today?: string; days?: number }): ActivePerson[] {
  const today = input.today ?? dayKey(new Date().toISOString())
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - ((input.days ?? 30) - 1) * DAY_MS).toISOString().slice(0, 10)
  const byUser = new Map<string, Set<string>>()
  for (const row of input.activity) {
    if (row.day < from || row.day > today) continue
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Set())
    byUser.get(row.user_id)!.add(row.day)
  }

  return input.people
    .filter((person) => byUser.has(person.id))
    .map((person) => {
      const days = [...byUser.get(person.id)!].sort()
      const signupDay = dayKey(person.created_at)
      return {
        id: person.id,
        username: person.username,
        display_name: person.display_name,
        photo_url: person.photo_url,
        kind: person.user_kind,
        createdAt: person.created_at,
        profileCompleted: person.profile_completed,
        counted: countsAsPerson(person),
        daysActive: days.length,
        lastActive: days[days.length - 1],
        activeToday: days[days.length - 1] === today,
        activeDays: days,
        returnDays: days.filter((day) => day > signupDay).length,
      }
    })
    // Primero quien más días ha estado activo; a igual número, quien entró más recientemente.
    .sort((a, b) => b.daysActive - a.daysActive || b.lastActive.localeCompare(a.lastActive))
}
