/**
 * Cuándo toca la siguiente publicación de vacantes en LinkedIn: lunes a sábado, a las 8:30 y a las
 * 13:30 hora de Monterrey (las mismas horas del cron en services/cron.service.ts).
 */
const MONTERREY_OFFSET_MS = 6 * 3600 * 1000

/** Hora y minuto de cada publicación, en hora de Monterrey. */
export const PUBLICATION_SLOTS: { hour: number; minute: number }[] = [
  { hour: 8, minute: 30 },
  { hour: 13, minute: 30 },
]

/** Días de la semana en que se publica (0 = domingo … 6 = sábado): de lunes a sábado. */
export const PUBLICATION_DAYS = [1, 2, 3, 4, 5, 6]

export function nextPublication(now: Date = new Date()): Date {
  // Se trabaja con la hora de Monterrey como si fuera UTC, y se regresa al final.
  const local = new Date(now.getTime() - MONTERREY_OFFSET_MS)

  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset))
    if (!PUBLICATION_DAYS.includes(day.getUTCDay())) continue

    for (const slot of PUBLICATION_SLOTS) {
      const candidate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), slot.hour, slot.minute))
      if (candidate.getTime() > local.getTime()) return new Date(candidate.getTime() + MONTERREY_OFFSET_MS)
    }
  }

  // No debería pasar: en una semana siempre hay una publicación.
  return new Date(now.getTime() + 86400000)
}
