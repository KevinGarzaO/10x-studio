import { reportApiError } from './error-reporter'
import { getToken, isTokenFresh, renewSession } from './session'

/**
 * Que ninguna llamada con sesión se quede sin renovar el token.
 *
 * El token de acceso dura ~1 hora. Pantallas como "Usuarios destacados" leían el token guardado y lo mandaban tal cual: con el token
 * vencido el servidor contestaba 401, la pantalla lo tomaba como "no hay nada" y el cuadro simplemente no aparecía, sin avisar a nadie.
 * Eran más de veinte lugares (cada uno con su `fetch`), así que en vez de arreglarlos uno por uno se envuelve `fetch` UNA vez:
 *
 *  - Si la llamada es a NUESTRO servidor y lleva la sesión guardada: si el token ya venció, se renueva antes de mandarla.
 *  - Si aun así llega un 401, se renueva (una sola renovación para todas las que coinciden, ver renewSession) y se repite UNA vez.
 *  - Si después de eso sigue siendo 401, la sesión de verdad se perdió: se reporta como error (antes ese fallo era invisible).
 *
 * No toca lo que no lleva la sesión guardada (visitantes, terceros, la telemetría, el inicio de sesión y la renovación misma).
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/** Las rutas de autenticación se dejan pasar tal cual: ahí un 401 es una respuesta normal ("contraseña incorrecta") o es la renovación. */
const AUTH_PATH = /\/api\/community\/auth\/(login|signup|refresh|oauth|logout)/

let installed = false
let originalFetch: typeof fetch | null = null

const urlOf = (input: RequestInfo | URL): string | null => (typeof input === 'string' ? input : input instanceof URL ? input.href : null)

/** El token que viaja en la cabecera Authorization de esa llamada (null si no lleva). */
function bearerOf(init?: RequestInit): string | null {
  if (!init?.headers) return null
  const headers = new Headers(init.headers as HeadersInit)
  const value = headers.get('Authorization')
  return value?.startsWith('Bearer ') ? value.slice(7) : null
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers as HeadersInit)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

/** ¿Se puede mandar otra vez sin riesgo de perder el cuerpo? (un texto, un formulario o nada; un flujo de datos no) */
function replayable(init?: RequestInit): boolean {
  const body = init?.body
  return body == null || typeof body === 'string' || body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob
}

export function installAuthFetch(): () => void {
  if (typeof window === 'undefined' || installed) return () => {}
  installed = true
  const original = window.fetch
  originalFetch = original

  const authAware = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input)
    const sent = url && url.startsWith(`${API_BASE}/api/`) && !AUTH_PATH.test(url) ? bearerOf(init) : null
    // Solo las llamadas que llevan LA sesión guardada de esta persona.
    if (!url || !sent || sent !== getToken()) return original.call(window, input, init)

    let current = init
    let token = sent
    if (!isTokenFresh(token)) {
      const renewed = await renewSession()
      if (renewed.ok) {
        token = renewed.token
        current = withBearer(init, token)
      }
    }

    let response = await original.call(window, input, current)
    if (response.status === 401 && replayable(init)) {
      const renewed = await renewSession()
      if (renewed.ok) response = await original.call(window, input, withBearer(init, renewed.token))
    }

    // La sesión no se pudo salvar y la persona sigue "dentro" en pantalla: eso sí es un fallo.
    if (response.status === 401) reportApiError({ method: init?.method ?? 'GET', url, status: 401, message: `401 con la sesión iniciada: ${new URL(url).pathname}` })
    return response
  }

  window.fetch = authAware as typeof fetch
  return () => {
    if (window.fetch === (authAware as typeof fetch)) window.fetch = original
    installed = false
    originalFetch = null
  }
}

/** Solo para pruebas. */
export function resetAuthFetchForTests(): void {
  if (originalFetch && typeof window !== 'undefined') window.fetch = originalFetch
  installed = false
  originalFetch = null
}
