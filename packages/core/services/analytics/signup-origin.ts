/**
 * Recupera el origen de registro que se perdió al volver del inicio de sesión con LinkedIn o GitHub (antes de que se arreglara
 * `readAttribution`): las cuentas quedaban con `signup_source` vacío y página de entrada `/auth/callback`, aunque la persona había llegado
 * por el enlace de una publicación. Las sesiones de analítica (desde el 30 de octubre de 2026) guardan el UTM de cada visita y quedan
 * unidas a la cuenta al registrarse, así que se puede volver a leer de ahí. Reglas puras; el script está en `scripts/backfill-signup-origin.ts`.
 */
export interface OriginSession {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  referrer_host: string | null
  entry_path: string | null
  created_at: string
}

export interface SignupOrigin {
  signup_source: string
  signup_medium: string | null
  signup_campaign: string | null
  signup_content: string | null
  signup_referrer: string | null
  signup_landing_path: string | null
}

/** Margen después de crear la cuenta: la sesión del registro mismo todavía cuenta (el UTM ya venía en el navegador). */
const GRACE_MS = 5 * 60_000

/**
 * El último enlace marcado (con `utm_source`) que la persona abrió hasta el momento de registrarse: el mismo criterio de «último origen»
 * que usa el sitio. Una visita sin UTM nunca lo reemplaza. Null si ninguna sesión traía origen.
 */
export function pickSignupOrigin(sessions: OriginSession[], registeredAt: string): SignupOrigin | null {
  const limit = Date.parse(registeredAt) + GRACE_MS
  const candidates = sessions
    .filter((session) => session.utm_source && Date.parse(session.created_at) <= limit)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const last = candidates[0]
  if (!last) return null
  return {
    signup_source: last.utm_source!,
    signup_medium: last.utm_medium,
    signup_campaign: last.utm_campaign,
    signup_content: last.utm_content,
    signup_referrer: last.referrer_host,
    signup_landing_path: last.entry_path,
  }
}
