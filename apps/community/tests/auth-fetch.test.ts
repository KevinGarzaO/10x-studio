import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installAuthFetch, resetAuthFetchForTests } from '@/lib/auth-fetch'
import { saveSession } from '@/lib/session'
import { resetErrorReporterForTests } from '@/lib/error-reporter'
import { resetWebAnalyticsForTests } from '@/lib/web-analytics'

const API = 'http://localhost:3001'

/** Un token con la forma de un JWT y el vencimiento que se pida (segundos desde ahora). */
const jwt = (secondsFromNow: number) => {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'HS256' })}.${encode({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.firma`
}

interface Call { url: string; auth: string | null; method: string; body: unknown }
let calls: Call[]
let reports: any[]
/** Qué contesta el servidor a cada ruta; una lista se va gastando (la última se repite). */
let server: Record<string, number[]>
let refreshReply: { status: number; token?: string }

function stub() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/a/error') { reports.push(JSON.parse(String(init?.body))); return { ok: true, status: 204 } }
    if (url.startsWith('/api/a/')) return { ok: true, status: 204 }
    const headers = new Headers(init?.headers as HeadersInit)
    calls.push({ url: url.replace(API, ''), auth: headers.get('Authorization'), method: init?.method ?? 'GET', body: init?.body })
    if (url.includes('/auth/refresh')) {
      return refreshReply.status === 200
        ? { ok: true, status: 200, json: async () => ({ session: { access_token: refreshReply.token, refresh_token: 'r1' }, user: { id: 'u1' } }) }
        : { ok: false, status: refreshReply.status, json: async () => ({}) }
    }
    const path = url.replace(API, '')
    const queue = server[path] ?? [200]
    const status = queue.length > 1 ? queue.shift()! : queue[0]
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true }) }
  }) as unknown as typeof fetch
}

let stop: () => void

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear()
  resetErrorReporterForTests()
  resetWebAnalyticsForTests()
  resetAuthFetchForTests()
  calls = []
  reports = []
  server = {}
  refreshReply = { status: 200, token: jwt(3600) }
  stub()
  stop = installAuthFetch()
})

afterEach(() => {
  stop()
  ;(globalThis as any).__avoAnalyticsTest = false
  vi.restoreAllMocks()
})

const get = (path: string, token: string | null) => fetch(`${API}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
const refreshes = () => calls.filter(call => call.url.includes('/auth/refresh')).length

describe('authFetch', () => {
  it('lets a call with a valid token through, untouched', async () => {
    const token = jwt(3600)
    saveSession({ access_token: token, refresh_token: 'r0' }, { id: 'u1' })
    const res = await get('/api/community/discover/featured-users', token)

    expect(res.status).toBe(200)
    expect(calls).toEqual([{ url: '/api/community/discover/featured-users', auth: `Bearer ${token}`, method: 'GET', body: undefined }])
  })

  it('renews BEFORE sending when the token already expired, so the call goes out with a good one (the missing "Usuarios destacados")', async () => {
    const old = jwt(-30)
    saveSession({ access_token: old, refresh_token: 'r0' }, { id: 'u1' })
    const res = await get('/api/community/discover/featured-users', old)

    expect(res.status).toBe(200)
    expect(calls.map(call => call.url)).toEqual(['/api/community/auth/refresh', '/api/community/discover/featured-users'])
    expect(calls[1].auth).toBe(`Bearer ${refreshReply.token}`)
  })

  it('many calls at once with an expired token make ONE renewal', async () => {
    const old = jwt(-30)
    saveSession({ access_token: old, refresh_token: 'r0' }, { id: 'u1' })
    await Promise.all([get('/api/a1', old), get('/api/a2', old), get('/api/a3', old), get('/api/a4', old)])

    expect(refreshes()).toBe(1)
    expect(calls.filter(call => call.auth === `Bearer ${refreshReply.token}`)).toHaveLength(4)
  })

  it('on a 401 it renews and repeats the call once', async () => {
    const token = jwt(3600)
    saveSession({ access_token: token, refresh_token: 'r0' }, { id: 'u1' })
    server['/api/community/notifications'] = [401, 200]
    const res = await get('/api/community/notifications', token)

    expect(res.status).toBe(200)
    expect(calls.map(call => call.url)).toEqual(['/api/community/notifications', '/api/community/auth/refresh', '/api/community/notifications'])
    expect(calls[2].auth).toBe(`Bearer ${refreshReply.token}`)
    expect(reports).toHaveLength(0)
  })

  it('repeats a POST with its text body, but does not try again with a body that cannot be re-sent', async () => {
    const token = jwt(3600)
    saveSession({ access_token: token, refresh_token: 'r0' }, { id: 'u1' })
    server['/api/community/posts'] = [401, 201]
    const res = await fetch(`${API}/api/community/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{"title":"hola"}' })
    expect(res.status).toBe(201)
    expect(calls.filter(call => call.url === '/api/community/posts').map(call => call.body)).toEqual(['{"title":"hola"}', '{"title":"hola"}'])

    calls.length = 0
    server['/api/community/upload'] = [401]
    const stream = new ReadableStream()
    const res2 = await fetch(`${API}/api/community/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: stream, duplex: 'half' } as RequestInit)
    expect(res2.status).toBe(401)
    expect(refreshes()).toBe(0)
  })

  it('REPORTS an error when the session is truly gone (the 401 stays after renewing), which used to pass unseen', async () => {
    const token = jwt(3600)
    saveSession({ access_token: token, refresh_token: 'r0' }, { id: 'u1' })
    server['/api/community/discover/featured-users'] = [401]
    refreshReply = { status: 401 }
    const res = await get('/api/community/discover/featured-users', token)
    await vi.waitFor(() => expect(reports).toHaveLength(1))

    expect(res.status).toBe(401)
    expect(reports[0]).toMatchObject({ name: 'ApiError', source: 'api', context: { endpoint: '/api/community/discover/featured-users', status: 401 } })
    expect(reports[0].message).toContain('401 con la sesión iniciada')
  })

  it('does not renew or report anything for what does not carry the stored session', async () => {
    saveSession({ access_token: jwt(-30), refresh_token: 'r0' }, { id: 'u1' })
    server['/api/community/posts?page=1'] = [401]

    await get('/api/community/posts?page=1', null)                       // visitante: sin sesión
    await get('/api/community/posts?page=1', 'otro-token-que-no-es-el-nuestro')
    await fetch('https://tercero.example.com/x', { headers: { Authorization: `Bearer ${jwt(-30)}` } })
    await fetch('/api/a/collect', { method: 'POST' })
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2))

    expect(refreshes()).toBe(0)
    expect(reports).toHaveLength(0)
  })

  it('leaves login, signup and the renewal alone: a 401 there is a normal answer, not a lost session', async () => {
    const token = jwt(-30)
    saveSession({ access_token: token, refresh_token: 'r0' }, { id: 'u1' })
    server['/api/community/auth/login'] = [401]
    const res = await fetch(`${API}/api/community/auth/login`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' })

    expect(res.status).toBe(401)
    expect(refreshes()).toBe(0)
    expect(reports).toHaveLength(0)
  })

  it('installs once and removing it leaves fetch as it was', () => {
    stop()
    const before = global.fetch
    const remove = installAuthFetch()
    expect(global.fetch).not.toBe(before)
    installAuthFetch()() // una segunda instalación no apila otra capa
    remove()
    expect(global.fetch).toBe(before)
    stop = installAuthFetch()
  })
})
