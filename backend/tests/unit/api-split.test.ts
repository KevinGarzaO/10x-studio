import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

// Una base falsa que siempre contesta «sin conexión»: aquí solo importa QUÉ RUTAS EXISTEN en cada forma de la API, no lo que contestan.
const { chain } = vi.hoisted(() => {
  const chain: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: 'offline' } }) : chain),
    apply: () => chain,
  })
  return { chain }
})
vi.mock('@avotalent/db', () => {
  const client = {
    from: () => chain,
    rpc: () => chain,
    storage: { from: () => chain },
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'offline' } }) },
  }
  return { supabase: client, createAuthClient: () => client }
})

import { createBaseApp, finishApp, useJsonBody } from '../../src/apps/base'
import { mountCommunity } from '../../src/apps/community'
import { mountTelemetry, mountTelemetryPreBody } from '../../src/apps/telemetry'

const communityApp = () => { const app = createBaseApp(); useJsonBody(app); mountCommunity(app); finishApp(app, 'community'); return app }
const telemetryApp = () => { const app = createBaseApp(); mountTelemetryPreBody(app); useJsonBody(app); mountTelemetry(app); finishApp(app, 'telemetry'); return app }
const fullApp = () => { const app = createBaseApp(); mountTelemetryPreBody(app); useJsonBody(app); mountTelemetry(app); mountCommunity(app); finishApp(app, '10X Studio API is running'); return app }

/** Una ruta NO montada cae al 404 de Express (cuerpo «Cannot GET ...»); una montada contesta lo suyo. */
const exists = async (app: ReturnType<typeof createBaseApp>, method: 'get' | 'post', path: string) => {
  const res = await request(app)[method](path).send({})
  return !(res.status === 404 && /Cannot (GET|POST)/.test(res.text))
}

const COMMUNITY = [['get', '/api/community/flags'], ['get', '/api/community/stats'], ['get', '/api/community/posts'], ['post', '/api/community/auth/login'], ['get', '/api/community/seo/roles'], ['get', '/api/files/avatars/x.png']] as const
const TELEMETRY = [['get', '/api/admin/analytics/overview'], ['post', '/api/analytics/collect'], ['post', '/api/webhooks/resend'], ['get', '/api/linkedin/callback'], ['get', '/api/scraper/sources']] as const

describe('the API in its three shapes', () => {
  it('api-community has the community routes and none of the telemetry ones', async () => {
    const app = communityApp()
    for (const [method, path] of COMMUNITY) expect(await exists(app, method, path), `${method} ${path} debe existir`).toBe(true)
    for (const [method, path] of TELEMETRY) expect(await exists(app, method, path), `${method} ${path} no debe existir`).toBe(false)
  })

  it('api-telemetry has the telemetry routes and none of the community ones', async () => {
    const app = telemetryApp()
    for (const [method, path] of TELEMETRY) expect(await exists(app, method, path), `${method} ${path} debe existir`).toBe(true)
    for (const [method, path] of COMMUNITY) expect(await exists(app, method, path), `${method} ${path} no debe existir`).toBe(false)
  })

  it('the complete API (what runs in production today) has everything', async () => {
    const app = fullApp()
    for (const [method, path] of [...COMMUNITY, ...TELEMETRY]) expect(await exists(app, method, path), `${method} ${path} debe existir`).toBe(true)
  })

  it('the panel routes still demand a session in the telemetry shape', async () => {
    const res = await request(telemetryApp()).get('/api/admin/analytics/overview')
    expect(res.status).toBe(401)
  })

  it('every shape answers its root and the flags endpoint never fails (closed on error)', async () => {
    expect((await request(communityApp()).get('/')).text).toBe('community')
    expect((await request(telemetryApp()).get('/')).text).toBe('telemetry')
    expect((await request(communityApp()).get('/api/community/flags')).body).toEqual({ flags: {} })
  })
})
