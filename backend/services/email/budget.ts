import { supabase } from '../supabase.service'

/**
 * El plan gratis de Resend permite 100 correos al día EN TOTAL. Todo lo que sale (recordatorio de perfil, invitaciones
 * y las pruebas que se mandan a mano) comparte ese cupo; se dejan 10 de margen para pruebas y reintentos.
 */
export const TOTAL_DAILY_BUDGET = 90

/** El día de Monterrey (UTC-6, sin horario de verano) empieza a las 06:00 UTC. */
export function monterreyDayStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() - 6 * 3600000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() + 6 * 3600000)
}

/** Cuántos correos salieron hoy (día de Monterrey) por cualquiera de los dos procesos. */
export async function sentToday(now: Date = new Date()): Promise<number> {
  const since = monterreyDayStart(now).toISOString()
  let total = 0
  for (const table of ['email_sends', 'invitation_sends']) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', since).neq('status', 'failed')
    if (!error) total += count ?? 0
  }
  return total
}

export async function remainingBudget(now: Date = new Date()): Promise<number> {
  return Math.max(0, TOTAL_DAILY_BUDGET - (await sentToday(now)))
}
