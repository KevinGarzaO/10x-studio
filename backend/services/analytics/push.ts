import { supabase } from '../supabase.service'
import { isMissingMigration } from './segments'
import { periodStart } from './metrics'

/**
 * Medición de los avisos push (backend/sql/push-notifications-migration.sql): el embudo de la invitación (se mostró, aceptó, negó, no quiso),
 * cuántos dispositivos hay activos y, por tipo de aviso, cuántos se mandaron, fallaron y se tocaron. Las reglas de lectura son puras.
 * Lo que traen las visitas que vienen de un aviso (`utm_source=push`) sale en Adquisición como un canal más.
 */
export interface PushRow { kind: string; notification_type: string; events: number; people: number }

export interface PushSummary {
  ready: true
  days: number
  /** Dispositivos activos hoy (no del periodo) y los que se activaron en el periodo. */
  devices: { active: number; activatedInPeriod: number }
  invitation: { shown: number; accepted: number; denied: number; dismissed: number; acceptRatePct: number | null }
  delivery: { sent: number; failed: number; clicked: number; clickRatePct: number | null; peopleReached: number; peopleClicked: number }
  byType: { type: string; sent: number; failed: number; clicked: number; clickRatePct: number | null }[]
  unsubscribed: number
  notes: string[]
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const events = (rows: PushRow[], kind: string) => rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.events, 0)
const people = (rows: PushRow[], kind: string) => Math.max(0, ...rows.filter((row) => row.kind === kind).map((row) => row.people))

export function buildPushSummary(rows: PushRow[], days: number, devices: { active: number; activatedInPeriod: number }): PushSummary {
  const sent = events(rows, 'sent')
  const clicked = events(rows, 'click')
  const types = [...new Set(rows.filter((row) => ['sent', 'failed', 'click'].includes(row.kind) && row.notification_type).map((row) => row.notification_type))].sort()
  const shown = events(rows, 'prompt_shown')
  const accepted = events(rows, 'permission_granted')
  return {
    ready: true,
    days,
    devices,
    invitation: { shown, accepted, denied: events(rows, 'permission_denied'), dismissed: events(rows, 'prompt_dismissed'), acceptRatePct: share(accepted, shown) },
    delivery: { sent, failed: events(rows, 'failed'), clicked, clickRatePct: share(clicked, sent), peopleReached: people(rows, 'sent'), peopleClicked: people(rows, 'click') },
    byType: types.map((type) => {
      const of = rows.filter((row) => row.notification_type === type)
      const typeSent = events(of, 'sent')
      return { type, sent: typeSent, failed: events(of, 'failed'), clicked: events(of, 'click'), clickRatePct: share(events(of, 'click'), typeSent) }
    }),
    unsubscribed: events(rows, 'unsubscribed'),
    notes: [
      '«Se mostró» cuenta las veces que se ofreció activar los avisos (después de contestar «¿Ya te postulaste?» o en Ajustes); «aceptó» es el permiso del navegador concedido.',
      '«Enviados» cuenta un envío por dispositivo: una persona con dos dispositivos recibe dos. El clic se cuenta una vez por aviso.',
      'Sin el equipo, pruebas ni perfiles del scraper. Las visitas que traen los avisos están en Adquisición, canal «push».',
    ],
  }
}

export async function loadPushSummary(days: number, now: Date = new Date()): Promise<{ ready: false } | PushSummary> {
  const from = periodStart(days, now)
  const { data, error } = await supabase.rpc('push_summary', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString() })
  if (error) {
    if (isMissingMigration(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  const [active, fresh] = await Promise.all([
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).is('revoked_at', null),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).gte('created_at', from.toISOString()),
  ])
  return buildPushSummary((data ?? []) as PushRow[], days, { active: active.count ?? 0, activatedInPeriod: fresh.count ?? 0 })
}
