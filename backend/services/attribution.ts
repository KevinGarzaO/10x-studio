/**
 * El origen de una visita o de un registro (UTM).
 *
 * Lo manda el navegador, así que no se le cree: se recorta, se limpia y se descarta lo que
 * no tenga forma de texto corto. Nunca guarda nada que identifique a una persona: solo de
 * qué enlace llegó.
 */

export interface Attribution {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  referrer: string | null
  landingPath: string | null
}

const MAX = { source: 60, medium: 60, campaign: 100, content: 200, referrer: 200, landingPath: 200 } as const

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // Sin caracteres de control; el recorte evita que alguien llene la tabla de basura.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
  return text === '' ? null : text
}

/** Solo el host y la ruta de una página de referencia: nunca su query (puede traer datos). */
function referrerHost(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return new URL(value).hostname.slice(0, MAX.referrer) || null
  } catch {
    return clean(value, MAX.referrer)
  }
}

/** La ruta de la página de entrada, sin parámetros. */
function landingPath(value: unknown): string | null {
  const text = clean(value, 400)
  if (!text) return null
  return text.split(/[?#]/)[0].slice(0, MAX.landingPath) || null
}

/**
 * @returns el origen limpio, o null si el navegador no mandó nada útil (visita directa).
 */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>

  const attribution: Attribution = {
    // El origen y el medio se comparan en minúsculas: "LinkedIn" y "linkedin" son lo mismo.
    source: clean(input.source, MAX.source)?.toLowerCase() ?? null,
    medium: clean(input.medium, MAX.medium)?.toLowerCase() ?? null,
    campaign: clean(input.campaign, MAX.campaign),
    content: clean(input.content, MAX.content),
    referrer: referrerHost(input.referrer),
    landingPath: landingPath(input.landingPath),
  }

  return Object.values(attribution).every((value) => value === null) ? null : attribution
}

/** Un identificador de visitante válido: aleatorio, corto y sin símbolos raros. */
export function sanitizeVisitorId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null
}
