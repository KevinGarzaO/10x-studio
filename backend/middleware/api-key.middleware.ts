import { timingSafeEqual } from 'crypto'
import { Request, Response, NextFunction } from 'express'

/**
 * REGLA DE DISEÑO (13 nov 2026): toda API de AvoTalent exige una llave de aplicación en la cabecera `x-api-key`, en TODOS los entornos.
 *
 * La llave dice QUÉ aplicación llama (la web, el panel, un servidor). Es una puerta, no una identidad: QUIÉN es la persona lo sigue diciendo su token.
 * Sirve para cuatro cosas: (1) rechazar los escáneres y las peticiones al azar que no conocen la llave; (2) saber qué cliente manda cada petición;
 * (3) poder rotar o apagar la llave de un cliente sin tocar a los demás; (4) medir y limitar por cliente.
 *
 * Una llave con nombre por cliente y por entorno, nunca la misma en dos entornos:
 *   API_KEYS=web:<llave>,panel:<llave>,servidor:<llave>      (cada llave de 24 caracteres o más; el nombre en minúsculas, números, - y _)
 *   API_KEY_MODE=off | report | enforce
 *     - off      : no revisa nada (por omisión si no hay API_KEYS).
 *     - report   : deja pasar todo pero CUENTA y registra las peticiones sin llave o con llave inválida (sirve para ensayar en producción sin romper
 *                  a nadie: se pasa a enforce cuando el registro muestra que todas las pantallas ya mandan su llave).
 *     - enforce  : sin llave válida, 401 y no se ejecuta nada (por omisión si hay API_KEYS).
 *
 * HONESTIDAD: una llave que viaja dentro de la página web (NEXT_PUBLIC_*) la puede leer quien abra la página. La del navegador es un identificador
 * de la aplicación, no un secreto; la protección real de ese camino son la sesión, los límites de uso y CORS. Las llaves de SERVIDOR a servidor
 * (el intermediario de analítica, el conector del agente) sí son secretos y van en variables que nunca llegan al navegador.
 *
 * Exentos (no pueden mandar cabeceras o traen su propia firma): OPTIONS (el navegador manda la consulta previa sin cabeceras propias), la raíz `/`
 * (chequeo de salud), `/api/files/*` y `/api/community/favicon/*` (se cargan con <img>), el inicio de OAuth (es una redirección del navegador), el
 * regreso de LinkedIn, el webhook de Resend (lleva su firma), el clic de un aviso push (lo manda el service worker), `/sitemap.xml` y `/api-docs`.
 */
export type ApiKeyMode = 'off' | 'report' | 'enforce'
export interface ApiKeyEntry { name: string; key: Buffer }

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/

export function parseApiKeys(raw: string | undefined): ApiKeyEntry[] {
  const entries: ApiKeyEntry[] = []
  for (const part of (raw ?? '').split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const at = trimmed.indexOf(':')
    const name = at > 0 ? trimmed.slice(0, at) : ''
    const key = at > 0 ? trimmed.slice(at + 1) : ''
    if (NAME.test(name) && key.length >= 24) entries.push({ name, key: Buffer.from(key) })
  }
  return entries
}

export function apiKeyMode(env: NodeJS.ProcessEnv = process.env): ApiKeyMode {
  const keys = parseApiKeys(env.API_KEYS)
  if (keys.length === 0) return 'off'
  const requested = (env.API_KEY_MODE ?? '').trim().toLowerCase()
  return requested === 'off' || requested === 'report' ? requested : 'enforce'
}

const EXEMPT = [
  /^\/$/,
  /^\/api\/files\//,
  /^\/api\/community\/favicon\//,
  /^\/api\/community\/auth\/oauth\//,
  /^\/api\/linkedin\/callback$/,
  /^\/api\/webhooks\//,
  /^\/api\/community\/push\/click$/,
  /^\/sitemap\.xml$/,
  /^\/api-docs/,
  /^\/uploads\//,
]
export const isApiKeyExempt = (method: string, path: string): boolean => method === 'OPTIONS' || EXEMPT.some((pattern) => pattern.test(path))

/** Contadores de lo que no traía llave válida (se registran una vez por minuto si hubo alguno). */
export interface ApiKeyStats { missing: number; invalid: number; byClient: Record<string, number> }
const stats: ApiKeyStats = { missing: 0, invalid: 0, byClient: {} }
export const apiKeyStats = (): ApiKeyStats => ({ ...stats, byClient: { ...stats.byClient } })
export function resetApiKeyStats() { stats.missing = 0; stats.invalid = 0; stats.byClient = {} }

export function apiKeyGate(env: NodeJS.ProcessEnv = process.env, log: (message: string) => void = (message) => console.log(message)) {
  const mode = apiKeyMode(env)
  if (mode === 'off') return (_req: Request, _res: Response, next: NextFunction) => next()
  const keys = parseApiKeys(env.API_KEYS)
  let lastLog = 0
  const note = () => {
    const now = Date.now()
    if (now - lastLog < 60_000 || (stats.missing === 0 && stats.invalid === 0)) return
    lastLog = now
    log(`[LlaveAPI] modo ${mode}: sin llave ${stats.missing}, llave inválida ${stats.invalid}, llaves válidas por cliente ${JSON.stringify(stats.byClient)}`)
  }
  return (req: Request & { apiClient?: string }, res: Response, next: NextFunction) => {
    if (isApiKeyExempt(req.method, req.path)) return next()
    const header = req.header('x-api-key')
    const given = Buffer.from(header ?? '')
    const hit = header ? keys.find((entry) => entry.key.length === given.length && timingSafeEqual(entry.key, given)) : undefined
    if (hit) {
      req.apiClient = hit.name
      stats.byClient[hit.name] = (stats.byClient[hit.name] ?? 0) + 1
      return next()
    }
    if (header) stats.invalid++
    else stats.missing++
    note()
    if (mode === 'report') return next()
    res.status(401).json({ error: 'Falta la llave de la aplicación (x-api-key) o no es válida' })
  }
}
