import { forgetSessionMarker, markSessionKnown } from './session-marker'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface Session {
  access_token: string
  refresh_token: string
}

/** Avisa al resto de la página que la sesión cambió (entró o salió alguien): por ejemplo, las funciones nuevas se vuelven a pedir. */
function announceSessionChange() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('avo:session-changed'))
  } catch {
    // avisar nunca debe estorbar
  }
}

export function saveSession(session: Session, user: unknown) {
  localStorage.setItem('avocado_token', session.access_token)
  localStorage.setItem('avocado_refresh_token', session.refresh_token)
  localStorage.setItem('avocado_user', JSON.stringify(user))
  markSessionKnown()
  announceSessionChange()
}

// Supabase's own confirmation link redirects the browser to
// `emailRedirectTo` (here, `/onboarding`) with the fresh session appended as
// a URL hash fragment (`#access_token=...&refresh_token=...&type=signup`) —
// that's server-side redirect logic we don't control, so the page it lands
// on has to pick the tokens up itself. Returns true if a session was found
// and saved, and strips the fragment from the address bar either way.
export function captureSessionFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!hash) return false

  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')

  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  if (!access_token || !refresh_token) return false
  saveSession({ access_token, refresh_token }, null)
  return true
}

/**
 * Borra la sesión de este navegador. Con `explicit` (la persona pulsó "Cerrar sesión") también se quita la marca de "ya tuvo
 * sesión"; sin ella (el servidor rechazó la renovación) la marca se queda, para poder medir cuántas veces se pierde la sesión.
 */
export function clearSession(options: { explicit?: boolean } = {}) {
  localStorage.removeItem('avocado_token')
  localStorage.removeItem('avocado_refresh_token')
  localStorage.removeItem('avocado_user')
  if (options.explicit) forgetSessionMarker()
  announceSessionChange()
}

export function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('avocado_token') : null
}

// Last known user, read synchronously so pages can render as "logged in"
// immediately instead of flashing a logged-out state while fetchCurrentUser
// confirms the session over the network (worse now that an expired token
// costs an extra round-trip to refresh). fetchCurrentUser() below is still
// the source of truth and will correct this if the session turned out to be
// invalid.
export function getCachedUser(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('avocado_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Cuándo vence un token de acceso (ms), leyendo el `exp` de su contenido; null si no se puede leer (no es un JWT). */
export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/** ¿El token sirve todavía (le queda al menos `marginMs`)? Si no se puede saber, se da por bueno: el servidor lo dirá. */
export function isTokenFresh(token: string, marginMs = 60_000): boolean {
  const expires = tokenExpiresAt(token)
  return expires === null || expires - Date.now() > marginMs
}

// Lo que salió de intentar renovar la sesión:
//   rejected     el servidor dijo que la renovación no vale (token vencido o ya usado): ya no hay sesión que salvar.
//   unavailable  no se pudo preguntar (sin red, servidor caído o lento): la sesión puede seguir siendo buena, NO se borra.
export type RenewResult = { ok: true; token: string } | { ok: false; reason: 'rejected' | 'unavailable' }

/** Cuenta lo que le pasa a la sesión en la analítica (se importa al momento para no crear un ciclo con web-analytics). */
function note(event: string, params: Record<string, string | number | boolean> = {}): void {
  void import('./web-analytics').then(module => module.trackEvent(event, params)).catch(() => undefined)
}

async function requestRenewal(): Promise<RenewResult> {
  const refresh_token = localStorage.getItem('avocado_refresh_token')
  if (!refresh_token) return { ok: false, reason: 'rejected' }

  try {
    const res = await fetch(`${API_URL}/api/community/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    })
    if (res.ok) {
      const data = await res.json()
      if (!data.session?.access_token) return { ok: false, reason: 'unavailable' }
      saveSession(data.session, data.user)
      return { ok: true, token: data.session.access_token }
    }
    // 400/401/403: el servidor rechazó ESTE token. Cualquier otro fallo (5xx, 503...) no dice nada sobre la sesión.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // Otra pestaña pudo haberlo renovado un momento antes (el token de renovación se usa una sola vez): si lo que hay guardado
      // ahora es distinto y sirve, esa sesión es la buena y no hay que borrarla.
      const stored = localStorage.getItem('avocado_refresh_token')
      const token = getToken()
      if (stored && stored !== refresh_token && token && isTokenFresh(token)) return { ok: true, token }
      return { ok: false, reason: 'rejected' }
    }
    return { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

let renewing: Promise<RenewResult> | null = null

/**
 * Renueva la sesión. Todas las llamadas al mismo tiempo comparten UNA sola petición: antes cada pantalla pedía la suya con el mismo
 * token de renovación (que se usa una sola vez), y la que llegaba segunda fallaba y borraba lo que la primera acababa de guardar.
 */
export function renewSession(): Promise<RenewResult> {
  if (!renewing) renewing = requestRenewal().finally(() => { renewing = null })
  return renewing
}

/**
 * Un token de acceso que sirve ahora mismo: el guardado si no ha vencido; si venció, se renueva antes de usarlo (así no se manda una
 * petición que se sabe que va a fallar). null si no hay sesión o no se pudo renovar.
 */
export async function getValidToken(): Promise<string | null> {
  const token = getToken()
  if (!token) return null
  if (isTokenFresh(token)) return token
  const renewed = await renewSession()
  return renewed.ok ? renewed.token : null
}

/** Qué hacer cuando no se pudo renovar: si el servidor la rechazó, la sesión ya no existe; si no se pudo preguntar, se conserva. */
function sessionNotRenewed(reason: 'rejected' | 'unavailable', cached: any | null): any | null {
  if (reason === 'rejected') {
    clearSession()
    note('session_lost', { reason: 'refresh_rejected' })
    return null
  }
  note('session_lost', { reason: 'refresh_unavailable', kept: !!cached })
  return cached
}

// The access token from Supabase expires after ~1h. Without this, any page
// open longer than that shows the "locked" state even though the user is
// still logged in, because /auth/me starts returning 401. Solo se borra la sesión si el servidor la rechaza de verdad:
// un fallo de red o del servidor no debe sacar a nadie.
export async function fetchCurrentUser(): Promise<any | null> {
  let token = getToken()
  const cached = getCachedUser()
  if (!token) {
    // Quedó el usuario guardado pero no el token: el navegador borró la sesión a medias.
    if (cached) note('session_lost', { reason: 'token_missing' })
    return null
  }

  if (!isTokenFresh(token)) {
    const renewed = await renewSession()
    if (!renewed.ok) return sessionNotRenewed(renewed.reason, cached)
    token = renewed.token
    note('session_renewed', { had_cached_user: !!cached })
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/api/community/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      const renewed = await renewSession()
      if (!renewed.ok) return sessionNotRenewed(renewed.reason, cached)
      note('session_renewed', { had_cached_user: !!cached, after_401: true })
      res = await fetch(`${API_URL}/api/community/auth/me`, { headers: { Authorization: `Bearer ${renewed.token}` } })
    }
  } catch {
    // Sin red: se sigue como estaba, no se saca a nadie.
    return cached
  }

  if (res.status >= 500) return cached
  if (!res.ok) return null
  const data = await res.json()
  return data.user || null
}

/**
 * GET con la sesión de la persona. Si el token venció lo renueva antes de pedir, y si aun así llega un 401 lo renueva y reintenta una
 * vez: sin esto, quien entraba con un token viejo recibía respuestas vacías hasta recargar. Devuelve null si no hay sesión o falla.
 */
export async function fetchJsonWithSession(url: string): Promise<any | null> {
  let token = await getValidToken()
  if (!token) return null
  try {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      const renewed = await renewSession()
      if (!renewed.ok) return null
      token = renewed.token
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    }
    // Una respuesta 5xx es un fallo nuestro (no de la persona): se reporta como error de API.
    // (se importa al momento para no crear un ciclo: error-reporter usa la analítica, que a su vez usa esta sesión)
    if (res.status >= 500) void import('./error-reporter').then(module => module.reportApiError({ url, status: res.status })).catch(() => undefined)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
