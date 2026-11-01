import type { Request } from 'express'
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { newId, safeEqual, sign, verify } from './tokens'

/**
 * Inicio de sesión (OAuth 2.1) de UN SOLO DUEÑO para el servidor MCP remoto.
 *
 * Claude (el conector personalizado) solo sabe hablar con servidores abiertos o con OAuth; no acepta una llave fija. Así que este
 * servidor es su propio servidor de autorización, con una sola regla: **se entra con la clave del dueño** (MCP_OWNER_KEY).
 *
 *  - Los clientes se registran solos (registro dinámico), pero SOLO con las direcciones de regreso de Claude (lista cerrada).
 *  - La persona escribe la clave en la pantalla de acceso; con 5 intentos fallidos desde una misma dirección se bloquea 15 minutos.
 *  - El código de autorización dura 5 minutos y sirve una vez; el token de acceso dura 1 hora y el de renovación 30 días (rota).
 *  - Todo va firmado (tokens.ts): no hay base ni memoria que perder en un despliegue.
 *  - Para cortar todo acceso: cambiar MCP_TOKEN_EPOCH (o MCP_TOKEN_SECRET) en Railway.
 */

/**
 * Lo único que se usa de la respuesta. El SDK trae sus propios tipos de Express (otra versión que la de este paquete), así que se
 * pide solo esta forma mínima en lugar de `Response`: lo importante es que lo que se usa existe.
 */
export interface PageResponse {
  status(code: number): PageResponse
  set(headers: Record<string, string>): PageResponse
  send(body: string): unknown
}

export const SCOPE = 'mcp:read'
const CODE_SECONDS = 5 * 60
const ACCESS_SECONDS = 60 * 60
const REFRESH_SECONDS = 30 * 24 * 60 * 60
const MAX_FAILURES = 5
const LOCK_SECONDS = 15 * 60

/** Las direcciones a las que Claude regresa tras iniciar sesión. Cualquier otra no puede registrarse. */
export const DEFAULT_ALLOWED_REDIRECTS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']

export interface ProviderOptions {
  /** Clave que firma todo (mínimo 32 caracteres). */
  secret: string
  /** La clave del dueño, la que se escribe en la pantalla de acceso (mínimo 20 caracteres). */
  ownerKey: string
  /** Sube este número para invalidar todo lo emitido antes. */
  epoch?: number
  allowedRedirects?: string[]
  /** Solo para pruebas: el reloj, en segundos. */
  now?: () => number
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

type ConsentResponse = PageResponse & { redirect(status: number, url: string): void }

export class OwnerOAuthProvider implements OAuthServerProvider {
  private readonly epoch: number
  private readonly redirects: string[]
  private readonly now: () => number
  private readonly usedCodes = new Map<string, number>()
  private readonly usedRefresh = new Map<string, number>()
  private readonly revoked = new Map<string, number>()
  private readonly failures = new Map<string, { count: number; until: number }>()

  constructor(private readonly options: ProviderOptions) {
    if (options.secret.length < 32) throw new Error('MCP_TOKEN_SECRET debe tener al menos 32 caracteres.')
    if (options.ownerKey.length < 20) throw new Error('MCP_OWNER_KEY debe tener al menos 20 caracteres.')
    this.epoch = options.epoch ?? 1
    this.redirects = options.allowedRedirects ?? DEFAULT_ALLOWED_REDIRECTS
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000))
  }

  /** Los orígenes de las direcciones de regreso, para la política de seguridad de la pantalla de acceso. */
  get redirectOrigins(): string[] {
    return [...new Set(this.redirects.map((url) => new URL(url).origin))]
  }

  // ---------------- Clientes (registro dinámico, sin guardar nada) ----------------

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId: string) => {
        const payload = verify(clientId, this.options.secret, 'client', this.epoch, this.now())
        if (!payload) return undefined
        return {
          client_id: clientId,
          redirect_uris: payload.ru as string[],
          client_name: typeof payload.n === 'string' ? payload.n : undefined,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: SCOPE,
        } as OAuthClientInformationFull
      },
      registerClient: (client) => {
        const uris = (client.redirect_uris ?? []).map(String)
        if (uris.length === 0 || uris.length > 5 || !uris.every((uri) => this.redirects.includes(uri))) {
          throw new InvalidClientMetadataError('redirect_uris no permitidas para este servidor')
        }
        const issuedAt = this.now()
        const id = sign({ t: 'client', ep: this.epoch, exp: issuedAt + 365 * 24 * 3600, ru: uris, n: String(client.client_name ?? '').slice(0, 80) }, this.options.secret)
        return {
          ...client,
          redirect_uris: uris,
          client_id: id,
          client_id_issued_at: issuedAt,
          client_secret: undefined,
          client_secret_expires_at: undefined,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: SCOPE,
        } as OAuthClientInformationFull
      },
    }
  }

  // ---------------- Pantalla de acceso ----------------

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: PageResponse): Promise<void> {
    this.renderConsent(res, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      clientName: client.client_name,
    })
  }

  private renderConsent(res: PageResponse, view: { clientId: string; redirectUri: string; codeChallenge: string; state?: string; clientName?: string }, error?: string, status = 200): void {
    const hidden = (name: string, value: string | undefined) => (value === undefined ? '' : `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    const origins = ["'self'", ...this.redirectOrigins].join(' ')
    res
      .status(status)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${origins}; frame-ancestors 'none'; base-uri 'none'`,
      })
      .send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Acceso a la analítica de AvoTalent</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}
main{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;max-width:420px;width:100%;box-sizing:border-box}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;line-height:1.5;margin:0 0 16px;font-size:14px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input[type=password]{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;background:#059669;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px}
</style></head><body><main>
<h1>Acceso a la analítica de AvoTalent</h1>
<p>${escapeHtml(view.clientName || 'Claude')} pide permiso para <b>leer</b> las cifras agregadas de AvoTalent (solo lectura, sin datos personales). Escribe la clave del dueño para permitirlo.</p>
${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/oauth/consent" autocomplete="off">
${hidden('client_id', view.clientId)}${hidden('redirect_uri', view.redirectUri)}${hidden('code_challenge', view.codeChallenge)}${hidden('state', view.state)}
<label for="key">Clave del dueño</label>
<input id="key" name="key" type="password" required autofocus autocomplete="off">
<button type="submit">Permitir acceso</button>
</form></main></body></html>`)
  }

  /** Recibe la clave escrita en la pantalla de acceso; si es correcta, regresa a Claude con un código de un solo uso. */
  consentHandler = async (req: Request, res: ConsentResponse): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const text = (value: unknown) => (typeof value === 'string' ? value : '')
    const clientId = text(body.client_id)
    const redirectUri = text(body.redirect_uri)
    const codeChallenge = text(body.code_challenge)
    const state = typeof body.state === 'string' ? body.state : undefined
    const key = text(body.key)

    const client = await this.clientsStore.getClient(clientId)
    if (!client || !client.redirect_uris.includes(redirectUri) || !this.redirects.includes(redirectUri) || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      res.status(400).set({ 'Content-Type': 'text/plain; charset=utf-8' }).send('Solicitud no válida.')
      return
    }
    const view = { clientId, redirectUri, codeChallenge, state, clientName: client.client_name }

    const who = req.ip ?? 'desconocido'
    const now = this.now()
    const record = this.failures.get(who)
    if (record && record.count >= MAX_FAILURES && record.until > now) {
      this.renderConsent(res, view, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 429)
      return
    }

    if (!safeEqual(key, this.options.ownerKey)) {
      const count = record && record.until > now ? record.count + 1 : 1
      this.failures.set(who, { count, until: now + LOCK_SECONDS })
      this.renderConsent(res, view, 'La clave no es correcta.', 401)
      return
    }
    this.failures.delete(who)

    const code = sign({ t: 'code', ep: this.epoch, exp: now + CODE_SECONDS, cid: clientId, ru: redirectUri, cc: codeChallenge }, this.options.secret)
    const target = new URL(redirectUri)
    target.searchParams.set('code', code)
    if (state !== undefined) target.searchParams.set('state', state)
    res.set({ 'Cache-Control': 'no-store' })
    res.redirect(302, target.toString())
  }

  // ---------------- Códigos y tokens ----------------

  private readCode(client: OAuthClientInformationFull, code: string) {
    const payload = verify(code, this.options.secret, 'code', this.epoch, this.now())
    if (!payload || payload.cid !== client.client_id) throw new InvalidGrantError('Código inválido o vencido')
    return payload
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return String(this.readCode(client, authorizationCode).cc)
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string): Promise<OAuthTokens> {
    const payload = this.readCode(client, authorizationCode)
    if (redirectUri !== undefined && redirectUri !== payload.ru) throw new InvalidGrantError('La dirección de regreso no coincide')
    this.sweep(this.usedCodes)
    if (this.usedCodes.has(payload.jti)) throw new InvalidGrantError('El código ya se usó')
    this.usedCodes.set(payload.jti, payload.exp)
    return this.issue(client.client_id)
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const payload = verify(refreshToken, this.options.secret, 'refresh', this.epoch, this.now())
    if (!payload || payload.cid !== client.client_id || this.revoked.has(payload.jti)) throw new InvalidGrantError('Token de renovación inválido o vencido')
    this.sweep(this.usedRefresh)
    if (this.usedRefresh.has(payload.jti)) throw new InvalidGrantError('El token de renovación ya se usó')
    this.usedRefresh.set(payload.jti, payload.exp)
    return this.issue(client.client_id)
  }

  private issue(clientId: string): OAuthTokens {
    const now = this.now()
    return {
      access_token: sign({ t: 'access', ep: this.epoch, exp: now + ACCESS_SECONDS, cid: clientId }, this.options.secret),
      token_type: 'Bearer',
      expires_in: ACCESS_SECONDS,
      refresh_token: sign({ t: 'refresh', ep: this.epoch, exp: now + REFRESH_SECONDS, cid: clientId }, this.options.secret),
      scope: SCOPE,
    } as OAuthTokens
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const payload = verify(token, this.options.secret, 'access', this.epoch, this.now())
    if (!payload || this.revoked.has(payload.jti)) throw new InvalidTokenError('Token inválido o vencido')
    return { token, clientId: String(payload.cid), scopes: [SCOPE], expiresAt: payload.exp }
  }

  /** Revocar es de mejor esfuerzo (la lista vive en memoria); el corte seguro es subir MCP_TOKEN_EPOCH. */
  async revokeToken(_client: OAuthClientInformationFull, request: { token: string }): Promise<void> {
    for (const kind of ['access', 'refresh'] as const) {
      const payload = verify(request.token, this.options.secret, kind, this.epoch, this.now())
      if (payload) this.revoked.set(payload.jti, payload.exp)
    }
  }

  /** Olvida lo ya vencido para que las listas en memoria no crezcan sin fin. */
  private sweep(map: Map<string, number>): void {
    const now = this.now()
    for (const [id, exp] of map) if (exp <= now) map.delete(id)
  }
}

export { newId }
