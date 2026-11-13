import type { Resend } from 'resend'
import { supabase } from '../supabase.service'

/**
 * El plan gratis de Resend permite 100 correos cada 24 HORAS CORRIDAS (no por día de calendario). Todo lo que sale
 * (recordatorios, bienvenidas, invitaciones, "Para ti" y las pruebas que se mandan a mano) comparte ese cupo; se
 * dejan 10 de margen para reintentos.
 *
 * Cada envío se anota en `email_quota` (ver `sendTracked`) y el cupo que queda es 90 menos lo anotado en las últimas
 * 24 horas. Cuando el día se acaba, los trabajos esperan: lo que no cupo sale en la siguiente corrida.
 */
export const TOTAL_DAILY_BUDGET = 90

/**
 * Cuánto cupo se deja SIEMPRE libre para lo que no puede esperar (bienvenidas y recordatorios): los trabajos menos
 * urgentes solo usan lo que sobre por encima de esta reserva.
 */
export const RESERVE = { alerts: 15, digest: 15, invitations: 30 } as const

/** Si no existe aún la tabla `email_quota`, se cuenta lo que sí está anotado y se suma este margen por lo que no lo está (pruebas a mano). */
const UNRECORDED_MARGIN = 40

const WINDOW_MS = 24 * 3600000

/** El día de Monterrey (UTC-6, sin horario de verano) empieza a las 06:00 UTC. */
export function monterreyDayStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() - 6 * 3600000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() + 6 * 3600000)
}

async function countSince(table: string, since: string, column = 'created_at'): Promise<number | null> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).gte(column, since)
  return error ? null : count ?? 0
}

/** Cuántos correos salieron en las últimas 24 horas, por cualquier camino. */
export async function sentLast24h(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString()
  const recorded = await countSince('email_quota', since, 'sent_at')
  if (recorded !== null) return recorded

  let total = UNRECORDED_MARGIN
  for (const table of ['email_sends', 'invitation_sends', 'match_emails']) total += (await countSince(table, since)) ?? 0
  return total
}

export async function remainingBudget(now: Date = new Date(), reserve = 0): Promise<number> {
  return Math.max(0, TOTAL_DAILY_BUDGET - reserve - (await sentLast24h(now)))
}

/** Los errores de Resend que significan "ya no hay cupo": no son un fallo de la persona y el envío debe poder repetirse después. */
export function isQuotaError(error: { name?: string; message?: string; statusCode?: number | null } | null | undefined): boolean {
  if (!error) return false
  return /quota|rate_limit/i.test(error.name ?? '') || error.statusCode === 429 || /daily.*(limit|quota)|too many requests/i.test(error.message ?? '')
}

type SendPayload = Parameters<Resend['emails']['send']>[0]

/** Manda un correo por Resend y lo anota en el cupo. TODOS los envíos pasan por aquí, también las pruebas. */
export async function sendTracked(resend: Resend, payload: SendPayload, kind: string) {
  const result = await resend.emails.send(payload)
  if (!result.error) {
    try {
      await supabase.from('email_quota').insert({ kind })
    } catch {
      // Sin la tabla (migración pendiente) no se rompe el envío: el cupo se estima con lo demás.
    }
  }
  return result
}
