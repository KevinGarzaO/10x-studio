import { getToken } from './session'

/**
 * Feedback dentro de la app (cliente): el botón «¿Qué te faltó?». El servidor decide quién lo ve (una cuenta real con 2 o más días de uso
 * después de registrarse); aquí solo se pregunta, se guarda lo que la persona escribe y se anota si se mostró o se descartó para medir la
 * tasa de respuesta. Nada de aquí rompe la pantalla si falla.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const FEEDBACK_CATEGORIES = [
  { value: 'vacantes', label: 'Vacantes' },
  { value: 'perfil', label: 'Mi perfil' },
  { value: 'comunidad', label: 'Comunidad' },
  { value: 'velocidad', label: 'Velocidad' },
  { value: 'avisos', label: 'Avisos' },
  { value: 'confianza', label: 'Confianza' },
  { value: 'otro', label: 'Otro' },
] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['value']

export const MIN_FEEDBACK_TEXT = 3
export const MAX_FEEDBACK_TEXT = 2000

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = getToken()
  if (!token) return null
  try {
    return await fetch(`${API_URL}/api/community/feedback${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
  } catch {
    return null
  }
}

// La respuesta se recuerda unos minutos: el menú se abre muchas veces y la regla (días de uso) cambia a lo más una vez al día.
let cached: { value: boolean; at: number } | null = null
const CACHE_MS = 10 * 60 * 1000

export async function fetchFeedbackEligibility(now: number = Date.now()): Promise<boolean> {
  if (cached && now - cached.at < CACHE_MS) return cached.value
  const res = await call('/eligibility')
  if (!res?.ok) return false
  const data = await res.json().catch(() => null)
  const value = data?.eligible === true
  cached = { value, at: now }
  return value
}

export function resetFeedbackCacheForTests(): void {
  cached = null
}

/** Se mostró la hoja o se descartó sin contestar. */
export async function recordFeedbackEvent(kind: 'shown' | 'dismissed'): Promise<void> {
  await call('/event', { method: 'POST', body: JSON.stringify({ kind }) })
}

export type SendResult = 'ok' | 'too_many' | 'not_available' | 'error'

export async function sendFeedback(input: { text: string; category: FeedbackCategory | null; page: string }): Promise<SendResult> {
  const res = await call('', { method: 'POST', body: JSON.stringify(input) })
  if (!res) return 'error'
  if (res.ok) return 'ok'
  if (res.status === 429) return 'too_many'
  if (res.status === 403 || res.status === 503) return 'not_available'
  return 'error'
}
