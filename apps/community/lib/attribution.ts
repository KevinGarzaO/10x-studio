/**
 * De dónde llega la gente (UTM), para saber qué trae registros.
 *
 * Cuando alguien entra con un enlace marcado (`?utm_source=linkedin&...`) se guarda su
 * origen en el navegador. Si visita otro enlace marcado antes de registrarse, se conserva
 * el último origen para atribuir el registro al post que lo convirtió. Dura 30 días.
 *
 * No guarda nada personal: solo de qué enlace o sitio llegó. Todo está en try/catch: sin
 * almacenamiento (ventana privada, bloqueado) la app funciona igual, solo sin medir.
 */

import { getToken } from './session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const ATTRIBUTION_KEY = 'avo_attribution'
const VISITOR_KEY = 'avo_visitor'
const VISIT_SENT_KEY = 'avo_visit_sent'
const ATTRIBUTION_DAYS = 30

export interface Attribution {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  referrer: string | null
  landingPath: string | null
}

interface Stored extends Attribution {
  capturedAt: number
}

/** Lo que trae la dirección y el sitio de referencia de ESTA visita. */
export function readAttribution(search: string, referrer: string, ownHost: string, path: string): Attribution | null {
  const params = new URLSearchParams(search)
  const pick = (name: string) => params.get(name)?.trim() || null

  let referrerHost: string | null = null
  try {
    const host = referrer ? new URL(referrer).hostname : ''
    // Venir de nuestro propio sitio (navegar entre páginas) no es un origen.
    referrerHost = host && host !== ownHost ? host : null
  } catch {
    referrerHost = null
  }

  const attribution: Attribution = {
    source: pick('utm_source'),
    medium: pick('utm_medium'),
    campaign: pick('utm_campaign'),
    content: pick('utm_content'),
    referrer: referrerHost,
    landingPath: path,
  }

  // Sin UTM y sin sitio de referencia: visita directa, no hay origen que guardar.
  return attribution.source || attribution.medium || attribution.campaign || attribution.referrer ? attribution : null
}

function visitorId(): string {
  try {
    const stored = localStorage.getItem(VISITOR_KEY)
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) return stored
    const created = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(VISITOR_KEY, created)
    return created
  } catch {
    return `s${Math.random().toString(36).slice(2, 14)}`
  }
}

/** El último origen guardado, si sigue vigente. Es el que se manda al registrarse. */
export function getAttribution(now: number = Date.now()): Attribution | null {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored
    if (!stored.capturedAt || now - stored.capturedAt > ATTRIBUTION_DAYS * 86400000) {
      localStorage.removeItem(ATTRIBUTION_KEY)
      return null
    }
    const { capturedAt: _capturedAt, ...attribution } = stored
    return attribution
  } catch {
    return null
  }
}

/**
 * El equipo no debe contarse como visitantes. Entrar una vez a `?notrack=1` en un navegador deja de medir las
 * visitas y las vistas de ese navegador; `?notrack=0` lo vuelve a activar.
 */
export const NO_TRACK_KEY = 'avo_no_track'

export function isTrackingOff(): boolean {
  try {
    return localStorage.getItem(NO_TRACK_KEY) === '1'
  } catch {
    return false
  }
}

function applyNoTrackParam(search: string): void {
  try {
    const value = new URLSearchParams(search).get('notrack')
    if (value === '1') localStorage.setItem(NO_TRACK_KEY, '1')
    else if (value === '0') localStorage.removeItem(NO_TRACK_KEY)
  } catch {
    // sin almacenamiento no se puede recordar la preferencia
  }
}

/**
 * Se llama al entrar al sitio: guarda el origen más reciente y avisa al backend una vez
 * por origen marcado durante la sesión del navegador.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return

  applyNoTrackParam(window.location.search)
  if (isTrackingOff()) return

  const current = readAttribution(window.location.search, document.referrer, window.location.hostname, window.location.pathname)

  try {
    // Un origen nuevo reemplaza al anterior; una visita directa nunca lo borra.
    if (current) {
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...current, capturedAt: Date.now() } satisfies Stored))
    }
  } catch {
    // sin almacenamiento: no se mide el registro, pero la visita sí se avisa abajo
  }

  try {
    const visitKey = [
      current?.source,
      current?.medium,
      current?.campaign,
      current?.content,
    ].map(value => encodeURIComponent(value || '')).join(':')
    const sessionKey = `${VISIT_SENT_KEY}:${visitKey}`
    if (sessionStorage.getItem(sessionKey)) return
    sessionStorage.setItem(sessionKey, '1')
  } catch {
    // sin sessionStorage se avisaría en cada página; mejor no avisar que inflar la cuenta
    return
  }

  fetch(`${API_URL}/api/community/attribution/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitorId: visitorId(),
      ...(current ?? { landingPath: window.location.pathname }),
    }),
    keepalive: true,
  }).catch(() => {
    // medir no debe romper nada
  })
}

/**
 * Anota que alguien abrió una vacante ('view') o pulsó "Postularse" ('apply'), para saber si la
 * gente que llega encuentra algo útil. Lleva el mismo identificador de navegador que las visitas y
 * la sesión, si la hay. No espera ni puede romper la página: si falla, se ignora.
 *
 * Una vista se anota una sola vez por sesión del navegador y vacante; recargar la página no la
 * repite. El clic en "Postularse" se anota cada vez (el servidor ignora un doble clic).
 */
export function trackVacancyEvent(slug: string, event: 'view' | 'apply'): void {
  if (typeof window === 'undefined' || !slug || isTrackingOff()) return

  if (event === 'view') {
    const key = `avo_vacancy_view_${slug}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // sin sessionStorage se anotaría en cada carga; mejor no anotar que inflar la cuenta
      return
    }
  }

  const token = getToken()
  fetch(`${API_URL}/api/community/attribution/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ visitorId: visitorId(), slug, event, source: getAttribution()?.source ?? undefined }),
    keepalive: true,
  }).catch(() => {
    // medir no debe romper nada
  })
}
