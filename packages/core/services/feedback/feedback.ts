import { supabase } from '../supabase.service'
import { dayKey } from '../analytics/metrics'

/**
 * Feedback dentro de la app (backend/sql/feedback-migration.sql). Hoy solo el botón «¿Qué te faltó?»; el modal de estrellas y el correo del
 * día 14 se montarán sobre las mismas reglas y tablas. Las reglas son puras para poder probarlas.
 *
 * Quién lo ve: una cuenta REAL (sin equipo, pruebas ni perfiles del scraper) con al menos 2 días distintos con actividad DESPUÉS del día de
 * registro (el día de registro no cuenta; los días son hora de Monterrey). Lo calcula el servidor con la cuenta de la persona.
 *
 * Lo que escribe la gente es DATO: se guarda tal cual (limpiado de caracteres de control) y jamás se trata como una instrucción.
 */
export const FEEDBACK_CATEGORIES = ['vacantes', 'perfil', 'comunidad', 'velocidad', 'avisos', 'confianza', 'otro'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]
export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  vacantes: 'Vacantes', perfil: 'Mi perfil', comunidad: 'Comunidad', velocidad: 'Velocidad', avisos: 'Avisos', confianza: 'Confianza', otro: 'Otro',
}

/** Días distintos con actividad después del registro que hacen falta para ver el botón. */
export const MIN_ACTIVE_DAYS = 2
/** Cuántas respuestas puede mandar una persona en 24 horas (contra abuso; el botón no insiste, pero está siempre ahí). */
export const MAX_PER_DAY = 5
export const MIN_TEXT = 3
export const MAX_TEXT = 2000
/** Versión de la pregunta del botón: si cambia, se sube para no mezclar respuestas que no se pueden comparar. */
export const QUESTION_VERSION = 1

/** Días distintos (hora de Monterrey) con actividad estrictamente después del día de registro. */
export function activeDaysAfterSignup(activityDays: string[], createdAt: string): number {
  const signupDay = dayKey(createdAt)
  return new Set(activityDays.filter((day) => day > signupDay)).size
}

export interface AccountFlags { user_kind: string | null; is_test_account: boolean | null; is_scraper_profile: boolean | null }

/** ¿Ve el botón? Cuenta real y suficientes días de uso. */
export function isEligible(account: AccountFlags | null | undefined, activeDays: number): boolean {
  if (!account) return false
  if (account.user_kind !== 'user' || account.is_test_account || account.is_scraper_profile) return false
  return activeDays >= MIN_ACTIVE_DAYS
}

/** El texto limpio, o null si no sirve. Se quitan caracteres de control; se recorta. Nunca se interpreta. */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT)
  return text.length >= MIN_TEXT ? text : null
}

export function cleanCategory(raw: unknown): FeedbackCategory | null {
  return typeof raw === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(raw) ? (raw as FeedbackCategory) : null
}

/** La página donde estaba: solo la ruta, sin query ni dirección completa (nada personal). */
export function cleanPage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const path = raw.split(/[?#]/)[0].trim()
  return path.startsWith('/') ? path.slice(0, 200) : null
}

/** El lunes de la semana (Monterrey) en que se registró: para agrupar por cohorte. */
export function signupWeek(createdAt: string): string {
  const day = new Date(`${dayKey(createdAt)}T00:00:00Z`)
  const sinceMonday = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - sinceMonday * 86_400_000).toISOString().slice(0, 10)
}

export interface FeedbackContext {
  signupWeek: string
  activeDays: number
  profileComplete: boolean
  applied: boolean
  source: string
  device: 'movil' | 'escritorio'
}

export const deviceOf = (userAgent: string | undefined): 'movil' | 'escritorio' => (/Mobi|Android|iPhone|iPad/i.test(userAgent ?? '') ? 'movil' : 'escritorio')

// ---------- datos ----------

/** Cuántos días activos tiene la persona después de registrarse y si es elegible. Null si falta la tabla de actividad. */
export async function loadEligibility(userId: string): Promise<{ eligible: boolean; activeDays: number; createdAt: string | null } | null> {
  const { data: user } = await supabase.from('users').select('created_at, user_kind, is_test_account, is_scraper_profile').eq('id', userId).maybeSingle()
  if (!user) return { eligible: false, activeDays: 0, createdAt: null }
  const days = await supabase.from('user_activity_daily').select('day').eq('user_id', userId).limit(1000)
  if (days.error) return null
  const activeDays = activeDaysAfterSignup(((days.data ?? []) as { day: string }[]).map((row) => row.day), user.created_at as string)
  return { eligible: isEligible(user as AccountFlags, activeDays), activeDays, createdAt: user.created_at as string }
}
