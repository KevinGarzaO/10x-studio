import { supabase } from '../supabase.service'
import { readAll } from './read'
import { dayKey } from './metrics'

/**
 * Personas de valor y temperatura (versión mínima, 7 nov 2026): a quién invitar a crear contenido y a quién pedirle feedback.
 * Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). SOLO para el fundador (lleva correos); el agente de producto lee
 * únicamente conteos por temperatura y por rango de valor (`summarize`), nunca correos ni nombres.
 *
 * TODO lo que se puede ajustar está aquí arriba, en un solo lugar: los puntos y los umbrales. Cambiar uno no toca nada más.
 */
export const VALUE_POINTS = {
  profileComplete: 3, // el perfil está completo
  savedVacancy: 1, // por cada vacante guardada (cuenta hasta MAX_PER_ACTION)
  tappedApply: 2, // por cada vez que tocó postular y salió al sitio de la empresa (hasta MAX_PER_ACTION)
  applied: 4, // por cada vacante que dijo haberse postulado (hasta MAX_PER_ACTION)
  returnedAnotherDay: 3, // volvió otro día distinto al de su registro
  emailClick: 2, // por cada clic en un correo (hasta MAX_PER_ACTION). Viene del webhook de Resend (email_events)
  participated: 5, // creó una discusión, un comentario o un voto
} as const
/** Una misma acción repetida no sigue sumando para siempre. */
export const MAX_PER_ACTION = 3
/** Temperatura por última actividad (días desde la última vez que estuvo activa, hora de Monterrey). */
export const TEMPERATURE = { hotWithinDays: 3, warmWithinDays: 7 } as const
/** Rangos de valor para el resumen del agente. */
export const VALUE_RANGES: { label: string; min: number; max: number }[] = [
  { label: '0', min: 0, max: 0 },
  { label: '1 a 3', min: 1, max: 3 },
  { label: '4 a 7', min: 4, max: 7 },
  { label: '8 a 14', min: 8, max: 14 },
  { label: '15 o más', min: 15, max: Number.POSITIVE_INFINITY },
]

export type Temperature = 'caliente' | 'tibio' | 'frio'
const DAY_MS = 86_400_000

export interface PersonInput { id: string; email: string | null; created_at: string; profile_completed: boolean | null }
export interface PersonSignals {
  savedVacancies: Map<string, number>
  tappedApply: Map<string, number>
  applied: Map<string, number>
  activeDays: Map<string, string[]>
  participated: Set<string>
  emailClicks: Map<string, number>
}
export interface PersonValueRow {
  id: string
  email: string | null
  createdAt: string
  value: number
  temperature: Temperature
  lastActiveDay: string | null
  daysSinceActive: number | null
  parts: { profileComplete: boolean; savedVacancies: number; tappedApply: number; applied: number; returnedAnotherDay: boolean; emailClicks: number; participated: boolean }
}

const capped = (n: number | undefined) => Math.min(n ?? 0, MAX_PER_ACTION)

export function temperatureOf(daysSinceActive: number | null): Temperature {
  if (daysSinceActive === null) return 'frio'
  if (daysSinceActive <= TEMPERATURE.hotWithinDays) return 'caliente'
  if (daysSinceActive <= TEMPERATURE.warmWithinDays) return 'tibio'
  return 'frio'
}

/** Pura: valor y temperatura de cada persona a partir de lo que hizo. */
export function buildPeopleValue(people: PersonInput[], signals: PersonSignals, now: Date = new Date()): PersonValueRow[] {
  const today = new Date(`${dayKey(now.toISOString())}T00:00:00Z`).getTime()
  return people.map((person) => {
    const days = [...(signals.activeDays.get(person.id) ?? [])].sort()
    const signupDay = dayKey(person.created_at)
    const last = days.length ? days[days.length - 1] : null
    const daysSince = last ? Math.max(0, Math.round((today - new Date(`${last}T00:00:00Z`).getTime()) / DAY_MS)) : null
    const parts = {
      profileComplete: !!person.profile_completed,
      savedVacancies: capped(signals.savedVacancies.get(person.id)),
      tappedApply: capped(signals.tappedApply.get(person.id)),
      applied: capped(signals.applied.get(person.id)),
      returnedAnotherDay: days.some((day) => day > signupDay),
      emailClicks: capped(signals.emailClicks.get(person.id)),
      participated: signals.participated.has(person.id),
    }
    const value =
      (parts.profileComplete ? VALUE_POINTS.profileComplete : 0) +
      parts.savedVacancies * VALUE_POINTS.savedVacancy +
      parts.tappedApply * VALUE_POINTS.tappedApply +
      parts.applied * VALUE_POINTS.applied +
      (parts.returnedAnotherDay ? VALUE_POINTS.returnedAnotherDay : 0) +
      parts.emailClicks * VALUE_POINTS.emailClick +
      (parts.participated ? VALUE_POINTS.participated : 0)
    return { id: person.id, email: person.email, createdAt: person.created_at, value, temperature: temperatureOf(daysSince), lastActiveDay: last, daysSinceActive: daysSince, parts }
  })
}

export interface PeopleValueSummary {
  total: number
  byTemperature: Record<Temperature, number>
  byValueRange: { range: string; people: number }[]
  /** Temperatura por rango de valor: solo conteos. */
  matrix: { range: string; caliente: number; tibio: number; frio: number }[]
  config: { points: typeof VALUE_POINTS; maxPerAction: number; temperature: typeof TEMPERATURE }
  notes: string[]
}

/** Solo conteos: sin correos, nombres ni identificadores. Es lo único que lee el agente de producto. */
export function summarize(rows: PersonValueRow[]): PeopleValueSummary {
  const byTemperature: Record<Temperature, number> = { caliente: 0, tibio: 0, frio: 0 }
  for (const row of rows) byTemperature[row.temperature]++
  const inRange = (row: PersonValueRow, range: (typeof VALUE_RANGES)[number]) => row.value >= range.min && row.value <= range.max
  return {
    total: rows.length,
    byTemperature,
    byValueRange: VALUE_RANGES.map((range) => ({ range: range.label, people: rows.filter((row) => inRange(row, range)).length })),
    matrix: VALUE_RANGES.map((range) => {
      const group = rows.filter((row) => inRange(row, range))
      return { range: range.label, caliente: group.filter((row) => row.temperature === 'caliente').length, tibio: group.filter((row) => row.temperature === 'tibio').length, frio: group.filter((row) => row.temperature === 'frio').length }
    }),
    config: { points: VALUE_POINTS, maxPerAction: MAX_PER_ACTION, temperature: TEMPERATURE },
    notes: [
      'Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). Los puntos son provisionales y están en un solo lugar del código (VALUE_POINTS).',
      `Temperatura por la última vez activa: caliente hasta ${TEMPERATURE.hotWithinDays} días, tibio hasta ${TEMPERATURE.warmWithinDays}, frío más allá o sin actividad.`,
      'Los clics en correos suman cuando el webhook de Resend los guarda (email_events). Las aperturas no suman nunca (no son confiables).',
      'Solo conteos: sin correos ni nombres. Con pocas personas por grupo, léelos como conteo y no como porcentaje.',
    ],
  }
}

const countBy = (rows: { user_id: string | null }[]): Map<string, number> => {
  const map = new Map<string, number>()
  for (const row of rows) if (row.user_id) map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1)
  return map
}

export async function loadPeopleValue(now: Date = new Date()): Promise<PersonValueRow[]> {
  const [people, saved, applications, activity, posts, comments, votes, clicks] = await Promise.all([
    readAll<PersonInput>((from, to) => supabase.from('users').select('id, email, created_at, profile_completed').eq('user_kind', 'user').eq('is_test_account', false).not('is_scraper_profile', 'is', true).range(from, to)),
    readAll<{ user_id: string | null }>((from, to) => supabase.from('community_saved_posts').select('user_id').range(from, to)),
    readAll<{ user_id: string | null; status: string }>((from, to) => supabase.from('vacancy_applications').select('user_id, status').range(from, to)).catch(() => [] as { user_id: string | null; status: string }[]),
    readAll<{ user_id: string; day: string }>((from, to) => supabase.from('user_activity_daily').select('user_id, day').range(from, to)).catch(() => [] as { user_id: string; day: string }[]),
    readAll<{ author_id: string | null }>((from, to) => supabase.from('community_posts').select('author_id').in('type', ['discussion']).range(from, to)),
    readAll<{ author_id: string | null }>((from, to) => supabase.from('community_comments').select('author_id').range(from, to)),
    readAll<{ user_id: string | null }>((from, to) => supabase.from('community_votes').select('user_id').range(from, to)),
    // Los clics en correos (webhook de Resend, email-events-migration.sql). Sin la tabla no suman, y nada se rompe. Las aperturas NUNCA suman.
    readAll<{ user_id: string | null }>((from, to) => supabase.from('email_events').select('user_id').eq('event_type', 'clicked').not('user_id', 'is', null).range(from, to)).catch(() => [] as { user_id: string | null }[]),
  ])
  const activeDays = new Map<string, string[]>()
  for (const row of activity) {
    const list = activeDays.get(row.user_id) ?? []
    list.push(row.day)
    activeDays.set(row.user_id, list)
  }
  const participated = new Set<string>()
  for (const row of posts) if (row.author_id) participated.add(row.author_id)
  for (const row of comments) if (row.author_id) participated.add(row.author_id)
  for (const row of votes) if (row.user_id) participated.add(row.user_id)
  const tapped = countBy(applications)
  const applied = countBy(applications.filter((row) => ['applied', 'interview', 'offer', 'rejected'].includes(row.status)))
  return buildPeopleValue(people, { savedVacancies: countBy(saved), tappedApply: tapped, applied, activeDays, participated, emailClicks: countBy(clicks) }, now)
}
