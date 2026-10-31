import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clearSession, fetchCurrentUser, fetchJsonWithSession, getValidToken, isTokenFresh, renewSession, saveSession, tokenExpiresAt } from '@/lib/session'
import { forgetSessionMarker, hadSessionBefore } from '@/lib/session-marker'

const noted: { event: string; params: any }[] = []
vi.mock('@/lib/web-analytics', () => ({
  trackEvent: vi.fn(async (event: string, params: any) => { noted.push({ event, params }) }),
}))

/** Un token con la forma de un JWT y el vencimiento que se pida (segundos desde ahora). */
const jwt = (secondsFromNow: number) => {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'HS256' })}.${encode({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.firma`
}

type Reply = { status: number; body?: unknown } | Error
let replies: Record<string, Reply[]>
let calls: { url: string; auth: string | null }[]

function stubFetch() {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const key = String(url).replace(/^.*\/api\/community\/auth\//, '')
    calls.push({ url: key, auth: ((init?.headers ?? {}) as Record<string, string>).Authorization ?? null })
    const queue = replies[key] ?? []
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    if (!next) return { ok: false, status: 404, json: async () => ({}) }
    if (next instanceof Error) throw next
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body ?? {} }
  }) as unknown as typeof fetch
}

const stored = () => ({ token: localStorage.getItem('avocado_token'), refresh: localStorage.getItem('avocado_refresh_token'), user: localStorage.getItem('avocado_user') })

beforeEach(() => {
  localStorage.clear()
  noted.length = 0
  calls = []
  replies = {}
  stubFetch()
})

afterEach(() => { vi.restoreAllMocks() })

describe('token helpers', () => {
  it('reads the expiry of a JWT and knows if it still works', () => {
    expect(tokenExpiresAt(jwt(3600))).toBeGreaterThan(Date.now())
    expect(isTokenFresh(jwt(3600))).toBe(true)
    expect(isTokenFresh(jwt(30))).toBe(false) // le queda menos del margen
    expect(isTokenFresh(jwt(-10))).toBe(false)
    expect(tokenExpiresAt('no-es-un-jwt')).toBeNull()
    expect(isTokenFresh('no-es-un-jwt')).toBe(true) // no se puede saber: lo dirá el servidor
  })
})

describe('renewSession', () => {
  it('shares ONE request between everything that asks at the same time', async () => {
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    replies.refresh = [{ status: 200, body: { session: { access_token: jwt(3600), refresh_token: 'r1' }, user: { id: 'u1' } } }]
    const [a, b, c] = await Promise.all([renewSession(), renewSession(), renewSession()])

    expect(calls.filter(call => call.url === 'refresh')).toHaveLength(1)
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true])
    expect(stored().refresh).toBe('r1')
  })

  it('a server error or no connection does NOT say the session is gone ("unavailable")', async () => {
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    replies.refresh = [{ status: 503 }]
    expect(await renewSession()).toEqual({ ok: false, reason: 'unavailable' })
    replies.refresh = [new Error('network down')]
    expect(await renewSession()).toEqual({ ok: false, reason: 'unavailable' })
    expect(stored().refresh).toBe('r0')
  })

  it('a 401 is "rejected", unless another tab already renewed with a newer token', async () => {
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    replies.refresh = [{ status: 401 }]
    expect(await renewSession()).toEqual({ ok: false, reason: 'rejected' })

    // otra pestaña guardó una sesión nueva mientras tanto
    const fresh = jwt(3600)
    global.fetch = vi.fn(async () => {
      localStorage.setItem('avocado_refresh_token', 'r-otra-pestana')
      localStorage.setItem('avocado_token', fresh)
      return { ok: false, status: 401, json: async () => ({}) }
    }) as unknown as typeof fetch
    expect(await renewSession()).toEqual({ ok: true, token: fresh })
  })
})

describe('getValidToken', () => {
  it('returns the stored token without asking if it still works, renews if it expired, and null if there is no session', async () => {
    expect(await getValidToken()).toBeNull()
    const good = jwt(3600)
    saveSession({ access_token: good, refresh_token: 'r0' }, { id: 'u1' })
    expect(await getValidToken()).toBe(good)
    expect(calls).toHaveLength(0)

    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    const renewed = jwt(3600)
    replies.refresh = [{ status: 200, body: { session: { access_token: renewed, refresh_token: 'r1' }, user: { id: 'u1' } } }]
    expect(await getValidToken()).toBe(renewed)

    saveSession({ access_token: jwt(-5), refresh_token: 'r1' }, { id: 'u1' })
    replies.refresh = [{ status: 401 }]
    expect(await getValidToken()).toBeNull()
  })
})

describe('fetchCurrentUser', () => {
  it('renews BEFORE asking when the token is already expired, and reports the renewal', async () => {
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    const renewed = jwt(3600)
    replies.refresh = [{ status: 200, body: { session: { access_token: renewed, refresh_token: 'r1' }, user: { id: 'u1' } } }]
    replies.me = [{ status: 200, body: { user: { id: 'u1', username: 'ana' } } }]

    expect(await fetchCurrentUser()).toEqual({ id: 'u1', username: 'ana' })
    expect(calls.map(call => call.url)).toEqual(['refresh', 'me']) // ni una petición perdida con el token viejo
    expect(calls[1].auth).toBe(`Bearer ${renewed}`)
    await vi.waitFor(() => expect(noted.map(n => n.event)).toContain('session_renewed'))
  })

  it('does NOT delete the session when the renewal fails because of the network or the server, and keeps the person logged in', async () => {
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1', username: 'ana' })
    replies.refresh = [{ status: 503 }]

    expect(await fetchCurrentUser()).toEqual({ id: 'u1', username: 'ana' })
    expect(stored().token).not.toBeNull()
    expect(stored().refresh).toBe('r0')
    await vi.waitFor(() => expect(noted).toContainEqual({ event: 'session_lost', params: { reason: 'refresh_unavailable', kept: true } }))
  })

  it('keeps the person logged in when there is no connection at all', async () => {
    saveSession({ access_token: jwt(3600), refresh_token: 'r0' }, { id: 'u1' })
    replies.me = [new Error('offline')]
    expect(await fetchCurrentUser()).toEqual({ id: 'u1' })
    replies.me = [{ status: 502 }]
    expect(await fetchCurrentUser()).toEqual({ id: 'u1' })
    expect(stored().token).not.toBeNull()
  })

  it('deletes the session only when the server really rejects it, and says so; the "had a session" mark stays', async () => {
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    replies.refresh = [{ status: 401 }]

    expect(await fetchCurrentUser()).toBeNull()
    expect(stored()).toEqual({ token: null, refresh: null, user: null })
    expect(hadSessionBefore()).toBe(true)
    await vi.waitFor(() => expect(noted).toContainEqual({ event: 'session_lost', params: { reason: 'refresh_rejected' } }))
  })

  it('reports a half-deleted session (the user is still saved but the token is gone)', async () => {
    localStorage.setItem('avocado_user', JSON.stringify({ id: 'u1' }))
    expect(await fetchCurrentUser()).toBeNull()
    await vi.waitFor(() => expect(noted).toContainEqual({ event: 'session_lost', params: { reason: 'token_missing' } }))
  })

  it('renews and retries once when the server answers 401 to a token that looked valid', async () => {
    saveSession({ access_token: jwt(3600), refresh_token: 'r0' }, { id: 'u1' })
    const renewed = jwt(3600)
    replies.me = [{ status: 401 }, { status: 200, body: { user: { id: 'u1' } } }]
    replies.refresh = [{ status: 200, body: { session: { access_token: renewed, refresh_token: 'r1' }, user: { id: 'u1' } } }]
    expect(await fetchCurrentUser()).toEqual({ id: 'u1' })
    expect(calls.map(call => call.url)).toEqual(['me', 'refresh', 'me'])
  })
})

describe('fetchJsonWithSession', () => {
  it('uses a renewed token when the stored one expired, and returns null without a session', async () => {
    expect(await fetchJsonWithSession('http://x/api/feed')).toBeNull()
    saveSession({ access_token: jwt(-5), refresh_token: 'r0' }, { id: 'u1' })
    const renewed = jwt(3600)
    replies.refresh = [{ status: 200, body: { session: { access_token: renewed, refresh_token: 'r1' }, user: { id: 'u1' } } }]
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/auth/refresh')) return { ok: true, status: 200, json: async () => ({ session: { access_token: renewed, refresh_token: 'r1' }, user: { id: 'u1' } }) }
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${renewed}`)
      return { ok: true, status: 200, json: async () => ({ ok: 1 }) }
    }) as unknown as typeof fetch
    expect(await fetchJsonWithSession('http://x/api/feed')).toEqual({ ok: 1 })
  })
})

describe('the "had a session" mark', () => {
  it('is set when a session is saved, kept when the server rejects it, and removed only by an explicit log out', () => {
    expect(hadSessionBefore()).toBe(false)
    saveSession({ access_token: jwt(3600), refresh_token: 'r0' }, { id: 'u1' })
    expect(hadSessionBefore()).toBe(true)
    clearSession()
    expect(hadSessionBefore()).toBe(true)
    clearSession({ explicit: true })
    expect(hadSessionBefore()).toBe(false)
    forgetSessionMarker()
  })
})
