import { supabase } from '../supabase.service'
import { readAll } from './read'
import { dayKey } from './metrics'
import { wantsCommunityNews } from '../email/community-news'

/**
 * Personas de valor, enganche y temperatura (7 nov 2026). Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). SOLO para el
 * fundador (lleva correos y fotos); el agente de producto lee únicamente conteos (`summarize`), nunca correos ni nombres.
 *
 *   VALOR ....... los puntos de todo lo que la persona ha hecho (acumulado).
 *   ENGANCHE .... los mismos puntos y el mismo tope de repeticiones, pero contando solo las acciones de los últimos ENGAGEMENT_DAYS días.
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
/**
 * Temperatura por ENGANCHE (puntos de los últimos ENGAGEMENT_DAYS días): caliente desde `hotAtLeast`, tibio desde `warmAtLeast`, frío por debajo.
 * PROVISIONALES hasta ver la distribución real (ver `engagementDistribution`).
 */
export const TEMPERATURE = { hotAtLeast: 6, warmAtLeast: 2 } as const
/** Rangos de puntos para los resúmenes (valor y enganche). */
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
  engagement: number
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

/** La frase que explica la temperatura. */
export function reasonOf(engagement: number, temperature: Temperature): string {
  const days = `en los últimos ${ENGAGEMENT_DAYS} días`
  if (temperature === 'caliente') return `${LABEL.caliente} porque sumó ${pts(engagement)} ${days} (desde ${TEMPERATURE.hotAtLeast} es caliente).`
  if (temperature === 'tibio') return `${LABEL.tibio} porque sumó ${pts(engagement)} ${days} (de ${TEMPERATURE.warmAtLeast} a ${TEMPERATURE.hotAtLeast - 1} es tibio).`
  return engagement === 0
    ? `${LABEL.frio} porque no sumó puntos ${days}.`
    : `${LABEL.frio} porque sumó solo ${pts(engagement)} ${days} (menos de ${TEMPERATURE.warmAtLeast} es frío).`
}

/**
 * Reparte los puntos entre las acciones: las repetibles dan puntos hasta MAX_PER_ACTION (las más antiguas primero), las de una sola vez dan sus
 * puntos a la primera. `inWindow` decide qué acciones cuentan (todas para el valor; solo las recientes para el enganche).
 */
function award(actions: DatedAction[], inWindow: (action: DatedAction) => boolean): { points: number[]; why: (null | 'outside' | 'once' | 'cap')[] } {
  const order = actions.map((_, index) => index).sort((a, b) => (actions[a].at ?? '').localeCompare(actions[b].at ?? ''))
  const taken = new Map<ActionKey, number>()
  const points = new Array<number>(actions.length).fill(0)
  const why = new Array<null | 'outside' | 'once' | 'cap'>(actions.length).fill(null)
  for (const index of order) {
    const item = actions[index]
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
function noteFor(action: ActionKey, at: string | null, why: 'outside' | 'once' | 'cap', target: 'valor' | 'enganche'): string {
  if (why === 'once') return `${target === 'valor' ? 'Valor' : 'Enganche'}: esta acción se cuenta una sola vez y ya se contó`
  if (why === 'cap') return `${target === 'valor' ? 'Valor' : 'Enganche'}: ya llegó al tope de ${MAX_PER_ACTION} repeticiones`
  return at === null ? 'Enganche: no se sabe la fecha, así que no cuenta en el enganche' : `Enganche: pasó hace más de ${periodText().replace('los últimos ', '')}`
}

/** Pura: valor, enganche y temperatura de cada persona a partir de lo que hizo y cuándo. */
export function buildPeopleValue(people: PersonInput[], actionsBy: Map<string, DatedAction[]>, activeDays: Map<string, string[]>, now: Date = new Date()): PersonValueRow[] {
  const today = new Date(`${dayKey(now.toISOString())}T00:00:00Z`).getTime()
  const since = now.getTime() - ENGAGEMENT_DAYS * DAY_MS
  return people.map((person) => {
    const actions = actionsBy.get(person.id) ?? []
    const valueAward = award(actions, () => true)
    const engagementAward = award(actions, (item) => item.at !== null && Date.parse(item.at) >= since)
    const valueEach = valueAward.points
    const engagementEach = engagementAward.points
    const days = [...(activeDays.get(person.id) ?? [])].sort()
    const last = days.length ? days[days.length - 1] : null
    const daysSince = last ? Math.max(0, Math.round((today - new Date(`${last}T00:00:00Z`).getTime()) / DAY_MS)) : null
    const engagement = engagementEach.reduce((a, b) => a + b, 0)
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
      temperature,
      reason: reasonOf(engagement, temperature),
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
  /** Cuántas cuentas tienen exactamente N puntos de enganche (para fijar los umbrales mirando la distribución real). */
  engagementDistribution: { points: number; people: number }[]
  /** Temperatura por rango de valor: solo conteos. */
  matrix: { range: string; caliente: number; tibio: number; frio: number }[]
  config: { points: typeof VALUE_POINTS; maxPerAction: number; onceActions: readonly ActionKey[]; engagementDays: number; temperature: typeof TEMPERATURE }
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
    byEngagementRange: POINT_RANGES.map((range) => ({ range: range.label, people: rows.filter((row) => inRange(row.engagement, range)).length })),
    engagementDistribution: [...distribution.entries()].sort((a, b) => a[0] - b[0]).map(([points, people]) => ({ points, people })),
    matrix: POINT_RANGES.map((range) => {
      const group = rows.filter((row) => inRange(row.value, range))
      return { range: range.label, caliente: group.filter((row) => row.temperature === 'caliente').length, tibio: group.filter((row) => row.temperature === 'tibio').length, frio: group.filter((row) => row.temperature === 'frio').length }
    }),
    config: { points: VALUE_POINTS, maxPerAction: MAX_PER_ACTION, onceActions: ONCE_ACTIONS, engagementDays: ENGAGEMENT_DAYS, temperature: TEMPERATURE },
    notes: [
      'Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). Los puntos y los umbrales son provisionales y están en un solo lugar del código.',
      `Valor = puntos acumulados. Enganche = los mismos puntos y el mismo tope, solo de los últimos ${ENGAGEMENT_DAYS} días. La temperatura sale del enganche: caliente desde ${TEMPERATURE.hotAtLeast} puntos, tibio desde ${TEMPERATURE.warmAtLeast}, frío por debajo.`,
      'Los clics en correos suman cuando el webhook de Resend los guarda (email_events). Las aperturas no suman nunca (no son confiables).',
      'Solo conteos: sin correos ni nombres. Con pocas personas por grupo, léelos como conteo y no como porcentaje.',
    ],
  }
}

const isoOfDay = (day: string) => `${day}T18:00:00.000Z` // el mediodía de Monterrey de ese día

export async function loadPeopleValue(now: Date = new Date()): Promise<PersonValueRow[]> {
  const [people, saved, applications, activity, posts, comments, votes, clicks, profileEvents] = await Promise.all([
    readAll<PersonInput>((from, to) => supabase.from('users').select('id, email, name, photo_url, created_at, profile_completed, email_opt_out, email_prefs').eq('user_kind', 'user').eq('is_test_account', false).not('is_scraper_profile', 'is', true).range(from, to)),
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
  return buildPeopleValue(people, byPerson, activeDays, now)
}
