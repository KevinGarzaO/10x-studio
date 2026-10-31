import { isTrackingOff } from './attribution'

/**
 * Microsoft Clarity (grabaciones de sesión, mapas de calor, rage clicks y dead clicks).
 *
 * Solo se activa con un proyecto (ver CLARITY_PROJECT_ID más abajo), y nunca en un navegador con `?notrack=1` (el equipo).
 * Clarity no tiene una función para pedir el enlace de la grabación, así que el vínculo con nuestra base va al revés: le damos
 * a Clarity NUESTROS ids (`identify`: la cuenta y la sesión de analítica) y en su panel se filtran las grabaciones por ellos.
 * Nunca se manda el correo ni el nombre: solo el id de la cuenta (Clarity lo convierte en un hash antes de enviarlo).
 */

/** El proyecto de AvoTalent en Clarity (es público: va en el código de la página). Solo se usa en producción. */
const DEFAULT_PROJECT_ID = 'z6emolc22r'

/**
 * En producción se enciende solo con el proyecto de AvoTalent. `NEXT_PUBLIC_CLARITY_PROJECT_ID` lo cambia, y puesta VACÍA
 * (en Vercel) apaga Clarity sin tocar el código. En desarrollo y en las pruebas está apagado, para no ensuciar las grabaciones.
 */
export const CLARITY_PROJECT_ID = (process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? (process.env.NODE_ENV === 'production' ? DEFAULT_PROJECT_ID : '')).trim()

type ClarityFn = (command: string, ...args: unknown[]) => unknown

export function clarityEnabled(): boolean {
  if (!CLARITY_PROJECT_ID || typeof window === 'undefined') return false
  if (process.env.NODE_ENV === 'test' && !(globalThis as { __avoClarityTest?: boolean }).__avoClarityTest) return false
  return !isTrackingOff()
}

/** El código de instalación oficial de Clarity (carga el script de forma asíncrona). */
export const clarityBootstrap = (projectId: string): string =>
  `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(projectId)});`

function clarity(command: string, ...args: unknown[]): void {
  try {
    const fn = (window as unknown as { clarity?: ClarityFn }).clarity
    if (typeof fn === 'function') fn(command, ...args)
  } catch {
    // medir no debe romper nada
  }
}

export interface ClarityLink {
  /** La cuenta, si hay sesión iniciada. */
  userId: string | null
  /** El id de la sesión de analítica de esta pestaña (analytics_sessions.session_id). */
  sessionId: string | null
  path: string
  /** Tipo de persona para filtrar en Clarity (candidato / empresa). Nunca nombre ni correo. */
  userKind?: string | null
}

/**
 * Le pasa a Clarity quién es esta sesión: con la cuenta como "custom id" y nuestra sesión como "custom session id", en su
 * panel se puede abrir la grabación exacta de una fila de `analytics_sessions`. Se llama en cada página (Clarity lo pide así).
 */
export function linkClaritySession({ userId, sessionId, path, userKind }: ClarityLink): void {
  if (!clarityEnabled()) return
  if (userId) clarity('identify', userId, sessionId ?? undefined, path)
  clarity('set', 'account', userId ? 'registered' : 'anonymous')
  if (userId) clarity('set', 'user_id', userId)
  if (userKind) clarity('set', 'user_kind', userKind)
  if (sessionId) clarity('set', 'avo_session', sessionId)
  clarity('set', 'entry_path', path)
}

// ------------------------------------------------------------------------------------------------
// El enlace a la grabación de cada sesión
// ------------------------------------------------------------------------------------------------

const CLARITY_ID = /^[A-Za-z0-9]{1,64}$/

/** El primer pedazo de una cookie de Clarity (`valor|2|...` o `valor^...`), ya sin codificar; null si no es un id válido. */
function firstSegment(raw: string | undefined): string | null {
  if (!raw) return null
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    // se usa tal cual
  }
  const first = value.split(/[\^|]/)[0]
  return CLARITY_ID.test(first) ? first : null
}

/** Lee una cookie de la lista `a=1; b=2` (o null). */
function cookieValue(cookies: string, name: string): string | undefined {
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

/**
 * La dirección del video de ESTA sesión en Clarity: https://clarity.microsoft.com/player/<proyecto>/<usuario>/<sesión>.
 * El usuario y la sesión de Clarity los deja su propio script en las cookies `_clck` y `_clsk` de nuestro dominio. Microsoft
 * no documenta esta dirección (es la que usan sus propias integraciones), así que si algún día cambia, solo este bloque se ajusta.
 * Devuelve null si Clarity aún no puso sus cookies (no cargó, está bloqueado o la persona no las acepta).
 */
export function clarityPlayerUrl(projectId: string, cookies: string): string | null {
  const user = firstSegment(cookieValue(cookies, '_clck'))
  const session = firstSegment(cookieValue(cookies, '_clsk'))
  if (!projectId || !CLARITY_ID.test(projectId) || !user || !session) return null
  return `https://clarity.microsoft.com/player/${projectId}/${user}/${session}`
}

const sentLinks = new Map<string, string>()

/** Avisa al backend qué grabación de Clarity es esta sesión de analítica (una vez por cambio de dirección). */
export function sendClarityLink(sessionId: string | null): void {
  if (!clarityEnabled() || !sessionId) return
  const url = clarityPlayerUrl(CLARITY_PROJECT_ID, document.cookie)
  if (!url || sentLinks.get(sessionId) === url) return
  sentLinks.set(sessionId, url)
  try {
    void fetch('/api/a/clarity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, url }), keepalive: true }).catch(() => undefined)
  } catch {
    // medir no debe romper nada
  }
}

/** Solo para pruebas. */
export function resetClarityLinksForTests(): void {
  sentLinks.clear()
}
