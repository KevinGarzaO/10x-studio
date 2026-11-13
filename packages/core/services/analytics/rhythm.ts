import { supabase } from '../supabase.service'
import { readAll } from './read'
import { isMissingMigration } from './segments'
import { PUBLICATION_DAYS, PUBLICATION_SLOTS } from './schedule'

/**
 * Ritmo de la semana: cuándo hay gente y cuándo no (SQL en backend/sql/web-analytics-rhythm-migration.sql).
 *
 * El SQL entrega una fila por día y el mapa de calor; aquí viven las reglas que lo leen:
 *  - cada día se compara con el MISMO día de la semana de las semanas anteriores (un sábado con otros sábados), con la mediana de hasta
 *    4 y solo si hay al menos 3: antes de eso dice "aún no hay base" en lugar de inventar una comparación;
 *  - un día es FLOJO si quedó por debajo de la mitad de su normal (y su normal es de al menos 4 personas: con 1 o 2 personas la mitad no dice nada);
 *  - el primer día de la medición (empezó a media jornada) y el día en curso nunca se juzgan.
 */
export const BASELINE_WEEKS = 4
export const MIN_BASELINE_SAMPLES = 3
export const SLOW_DAY_RATIO = 0.5
/** Con una normal más chica que esto, "la mitad" son una o dos personas: ruido, no un día flojo. */
export const MIN_BASELINE_FOR_FLAG = 4
/** Hace falta mirar hacia atrás lo suficiente para que el primer día mostrado ya tenga sus semanas de comparación. */
export const HISTORY_DAYS = 35

export interface RhythmDayRow {
  day: string
  dow: number
  is_today: boolean
  is_partial: boolean
  active: number
  new_active: number
  members_active: number
  from_linkedin: number
  from_email: number
  from_direct: number
  from_other: number
  visit_only: number
  sessions: number
  registrations: number
}

export type DayStatus = 'flojo' | 'normal' | 'sin_base' | 'en_curso' | 'parcial'

export interface RhythmDay {
  day: string
  dow: number
  isToday: boolean
  active: number
  newActive: number
  /** Personas activas que YA tenían cuenta de un día anterior: nuestra propia gente que volvió. */
  membersActive: number
  origins: { linkedin: number; email: number; direct: number; other: number }
  visitOnly: number
  sessions: number
  registrations: number
  /** La mediana de personas activas de ese mismo día de la semana en las semanas anteriores (null si no hay ninguna). */
  baseline: number | null
  baselineSamples: number
  /** Cuánto se separó de su normal, en %; null si no hay base. */
  vsBaselinePct: number | null
  status: DayStatus
  linkedinPosts: number
  emailsSent: number
  changes: string[]
}

export interface HeatCell { dow: number; hour: number; people: number; occurrences: number; average: number | null }

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places

/** Día de Monterrey (UTC-6 todo el año) de un instante. */
export const monterreyDay = (iso: string): string => new Date(new Date(iso).getTime() - 6 * 3600_000).toISOString().slice(0, 10)

/**
 * Pone a cada día su base (el mismo día de la semana de las semanas anteriores), su separación de ella y su estado.
 * `rows` va de más viejo a más nuevo y debe traer también los días anteriores al periodo que se va a mostrar.
 */
export function judgeDays(rows: RhythmDayRow[]): Omit<RhythmDay, 'linkedinPosts' | 'emailsSent' | 'changes'>[] {
  return rows.map((row, index) => {
    const comparable = rows
      .slice(0, index)
      .filter((earlier) => earlier.dow === row.dow && !earlier.is_partial && !earlier.is_today)
      .slice(-BASELINE_WEEKS)
      .map((earlier) => earlier.active)
    const base = median(comparable)
    const enough = comparable.length >= MIN_BASELINE_SAMPLES
    const vs = enough && base !== null && base > 0 ? round(((row.active - base) / base) * 100, 0) : null

    let status: DayStatus
    if (row.is_partial) status = 'parcial'
    else if (row.is_today) status = 'en_curso'
    else if (!enough) status = 'sin_base'
    else status = base !== null && base >= MIN_BASELINE_FOR_FLAG && row.active < base * SLOW_DAY_RATIO ? 'flojo' : 'normal'

    return {
      day: row.day.slice(0, 10), dow: row.dow, isToday: row.is_today,
      active: row.active, newActive: row.new_active, membersActive: row.members_active,
      origins: { linkedin: row.from_linkedin, email: row.from_email, direct: row.from_direct, other: row.from_other },
      visitOnly: row.visit_only, sessions: row.sessions, registrations: row.registrations,
      baseline: enough && base !== null ? round(base, 1) : null,
      baselineSamples: comparable.length,
      vsBaselinePct: vs,
      status,
    }
  })
}

/** El mapa de calor completo (7 x 24): las celdas sin ninguna hora medida llevan promedio null, no un cero que parezca real. */
export function heatGrid(rows: { dow: number; hour: number; people: number; occurrences: number }[]): HeatCell[] {
  const found = new Map(rows.map((row) => [`${row.dow}-${row.hour}`, row]))
  const cells: HeatCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const row = found.get(`${dow}-${hour}`)
      cells.push({ dow, hour, people: row?.people ?? 0, occurrences: row?.occurrences ?? 0, average: row && row.occurrences > 0 ? round(row.people / row.occurrences, 2) : null })
    }
  }
  return cells
}

/** Cuántas publicaciones de LinkedIn se esperan en un día de la semana según el horario (services/analytics/schedule.ts). */
export const expectedLinkedinPosts = (dow: number): number => (PUBLICATION_DAYS.includes(dow) ? PUBLICATION_SLOTS.length : 0)

const countBy = (days: string[]): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1)
  return counts
}

/** Lo que se publicó o se mandó cada día. Cada fuente es tolerante: si su tabla no existe, esa fila se queda en cero. */
async function loadActivity(sinceIso: string) {
  const [posts, mails, changes] = await Promise.all([
    readAll<{ published_at: string | null }>((from, to) =>
      supabase.from('linkedin_vacancy_posts').select('published_at').eq('status', 'published').gte('published_at', sinceIso).range(from, to)).catch(() => []),
    readAll<{ sent_at: string }>((from, to) => supabase.from('email_quota').select('sent_at').gte('sent_at', sinceIso).range(from, to)).catch(() => []),
    readAll<{ shipped_at: string; title: string }>((from, to) =>
      supabase.from('product_changes').select('shipped_at, title').gte('shipped_at', sinceIso).order('shipped_at', { ascending: true }).range(from, to)).catch(() => []),
  ])
  const changesByDay = new Map<string, string[]>()
  for (const change of changes) {
    const day = monterreyDay(change.shipped_at)
    changesByDay.set(day, [...(changesByDay.get(day) ?? []), change.title])
  }
  return {
    linkedin: countBy(posts.filter((post) => post.published_at).map((post) => monterreyDay(post.published_at as string))),
    emails: countBy(mails.map((mail) => monterreyDay(mail.sent_at))),
    changes: changesByDay,
  }
}

export interface RhythmResult {
  ready: true
  days: number
  /** El primer día con medición, para decir desde cuándo hay datos. */
  trackedSince: string | null
  rows: RhythmDay[]
  heat: HeatCell[]
  rules: { baselineWeeks: number; minSamples: number; slowBelowPct: number; minBaseline: number }
}

/** Ritmo de los últimos `days` días. `{ ready: false }` si falta la migración. */
export async function loadRhythm(days: number): Promise<{ ready: false } | RhythmResult> {
  const [daysResult, heatResult] = await Promise.all([
    supabase.rpc('analytics_rhythm_days', { p_days: Math.max(days, HISTORY_DAYS) }),
    supabase.rpc('analytics_rhythm_heatmap', { p_days: days }),
  ])
  const failed = [daysResult, heatResult].find((result) => result.error)
  if (failed?.error) {
    if (isMissingMigration(failed.error.message)) return { ready: false }
    throw new Error(failed.error.message)
  }

  const all = (daysResult.data ?? []) as RhythmDayRow[]
  const judged = judgeDays(all.map((row) => ({ ...row, day: String(row.day).slice(0, 10) })))
  const shown = judged.slice(-days)
  const activity = await loadActivity(new Date(Date.now() - (days + 1) * 86400_000).toISOString())

  const rows: RhythmDay[] = shown.map((row) => ({
    ...row,
    linkedinPosts: activity.linkedin.get(row.day) ?? 0,
    emailsSent: activity.emails.get(row.day) ?? 0,
    changes: (activity.changes.get(row.day) ?? []).slice(0, 4),
  }))

  return {
    ready: true,
    days,
    trackedSince: all[0] ? String(all[0].day).slice(0, 10) : null,
    rows,
    heat: heatGrid((heatResult.data ?? []) as { dow: number; hour: number; people: number; occurrences: number }[]),
    rules: { baselineWeeks: BASELINE_WEEKS, minSamples: MIN_BASELINE_SAMPLES, slowBelowPct: Math.round(SLOW_DAY_RATIO * 100), minBaseline: MIN_BASELINE_FOR_FLAG },
  }
}
