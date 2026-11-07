import { timingSafeEqual } from 'crypto'
import { Request, Response, NextFunction } from 'express'

/**
 * Lectura del panel de analítica por una llave de servicio, para que el agente de producto (MCP) lea LAS MISMAS rutas, con
 * el mismo código y los mismos números que el panel de Telemetry, en vez de repetir las cuentas.
 *
 * - Solo existe si `ANALYTICS_SERVICE_KEY` está puesta en el servidor (sin ella, nadie entra por aquí).
 * - Solo GET y solo las rutas agregadas de `SERVICE_READABLE`: nada de listas de sesiones, personas en vivo ni usuarios.
 * - A lo que contesta se le quitan las listas de personas (`PERSON_KEYS`), por si una ruta agregada trae alguna.
 * - Cualquier otra petición sigue el camino de siempre (sesión + superadmin).
 */
export const SERVICE_READABLE = new Set([
  '/overview', '/acquisition', '/linkedin', '/vacancies', '/matching', '/alerts', '/changes', '/performance', '/retention',
  '/web', '/web/segments', '/web/geo', '/web/pages', '/web/events', '/web/errors', '/web/flows', '/web/rhythm', '/feedback', '/supply', '/feed-visible','/linkedin-experiment', '/web/wall', '/web/providers','/web/bots', '/linkedin-report', '/push', '/accounts/weekly', '/web/apply-funnel', '/web/retention',
])

/** Claves que nunca salen por la llave de servicio: listas de personas y sus datos de contacto. */
export const PERSON_KEYS = new Set(['people', 'activePeople', 'profile', 'email', 'user', 'displayName', 'display_name', 'username', 'photoUrl', 'photo_url'])

export function stripPeople<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripPeople) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (!PERSON_KEYS.has(key)) out[key] = stripPeople(inner)
    }
    return out as T
  }
  return value
}

export function hasValidServiceKey(req: Request, expected = process.env.ANALYTICS_SERVICE_KEY): boolean {
  if (!expected || expected.length < 24) return false
  const given = req.header('x-analytics-key')
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** `studio` es el guardia de siempre (sesión + superadmin); la llave solo abre las rutas permitidas. */
export function analyticsAccess(studio: (req: Request, res: Response, next: NextFunction) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && SERVICE_READABLE.has(req.path) && hasValidServiceKey(req)) {
      const json = res.json.bind(res)
      res.json = ((body: unknown) => json(stripPeople(body))) as Response['json']
      return next()
    }
    return studio(req, res, next)
  }
}
