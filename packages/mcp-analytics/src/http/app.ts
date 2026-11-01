import express, { type Express, type Request, type Response } from 'express'
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Queryable } from '../queries'
import { createServer } from '../server'
import { OwnerOAuthProvider, SCOPE, type ProviderOptions } from './provider'

/** El SDK trae su propia versión de los tipos de Express: se pasa por aquí lo que él entrega y recibe. */
const asHandler = (handler: unknown) => handler as express.RequestHandler

export interface RemoteAppOptions extends ProviderOptions {
  db: Queryable
  /** La dirección pública del servicio (https://...up.railway.app), sin barra final. */
  publicUrl: string
  clarityProjectId?: string
}

/**
 * El servidor MCP remoto: el MISMO servidor de herramientas de solo lectura de siempre, detrás de HTTPS y del inicio de sesión de un
 * solo dueño (provider.ts). Sin una ficha de acceso válida nadie llega a ninguna herramienta.
 *
 * Es «sin estado»: cada petición arma su propio servidor y transporte, así que se puede reiniciar o repartir sin perder nada.
 */
export function createRemoteApp(options: RemoteAppOptions): { app: Express; provider: OwnerOAuthProvider } {
  const publicUrl = new URL(options.publicUrl)
  if (publicUrl.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(publicUrl.hostname)) throw new Error('MCP_PUBLIC_URL debe ser https.')
  const base = options.publicUrl.replace(/\/+$/, '')
  const mcpUrl = new URL(`${base}/mcp`)
  const provider = new OwnerOAuthProvider(options)

  const app = express()
  app.disable('x-powered-by')
  // Railway pone un proxy delante: sin esto todas las visitas parecerían venir de la misma dirección (y el bloqueo de intentos sería de todos).
  app.set('trust proxy', 1)

  // Registro de accesos para saber qué pide cada cliente y qué se le contesta. Solo método, ruta (sin parámetros: ahí viajan los códigos),
  // resultado, duración, el método MCP y los primeros caracteres del navegador/cliente. NUNCA cabeceras, cuerpos, claves ni tokens.
  app.use((req, res, next) => {
    const started = Date.now()
    res.on('finish', () => {
      if (req.path === '/health') return
      const rpc = typeof res.locals.rpcMethod === 'string' ? ` rpc=${res.locals.rpcMethod}` : ''
      const agent = String(req.get('user-agent') ?? '-').replace(/[^ -~]/g, '').slice(0, 40)
      console.log(`[acceso] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - started} ms)${rpc} ua="${agent}"`)
    })
    next()
  })

  app.get('/health', (_req, res) => { res.json({ ok: true }) })

  app.use(
    asHandler(mcpAuthRouter({
      provider: provider as unknown as OAuthServerProvider,
      issuerUrl: new URL(base),
      baseUrl: new URL(base),
      resourceServerUrl: mcpUrl,
      scopesSupported: [SCOPE],
      resourceName: 'Analítica de AvoTalent (solo lectura)',
      clientRegistrationOptions: { clientIdGeneration: false },
    })),
  )

  app.post('/oauth/consent', express.urlencoded({ extended: false, limit: '8kb' }), (req, res, next) => { void provider.consentHandler(req, res as never).catch(next) })

  const auth = asHandler(requireBearerAuth({ verifier: provider, requiredScopes: [SCOPE], resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) }))

  app.post('/mcp', auth, express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
    const body = req.body as { method?: unknown } | unknown[] | undefined
    res.locals.rpcMethod = Array.isArray(body) ? 'batch' : String((body as { method?: unknown } | undefined)?.method ?? '').replace(/[^\w/.-]/g, '').slice(0, 40)
    const server = createServer(options.db, { clarityProjectId: options.clarityProjectId })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => { void transport.close(); void server.close() })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('[avotalent-analytics] error en una petición MCP:', (error as Error).message)
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno' }, id: null })
    }
  })
  const notAllowed = (_req: Request, res: Response) => { res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido' }, id: null }) }
  app.get('/mcp', auth, notAllowed)
  app.delete('/mcp', auth, notAllowed)

  // Nada más existe: todo lo demás es 404 sin pistas.
  app.use((_req, res) => { res.status(404).type('text/plain').send('No encontrado') })

  return { app, provider }
}
