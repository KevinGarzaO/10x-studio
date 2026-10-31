import { supabase } from '../supabase.service'
import { pct } from './metrics'

/**
 * LA distinción de personas, la misma en todas las pantallas del admin (definida en SQL: backend/sql/web-analytics-segments-migration.sql).
 *
 *   NUEVA / RECURRENTE .. la primera visita de la persona cae dentro del periodo, o ya había entrado antes.
 *   ACTIVA / SOLO VISITA  entró y tuvo una sesión activa (10 s con la pestaña visible, 2 páginas o un evento clave), o se fue sin hacer nada.
 *   REGISTRADA / ANÓNIMA  ya tiene cuenta o aún no.
 *   CONVERSIÓN ......... personas nuevas que se registraron en el periodo / personas nuevas ACTIVAS.
 *
 * Lo que se destaca siempre son las personas ACTIVAS; las visitas y las "solo visita" se muestran aparte para saber cuánto ruido hay.
 */
export interface SegmentCounts {
  /** El grupo: "Todo el sitio", un canal, una página, un país, una vacante... */
  label: string
  /** Entradas al sitio (sesiones). */
  visits: number
  /** Personas distintas, activas o no. */
  people: number
  /** Personas distintas que tuvieron una sesión activa. */
  active: number
  newPeople: number
  newActive: number
  /** Nuevas que entraron y se fueron sin hacer nada. */
  newVisitOnly: number
  returningPeople: number
  returningActive: number
  returningVisitOnly: number
  registered: number
  registeredActive: number
  anonymous: number
  anonymousActive: number
  /** Nuevas que se registraron en el periodo. */
  registeredNew: number
  /** registeredNew / newActive */
  conversionPct: number | null
}

export interface SegmentSqlRow {
  grp: string
  visits: number
  people: number
  new_people: number
  new_active: number
  returning_people: number
  returning_active: number
  registered: number
  registered_active: number
  anonymous: number
  anonymous_active: number
  registered_new: number
  active: number
}

export const segmentFromRow = (row: SegmentSqlRow): SegmentCounts => ({
  label: row.grp,
  visits: row.visits,
  people: row.people,
  active: row.active,
  newPeople: row.new_people,
  newActive: row.new_active,
  newVisitOnly: row.new_people - row.new_active,
  returningPeople: row.returning_people,
  returningActive: row.returning_active,
  returningVisitOnly: row.returning_people - row.returning_active,
  registered: row.registered,
  registeredActive: row.registered_active,
  anonymous: row.anonymous,
  anonymousActive: row.anonymous_active,
  registeredNew: row.registered_new,
  conversionPct: pct(row.registered_new, row.new_active),
})

/** Un periodo sin nadie: todo en cero (no un hueco), para que "no hubo gente" se vea como cero real. */
export const emptySegment = (label: string): SegmentCounts => segmentFromRow({
  grp: label, visits: 0, people: 0, new_people: 0, new_active: 0, returning_people: 0, returning_active: 0, registered: 0,
  registered_active: 0, anonymous: 0, anonymous_active: 0, registered_new: 0, active: 0,
})

/** Los grupos que se pueden pedir (la misma lista cerrada que la función SQL). */
export const SEGMENT_GROUPS = [
  'all', 'linkedin', 'linkedin_post', 'channel', 'landing', 'exit_path', 'language', 'device_category', 'operating_system',
  'browser_version', 'screen_resolution', 'timezone', 'country', 'region', 'city', 'referrer_host',
] as const
export type SegmentGroup = (typeof SEGMENT_GROUPS)[number]

/** Si el error es que la función SQL aún no existe (falta correr la migración). */
export const isMissingMigration = (message: string) => /function|does not exist|schema cache|analytics_|relation|column/i.test(message)

/**
 * Las personas del periodo [from, to) agrupadas como se pida. `null` si la migración aún no se corrió; cualquier otro error se lanza
 * (un fallo real de la base no se disfraza de ceros).
 */
export async function loadSegments(group: SegmentGroup, from: Date, to: Date, limit = 200): Promise<SegmentCounts[] | null> {
  const { data, error } = await supabase.rpc('analytics_segments', { p_from: from.toISOString(), p_to: to.toISOString(), p_group: group, p_limit: limit })
  if (error) {
    if (isMissingMigration(error.message)) return null
    throw new Error(error.message)
  }
  return ((data ?? []) as SegmentSqlRow[]).map(segmentFromRow)
}

/** Desde cuándo hay medición: antes de esa fecha no se puede saber quién era activo ni nuevo. */
export async function trackingSince(): Promise<string | null> {
  const { data } = await supabase.from('analytics_sessions').select('created_at').order('created_at', { ascending: true }).limit(1)
  return ((data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null
}
