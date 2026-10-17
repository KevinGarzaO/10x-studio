/**
 * De dónde llega la gente (UTM), para saber qué trae registros.
 *
 * Cuando alguien entra con un enlace marcado (`?utm_source=linkedin&...`) se guarda su
 * origen en el navegador. Si después se registra, ese origen viaja con el registro. Mide
 * el PRIMER origen: quien llegó por LinkedIn y se registró días después entrando directo
 * sigue contando como de LinkedIn. Dura 30 días.
 *
 * No guarda nada personal: solo de qué enlace o sitio llegó. Todo está en try/catch: sin
 * almacenamiento (ventana privada, bloqueado) la app funciona igual, solo sin medir.
 */

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

/** El origen guardado, si sigue vigente. Es el que se manda al registrarse. */
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
 * Se llama al entrar al sitio: guarda el origen (si es el primero que se ve) y avisa al
 * backend de la visita, una vez por sesión del navegador.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return

  const current = readAttribution(window.location.search, document.referrer, window.location.hostname, window.location.pathname)

  try {
    // El primer origen manda: uno vigente no se pisa. Una visita directa nunca borra nada.
    if (current && !getAttribution()) {
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...current, capturedAt: Date.now() } satisfies Stored))
    }
  } catch {
    // sin almacenamiento: no se mide el registro, pero la visita sí se avisa abajo
  }

  try {
    if (sessionStorage.getItem(VISIT_SENT_KEY)) return
    sessionStorage.setItem(VISIT_SENT_KEY, '1')
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
