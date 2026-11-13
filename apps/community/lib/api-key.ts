/**
 * La llave de aplicación (regla de diseño: toda API la exige; ver backend/middleware/api-key.middleware.ts). Cada llamada a NUESTRA API lleva la
 * cabecera `x-api-key`:
 *   - En el NAVEGADOR va la llave `NEXT_PUBLIC_API_KEY`. Viaja dentro de la página, así que es un IDENTIFICADOR de la aplicación (sirve para rechazar
 *     escáneres, medir, limitar y rotar), no un secreto: quien abra la página puede verla.
 *   - En el SERVIDOR de Next (páginas, metadatos, intermediario de analítica) va `API_KEY_SERVER` si existe: esa SÍ es un secreto, nunca llega al
 *     navegador. Si no existe, se usa la del navegador.
 * Sin ninguna llave no se toca nada (entornos que todavía no la exigen).
 *
 * Es una puerta, no una identidad: la sesión de la persona sigue siendo su token.
 * Las imágenes públicas (/api/files/) no la llevan: el navegador no puede mandar cabeceras al cargar una <img> y el backend las deja pasar.
 */
const HEADER = 'x-api-key'

export const apiKey = (): string => (typeof window === 'undefined' ? process.env.API_KEY_SERVER || '' : '') || process.env.NEXT_PUBLIC_API_KEY || ''

/** ¿Esta dirección es de NUESTRA API (y no de las imágenes públicas)? */
export function needsApiKey(url: string | null, apiBase: string): boolean {
  return !!url && url.startsWith(`${apiBase}/api/`) && !url.startsWith(`${apiBase}/api/files/`)
}

export function withApiKey(init: RequestInit | undefined, key: string): RequestInit {
  const headers = new Headers(init?.headers as HeadersInit)
  if (!headers.has(HEADER)) headers.set(HEADER, key)
  return { ...init, headers }
}

/**
 * Envuelve `fetch` (navegador y servidor) para poner la llave de aplicación en las llamadas a nuestra API. Devuelve una función que lo deshace.
 * No hace nada sin llave. Hay que instalarlo ANTES que el envoltorio de sesión (auth-fetch), que toma el `fetch` que encuentre.
 */
export function installApiKey(target: { fetch: typeof fetch } = globalThis as unknown as { fetch: typeof fetch }, apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', key = apiKey()): () => void {
  if (!key) return () => {}
  const original = target.fetch
  const urlOf = (input: RequestInfo | URL): string | null => (typeof input === 'string' ? input : input instanceof URL ? input.href : typeof Request !== 'undefined' && input instanceof Request ? input.url : null)
  const analytics = process.env.ANALYTICS_API_URL
  target.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url = urlOf(input)
    const ours = needsApiKey(url, apiBase) || (!!analytics && needsApiKey(url, analytics.replace(/\/+$/, '')))
    if (!ours) return original.call(target, input, init)
    // Una Request ya armada trae sus propias cabeceras: se copian a una nueva con la llave.
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const headers = new Headers(input.headers)
      if (!headers.has(HEADER)) headers.set(HEADER, key)
      return original.call(target, new Request(input, { headers }), init)
    }
    return original.call(target, input, withApiKey(init, key))
  } as typeof fetch
  return () => { target.fetch = original }
}
