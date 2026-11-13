/**
 * Cuándo se publican las vacantes en LinkedIn: 4 al día, todos los días de la semana (lunes a domingo), a las 8:30, 11:30, 14:30 y
 * 18:30 hora de Monterrey. ESTA es la única definición: el cron (services/cron.service.ts), la próxima publicación que muestra el
 * panel y la alarma de "debían haber salido" salen de aquí, así que cambiar una hora o un día es cambiar este archivo y nada más.
 */
const MONTERREY_OFFSET_MS = 6 * 3600 * 1000
/** Monterrey está en UTC-6 todo el año (México ya no cambia de horario). */
const MONTERREY_OFFSET_HOURS = 6

/** Hora y minuto de cada publicación, en hora de Monterrey. */
export const PUBLICATION_SLOTS: { hour: number; minute: number }[] = [
  { hour: 8, minute: 30 },
  { hour: 11, minute: 30 },
  { hour: 14, minute: 30 },
  { hour: 18, minute: 30 },
]

/** Días de la semana en que se publica (0 = domingo … 6 = sábado): todos. */
export const PUBLICATION_DAYS = [0, 1, 2, 3, 4, 5, 6]

/**
 * Las expresiones del cron (en UTC, que es la hora del servidor) para cada hora de publicación. Como las horas de Monterrey pueden
 * caer al día siguiente en UTC (18:30 aquí es 00:30 UTC), el día de la semana se conserva solo cuando se publica todos los días.
 */
export function publicationCronExpressions(): string[] {
  const everyDay = PUBLICATION_DAYS.length === 7
  return PUBLICATION_SLOTS.map((slot) => {
    const utcHour = (slot.hour + MONTERREY_OFFSET_HOURS) % 24
    const nextDayInUtc = slot.hour + MONTERREY_OFFSET_HOURS >= 24
    const days = everyDay ? '*' : PUBLICATION_DAYS.map((day) => (nextDayInUtc ? (day + 1) % 7 : day)).join(',')
    return `${slot.minute} ${utcHour} * * ${days}`
  })
}

/**
 * Cuántas publicaciones ya debieron haber salido hoy (hora de Monterrey). Se da un margen de 20 minutos
 * después de la hora, porque el cron tarda en publicar. Es 0 en un día en que no se publica.
 */
export function expectedPublicationsToday(now: Date = new Date(), graceMinutes = 20): number {
  const local = new Date(now.getTime() - MONTERREY_OFFSET_MS)
  if (!PUBLICATION_DAYS.includes(local.getUTCDay())) return 0

  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  return PUBLICATION_SLOTS.filter((slot) => slot.hour * 60 + slot.minute + graceMinutes <= minutes).length
}

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
