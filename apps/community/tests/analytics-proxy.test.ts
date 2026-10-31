import { describe, it, expect, vi } from 'vitest'
import { forwardToBackend, geoFromHeaders, validClientId } from '@/lib/analytics-proxy'

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null })
const OK_ID = 'b7c1f0de-1111-4222-8333-944455556666'

function run(overrides: Partial<Parameters<typeof forwardToBackend>[0]> = {}) {
  const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
  const promise = forwardToBackend({
    path: 'collect',
    body: '{"type":"heartbeat"}',
    headers: headers({ 'user-agent': 'Mozilla/5.0 Chrome/130', 'accept-language': 'es-MX,es;q=0.9', 'x-vercel-ip-country': 'MX', 'x-vercel-ip-country-region': 'NLE', 'x-vercel-ip-city': 'Monterrey', 'x-vercel-ip-latitude': '25.6866', 'x-vercel-ip-longitude': '-100.3161' }),
    existingClientId: OK_ID,
    backendUrl: 'https://api.test',
    secret: 'clave',
    fetcher: fetcher as unknown as typeof fetch,
    ...overrides,
  })
  return { fetcher, promise }
}

describe('geoFromHeaders', () => {
  it('reads Vercel, and Cloudflare as a fallback', () => {
    expect(geoFromHeaders(headers({ 'x-vercel-ip-country': 'MX', 'x-vercel-ip-city': 'Monterrey', 'x-vercel-ip-country-region': 'NLE' }))).toEqual({ country: 'MX', region: 'NLE', city: 'Monterrey', latitude: null, longitude: null })
    expect(geoFromHeaders(headers({ 'cf-ipcountry': 'AR', 'cf-ipcity': 'Rosario' }))).toEqual({ country: 'AR', region: null, city: 'Rosario', latitude: null, longitude: null })
    expect(geoFromHeaders(headers({}))).toEqual({ country: null, region: null, city: null, latitude: null, longitude: null })
  })
})

describe('forwardToBackend', () => {
  it('forwards to the backend with the client id, the real User-Agent, the language, the geography and the secret', async () => {
    const { fetcher, promise } = run()
    await promise

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/api/analytics/collect')
    expect(init.body).toBe('{"type":"heartbeat"}')
    expect(init.headers).toMatchObject({
      'x-avo-lat': '25.6866', 'x-avo-lon': '-100.3161',
      'x-avo-client-id': OK_ID, 'x-avo-ua': 'Mozilla/5.0 Chrome/130', 'x-avo-lang': 'es-MX,es;q=0.9',
      'x-avo-country': 'MX', 'x-avo-region': 'NLE', 'x-avo-city': 'Monterrey', 'x-avo-proxy-secret': 'clave',
    })
  })

  it('does not ask for a new cookie when the browser already has a valid one', async () => {
    expect((await run().promise).setClientId).toBeNull()
  })

  it('creates a client id (UUID) for a new browser and sends that same one to the backend', async () => {
    const { fetcher, promise } = run({ existingClientId: null })
    const result = await promise

    expect(result.setClientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'x-avo-client-id': result.setClientId })
  })

  it('replaces a cookie that is not a valid id instead of trusting it', async () => {
    const result = await run({ existingClientId: '<script>' }).promise
    expect(result.setClientId).not.toBeNull()
    expect(validClientId('<script>')).toBeNull()
  })

  it('only forwards the session token on identify', async () => {
    const withAuth = headers({ authorization: 'Bearer tok', 'user-agent': 'x' })
    const collect = run({ headers: withAuth })
    await collect.promise
    expect((collect.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('Authorization')

    const identify = run({ path: 'identify', headers: withAuth })
    await identify.promise
    expect((identify.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('never throws when the backend does not answer', async () => {
    const result = await run({ fetcher: vi.fn(async () => { throw new Error('caído') }) as unknown as typeof fetch }).promise
    expect(result.setClientId).toBeNull()
  })
})
