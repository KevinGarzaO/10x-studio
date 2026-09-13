/**
 * Lógica pura del examen de skills (002). Ninguna función aquí toca la base de
 * datos: son las reglas de negocio aisladas, que es donde se concentran los
 * tests unitarios. El acceso a datos vive en la ruta.
 */

export type SkillLevel = 'basico' | 'intermedio' | 'avanzado'

/** Orden de los niveles. El índice es el rango: mayor es mejor. */
const LEVEL_ORDER: SkillLevel[] = ['basico', 'intermedio', 'avanzado']

export const EXAM_QUESTION_COUNT = 10
export const MIN_BANK_SIZE = 20
export const ATTEMPT_TTL_HOURS = 24
export const RETRY_COOLDOWN_DAYS = 30

/**
 * FR-008 / FR-020: traduce el desempeño a un nivel. Todo examen terminado
 * otorga al menos "basico" — no existe el resultado "terminé y no validé nada".
 */
export function levelFor(correctCount: number, questionCount: number): SkillLevel {
  if (questionCount <= 0) throw new Error('questionCount must be greater than zero')
  const ratio = correctCount / questionCount
  if (ratio >= 0.9) return 'avanzado'
  if (ratio >= 0.7) return 'intermedio'
  return 'basico'
}

/**
 * FR-021: ¿el nivel candidato supera al ya validado? Si no hay nivel previo,
 * cualquiera lo supera.
 */
export function isBetterLevel(candidate: SkillLevel, current: SkillLevel | null): boolean {
  if (current === null) return true
  return LEVEL_ORDER.indexOf(candidate) > LEVEL_ORDER.indexOf(current)
}

/**
 * FR-014: elige las preguntas del examen excluyendo las del intento
 * inmediatamente anterior. Si tras excluirlas no alcanzan, completa con las
 * excluidas (mejor esfuerzo) — "en la medida en que el banco lo permita".
 *
 * No se exige memoria más allá de ese intento: un tercer intento PUEDE volver a
 * coincidir con el primero, y eso no incumple el requisito.
 */
export function pickQuestions(
  bankIds: string[],
  previousAttemptIds: string[],
  count: number = EXAM_QUESTION_COUNT,
  shuffle: (ids: string[]) => string[] = shuffleRandom,
): string[] {
  const previous = new Set(previousAttemptIds)
  const fresh = shuffle(bankIds.filter((id) => !previous.has(id)))

  if (fresh.length >= count) return fresh.slice(0, count)

  const reused = shuffle(bankIds.filter((id) => previous.has(id)))
  return [...fresh, ...reused].slice(0, count)
}

function shuffleRandom(ids: string[]): string[] {
  const out = [...ids]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface AttemptTiming {
  status: 'in_progress' | 'completed' | 'expired'
  expires_at: string
  finished_at?: string | null
}

/**
 * FR-019. El vencimiento se deriva en las lecturas, así que no hace falta un
 * cron que barra intentos y no hay ventana "ya venció pero nadie lo marcó".
 *
 * El estado `expired` sí se almacena, pero solo de forma perezosa y por una
 * razón concreta: el índice único parcial de FR-017 mira `status`, no
 * `expires_at`, así que un intento vencido que siguiera siendo 'in_progress'
 * ocuparía el índice para siempre y dejaría al candidato sin poder examinarse
 * nunca más. Ver el bloque 4 de skill-exams-migration.sql.
 */
export function isExpired(attempt: AttemptTiming, now: Date = new Date()): boolean {
  if (attempt.status === 'expired') return true
  return attempt.status === 'in_progress' && new Date(attempt.expires_at) < now
}

/**
 * FR-011: a partir de cuándo puede reintentar ese skill. Se cuenta desde que el
 * intento terminó (completado) o venció (expirado), no desde que empezó.
 * Devuelve null si el intento sigue vivo.
 */
export function retryAvailableAt(attempt: AttemptTiming, now: Date = new Date()): Date | null {
  let from: Date
  if (attempt.status === 'completed' && attempt.finished_at) {
    from = new Date(attempt.finished_at)
  } else if (isExpired(attempt, now)) {
    // También cubre el intento ya marcado como 'expired': la espera se cuenta
    // desde que venció, no desde que alguien lo marcó.
    from = new Date(attempt.expires_at)
  } else {
    return null
  }

  const retryAt = new Date(from)
  retryAt.setDate(retryAt.getDate() + RETRY_COOLDOWN_DAYS)
  return retryAt
}

/** Fecha de expiración de un intento que arranca ahora. */
export function expiresAtFrom(startedAt: Date): Date {
  const expires = new Date(startedAt)
  expires.setHours(expires.getHours() + ATTEMPT_TTL_HOURS)
  return expires
}
