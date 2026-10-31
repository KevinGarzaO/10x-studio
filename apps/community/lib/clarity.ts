import { isTrackingOff } from './attribution'

/**
 * Microsoft Clarity (grabaciones de sesión, mapas de calor, rage clicks y dead clicks).
 *
 * Solo se activa si `NEXT_PUBLIC_CLARITY_PROJECT_ID` está puesto, y nunca en un navegador con `?notrack=1` (el equipo).
 * Clarity no tiene una función para pedir el enlace de la grabación, así que el vínculo con nuestra base va al revés: le damos
 * a Clarity NUESTROS ids (`identify`: la cuenta y la sesión de analítica) y en su panel se filtran las grabaciones por ellos.
 * Nunca se manda el correo ni el nombre: solo el id de la cuenta (Clarity lo convierte en un hash antes de enviarlo).
 */

export const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() || ''

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
