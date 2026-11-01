import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createRemoteApp } from '../src/http/app'
import { sign, verify } from '../src/http/tokens'
import type { Queryable } from '../src/queries'

/**
 * El servidor MCP remoto de punta a punta (HTTP de verdad en un puerto local): el inicio de sesión del dueño (registro, pantalla
 * de acceso, código con PKCE, tokens, renovación), lo que NO debe dejar pasar, y que las herramientas respondan ya con el token.
 */
const SECRET = 'una-clave-de-firma-larga-de-prueba-0123456789'
const OWNER_KEY = 'la-clave-del-dueno-de-prueba-9876'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'

let clock = 1_800_000_000
let server: Server
let base: string
const db: Queryable = { query: async () => ({ rows: [] }) }

function start(epoch = 1) {
  const { app } = createRemoteApp({ db, publicUrl: 'http://localhost:4510', secret: SECRET, ownerKey: OWNER_KEY, epoch, now: () => clock })
  return new Promise<{ server: Server; base: string }>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ server: s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }))
  })
}

beforeAll(async () => { ;({ server, base } = await start()) })
afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })
beforeEach(() => { clock = 1_800_000_000 })

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}
const form = (values: Record<string, string>) => new URLSearchParams(values).toString()
const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' }

async function register(url = base, redirects = [CALLBACK]) {
  const res = await fetch(`${url}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: redirects, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })
  return { status: res.status, body: await res.json() }
}

/** Todo el camino hasta tener tokens. Devuelve también las piezas para probar variantes. */
async function login(url = base, key = OWNER_KEY) {
  const client = (await register(url)).body
  const { verifier, challenge } = pkce()
  const consent = await fetch(`${url}/oauth/consent`, {
    method: 'POST', headers: formHeaders, redirect: 'manual',
    body: form({ client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, state: 'abc', key }),
  })
  const location = consent.headers.get('location')
  const code = location ? new URL(location).searchParams.get('code') : null
  return { client, verifier, challenge, consent, location, code }
}

const exchange = (clientId: string, code: string, verifier: string, url = base) =>
  fetch(`${url}/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: CALLBACK }) })

const rpc = (token: string | null, method: string, params: unknown = {}, url = base) =>
  fetch(`${url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

describe('discovery and open endpoints', () => {
  it('answers health with nothing in it and hides everything else behind a plain 404', async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true })
    expect((await fetch(`${base}/cualquier-cosa`)).status).toBe(404)
    expect((await fetch(`${base}/`)).status).toBe(404)
  })

  it('publishes the OAuth metadata Claude needs to connect', async () => {
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()
    expect(meta.authorization_endpoint).toContain('/authorize')
    expect(meta.token_endpoint).toContain('/token')
    expect(meta.registration_endpoint).toContain('/register')
    expect(meta.code_challenge_methods_supported).toContain('S256')
  })
})

describe('nobody gets in without a token', () => {
  it('refuses /mcp without a token and says where to log in', async () => {
    const res = await rpc(null, 'tools/list')
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata')
  })

  it('refuses a made-up token, one signed with another key, and one of another kind', async () => {
    expect((await rpc('inventado', 'tools/list')).status).toBe(401)
    expect((await rpc(sign({ t: 'access', ep: 1, exp: clock + 3600, cid: 'x' }, 'otra-clave-distinta-de-la-del-servidor-1234'), 'tools/list')).status).toBe(401)
    expect((await rpc(sign({ t: 'code', ep: 1, exp: clock + 3600, cid: 'x' }, SECRET), 'tools/list')).status).toBe(401)
  })

  it('does not accept GET or DELETE on /mcp even with no token', async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(401)
    expect((await fetch(`${base}/mcp`, { method: 'DELETE' })).status).toBe(401)
  })
})

describe('registration', () => {
  it('registers Claude with its callback and gives a public client (no secret)', async () => {
    const { status, body } = await register()
    expect(status).toBe(201)
    expect(body.client_id.length).toBeGreaterThan(40)
    expect(body.client_secret).toBeUndefined()
    expect(body.token_endpoint_auth_method).toBe('none')
  })

  it('refuses any callback that is not Claude’s, so nobody can register to receive codes', async () => {
    expect((await register(base, ['https://evil.example.com/callback'])).status).toBe(400)
    expect((await register(base, [CALLBACK, 'https://evil.example.com/callback'])).status).toBe(400)
    expect((await register(base, [])).status).toBe(400)
  })
})

describe('the owner login screen', () => {
  it('shows the access page with the key field for a valid client', async () => {
    const client = (await register()).body
    const { challenge } = pkce()
    const res = await fetch(`${base}/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', state: 's1' })}`)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('type="password"')
    expect(html).toContain('Clave del dueño')
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('refuses a client that was never registered or whose signature was tampered with', async () => {
    const { challenge } = pkce()
    const query = (clientId: string) => `${base}/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256' })}`
    const real = (await register()).body.client_id as string
    expect((await fetch(query('inventado'))).status).toBe(400)
    expect((await fetch(query(`${real.slice(0, -2)}xx`))).status).toBe(400)
  })

  it('a wrong key gives no code and says so', async () => {
    const { consent, code } = await login(base, 'clave-equivocada-de-largo-suficiente')
    expect(consent.status).toBe(401)
    expect(code).toBeNull()
    expect(await consent.text()).toContain('La clave no es correcta')
  })

  it('refuses a callback that is not registered for that client even with the right key', async () => {
    const client = (await register()).body
    const { challenge } = pkce()
    const res = await fetch(`${base}/oauth/consent`, { method: 'POST', headers: formHeaders, redirect: 'manual', body: form({ client_id: client.client_id, redirect_uri: 'https://evil.example.com/cb', code_challenge: challenge, key: OWNER_KEY }) })
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('locks out after 5 wrong keys, even for the right one, until the wait passes', async () => {
    const lockedApp = await start()
    try {
      for (let attempt = 0; attempt < 5; attempt++) expect((await login(lockedApp.base, 'clave-equivocada-de-largo-suficiente')).consent.status).toBe(401)
      expect((await login(lockedApp.base, OWNER_KEY)).consent.status).toBe(429)
      clock += 16 * 60
      expect((await login(lockedApp.base, OWNER_KEY)).consent.status).toBe(302)
    } finally {
      await new Promise((resolve) => lockedApp.server.close(resolve))
    }
  })
})

describe('code, tokens and renewal', () => {
  it('the right key leads back to Claude with a code and the same state', async () => {
    const { consent, location, code } = await login()
    expect(consent.status).toBe(302)
    expect(location!.startsWith(`${CALLBACK}?`)).toBe(true)
    expect(new URL(location!).searchParams.get('state')).toBe('abc')
    expect(code).toBeTruthy()
  })

  it('exchanges the code (with PKCE) for tokens, and the token opens the tools', async () => {
    const { client, verifier, code } = await login()
    const res = await exchange(client.client_id, code!, verifier)
    const tokens = await res.json()
    expect(res.status).toBe(200)
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mcp:read' })

    const list = await (await rpc(tokens.access_token, 'tools/list')).json()
    const names = list.result.tools.map((tool: { name: string }) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['get_change_log', 'get_retention_and_cohorts', 'get_signup_sources', 'get_weekly_rhythm', 'get_server_speed']))
    // todas son de solo lectura
    expect(list.result.tools.every((tool: { annotations?: { readOnlyHint?: boolean } }) => tool.annotations?.readOnlyHint === true)).toBe(true)

    const call = await (await rpc(tokens.access_token, 'tools/call', { name: 'get_server_speed', arguments: { days: 1 } })).json()
    expect(JSON.parse(call.result.content[0].text)).toMatchObject({ hours: 24, routes: [] })
  })

  it('refuses a wrong PKCE verifier and a code used twice', async () => {
    const first = await login()
    expect((await exchange(first.client.client_id, first.code!, 'x'.repeat(43))).status).toBe(400)

    const second = await login()
    expect((await exchange(second.client.client_id, second.code!, second.verifier)).status).toBe(200)
    expect((await exchange(second.client.client_id, second.code!, second.verifier)).status).toBe(400)
  })

  it('refuses a code from another client and one that expired', async () => {
    const a = await login()
    const other = (await register()).body
    expect((await exchange(other.client_id, a.code!, a.verifier)).status).toBe(400)

    const b = await login()
    clock += 6 * 60
    expect((await exchange(b.client.client_id, b.code!, b.verifier)).status).toBe(400)
  })

  it('the access token expires after an hour and the refresh token gets a new one (rotating, single use)', async () => {
    const { client, verifier, code } = await login()
    const tokens = await (await exchange(client.client_id, code!, verifier)).json()

    clock += 61 * 60
    expect((await rpc(tokens.access_token, 'tools/list')).status).toBe(401)

    const refresh = (token: string) => fetch(`${base}/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'refresh_token', refresh_token: token, client_id: client.client_id }) })
    const renewed = await refresh(tokens.refresh_token)
    const next = await renewed.json()
    expect(renewed.status).toBe(200)
    expect((await rpc(next.access_token, 'tools/list')).status).toBe(200)
    expect((await refresh(tokens.refresh_token)).status).toBe(400) // ya se usó

    clock += 31 * 24 * 3600
    expect((await refresh(next.refresh_token)).status).toBe(400) // vencido a los 30 días
  })

  it('an access token cannot be used as a refresh token, nor the other way round', async () => {
    const { client, verifier, code } = await login()
    const tokens = await (await exchange(client.client_id, code!, verifier)).json()
    const asRefresh = await fetch(`${base}/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'refresh_token', refresh_token: tokens.access_token, client_id: client.client_id }) })
    expect(asRefresh.status).toBe(400)
    expect((await rpc(tokens.refresh_token, 'tools/list')).status).toBe(401)
  })
})

describe('the emergency switch', () => {
  it('raising the epoch invalidates every token, code and client already issued', async () => {
    const { client, verifier, code } = await login()
    const tokens = await (await exchange(client.client_id, code!, verifier)).json()
    expect((await rpc(tokens.access_token, 'tools/list')).status).toBe(200)

    const after = await start(2)
    try {
      expect((await rpc(tokens.access_token, 'tools/list', {}, after.base)).status).toBe(401)
      // el cliente registrado antes tampoco sirve: hay que volver a conectar
      const { challenge } = pkce()
      const res = await fetch(`${after.base}/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256' })}`)
      expect(res.status).toBe(400)
    } finally {
      await new Promise((resolve) => after.server.close(resolve))
    }
  })

  it('refuses to start with weak keys or an insecure public address', () => {
    expect(() => createRemoteApp({ db, publicUrl: 'https://x.example.com', secret: 'corta', ownerKey: OWNER_KEY })).toThrow(/MCP_TOKEN_SECRET/)
    expect(() => createRemoteApp({ db, publicUrl: 'https://x.example.com', secret: SECRET, ownerKey: 'corta' })).toThrow(/MCP_OWNER_KEY/)
    expect(() => createRemoteApp({ db, publicUrl: 'http://x.example.com', secret: SECRET, ownerKey: OWNER_KEY })).toThrow(/https/)
  })
})

describe('signed tokens', () => {
  it('rejects tampering, the wrong kind, other epochs, expiry and oversized input', () => {
    const token = sign({ t: 'access', ep: 1, exp: clock + 60 }, SECRET)
    expect(verify(token, SECRET, 'access', 1, clock)).not.toBeNull()
    expect(verify(token, SECRET, 'refresh', 1, clock)).toBeNull()
    expect(verify(token, SECRET, 'access', 2, clock)).toBeNull()
    expect(verify(token, SECRET, 'access', 1, clock + 61)).toBeNull()
    expect(verify(`${token.slice(0, -3)}AAA`, SECRET, 'access', 1, clock)).toBeNull()
    expect(verify(`${token}.extra`, SECRET, 'access', 1, clock)).toBeNull()
    expect(verify('x'.repeat(5000), SECRET, 'access', 1, clock)).toBeNull()
    expect(verify('', SECRET, 'access', 1, clock)).toBeNull()
  })
})
