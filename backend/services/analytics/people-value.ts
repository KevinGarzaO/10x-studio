import { supabase } from '../supabase.service'
import { readAll } from './read'
import { dayKey } from './metrics'
import { wantsCommunityNews } from '../email/community-news'

/**
 * Personas de valor, enganche y temperatura (7 nov 2026). Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). SOLO para el
 * fundador (lleva correos y fotos); el agente de producto lee únicamente conteos (`summarize`), nunca correos ni nombres.
 *
 *   VALOR ....... los puntos de todo lo que la persona ha hecho (acumulado).
 *   ENGANCHE .... el USO de los últimos ENGAGEMENT_DAYS días: las mismas acciones y el mismo tope de repeticiones, SIN las de configurar la cuenta
 *                 (ENGAGEMENT_EXCLUDED: completar el perfil), más los DÍAS DISTINTOS de actividad en ese periodo (ACTIVE_DAY_POINTS por día).
 *   TEMPERATURA . sale del ENGANCHE (no de la última actividad): caliente, tibio o frío según los umbrales de TEMPERATURE.
 *
 * TODO lo que se puede ajustar está aquí arriba, en un solo lugar: puntos, tope, periodo y umbrales. Cambiar uno no toca nada más.
 */
export const VALUE_POINTS = {
  profileComplete: 3, // el perfil está completo (una vez)
  savedVacancy: 1, // por cada vacante guardada
  tappedApply: 2, // por cada vez que tocó postular y salió al sitio de la empresa
  applied: 4, // por cada vacante que dijo haberse postulado
  returnedAnotherDay: 3, // volvió otro día distinto al de su registro (una vez)
  emailClick: 2, // por cada clic en un correo (webhook de Resend, email_events). Las aperturas nunca suman
  participated: 5, // creó una discusión, un comentario o un voto (una vez)
} as const
export type ActionKey = keyof typeof VALUE_POINTS
/** Las acciones que se cuentan UNA SOLA VEZ (por periodo): aunque se repitan, solo la primera da puntos. Las demás se repiten hasta MAX_PER_ACTION. */
export const ONCE_ACTIONS: readonly ActionKey[] = ['profileComplete', 'returnedAnotherDay', 'participated']
const ONCE: ReadonlySet<ActionKey> = new Set(ONCE_ACTIONS)
/** Una misma acción repetida no sigue sumando para siempre (en el valor y, aparte, en el enganche). */
export const MAX_PER_ACTION = 3
/** Cuántos días hacia atrás cuenta el enganche. */
export const ENGAGEMENT_DAYS = 7
/** Acciones que cuentan en el VALOR pero no en el enganche: configurar la cuenta no es usar la app (completar el perfil). */
export const ENGAGEMENT_EXCLUDED: readonly ActionKey[] = ['profileComplete']
/** Puntos de enganche por cada día distinto de actividad en el periodo (de 0 a ENGAGEMENT_DAYS días). Provisional. */
export const ACTIVE_DAY_POINTS = 1
/**
 * Temperatura por ENGANCHE (puntos de los últimos ENGAGEMENT_DAYS días): caliente desde `hotAtLeast`, tibio desde `warmAtLeast`, frío por debajo.
 * PROVISIONALES hasta ver la distribución real (ver `engagementDistribution`).
 */
export const TEMPERATURE = { hotAtLeast: 6, warmAtLeast: 2 } as const
/** Rangos del ENGANCHE para el resumen (y para fijar los cortes de temperatura mirando cuántas cuentas caen en cada uno). */
export const ENGAGEMENT_RANGES: { label: string; min: number; max: number }[] = [
  { label: '0', min: 0, max: 0 },
  { label: '1 a 2', min: 1, max: 2 },
  { label: '3 a 5', min: 3, max: 5 },
  { label: '6 a 8', min: 6, max: 8 },
  { label: '9 o más', min: 9, max: Number.POSITIVE_INFINITY },
]
/** Rangos de puntos para el resumen del valor. */
export const POINT_RANGES: { label: string; min: number; max: number }[] = [
  { label: '0', min: 0, max: 0 },
  { label: '1 a 3', min: 1, max: 3 },
  { label: '4 a 7', min: 4, max: 7 },
  { label: '8 a 14', min: 8, max: 14 },
  { label: '15 o más', min: 15, max: Number.POSITIVE_INFINITY },
]

export type Temperature = 'caliente' | 'tibio' | 'frio'
const DAY_MS = 86_400_000

/** Algo que la persona hizo. `at` null = se sabe que lo hizo pero no cuándo (cuenta en el valor, no en el enganche). */
export interface DatedAction { action: ActionKey; at: string | null }

export interface PersonInput {
  id: string
  email: string | null
  /** El nombre que se muestra: ver `displayNameOf` (la columna `users.name` está vacía; el nombre real vive en `display_name`). */
  name: string | null
  photo_url: string | null
  created_at: string
  profile_completed: boolean | null
  email_opt_out: boolean | null
  email_prefs: { community?: boolean } | null
}

/**
 * Cada acción con los puntos que le dio al valor y al enganche. Cuando alguno es 0, `notes` dice POR QUÉ (no una lista de posibles razones):
 * ya se cuenta una sola vez, ya llegó al tope de repeticiones, no tiene fecha o quedó fuera de los últimos días.
 */
export interface PersonEvent { action: ActionKey; at: string | null; valuePoints: number; engagementPoints: number; notes: string[] }

export interface PersonValueRow {
  id: string
  email: string | null
  name: string | null
  photoUrl: string | null
  createdAt: string
  value: number
  /** Puntos de uso de los últimos días: `actionPoints` (acciones) + `activeDayPoints` (días activos). */
  engagement: number
  actionPoints: number
  /** Días distintos con actividad en los últimos ENGAGEMENT_DAYS días (de 0 a ENGAGEMENT_DAYS), del más reciente al más antiguo. */
  activeDays7: number
  activeDays7List: string[]
  activeDayPoints: number
  temperature: Temperature
  reason: string
  lastActiveDay: string | null
  daysSinceActive: number | null
  acceptsCommunityNews: boolean
  emailClicks: number
  events: PersonEvent[]
}

export function temperatureOf(engagement: number): Temperature {
  if (engagement >= TEMPERATURE.hotAtLeast) return 'caliente'
  if (engagement >= TEMPERATURE.warmAtLeast) return 'tibio'
  return 'frio'
}

const LABEL: Record<Temperature, string> = { caliente: 'Caliente', tibio: 'Tibio', frio: 'Frío' }
const pts = (n: number) => `${n} ${n === 1 ? 'punto' : 'puntos'}`

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** La frase que explica la temperatura: de dónde salen los puntos de uso y, si aplica, que completar el perfil no cuenta como enganche. */
export function reasonOf(engagement: number, temperature: Temperature, parts: { actionPoints?: number; activeDays?: number; profileComplete?: boolean } = {}): string {
  const days = `en los últimos ${ENGAGEMENT_DAYS} días`
  const profile = parts.profileComplete ? ' Completar el perfil no cuenta como enganche.' : ''
  const detail = parts.actionPoints !== undefined && (parts.activeDays ?? 0) > 0
    ? ` (${pts(parts.actionPoints)} por acciones y ${plural(parts.activeDays ?? 0, 'día activo', 'días activos')})`
    : ''
  if (temperature === 'caliente') return `${LABEL.caliente}: sumó ${pts(engagement)} de uso ${days}${detail} (desde ${TEMPERATURE.hotAtLeast} es caliente).${profile}`
  if (temperature === 'tibio') return `${LABEL.tibio}: sumó ${pts(engagement)} de uso ${days}${detail} (de ${TEMPERATURE.warmAtLeast} a ${TEMPERATURE.hotAtLeast - 1} es tibio).${profile}`
  return engagement === 0
    ? `${LABEL.frio}: no sumó puntos de uso ${days}.${profile}`
    : `${LABEL.frio}: sumó solo ${pts(engagement)} de uso ${days}${detail} (menos de ${TEMPERATURE.warmAtLeast} es frío).${profile}`
}

/**
 * Reparte los puntos entre las acciones: las repetibles dan puntos hasta MAX_PER_ACTION (las más antiguas primero), las de una sola vez dan sus
 * puntos a la primera. `inWindow` decide qué acciones cuentan (todas para el valor; solo las recientes para el enganche).
 */
type Why = null | 'outside' | 'once' | 'cap' | 'setup'
function award(actions: DatedAction[], inWindow: (action: DatedAction) => boolean, excluded: ReadonlySet<ActionKey> = new Set()): { points: number[]; why: Why[] } {
  const order = actions.map((_, index) => index).sort((a, b) => (actions[a].at ?? '').localeCompare(actions[b].at ?? ''))
  const taken = new Map<ActionKey, number>()
  const points = new Array<number>(actions.length).fill(0)
  const why = new Array<Why>(actions.length).fill(null)
  for (const index of order) {
    const item = actions[index]
    if (excluded.has(item.action)) { why[index] = 'setup'; continue }
    if (!inWindow(item)) { why[index] = 'outside'; continue }
    const count = taken.get(item.action) ?? 0
    if (count >= (ONCE.has(item.action) ? 1 : MAX_PER_ACTION)) { why[index] = ONCE.has(item.action) ? 'once' : 'cap'; continue }
    taken.set(item.action, count + 1)
    points[index] = VALUE_POINTS[item.action]
  }
  return { points, why }
}

const periodText = () => `los últimos ${ENGAGEMENT_DAYS} días`
/** La razón concreta de un 0, en palabras. */
function noteFor(action: ActionKey, at: string | null, why: 'outside' | 'once' | 'cap' | 'setup', target: 'valor' | 'enganche'): string {
  if (why === 'setup') return 'Enganche: completar el perfil es configurar la cuenta, no usar la app, así que solo cuenta en el valor'
  if (why === 'once') return `${target === 'valor' ? 'Valor' : 'Enganche'}: esta acción se cuenta una sola vez y ya se contó`
  if (why === 'cap') return `${target === 'valor' ? 'Valor' : 'Enganche'}: ya llegó al tope de ${MAX_PER_ACTION} repeticiones`
  return at === null ? 'Enganche: no se sabe la fecha, así que no cuenta en el enganche' : `Enganche: pasó hace más de ${periodText().replace('los últimos ', '')}`
}

/** Pura: valor, enganche y temperatura de cada persona a partir de lo que hizo y cuándo. */
export interface EngagementRules { excluded: readonly ActionKey[]; activeDayPoints: number }
export const CURRENT_RULES: EngagementRules = { excluded: ENGAGEMENT_EXCLUDED, activeDayPoints: ACTIVE_DAY_POINTS }

export function buildPeopleValue(people: PersonInput[], actionsBy: Map<string, DatedAction[]>, activeDays: Map<string, string[]>, now: Date = new Date(), rules: EngagementRules = CURRENT_RULES): PersonValueRow[] {
  const todayKey = dayKey(now.toISOString())
  const today = new Date(`${todayKey}T00:00:00Z`).getTime()
  const since = now.getTime() - ENGAGEMENT_DAYS * DAY_MS
  // Los ENGAGEMENT_DAYS días de Monterrey que terminan hoy (hoy y los anteriores).
  const firstWindowDay = new Date(today - (ENGAGEMENT_DAYS - 1) * DAY_MS).toISOString().slice(0, 10)
  const excluded = new Set<ActionKey>(rules.excluded)
  return people.map((person) => {
    const actions = actionsBy.get(person.id) ?? []
    const valueAward = award(actions, () => true)
    const engagementAward = award(actions, (item) => item.at !== null && Date.parse(item.at) >= since, excluded)
    const valueEach = valueAward.points
    const engagementEach = engagementAward.points
    const days = [...(activeDays.get(person.id) ?? [])].sort()
    const last = days.length ? days[days.length - 1] : null
    const daysSince = last ? Math.max(0, Math.round((today - new Date(`${last}T00:00:00Z`).getTime()) / DAY_MS)) : null
    const actionPoints = engagementEach.reduce((a, b) => a + b, 0)
    const windowDays = [...new Set(days.filter((day) => day >= firstWindowDay && day <= todayKey))].sort().reverse()
    const activeDayPoints = windowDays.length * rules.activeDayPoints
    const engagement = actionPoints + activeDayPoints
    const temperature = temperatureOf(engagement)
    const events = actions
      .map((item, index) => {
        const notes: string[] = []
        const valueWhy = valueAward.why[index]
        const engagementWhy = engagementAward.why[index]
        if (valueWhy) notes.push(noteFor(item.action, item.at, valueWhy, 'valor'))
        // Si ya se explicó en el valor que es de una sola vez o que topó, no se repite lo mismo para el enganche.
        else if (engagementWhy && !(engagementWhy !== 'outside' && notes.length)) notes.push(noteFor(item.action, item.at, engagementWhy, 'enganche'))
        return { action: item.action, at: item.at, valuePoints: valueEach[index], engagementPoints: engagementEach[index], notes }
      })
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    return {
      id: person.id,
      email: person.email,
      name: person.name,
      photoUrl: person.photo_url,
      createdAt: person.created_at,
      value: valueEach.reduce((a, b) => a + b, 0),
      engagement,
      actionPoints,
      activeDays7: windowDays.length,
      activeDays7List: windowDays,
      activeDayPoints,
      temperature,
      reason: reasonOf(engagement, temperature, { actionPoints, activeDays: rules.activeDayPoints > 0 ? windowDays.length : 0, profileComplete: actions.some((item) => item.action === 'profileComplete') }),
      lastActiveDay: last,
      daysSinceActive: daysSince,
      acceptsCommunityNews: wantsCommunityNews(person),
      emailClicks: actions.filter((item) => item.action === 'emailClick').length,
      events,
    }
  })
}

export interface PeopleValueSummary {
  total: number
  byTemperature: Record<Temperature, number>
  byValueRange: { range: string; people: number }[]
  byEngagementRange: { range: string; people: number }[]
  /** Cuántas cuentas tienen exactamente N días activos de los últimos ENGAGEMENT_DAYS (de 0 a ENGAGEMENT_DAYS). */
  activeDaysDistribution: { days: number; people: number }[]
  /** Cuántas cuentas tienen exactamente N puntos de enganche (para fijar los umbrales mirando la distribución real). */
  engagementDistribution: { points: number; people: number }[]
  /** Temperatura por rango de valor: solo conteos. */
  matrix: { range: string; caliente: number; tibio: number; frio: number }[]
  config: { points: typeof VALUE_POINTS; maxPerAction: number; onceActions: readonly ActionKey[]; engagementDays: number; engagementExcluded: readonly ActionKey[]; activeDayPoints: number; temperature: typeof TEMPERATURE }
  notes: string[]
}

/** Solo conteos: sin correos, nombres ni identificadores. Es lo único que lee el agente de producto. */
export function summarize(rows: PersonValueRow[]): PeopleValueSummary {
  const byTemperature: Record<Temperature, number> = { caliente: 0, tibio: 0, frio: 0 }
  for (const row of rows) byTemperature[row.temperature]++
  const inRange = (value: number, range: (typeof POINT_RANGES)[number]) => value >= range.min && value <= range.max
  const distribution = new Map<number, number>()
  for (const row of rows) distribution.set(row.engagement, (distribution.get(row.engagement) ?? 0) + 1)
  return {
    total: rows.length,
    byTemperature,
    byValueRange: POINT_RANGES.map((range) => ({ range: range.label, people: rows.filter((row) => inRange(row.value, range)).length })),
    byEngagementRange: ENGAGEMENT_RANGES.map((range) => ({ range: range.label, people: rows.filter((row) => inRange(row.engagement, range)).length })),
    activeDaysDistribution: Array.from({ length: ENGAGEMENT_DAYS + 1 }, (_, days) => ({ days, people: rows.filter((row) => row.activeDays7 === days).length })),
    engagementDistribution: [...distribution.entries()].sort((a, b) => a[0] - b[0]).map(([points, people]) => ({ points, people })),
    matrix: POINT_RANGES.map((range) => {
      const group = rows.filter((row) => inRange(row.value, range))
      return { range: range.label, caliente: group.filter((row) => row.temperature === 'caliente').length, tibio: group.filter((row) => row.temperature === 'tibio').length, frio: group.filter((row) => row.temperature === 'frio').length }
    }),
    config: { points: VALUE_POINTS, maxPerAction: MAX_PER_ACTION, onceActions: ONCE_ACTIONS, engagementDays: ENGAGEMENT_DAYS, engagementExcluded: ENGAGEMENT_EXCLUDED, activeDayPoints: ACTIVE_DAY_POINTS, temperature: TEMPERATURE },
    notes: [
      'Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). Los puntos y los umbrales son provisionales y están en un solo lugar del código.',
      `Valor = puntos acumulados de todo. Enganche = el uso de los últimos ${ENGAGEMENT_DAYS} días: las acciones de uso (con el mismo tope) más ${ACTIVE_DAY_POINTS} punto por cada día distinto con actividad; completar el perfil cuenta en el valor pero no en el enganche. La temperatura sale del enganche: caliente desde ${TEMPERATURE.hotAtLeast} puntos, tibio desde ${TEMPERATURE.warmAtLeast}, frío por debajo.`,
      'Los clics en correos suman cuando el webhook de Resend los guarda (email_events). Las aperturas no suman nunca (no son confiables).',
      'Solo conteos: sin correos ni nombres. Con pocas personas por grupo, léelos como conteo y no como porcentaje.',
    ],
  }
}

/** El nombre de una cuenta: `display_name` (donde se guarda el nombre real), si no `name`, si no el usuario. Nunca el correo. */
export function displayNameOf(row: { display_name?: string | null; name?: string | null; username?: string | null }): string | null {
  for (const candidate of [row.display_name, row.name, row.username]) if (candidate && candidate.trim()) return candidate.trim()
  return null
}

const isoOfDay = (day: string) => `${day}T18:00:00.000Z` // el mediodía de Monterrey de ese día

export async function loadPeopleValue(now: Date = new Date(), rules: EngagementRules = CURRENT_RULES): Promise<PersonValueRow[]> {
  const [people, saved, applications, activity, posts, comments, votes, clicks, profileEvents] = await Promise.all([
    readAll<PersonInput & { display_name: string | null; username: string | null }>((from, to) => supabase.from('users').select('id, email, name, display_name, username, photo_url, created_at, profile_completed, email_opt_out, email_prefs').eq('user_kind', 'user').eq('is_test_account', false).not('is_scraper_profile', 'is', true).range(from, to))
      .then((rows) => rows.map((row) => ({ ...row, name: displayNameOf(row) }))),
    readAll<{ user_id: string | null; saved_at: string | null }>((from, to) => supabase.from('community_saved_posts').select('user_id, saved_at').range(from, to)),
    readAll<{ user_id: string | null; status: string; clicked_at: string | null; applied_at: string | null; answered_at: string | null; updated_at: string | null }>((from, to) => supabase.from('vacancy_applications').select('user_id, status, clicked_at, applied_at, answered_at, updated_at').range(from, to)).catch(() => []),
    readAll<{ user_id: string; day: string }>((from, to) => supabase.from('user_activity_daily').select('user_id, day').range(from, to)).catch(() => []),
    readAll<{ author_id: string | null; created_at: string }>((from, to) => supabase.from('community_posts').select('author_id, created_at').in('type', ['discussion']).range(from, to)),
    readAll<{ author_id: string | null; created_at: string }>((from, to) => supabase.from('community_comments').select('author_id, created_at').range(from, to)),
    // Los votos solo tienen fecha desde community-votes-created-at-migration.sql; antes se leen sin fecha (cuentan en el valor, no en el enganche).
    readAll<{ user_id: string | null; created_at?: string | null }>((from, to) => supabase.from('community_votes').select('user_id, created_at').range(from, to))
      .catch(() => readAll<{ user_id: string | null; created_at?: string | null }>((from, to) => supabase.from('community_votes').select('user_id').range(from, to))),
    // Los clics en correos (webhook de Resend, email-events-migration.sql). Sin la tabla no suman, y nada se rompe.
    readAll<{ user_id: string | null; occurred_at: string }>((from, to) => supabase.from('email_events').select('user_id, occurred_at').eq('event_type', 'clicked').not('user_id', 'is', null).range(from, to)).catch(() => []),
    // Cuándo completó su perfil: el evento profile_completed de su sesión (la cuenta se une a la sesión al iniciar sesión).
    readAll<{ session_id: string; created_at: string }>((from, to) => supabase.from('analytics_events').select('session_id, created_at').eq('event_name', 'profile_completed').range(from, to)).catch(() => []),
  ])

  const sessionUser = new Map<string, string>()
  const sessionIds = [...new Set(profileEvents.map((event) => event.session_id))]
  for (let i = 0; i < sessionIds.length; i += 100) {
    const { data } = await supabase.from('analytics_sessions').select('session_id, user_id').in('session_id', sessionIds.slice(i, i + 100)).not('user_id', 'is', null)
    for (const row of (data ?? []) as { session_id: string; user_id: string }[]) sessionUser.set(row.session_id, row.user_id)
  }

  const byPerson = new Map<string, DatedAction[]>()
  const add = (userId: string | null | undefined, action: ActionKey, at: string | null | undefined) => {
    if (!userId) return
    const list = byPerson.get(userId) ?? []
    list.push({ action, at: at ?? null })
    byPerson.set(userId, list)
  }
  const profileDate = new Map<string, string>()
  for (const event of profileEvents) {
    const userId = sessionUser.get(event.session_id)
    if (userId && (!profileDate.has(userId) || event.created_at < profileDate.get(userId)!)) profileDate.set(userId, event.created_at)
  }
  for (const person of people) if (person.profile_completed) add(person.id, 'profileComplete', profileDate.get(person.id))
  for (const row of saved) add(row.user_id, 'savedVacancy', row.saved_at)
  for (const row of applications) {
    add(row.user_id, 'tappedApply', row.clicked_at)
    if (['applied', 'interview', 'offer', 'rejected'].includes(row.status)) add(row.user_id, 'applied', row.applied_at ?? row.answered_at ?? row.updated_at)
  }
  for (const row of posts) add(row.author_id, 'participated', row.created_at)
  for (const row of comments) add(row.author_id, 'participated', row.created_at)
  for (const row of votes) add(row.user_id, 'participated', row.created_at ?? null)
  for (const row of clicks) add(row.user_id, 'emailClick', row.occurred_at)

  const activeDays = new Map<string, string[]>()
  for (const row of activity) {
    const list = activeDays.get(row.user_id) ?? []
    list.push(row.day)
    activeDays.set(row.user_id, list)
  }
  // «Volvió otro día»: cada día activo posterior al día de su registro; el valor lo cuenta una vez y el enganche solo si hay uno reciente.
  for (const person of people) {
    const signupDay = dayKey(person.created_at)
    for (const day of activeDays.get(person.id) ?? []) if (day > signupDay) add(person.id, 'returnedAnotherDay', isoOfDay(day))
  }
  return buildPeopleValue(people, byPerson, activeDays, now, rules)
}
