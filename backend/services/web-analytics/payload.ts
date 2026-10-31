/**
 * Lo que manda el navegador a /api/analytics/collect es información no confiable: aquí se revisa y se limpia TODO
 * antes de tocar la base. Funciones puras, sin red ni base de datos.
 */

/** Eventos clave (conversiones). Los decide el servidor: el navegador no puede marcar un evento como conversión. */
export const CONVERSION_EVENTS: ReadonlySet<string> = new Set(['user_registration_success', 'click_external_apply', 'profile_completed'])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/
const EVENT_NAME = /^[a-z][a-z0-9_]{0,99}$/
/** Datos que nunca deben quedar guardados aunque vengan en la dirección. */
const SENSITIVE_KEY = /token|code|password|passwd|secret|key|auth|session|email|mail/i

export const MAX_PARAMS_BYTES = 2000

export interface Utm {
  source: string | null
  medium: string | null
  campaign: string | null
  term: string | null
  content: string | null
}

export type CollectPayload =
  | { type: 'session_start'; sessionId: string; entryPath: string; queryParams: Record<string, string> | null; utm: Utm; referrerHost: string | null; language: string | null; screenResolution: string | null; timezone: string | null; brave: boolean }
  | { type: 'heartbeat'; sessionId: string; seconds: number }
  | { type: 'page_view'; sessionId: string; path: string; queryParams: Record<string, string> | null }
  | { type: 'event'; sessionId: string; name: string; params: Record<string, unknown>; isConversion: boolean }

export const sanitizeClientId = (value: unknown): string | null => (typeof value === 'string' && CLIENT_ID.test(value) ? value : null)
export const sanitizeSessionId = (value: unknown): string | null => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null)

/** Solo la ruta: sin dirección completa, sin lo que va después de ? o #, y con un tope de largo. */
export function sanitizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const path = value.split('#')[0].split('?')[0].trim()
  if (!path.startsWith('/') || path.startsWith('//')) return null
  return path.slice(0, 500)
}

function text(value: unknown, max: number, lower = false): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max)
  if (!trimmed) return null
  return lower ? trimmed.toLowerCase() : trimmed
}

/** Parámetros de la dirección: texto corto, sin lo sensible y con tope de cantidad. */
export function sanitizeQuery(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (SENSITIVE_KEY.test(key) || typeof raw !== 'string') continue
    out[key.slice(0, 50)] = raw.slice(0, 200)
  }
  return Object.keys(out).length > 0 ? out : null
}

export function sanitizeReferrerHost(value: unknown): string | null {
  const host = text(value, 255, true)
  return host && /^[a-z0-9.-]+$/.test(host) ? host : null
}

/** Parámetros de un evento: un objeto pequeño; si pasa del tope se descarta, no se guarda a medias. */
export function sanitizeParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 20).filter(([key]) => !SENSITIVE_KEY.test(key))
  const out: Record<string, unknown> = {}
  for (const [key, raw] of entries) {
    if (typeof raw === 'string') out[key.slice(0, 50)] = raw.slice(0, 200)
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key.slice(0, 50)] = raw
    else if (typeof raw === 'boolean') out[key.slice(0, 50)] = raw
  }
  return JSON.stringify(out).length <= MAX_PARAMS_BYTES ? out : {}
}

function sanitizeScreen(value: unknown): string | null {
  const screen = text(value, 20)
  return screen && /^\d{2,5}x\d{2,5}$/.test(screen) ? screen : null
}

export function parseCollectPayload(body: unknown): CollectPayload | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const sessionId = sanitizeSessionId(input.session_id)
  if (!sessionId) return null

  switch (input.type) {
    case 'session_start': {
      const entryPath = sanitizePath(input.entry_path)
      if (!entryPath) return null
      const utm = (input.utm && typeof input.utm === 'object' ? input.utm : {}) as Record<string, unknown>
      return {
        type: 'session_start',
        sessionId,
        entryPath,
        queryParams: sanitizeQuery(input.query_params),
        utm: { source: text(utm.source, 100, true), medium: text(utm.medium, 100, true), campaign: text(utm.campaign, 100), term: text(utm.term, 100), content: text(utm.content, 100) },
        referrerHost: sanitizeReferrerHost(input.referrer_host),
        language: text(input.language, 10),
        screenResolution: sanitizeScreen(input.screen),
        timezone: text(input.timezone, 64),
        brave: input.brave === true,
      }
    }
    case 'heartbeat': {
      const seconds = Number(input.seconds)
      if (!Number.isFinite(seconds) || seconds < 0) return null
      return { type: 'heartbeat', sessionId, seconds: Math.min(Math.floor(seconds), 86400) }
    }
    case 'page_view': {
      const path = sanitizePath(input.path)
      return path ? { type: 'page_view', sessionId, path, queryParams: sanitizeQuery(input.query_params) } : null
    }
    case 'event': {
      const name = typeof input.name === 'string' ? input.name : ''
      if (!EVENT_NAME.test(name)) return null
      // `is_conversion` que mande el navegador se ignora: solo cuenta la lista del servidor.
      return { type: 'event', sessionId, name, params: sanitizeParams(input.params), isConversion: CONVERSION_EVENTS.has(name) }
    }
    default:
      return null
  }
}

/** Primer idioma de un Accept-Language ("es-MX,es;q=0.9,en;q=0.8" -> "es-MX"). */
export function languageFromHeader(header: unknown): string | null {
  const first = typeof header === 'string' ? header.split(',')[0]?.split(';')[0] : ''
  return text(first, 10)
}
