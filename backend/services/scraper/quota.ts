/**
 * Cuántas vacantes del área de paso salen al feed cada día.
 *
 * El scraper trae un lote cada 15 días. Con un tope fijo (antes, 20 al día) lo que traía no cabía en el ciclo: 668 en
 * cola a 20 por día son más de 33 días, y el lote siguiente llegaba antes de vaciar el anterior. Ahora el cupo del
 * día es lo que hay por publicar dividido entre los días que faltan para el próximo lote, así la cola se vacía
 * justo cuando llega la siguiente. Se recalcula cada día, de modo que si entran o salen vacantes se corrige solo.
 */
export const CYCLE_DAYS = 15
/** Ni tan pocas que el feed parezca muerto, ni tantas que un error vacíe la cola de golpe. */
export const MIN_PER_DAY = 5
export const MAX_PER_DAY = 120

const MONTERREY_OFFSET_MS = 6 * 3600000
const DAY_MS = 86400000

/** El día en Monterrey (UTC-6), como número de días desde 1970. */
const dayNumber = (date: Date) => Math.floor((date.getTime() - MONTERREY_OFFSET_MS) / DAY_MS)

/**
 * Días en que se publicará antes del próximo lote: hoy y los siguientes, sin contar el día en que llega el lote.
 * Si no se sabe cuándo llega (o ya venció), se supone un ciclo completo.
 */
export function daysUntilNextBatch(now: Date, nextBatchAt: Date | null): number {
  if (!nextBatchAt || nextBatchAt.getTime() <= now.getTime()) return CYCLE_DAYS
  return Math.max(1, dayNumber(nextBatchAt) - dayNumber(now))
}

export function dailyQuota(input: { pending: number; now: Date; nextBatchAt: Date | null }): number {
  const days = daysUntilNextBatch(input.now, input.nextBatchAt)
  return Math.min(MAX_PER_DAY, Math.max(MIN_PER_DAY, Math.ceil(Math.max(0, input.pending) / days)))
}

/** El próximo lote: 15 días después de que empezó el ciclo actual. */
export function nextBatchFrom(cycleStartedAt: Date | null): Date | null {
  return cycleStartedAt ? new Date(cycleStartedAt.getTime() + CYCLE_DAYS * DAY_MS) : null
}
