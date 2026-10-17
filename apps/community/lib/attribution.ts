const ATTR_KEY = 'avocado_attribution'

export interface Attribution {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  referrer: string | null
  landingPath: string | null
}

/**
 * Guarda los UTM de la URL y el referrer la PRIMERA vez que alguien llega.
 *
 * Se guarda en localStorage porque el registro puede ocurrir varias pantallas
 * después de aterrizar (la persona navega el feed antes de decidirse). Se
 * conserva el primer contacto, no el último, que es el que explica el alta.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(ATTR_KEY)) return

    const params = new URLSearchParams(window.location.search)
    const attr: Attribution = {
      source: params.get('utm_source'),
      medium: params.get('utm_medium'),
      campaign: params.get('utm_campaign'),
      content: params.get('utm_content'),
      referrer: document.referrer || null,
      landingPath: window.location.pathname,
    }

    if (!attr.source && !attr.referrer) return
    localStorage.setItem(ATTR_KEY, JSON.stringify(attr))
  } catch {
    // Sin localStorage simplemente no se atribuye.
  }
}

export function getAttribution(): Partial<Attribution> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(ATTR_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function clearAttribution(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ATTR_KEY)
}
