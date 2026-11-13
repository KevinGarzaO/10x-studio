import { createHash } from 'crypto'

/**
 * La regla de los interruptores por grupo: ¿esta persona ve esta función? Pura y sin base de datos, para poder probarla a fondo.
 *
 * La escalera (cada paso incluye a los anteriores):
 *   off -> equipo -> beta -> p1 (1 %) -> p10 (10 %) -> p25 (25 %) -> p50 (50 %) -> todos
 *
 * Orden de decisión, de lo más fuerte a lo más débil:
 *   1. Paso «off»: apagada para TODOS (el botón de emergencia; ni quien se puso a mano la ve).
 *   2. Sin sesión: solo la ve quien llega en el paso «todos».
 *   3. Excluida a mano (deny): no la ve.
 *   4. Puesta a mano (allow): la ve.
 *   5. Equipo: la ve desde el paso «equipo».
 *   6. Beta: la ve desde el paso «beta».
 *   7. Porcentaje: a cada persona se le asigna, por función, un número fijo del 0 al 100 (según su identificador); ve la función si ese número
 *      es menor que el porcentaje del paso. Como el número es FIJO, quien entra al 1 % sigue dentro al subir al 10 %: nadie entra y sale al azar.
 */
export const STAGES = ['off', 'equipo', 'beta', 'p1', 'p10', 'p25', 'p50', 'todos'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = { off: 'Apagado', equipo: 'Equipo', beta: 'Beta', p1: '1 %', p10: '10 %', p25: '25 %', p50: '50 %', todos: 'Todos' }
const PERCENT: Record<Stage, number> = { off: 0, equipo: 0, beta: 0, p1: 1, p10: 10, p25: 25, p50: 50, todos: 100 }

export const isStage = (value: unknown): value is Stage => typeof value === 'string' && (STAGES as readonly string[]).includes(value)
export const percentOf = (stage: Stage): number => PERCENT[stage]
const rankOf = (stage: Stage): number => STAGES.indexOf(stage)

/** El número fijo (de 0 a 100, sin llegar a 100) de una persona para una función. El mismo par siempre da el mismo número. */
export function bucketOf(flagKey: string, subjectId: string): number {
  const digest = createHash('sha256').update(`${flagKey}:${subjectId}`).digest()
  return (digest.readUInt32BE(0) / 2 ** 32) * 100
}

export interface FlagDef { key: string; stage: Stage }
export interface Subject {
  /** null = sin sesión. */
  userId: string | null
  /** Cuenta del equipo: superadmin o de prueba. */
  isTeam: boolean
  /** Grupos a los que pertenece (por ahora solo «beta»). */
  groups: ReadonlySet<string>
}
export type Reason = 'apagado' | 'sin_sesion' | 'excluida' | 'puesta_a_mano' | 'equipo' | 'beta' | 'porcentaje' | 'todos' | 'fuera'

export const ANONYMOUS: Subject = { userId: null, isTeam: false, groups: new Set() }

export function evaluate(flag: FlagDef, subject: Subject, override: 'allow' | 'deny' | null = null): { enabled: boolean; reason: Reason } {
  if (flag.stage === 'off') return { enabled: false, reason: 'apagado' }
  if (subject.userId === null) return flag.stage === 'todos' ? { enabled: true, reason: 'todos' } : { enabled: false, reason: 'sin_sesion' }
  if (override === 'deny') return { enabled: false, reason: 'excluida' }
  if (override === 'allow') return { enabled: true, reason: 'puesta_a_mano' }
  if (subject.isTeam) return { enabled: true, reason: 'equipo' }
  if (rankOf(flag.stage) >= rankOf('beta') && subject.groups.has('beta')) return { enabled: true, reason: 'beta' }
  const percent = percentOf(flag.stage)
  if (percent >= 100) return { enabled: true, reason: 'todos' }
  if (percent > 0 && bucketOf(flag.key, subject.userId) < percent) return { enabled: true, reason: 'porcentaje' }
  return { enabled: false, reason: 'fuera' }
}
