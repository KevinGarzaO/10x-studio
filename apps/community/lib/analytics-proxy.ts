/**
 * El intermediario de la analítica web (lo usan app/api/a/collect y app/api/a/identify).
 *
 * Next NO toca la base de datos: solo reenvía lo que llega al backend (Railway), que es quien guarda todo. Está aquí, en el
 * mismo sitio que la página (avotalent.app/api/a/...), por tres razones:
 *   1. Los bloqueadores de anuncios no lo ven como un tercero, así que no se pierden visitas.
 *   2. Puede poner la cookie `_avo_cid` como HttpOnly con 2 años de vida (Safari recorta a 7 días las cookies que pone JavaScript).
 *   3. Vercel le da la ciudad, región y país de la persona (cabeceras `x-vercel-ip-*`), que el backend en Railway no recibe.
 *
 * Todo responde 204 y nada de lo que falle debe notarse en la página.
 */

export const CLIENT_COOKIE = '_avo_cid'
/** 2 años, en segundos. */
export const CLIENT_COOKIE_MAX_AGE = 2 * 365 * 24 * 60 * 60

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/

const BACKEND_TIMEOUT_MS = 4000

type HeaderReader = { get(name: string): string | null }

/** Los datos del visitante que solo conoce quien está en la frontera (Vercel / Cloudflare). */
export function geoFromHeaders(headers: HeaderReader): { country: string | null; region: string | null; city: string | null; latitude: string | null; longitude: string | null } {
  const pick = (...names: string[]) => {
    for (const name of names) {
      const value = headers.get(name)
      if (value && value.trim()) return value.trim()
    }
    return null
  }
  return {
    country: pick('x-vercel-ip-country', 'cf-ipcountry'),
    region: pick('x-vercel-ip-country-region'),
    city: pick('x-vercel-ip-city', 'cf-ipcity'),
    // La posición de la CIUDAD (no de la persona), para dibujar el mapa. Cloudflare no la manda por defecto.
    latitude: pick('x-vercel-ip-latitude'),
    longitude: pick('x-vercel-ip-longitude'),
  }
}

export function validClientId(value: string | null | undefined): string | null {
  return value && CLIENT_ID.test(value) ? value : null
}

export interface ProxyResult {
  /** Si hay que mandar la cookie (navegador nuevo). */
  setClientId: string | null
}

/**
 * Reenvía un envío de analítica al backend. `existingClientId` es lo que traía la cookie; si no es válido se crea un
 * client_id nuevo (UUID v4).
 */
export async function forwardToBackend(options: {
  path: 'collect' | 'identify' | 'clarity'
  body: string
  headers: HeaderReader
  existingClientId: string | null
  backendUrl: string
  secret?: string
  fetcher?: typeof fetch
}): Promise<ProxyResult> {
  const clientId = validClientId(options.existingClientId) ?? crypto.randomUUID()
  const geo = geoFromHeaders(options.headers)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-avo-client-id': clientId,
  }
  const ua = options.headers.get('user-agent')
  const lang = options.headers.get('accept-language')
  if (ua) headers['x-avo-ua'] = ua
  if (lang) headers['x-avo-lang'] = lang
  if (geo.country) headers['x-avo-country'] = geo.country
  if (geo.region) headers['x-avo-region'] = geo.region
  if (geo.city) headers['x-avo-city'] = geo.city
  if (geo.latitude) headers['x-avo-lat'] = geo.latitude
  if (geo.longitude) headers['x-avo-lon'] = geo.longitude
  if (options.secret) headers['x-avo-proxy-secret'] = options.secret
  const auth = options.headers.get('authorization')
  if (auth && options.path === 'identify') headers.Authorization = auth

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)
  try {
    await (options.fetcher ?? fetch)(`${options.backendUrl}/api/analytics/${options.path}`, {
      method: 'POST',
      headers,
      body: options.body,
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch {
    // el backend no respondió: la medición se pierde, la página no se entera
  } finally {
    clearTimeout(timer)
  }

  return { setClientId: validClientId(options.existingClientId) ? null : clientId }
}
