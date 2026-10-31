import { Router, Request, Response } from 'express'
import { timingSafeEqual } from 'crypto'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { isBotUserAgent } from '../../../services/analytics/bots'
import { parseCollectPayload, sanitizeClientId } from '../../../services/web-analytics/payload'
import { applyCollect, executeUserStitching, type RequestContext } from '../../../services/web-analytics/collect'

const router = Router()

/**
 * Analítica web propia (reglas de GA4). Ver backend/sql/web-analytics-migration.sql.
 *
 * Estas rutas NO las llama el navegador directamente: las llama el intermediario de la comunidad
 * (apps/community/app/api/a/*), que está en el mismo sitio que la página y por eso no lo frenan los bloqueadores. El
 * intermediario es el que:
 *   - pone y lee la cookie `_avo_cid` (HttpOnly, 2 años): el navegador nunca ve ni manda el client_id;
 *   - agrega país, región y ciudad (cabeceras `x-vercel-ip-*`, que solo existen en Vercel);
 *   - reenvía el User-Agent y el idioma reales de la persona.
 * Y se identifica con `ANALYTICS_PROXY_SECRET`. Sin esa clave bien puesta, lo que llega no se toma en cuenta: así nadie
 * puede inventar visitas con ciudades falsas ni unir su cuenta con el navegador de otra persona.
 *
 * Todo responde 204 sin importar qué pasó: quien manda no necesita saber si se guardó, y medir nunca debe romper nada.
 */

/** ¿Viene del intermediario? Si no hay clave configurada (desarrollo local) se acepta todo. */
function fromProxy(req: Request): boolean {
  const secret = process.env.ANALYTICS_PROXY_SECRET
  if (!secret) return true
  const sent = String(req.headers['x-avo-proxy-secret'] ?? '')
  const a = Buffer.from(sent)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

const header = (req: Request, name: string): string | null => {
  const value = req.headers[name]
  const text = Array.isArray(value) ? value[0] : value
  return text && text.trim() ? text.trim() : null
}

/** La ciudad llega codificada como URL (Vercel: "Ciudad%20de%20M%C3%A9xico"). */
function decoded(value: string | null): string | null {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Tope por navegador: son rutas públicas que escriben en la base. */
function makeLimiter(maxPerHour: number) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (key: string): boolean => {
    const now = Date.now()
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
    const entry = hits.get(key)
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + 3600000 })
      return true
    }
    entry.count += 1
    return entry.count <= maxPerHour
  }
}

// Un latido cada 10 s son 360 por hora de pestaña abierta: el tope deja holgura para varias pestañas y eventos.
const allowedCollect = makeLimiter(1500)
const allowedIdentify = makeLimiter(60)

/** Una coordenada válida dentro de su rango, o null (lo que llega del encabezado no se toma tal cual). */
function coordinate(value: string | null, limit: number): number | null {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) && Math.abs(number) <= limit ? Math.round(number * 10000) / 10000 : null
}

function contextOf(req: Request): RequestContext | null {
  const clientId = sanitizeClientId(header(req, 'x-avo-client-id') ?? (process.env.ANALYTICS_PROXY_SECRET ? null : req.body?.client_id))
  if (!clientId) return null
  return {
    clientId,
    userAgent: header(req, 'x-avo-ua') ?? header(req, 'user-agent'),
    acceptLanguage: header(req, 'x-avo-lang') ?? header(req, 'accept-language'),
    country: decoded(header(req, 'x-avo-country')),
    region: decoded(header(req, 'x-avo-region')),
    city: decoded(header(req, 'x-avo-city')),
    latitude: coordinate(header(req, 'x-avo-lat'), 90),
    longitude: coordinate(header(req, 'x-avo-lon'), 180),
  }
}

/** Una sesión, una vista de página, un latido o un evento. */
router.post('/collect', async (req: Request, res: Response) => {
  try {
    if (!fromProxy(req)) return res.status(204).end()
    const context = contextOf(req)
    const payload = parseCollectPayload(req.body)
    // Los robots no son visitantes (misma lista que el resto del panel). Sin User-Agent tampoco es una persona.
    if (!context || !payload || isBotUserAgent(context.userAgent) || !allowedCollect(context.clientId)) return res.status(204).end()

    await applyCollect(payload, context)
  } catch (error) {
    console.warn('[WebAnalytics] No se pudo guardar:', (error as Error).message)
  }
  res.status(204).end()
})

/**
 * "Esta persona acaba de registrarse o iniciar sesión": une sus visitas anónimas con su cuenta (user stitching).
 * El usuario sale del token de sesión verificado, no de lo que diga el cuerpo.
 */
router.post('/identify', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!fromProxy(req)) return res.status(204).end()
    const context = contextOf(req)
    if (!context || !req.userId || !allowedIdentify(context.clientId)) return res.status(204).end()

    await executeUserStitching(context.clientId, req.userId)
  } catch (error) {
    console.warn('[WebAnalytics] No se pudo unir la identidad:', (error as Error).message)
  }
  res.status(204).end()
})

export default router
