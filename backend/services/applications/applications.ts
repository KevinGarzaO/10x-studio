import { supabase } from '../supabase.service'

/**
 * Mis postulaciones (SQL en backend/sql/vacancy-applications-migration.sql).
 *
 * El formulario de postulación es del sitio de la empresa, así que no vemos si alguien se postuló. Lo que hacemos: al salir a postularse
 * se guarda el intento (`clicked`), al volver se pregunta «¿Ya te postulaste?» y se guarda lo que la persona contesta. Es un dato que ella
 * nos dice, no uno que veamos, y toda pantalla que lo use debe decirlo así.
 */
export const STATUSES = ['clicked', 'not_yet', 'applied', 'interview', 'offer', 'rejected'] as const
export type ApplicationStatus = (typeof STATUSES)[number]

/** Lo que la persona puede poner ella misma en «Mis postulaciones» (`clicked` es del sistema: «salió, sin contestar»). */
export const PERSON_STATUSES: ApplicationStatus[] = ['not_yet', 'applied', 'interview', 'offer', 'rejected']
/** Estados en los que la persona ya se postuló (para la marca «Postulada» y para el seguimiento). */
export const APPLIED_STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected']

export type Answer = 'applied' | 'not_yet' | 'later'
export const ANSWERS: Answer[] = ['applied', 'not_yet', 'later']

/** «Más tarde» no vuelve a preguntar antes de esto. */
export const LATER_HOURS = 24
/** «Todavía no»: se le vuelve a preguntar pasado este tiempo (no se le deja solo, pero tampoco se le insiste el mismo día). */
export const NOT_YET_HOURS = 48
/** Se pregunta por los intentos de los últimos días; más viejos que esto ya no tiene caso interrumpir. */
export const ASK_WITHIN_DAYS = 14

const HOUR = 3_600_000
const DAY = 24 * HOUR
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** Solo el dominio del sitio al que se sale (sin www), para decir «te llevamos al sitio oficial de ...». Null si no es una dirección web. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.hostname.toLowerCase().replace(/^www\./, '').slice(0, 120)
  } catch {
    return null
  }
}

export interface ApplicationRow {
  id: string
  user_id: string
  vacancy_id: string
  vacancy_slug: string | null
  title: string
  company: string | null
  apply_host: string | null
  status: ApplicationStatus
  remind_at: string | null
  clicked_at: string
  answered_at: string | null
  applied_at: string | null
  followup_notified_at: string | null
  followup_emailed_at: string | null
  updated_at: string
}

/** ¿Toca preguntarle «¿Ya te postulaste?» por este intento? Solo los que salieron y no contestó, recientes y sin «más tarde» vigente. */
export function isPromptDue(row: Pick<ApplicationRow, 'status' | 'clicked_at' | 'remind_at'> & { answered_at?: string | null }, now: Date = new Date()): boolean {
  if (now.getTime() - Date.parse(row.clicked_at) > ASK_WITHIN_DAYS * DAY) return false
  // «Todavía no»: se vuelve a preguntar 48 horas después de su respuesta (si no, quedaba sin ningún seguimiento).
  if (row.status === 'not_yet') return !!row.answered_at && now.getTime() - Date.parse(row.answered_at) >= NOT_YET_HOURS * HOUR
  if (row.status !== 'clicked') return false
  return !row.remind_at || Date.parse(row.remind_at) <= now.getTime()
}

/** El cambio en la fila para cada respuesta de la franja. */
export function answerPatch(answer: Answer, now: Date = new Date()): Record<string, unknown> {
  const stamp = now.toISOString()
  if (answer === 'applied') return { status: 'applied', applied_at: stamp, answered_at: stamp, remind_at: null, updated_at: stamp }
  if (answer === 'not_yet') return { status: 'not_yet', answered_at: stamp, remind_at: null, updated_at: stamp, followup_notified_at: null }
  return { remind_at: new Date(now.getTime() + LATER_HOURS * HOUR).toISOString(), updated_at: stamp }
}

/** El cambio cuando la persona pone un estado desde «Mis postulaciones». Entrevista, oferta y «no avanzó» suponen que ya se postuló. */
export function statusPatch(status: ApplicationStatus, current: Pick<ApplicationRow, 'applied_at'>, now: Date = new Date()): Record<string, unknown> {
  const stamp = now.toISOString()
  const patch: Record<string, unknown> = { status, answered_at: stamp, remind_at: null, updated_at: stamp }
  if (APPLIED_STATUSES.includes(status) && !current.applied_at) patch.applied_at = stamp
  return patch
}

/**
 * ¿Toca el seguimiento? «¿Cómo te fue con X?» a los `afterDays` días de haberse postulado, una sola vez. Y a quien salió a postularse y
 * nunca contestó, un solo recordatorio pasados `unansweredDays` días (aviso en la app, sin correo).
 */
export const FOLLOWUP_AFTER_DAYS = 5
export const UNANSWERED_AFTER_DAYS = 2
export function followupKind(row: Pick<ApplicationRow, 'status' | 'applied_at' | 'clicked_at' | 'followup_notified_at'> & { answered_at?: string | null }, now: Date = new Date()): 'applied' | 'unanswered' | null {
  if (row.followup_notified_at) return null
  const age = (iso: string | null) => (iso ? now.getTime() - Date.parse(iso) : -1)
  if (row.status === 'applied' && age(row.applied_at) >= FOLLOWUP_AFTER_DAYS * DAY) return 'applied'
  if (row.status === 'not_yet' && age(row.answered_at ?? null) >= NOT_YET_HOURS * HOUR && age(row.clicked_at) <= ASK_WITHIN_DAYS * DAY) return 'unanswered'
  if (row.status === 'clicked' && age(row.clicked_at) >= UNANSWERED_AFTER_DAYS * DAY && age(row.clicked_at) <= ASK_WITHIN_DAYS * DAY) return 'unanswered'
  return null
}

export interface PublicApplication {
  id: string
  vacancyId: string
  slug: string | null
  title: string
  company: string | null
  host: string | null
  status: ApplicationStatus
  clickedAt: string
  appliedAt: string | null
  /** La vacante ya pasó los 45 días o se borró: ya no acepta solicitudes. */
  closed?: boolean
}

export const publicApplication = (row: ApplicationRow): PublicApplication => ({
  id: row.id, vacancyId: row.vacancy_id, slug: row.vacancy_slug, title: row.title, company: row.company, host: row.apply_host,
  status: row.status, clickedAt: row.clicked_at, appliedAt: row.applied_at,
})

// ---------- Lectura y escritura ----------

interface VacancyForClick { id: string; slug: string | null; title: string; company: string | null; source_url: string | null; type: string }

/**
 * La persona salió a postularse a esta vacante. Si ya había un intento, no se pisa lo que contestó (postulada, entrevista...): solo si
 * estaba sin contestar o en «todavía no» vuelve a quedar como «salió». Devuelve la fila.
 */
export async function recordClick(userId: string, vacancy: VacancyForClick, now: Date = new Date()): Promise<ApplicationRow | null> {
  const { data: existing } = await supabase.from('vacancy_applications').select('*').eq('user_id', userId).eq('vacancy_id', vacancy.id).maybeSingle()
  const stamp = now.toISOString()
  if (existing) {
    const row = existing as ApplicationRow
    if (row.status === 'clicked' || row.status === 'not_yet') {
      const { data } = await supabase.from('vacancy_applications')
        .update({ status: 'clicked', clicked_at: stamp, remind_at: null, updated_at: stamp, followup_notified_at: null })
        .eq('id', row.id).select('*').single()
      return (data as ApplicationRow) ?? row
    }
    return row
  }
  const { data, error } = await supabase.from('vacancy_applications').insert({
    user_id: userId, vacancy_id: vacancy.id, vacancy_slug: vacancy.slug, title: vacancy.title.slice(0, 300), company: vacancy.company, apply_host: hostOf(vacancy.source_url),
    status: 'clicked', clicked_at: stamp, updated_at: stamp,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as ApplicationRow
}

/** Por qué intento preguntar ahora (el más reciente que toque), o null. */
export async function pendingFor(userId: string, now: Date = new Date()): Promise<ApplicationRow | null> {
  const since = new Date(now.getTime() - ASK_WITHIN_DAYS * DAY).toISOString()
  const { data, error } = await supabase.from('vacancy_applications').select('*').eq('user_id', userId).in('status', ['clicked', 'not_yet']).gte('clicked_at', since).order('clicked_at', { ascending: false }).limit(5)
  if (error) throw new Error(error.message)
  return ((data ?? []) as ApplicationRow[]).find((row) => isPromptDue(row, now)) ?? null
}

/** El estado de las postulaciones de una persona para varias vacantes (para la marca «Postulada» del feed y del detalle). Nunca lanza. */
export async function statusMap(userId: string | null, vacancyIds: string[]): Promise<Map<string, ApplicationStatus>> {
  const map = new Map<string, ApplicationStatus>()
  if (!userId || vacancyIds.length === 0) return map
  try {
    const { data } = await supabase.from('vacancy_applications').select('vacancy_id, status').eq('user_id', userId).in('vacancy_id', vacancyIds)
    for (const row of (data ?? []) as { vacancy_id: string; status: ApplicationStatus }[]) map.set(row.vacancy_id, row.status)
  } catch {
    // sin la tabla (falta la migración) el feed sigue como siempre
  }
  return map
}
