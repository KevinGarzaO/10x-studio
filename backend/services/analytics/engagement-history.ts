import { supabase } from '../supabase.service'
import { readAll } from './read'
import { dayKey } from './metrics'
import { loadPeopleValue, type PersonValueRow } from './people-value'

/**
 * Historial de compromiso por persona (8 nov 2026). Hasta hoy el valor y la temperatura se calculaban al momento y no se guardaban, así que el
 * pasado de esos dos no se podía reconstruir. Aquí:
 *   - FOTO SEMANAL por cuenta real (cada lunes 00:00 hora de Monterrey; resume la semana que terminó): se guarda para siempre y no se sobrescribe.
 *   - FOTO BASE del 7 de nov de 2026 (valor, enganche y temperatura de ese día), para seguir a «los calientes del 7 nov».
 *   - SEMANAS RECONSTRUIDAS hacia atrás con lo que sí tiene fecha (actividad diaria, publicaciones, comentarios, correos): valor, enganche y
 *     temperatura quedan vacíos (NULL) porque esos no existían.
 *   - FECHAS CLAVE por persona (registro, perfil completo, primer toque y primera postulación, primera y última acción en la comunidad y, a mano,
 *     cuándo se le invitó).
 *   - ESTADO DE COMPROMISO calculado desde las fotos (nueva, comprometida, en riesgo, dormida, reactivada, activa), con cortes configurables.
 * No se guarda el contenido de ninguna publicación ni dato sensible: solo conteos y fechas. Todo cuelga de users con ON DELETE CASCADE.
 *
 * Lo que se puede ajustar está aquí arriba, en un solo lugar.
 */
export const ENGAGEMENT_STATES = {
  /** Una cuenta con menos semanas desde su registro es «nueva». */
  newWithinWeeks: 4,
  /** Comprometida: activa en al menos `committedActiveWeeks` de las últimas `activeWeeksWindow` semanas... */
  committedActiveWeeks: 3,
  activeWeeksWindow: 4,
  /** ...y con participación en la comunidad en al menos `committedCommunityWeeks` semanas distintas de esa ventana. */
  committedCommunityWeeks: 2,
  /** Dormida: sin actividad en las últimas `dormantAfterWeeks` semanas. */
  dormantAfterWeeks: 4,
} as const
/** Semanas de las lecturas de 1 mes, 6 meses y 1 año. */
export const HORIZON_WEEKS = { mes: 4, seis_meses: 26, ano: 52 } as const
/** Primer día con actividad diaria guardada (desde ahí se puede reconstruir): el lunes de esa semana. */
export const ACTIVITY_SINCE = '2026-10-19'
/** El día de la foto base. */
export const BASELINE_DAY = '2026-11-07'

export type SnapshotKind = 'semanal' | 'base' | 'reconstruida'
export type EngagementState = 'nueva' | 'comprometida' | 'en_riesgo' | 'dormida' | 'reactivada' | 'activa'
export const STATE_LABEL: Record<EngagementState, string> = { nueva: 'Nueva', comprometida: 'Comprometida', en_riesgo: 'En riesgo', dormida: 'Dormida', reactivada: 'Reactivada', activa: 'Activa' }

const DAY_MS = 86_400_000

export interface SnapshotRow {
  user_id: string
  kind: SnapshotKind
  week_start: string
  cut_at: string
  value: number | null
  engagement: number | null
  temperature: 'caliente' | 'tibio' | 'frio' | null
  active_days_7: number | null
  active_weeks_4: number | null
  discussions: number | null
  comments: number | null
  votes: number | null
  replies_given: number | null
  replies_received: number | null
  emails_sent: number | null
  email_clicks: number | null
  push_clicks: number | null
  accepts_news: boolean | null
  accepts_commercial: boolean | null
}

// ---------------------------------------------------------------------------------------------------------------------
// Semanas (lunes a domingo, hora de Monterrey)
// ---------------------------------------------------------------------------------------------------------------------
const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10)
/** El lunes de la semana que contiene a `day` (AAAA-MM-DD). */
export const mondayOf = (day: string): string => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
/** El lunes de la semana que ACABA de terminar respecto a `now` (la que resume la foto de un lunes). */
export const lastCompletedWeekStart = (now: Date): string => addDays(mondayOf(dayKey(now.toISOString())), -7)
/** Instante (UTC) en que empieza el lunes `weekStart` a las 00:00 de Monterrey (UTC-6). */
export const cutOf = (weekStart: string): string => new Date(`${weekStart}T06:00:00Z`).toISOString()

// ---------------------------------------------------------------------------------------------------------------------
// Datos y foto de una persona en una semana (puro)
// ---------------------------------------------------------------------------------------------------------------------
export interface HistoryPerson { id: string; created_at: string; accepts_news: boolean }
export interface HistoryData {
  people: HistoryPerson[]
  activity: { user_id: string; day: string }[]
  /** Discusiones de la comunidad (para saber de quién es cada una). */
  posts: { id: string; author_id: string | null; created_at: string }[]
  comments: { author_id: string | null; post_id: string; created_at: string }[]
  votes: { user_id: string | null; created_at: string | null }[]
  emailSends: { user_id: string | null; created_at: string }[]
  emailClicks: { user_id: string | null; occurred_at: string }[]
  pushClicks: { user_id: string | null; created_at: string }[]
}

export function indexHistory(data: HistoryData) {
  const activeDays = new Map<string, Set<string>>()
  for (const row of data.activity) {
    const set = activeDays.get(row.user_id) ?? new Set<string>()
    set.add(row.day)
    activeDays.set(row.user_id, set)
  }
  const postAuthor = new Map<string, string | null>(data.posts.map((post) => [post.id, post.author_id]))
  return { activeDays, postAuthor }
}
export type HistoryIndex = ReturnType<typeof indexHistory>

const inWeek = (iso: string | null | undefined, weekStart: string) => {
  if (!iso) return false
  const day = dayKey(iso)
  return day >= weekStart && day <= addDays(weekStart, 6)
}

/** Los conteos de UNA semana de UNA persona (todo lo que tiene fecha). */
export function weekCounts(data: HistoryData, index: HistoryIndex, personId: string, weekStart: string) {
  const days = [...(index.activeDays.get(personId) ?? [])].filter((day) => day >= weekStart && day <= addDays(weekStart, 6))
  const weeksActive = [0, 1, 2, 3].filter((back) => {
    const start = addDays(weekStart, -7 * back)
    return [...(index.activeDays.get(personId) ?? [])].some((day) => day >= start && day <= addDays(start, 6))
  }).length
  const myComments = data.comments.filter((comment) => comment.author_id === personId && inWeek(comment.created_at, weekStart))
  return {
    active_days_7: days.length,
    active_weeks_4: weeksActive,
    discussions: data.posts.filter((post) => post.author_id === personId && inWeek(post.created_at, weekStart)).length,
    comments: myComments.length,
    votes: data.votes.filter((vote) => vote.user_id === personId && inWeek(vote.created_at, weekStart)).length,
    replies_given: myComments.filter((comment) => { const author = index.postAuthor.get(comment.post_id); return !!author && author !== personId }).length,
    replies_received: data.comments.filter((comment) => comment.author_id !== personId && index.postAuthor.get(comment.post_id) === personId && inWeek(comment.created_at, weekStart)).length,
    emails_sent: data.emailSends.filter((send) => send.user_id === personId && inWeek(send.created_at, weekStart)).length,
    email_clicks: data.emailClicks.filter((click) => click.user_id === personId && inWeek(click.occurred_at, weekStart)).length,
    push_clicks: data.pushClicks.filter((click) => click.user_id === personId && inWeek(click.created_at, weekStart)).length,
  }
}

/** La foto semanal de una persona: los conteos de la semana y, si se pasan, el valor, el enganche y la temperatura de ese momento. */
export function snapshotRow(data: HistoryData, index: HistoryIndex, person: HistoryPerson, weekStart: string, kind: SnapshotKind, live?: Pick<PersonValueRow, 'value' | 'engagement' | 'temperature'>): SnapshotRow {
  const counts = weekCounts(data, index, person.id, weekStart)
  return {
    user_id: person.id, kind, week_start: weekStart, cut_at: cutOf(addDays(weekStart, 7)),
    value: live?.value ?? null, engagement: live?.engagement ?? null, temperature: live?.temperature ?? null,
    ...counts,
    accepts_news: person.accepts_news, accepts_commercial: null,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Estado de compromiso (puro, desde las fotos)
// ---------------------------------------------------------------------------------------------------------------------
export interface WeekPoint { week_start: string; active_days_7: number | null; discussions: number | null; comments: number | null; votes: number | null }
const active = (point: WeekPoint | undefined) => (point?.active_days_7 ?? 0) > 0
const participated = (point: WeekPoint | undefined) => ((point?.discussions ?? 0) + (point?.comments ?? 0) + (point?.votes ?? 0)) > 0

/** ¿Estaba comprometida al terminar la semana `endIndex` de la serie continua `weeks`? */
function committedAt(weeks: (WeekPoint | undefined)[], endIndex: number): boolean {
  const window = weeks.slice(Math.max(0, endIndex - ENGAGEMENT_STATES.activeWeeksWindow + 1), endIndex + 1)
  return window.filter(active).length >= ENGAGEMENT_STATES.committedActiveWeeks && window.filter(participated).length >= ENGAGEMENT_STATES.committedCommunityWeeks
}

/** La serie continua de semanas hasta `lastWeek` (las que faltan quedan sin dato = sin actividad conocida). */
function continuous(points: WeekPoint[], lastWeek: string): (WeekPoint | undefined)[] {
  if (points.length === 0) return []
  const byWeek = new Map(points.map((point) => [point.week_start, point]))
  const first = [...byWeek.keys()].sort()[0]
  const out: (WeekPoint | undefined)[] = []
  for (let week = first; week <= lastWeek; week = addDays(week, 7)) out.push(byWeek.get(week))
  return out
}

/**
 * El estado de una persona a partir de sus fotos semanales (una por semana, de la más antigua a la más reciente), su fecha de registro y la última
 * semana cerrada. Orden: nueva, comprometida, reactivada, dormida, en riesgo, activa.
 */
export function engagementState(points: WeekPoint[], registeredAt: string | null, lastWeek: string): EngagementState {
  const weeksSinceSignup = registeredAt ? Math.floor((new Date(`${lastWeek}T00:00:00Z`).getTime() + 7 * DAY_MS - Date.parse(registeredAt)) / (7 * DAY_MS)) : Number.POSITIVE_INFINITY
  if (weeksSinceSignup < ENGAGEMENT_STATES.newWithinWeeks) return 'nueva'
  const weeks = continuous(points, lastWeek)
  if (weeks.length === 0) return 'dormida'
  const last = weeks.length - 1
  if (committedAt(weeks, last)) return 'comprometida'
  const lastActive = active(weeks[last])
  const before = weeks.slice(Math.max(0, last - ENGAGEMENT_STATES.dormantAfterWeeks), last)
  if (lastActive && before.length >= ENGAGEMENT_STATES.dormantAfterWeeks && before.every((point) => !active(point))) return 'reactivada'
  const recent = weeks.slice(Math.max(0, last - ENGAGEMENT_STATES.dormantAfterWeeks + 1))
  if (recent.every((point) => !active(point))) return 'dormida'
  for (let index = 0; index < last; index++) if (committedAt(weeks, index)) return 'en_riesgo'
  return 'activa'
}

// ---------------------------------------------------------------------------------------------------------------------
// Resumen para el agente: SOLO conteos (puro)
// ---------------------------------------------------------------------------------------------------------------------
export interface HistoryRow { user_id: string; kind: SnapshotKind; week_start: string; value: number | null; engagement: number | null; temperature: string | null; active_days_7: number | null; discussions: number | null; comments: number | null; votes: number | null; replies_given: number | null; replies_received: number | null }

export interface HorizonReading {
  weeks: number
  /** Semanas de fotos que de verdad existen dentro del horizonte (puede ser menos que `weeks`). */
  weeksWithData: number
  people: number
  /** Cuántas personas estuvieron activas en 0, 1, 2... semanas del horizonte. */
  activeWeeksDistribution: { activeWeeks: number; people: number }[]
  /** Con participación en la comunidad en 2 o más semanas distintas. */
  repeatedParticipation: number
  /** Dieron y recibieron respuestas (reciprocidad). */
  reciprocity: number
}

export function readHorizon(rows: HistoryRow[], personIds: string[], lastWeek: string, weeks: number): HorizonReading {
  const first = addDays(lastWeek, -7 * (weeks - 1))
  const inside = rows.filter((row) => row.kind !== 'base' && row.week_start >= first && row.week_start <= lastWeek)
  const byPerson = new Map<string, HistoryRow[]>()
  for (const row of inside) byPerson.set(row.user_id, [...(byPerson.get(row.user_id) ?? []), row])
  const distribution = new Map<number, number>()
  let repeated = 0
  let reciprocity = 0
  for (const id of personIds) {
    const own = byPerson.get(id) ?? []
    const activeWeeks = own.filter((row) => (row.active_days_7 ?? 0) > 0).length
    distribution.set(activeWeeks, (distribution.get(activeWeeks) ?? 0) + 1)
    if (own.filter((row) => ((row.discussions ?? 0) + (row.comments ?? 0) + (row.votes ?? 0)) > 0).length >= 2) repeated++
    if (own.some((row) => (row.replies_given ?? 0) > 0) && own.some((row) => (row.replies_received ?? 0) > 0)) reciprocity++
  }
  return {
    weeks,
    weeksWithData: new Set(inside.map((row) => row.week_start)).size,
    people: personIds.length,
    activeWeeksDistribution: [...distribution.entries()].sort((a, b) => a[0] - b[0]).map(([activeWeeks, people]) => ({ activeWeeks, people })),
    repeatedParticipation: repeated,
    reciprocity,
  }
}

export interface HistorySummary {
  ready: true
  lastWeek: string | null
  snapshots: { weeklyWeeks: number; reconstructedWeeks: number; hasBaseline: boolean }
  byState: Record<EngagementState, number>
  horizons: { mes: HorizonReading; seis_meses: HorizonReading; ano: HorizonReading }
  /** Los calientes de la foto base (7 nov): cuántos fueron y cuántos siguen activos en la última semana cerrada. */
  hotBaseline: { hot: number; stillActive: number } | null
  notes: string[]
}

export function buildHistorySummary(rows: HistoryRow[], states: Map<string, EngagementState>, personIds: string[], lastWeek: string | null): HistorySummary {
  const byState: Record<EngagementState, number> = { nueva: 0, comprometida: 0, en_riesgo: 0, dormida: 0, reactivada: 0, activa: 0 }
  for (const id of personIds) byState[states.get(id) ?? 'dormida']++
  const base = rows.filter((row) => row.kind === 'base' && row.temperature === 'caliente')
  const lastRows = new Map(rows.filter((row) => row.kind !== 'base' && row.week_start === lastWeek).map((row) => [row.user_id, row]))
  const reading = (weeks: number) => readHorizon(rows, personIds, lastWeek ?? BASELINE_DAY, weeks)
  return {
    ready: true,
    lastWeek,
    snapshots: {
      weeklyWeeks: new Set(rows.filter((row) => row.kind === 'semanal').map((row) => row.week_start)).size,
      reconstructedWeeks: new Set(rows.filter((row) => row.kind === 'reconstruida').map((row) => row.week_start)).size,
      hasBaseline: rows.some((row) => row.kind === 'base'),
    },
    byState,
    horizons: { mes: reading(HORIZON_WEEKS.mes), seis_meses: reading(HORIZON_WEEKS.seis_meses), ano: reading(HORIZON_WEEKS.ano) },
    hotBaseline: base.length ? { hot: base.length, stillActive: base.filter((row) => (lastRows.get(row.user_id)?.active_days_7 ?? 0) > 0).length } : null,
    notes: [
      'Solo conteos: sin correos ni nombres. Una foto semanal por cuenta real, cada lunes 00:00 hora de Monterrey, guardada para siempre.',
      'Valor, enganche y temperatura solo existen desde la primera foto (el 7 de nov de 2026, foto base). Las semanas anteriores están reconstruidas solo con actividad, comunidad y correos.',
      `Estado: nueva (menos de ${ENGAGEMENT_STATES.newWithinWeeks} semanas), comprometida (activa en ${ENGAGEMENT_STATES.committedActiveWeeks} de las últimas ${ENGAGEMENT_STATES.activeWeeksWindow} semanas y con participación en ${ENGAGEMENT_STATES.committedCommunityWeeks}+ semanas distintas), en riesgo (estuvo comprometida y bajó), dormida (sin actividad en ${ENGAGEMENT_STATES.dormantAfterWeeks} semanas), reactivada (volvió tras ${ENGAGEMENT_STATES.dormantAfterWeeks} semanas dormida) y activa (en uso sin cumplir lo de comprometida). Cortes provisionales.`,
      'Con pocas semanas de historia casi todas las cuentas salen como nueva o activa: los horizontes de 6 meses y 1 año se irán llenando con el tiempo.',
    ],
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura y escritura en la base
// ---------------------------------------------------------------------------------------------------------------------
async function tolerant<T>(read: () => Promise<T[]>): Promise<T[]> {
  try { return await read() } catch { return [] }
}

export async function loadHistoryData(sinceDay: string = ACTIVITY_SINCE): Promise<HistoryData> {
  const since = `${sinceDay}T00:00:00Z`
  const [people, activity, posts, comments, votes, emailSends, emailClicks, pushClicks] = await Promise.all([
    readAll<{ id: string; created_at: string; email_opt_out: boolean | null; email_prefs: { community?: boolean } | null }>((from, to) => supabase.from('users').select('id, created_at, email_opt_out, email_prefs').eq('user_kind', 'user').eq('is_test_account', false).not('is_scraper_profile', 'is', true).range(from, to)),
    tolerant(() => readAll<{ user_id: string; day: string }>((from, to) => supabase.from('user_activity_daily').select('user_id, day').gte('day', sinceDay).range(from, to))),
    readAll<{ id: string; author_id: string | null; created_at: string }>((from, to) => supabase.from('community_posts').select('id, author_id, created_at').eq('type', 'discussion').range(from, to)),
    readAll<{ author_id: string | null; post_id: string; created_at: string }>((from, to) => supabase.from('community_comments').select('author_id, post_id, created_at').range(from, to)),
    tolerant(() => readAll<{ user_id: string | null; created_at: string | null }>((from, to) => supabase.from('community_votes').select('user_id, created_at').range(from, to))),
    tolerant(() => readAll<{ user_id: string | null; created_at: string }>((from, to) => supabase.from('email_sends').select('user_id, created_at').gte('created_at', since).range(from, to))),
    tolerant(() => readAll<{ user_id: string | null; occurred_at: string }>((from, to) => supabase.from('email_events').select('user_id, occurred_at').eq('event_type', 'clicked').gte('occurred_at', since).range(from, to))),
    tolerant(() => readAll<{ user_id: string | null; created_at: string }>((from, to) => supabase.from('push_events').select('user_id, created_at').eq('kind', 'click').gte('created_at', since).range(from, to))),
  ])
  const wantsNews = (row: { email_opt_out: boolean | null; email_prefs: { community?: boolean } | null }) => row.email_opt_out !== true && row.email_prefs?.community !== false
  return { people: people.map((row) => ({ id: row.id, created_at: row.created_at, accepts_news: wantsNews(row) })), activity, posts, comments, votes, emailSends, emailClicks, pushClicks }
}

const CHUNK = 500
/** Guarda las filas SIN sobrescribir las que ya existen (una foto por persona, tipo y semana). Devuelve cuántas filas se mandaron. */
async function insertSnapshots(rows: SnapshotRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('engagement_snapshots').upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,kind,week_start', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  return rows.length
}

export async function snapshotsReady(): Promise<boolean> {
  const { error } = await supabase.from('engagement_snapshots').select('id').limit(1)
  return !error
}

export interface SnapshotOutcome { status: 'done' | 'skipped'; reason?: string; kind?: SnapshotKind; weekStart?: string; people?: number }

/** La foto del lunes: resume la semana que acaba de terminar, con el valor, el enganche y la temperatura de este momento. */
export async function takeWeeklySnapshot(now: Date = new Date()): Promise<SnapshotOutcome> {
  if (!(await snapshotsReady())) return { status: 'skipped', reason: 'falta la migración engagement-history-migration.sql' }
  const weekStart = lastCompletedWeekStart(now)
  const [data, live] = await Promise.all([loadHistoryData(addDays(weekStart, -21)), loadPeopleValue(now)])
  const index = indexHistory(data)
  const liveBy = new Map(live.map((row) => [row.id, row]))
  const rows = data.people.map((person) => snapshotRow(data, index, person, weekStart, 'semanal', liveBy.get(person.id)))
  await insertSnapshots(rows)
  await updateKeyDates(data, live)
  return { status: 'done', kind: 'semanal', weekStart, people: rows.length }
}

/** La foto base del 7 de nov: el valor, el enganche y la temperatura de ese día (no se puede rehacer después). */
export async function takeBaseline(now: Date = new Date()): Promise<SnapshotOutcome> {
  if (!(await snapshotsReady())) return { status: 'skipped', reason: 'falta la migración engagement-history-migration.sql' }
  const [data, live] = await Promise.all([loadHistoryData(), loadPeopleValue(now)])
  const index = indexHistory(data)
  const liveBy = new Map(live.map((row) => [row.id, row]))
  const rows = data.people.map((person) => ({ ...snapshotRow(data, index, person, BASELINE_DAY, 'base', liveBy.get(person.id)), cut_at: now.toISOString() }))
  await insertSnapshots(rows)
  await updateKeyDates(data, live)
  return { status: 'done', kind: 'base', weekStart: BASELINE_DAY, people: rows.length }
}

/** Reconstruye las semanas ya cerradas desde ACTIVITY_SINCE con lo que sí tiene fecha. Nunca sobrescribe una foto real. */
export async function backfillHistory(now: Date = new Date()): Promise<SnapshotOutcome & { weeks?: number }> {
  if (!(await snapshotsReady())) return { status: 'skipped', reason: 'falta la migración engagement-history-migration.sql' }
  const data = await loadHistoryData()
  const index = indexHistory(data)
  const last = lastCompletedWeekStart(now)
  const rows: SnapshotRow[] = []
  let weeks = 0
  for (let week = ACTIVITY_SINCE; week <= last; week = addDays(week, 7)) {
    weeks++
    for (const person of data.people) rows.push(snapshotRow(data, index, person, week, 'reconstruida'))
  }
  await insertSnapshots(rows)
  return { status: 'done', kind: 'reconstruida', weeks, people: data.people.length }
}

/** Las fechas clave: las «primera ...» se guardan una vez y no se borran; `last_community_at` se mueve hacia adelante; `invited_manually_at` no se toca. */
async function updateKeyDates(data: HistoryData, live: PersonValueRow[]): Promise<void> {
  const existing = await readAll<{ user_id: string; profile_completed_at: string | null; first_apply_tap_at: string | null; first_applied_at: string | null; first_community_at: string | null; last_community_at: string | null }>((from, to) => supabase.from('person_key_dates').select('user_id, profile_completed_at, first_apply_tap_at, first_applied_at, first_community_at, last_community_at').range(from, to))
  const had = new Map(existing.map((row) => [row.user_id, row]))
  const apps = await tolerant(() => readAll<{ user_id: string | null; clicked_at: string | null; applied_at: string | null }>((from, to) => supabase.from('vacancy_applications').select('user_id, clicked_at, applied_at').range(from, to)))
  const earliest = (values: (string | null | undefined)[]) => values.filter((value): value is string => !!value).sort()[0] ?? null
  const latest = (values: (string | null | undefined)[]) => values.filter((value): value is string => !!value).sort().slice(-1)[0] ?? null
  const rows = data.people.map((person) => {
    const before = had.get(person.id)
    const own = live.find((row) => row.id === person.id)
    const community = [
      ...data.posts.filter((post) => post.author_id === person.id).map((post) => post.created_at),
      ...data.comments.filter((comment) => comment.author_id === person.id).map((comment) => comment.created_at),
      ...data.votes.filter((vote) => vote.user_id === person.id).map((vote) => vote.created_at),
    ]
    const profileAt = own?.events.filter((event) => event.action === 'profileComplete' && event.at).map((event) => event.at)
    return {
      user_id: person.id,
      registered_at: person.created_at,
      profile_completed_at: before?.profile_completed_at ?? earliest(profileAt ?? []),
      first_apply_tap_at: before?.first_apply_tap_at ?? earliest(apps.filter((row) => row.user_id === person.id).map((row) => row.clicked_at)),
      first_applied_at: before?.first_applied_at ?? earliest(apps.filter((row) => row.user_id === person.id).map((row) => row.applied_at)),
      first_community_at: before?.first_community_at ?? earliest(community),
      last_community_at: latest([before?.last_community_at, ...community]),
      updated_at: new Date().toISOString(),
    }
  })
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('person_key_dates').upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id' })
    if (error) throw new Error(error.message)
  }
}

export interface PersonHistoryWeek { weekStart: string; kind: SnapshotKind; value: number | null; engagement: number | null; temperature: string | null; activeDays: number | null; discussions: number | null; comments: number | null; votes: number | null; repliesGiven: number | null; repliesReceived: number | null; emailsSent: number | null; emailClicks: number | null; pushClicks: number | null }

/** Los estados de todas las cuentas reales, desde sus fotos. Sin la migración, vacío. */
export async function loadEngagementStates(now: Date = new Date()): Promise<{ states: Map<string, EngagementState>; rows: HistoryRow[]; personIds: string[]; lastWeek: string | null; ready: boolean }> {
  if (!(await snapshotsReady())) return { states: new Map(), rows: [], personIds: [], lastWeek: null, ready: false }
  const [rows, people] = await Promise.all([
    readAll<HistoryRow>((from, to) => supabase.from('engagement_snapshots').select('user_id, kind, week_start, value, engagement, temperature, active_days_7, discussions, comments, votes, replies_given, replies_received').order('week_start', { ascending: true }).range(from, to)),
    readAll<{ id: string; created_at: string }>((from, to) => supabase.from('users').select('id, created_at').eq('user_kind', 'user').eq('is_test_account', false).not('is_scraper_profile', 'is', true).range(from, to)),
  ])
  const lastWeek = lastCompletedWeekStart(now)
  const states = new Map<string, EngagementState>()
  const byPerson = new Map<string, WeekPoint[]>()
  // Una foto por semana: la semanal gana a la reconstruida.
  const rank = (kind: SnapshotKind) => (kind === 'semanal' ? 2 : kind === 'reconstruida' ? 1 : 0)
  const chosen = new Map<string, HistoryRow>()
  for (const row of rows) {
    if (row.kind === 'base') continue
    const key = `${row.user_id}|${row.week_start}`
    const current = chosen.get(key)
    if (!current || rank(row.kind) > rank(current.kind)) chosen.set(key, row)
  }
  for (const row of chosen.values()) byPerson.set(row.user_id, [...(byPerson.get(row.user_id) ?? []), row])
  for (const person of people) states.set(person.id, engagementState((byPerson.get(person.id) ?? []).sort((a, b) => a.week_start.localeCompare(b.week_start)), person.created_at, lastWeek))
  return { states, rows, personIds: people.map((person) => person.id), lastWeek, ready: true }
}

export async function loadHistorySummary(now: Date = new Date()): Promise<{ ready: false } | HistorySummary> {
  const { states, rows, personIds, lastWeek, ready } = await loadEngagementStates(now)
  if (!ready) return { ready: false }
  return buildHistorySummary(rows, states, personIds, lastWeek)
}

export async function loadPersonHistory(userId: string): Promise<{ weeks: PersonHistoryWeek[]; keyDates: Record<string, string | null> | null } | null> {
  if (!(await snapshotsReady())) return null
  const [{ data: snaps }, { data: dates }] = await Promise.all([
    supabase.from('engagement_snapshots').select('*').eq('user_id', userId).order('week_start', { ascending: true }),
    supabase.from('person_key_dates').select('*').eq('user_id', userId).limit(1),
  ])
  const weeks = ((snaps ?? []) as SnapshotRow[]).map((row) => ({
    weekStart: row.week_start, kind: row.kind, value: row.value, engagement: row.engagement, temperature: row.temperature, activeDays: row.active_days_7,
    discussions: row.discussions, comments: row.comments, votes: row.votes, repliesGiven: row.replies_given, repliesReceived: row.replies_received,
    emailsSent: row.emails_sent, emailClicks: row.email_clicks, pushClicks: row.push_clicks,
  }))
  const date = ((dates ?? [])[0] as Record<string, string | null> | undefined) ?? null
  return { weeks, keyDates: date ? { registeredAt: date.registered_at, profileCompletedAt: date.profile_completed_at, firstApplyTapAt: date.first_apply_tap_at, firstAppliedAt: date.first_applied_at, firstCommunityAt: date.first_community_at, lastCommunityAt: date.last_community_at, invitedManuallyAt: date.invited_manually_at } : null }
}

/** El fundador marca (o quita) a mano que a esta persona se le invitó. */
export async function markInvited(userId: string, invited: boolean, now: Date = new Date()): Promise<void> {
  const { error } = await supabase.from('person_key_dates').upsert({ user_id: userId, invited_manually_at: invited ? now.toISOString() : null, updated_at: now.toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}
