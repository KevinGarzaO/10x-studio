/**
 * A dónde volver después de registrarse o iniciar sesión.
 *
 * Quien llega a una vacante desde LinkedIn y decide registrarse no debe perder esa
 * vacante: se guarda la página en la que estaba y, cuando termina el registro y el
 * onboarding (o el inicio de sesión), se le regresa a ella.
 *
 * Solo se guardan rutas del propio sitio: el valor viaja por el almacenamiento del
 * navegador y, si aceptara cualquier dirección, un enlace malicioso podría usarlo para
 * mandar a la gente a otro sitio al terminar de registrarse.
 *
 * Todo está en try/catch: sin almacenamiento (ventana privada, bloqueado) simplemente se
 * vuelve a la página principal, como antes.
 */

const KEY = 'avo_return_to'
/** Pasa por el correo de confirmación y el onboarding: puede tardar, pero no días. */
const TTL_MS = 24 * 60 * 60 * 1000

/** Páginas a las que nunca se vuelve: son parte del propio registro. */
const EXCLUDED = ['/login', '/signup', '/onboarding']

/** ¿Es una ruta del propio sitio a la que sea seguro volver? */
export function isSafeReturnPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 500) return false
  // "//otro.com" y "/\otro.com" los toman los navegadores como otro sitio.
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false
  if (/[\u0000-\u001f]/.test(path)) return false
  const pathname = path.split(/[?#]/)[0]
  return !EXCLUDED.some((excluded) => pathname === excluded || pathname.startsWith(`${excluded}/`))
}

export function saveReturnTo(path: string, now: number = Date.now()): void {
  if (!isSafeReturnPath(path)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, savedAt: now }))
  } catch {
    // sin almacenamiento: se vuelve al inicio
  }
}

/** La ruta guardada, sin borrarla; null si no hay, venció o no es segura. */
export function peekReturnTo(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { path, savedAt } = JSON.parse(raw) as { path?: unknown; savedAt?: unknown }
    if (typeof savedAt !== 'number' || now - savedAt > TTL_MS || !isSafeReturnPath(path)) {
      localStorage.removeItem(KEY)
      return null
    }
    return path
  } catch {
    return null
  }
}

export function clearReturnTo(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nada que borrar
  }
}

/** La ruta guardada, borrándola: se usa al terminar el recorrido. */
export function takeReturnTo(now: number = Date.now()): string | null {
  const path = peekReturnTo(now)
  clearReturnTo()
  return path
}
