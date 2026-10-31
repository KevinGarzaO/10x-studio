import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/session', () => ({
  getToken: vi.fn(() => null as string | null),
  getCachedUser: vi.fn(() => null as { id?: string } | null),
}))

import { getToken, getCachedUser } from '@/lib/session'
import {
  ActiveTimer, resolveSession, referrerHostOf, utmOf, queryParamsOf, SESSION_KEY, SESSION_TIMEOUT_MS, HEARTBEAT_MS,
  trackEvent, trackPageView, identifyUser, startWebAnalytics, resetWebAnalyticsForTests,
} from '@/lib/web-analytics'
import { NO_TRACK_KEY } from '@/lib/attribution'

type Sent = { url: string; body: any; headers: Record<string, string> }
let sent: Sent[] = []

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear()
  resetWebAnalyticsForTests()
  sent = []
  setVisibility('visible')
  vi.mocked(getToken).mockReturnValue(null)
  vi.mocked(getCachedUser).mockReturnValue(null)
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, headers: (init?.headers ?? {}) as Record<string, string> })
    return { ok: true, status: 204 }
  }) as unknown as typeof fetch
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined })
  window.history.replaceState(null, '', '/vacantes/react-developer?utm_source=LinkedIn&utm_medium=social&utm_campaign=vacante-auto&page=2')
})

afterEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = false
  vi.useRealTimers()
})

describe('ActiveTimer', () => {
  it('only counts the time the tab is visible', () => {
    let now = 0
    const timer = new ActiveTimer(0, () => now)
    timer.start()
    now = 4000
    timer.pause()   // la persona cambió de pestaña
    now = 60000     // un minuto fuera: no cuenta
    expect(timer.seconds()).toBe(4)
    timer.start()
    now = 66000
    expect(timer.seconds()).toBe(10)
  })

  it('picks up from the seconds already stored (a reload does not start from zero)', () => {
    let now = 0
    const timer = new ActiveTimer(7, () => now)
    timer.start()
    now = 3000
    expect(timer.seconds()).toBe(10)
  })

  it('does not count twice if started twice', () => {
    let now = 0
    const timer = new ActiveTimer(0, () => now)
    timer.start()
    now = 2000
    timer.start()
    now = 5000
    expect(timer.seconds()).toBe(5)
  })
})

describe('resolveSession', () => {
  const stored = { id: 'abc', last: 1_000_000, seconds: 12, identified: null }

  it('keeps the session while there is activity within 30 minutes', () => {
    const { session, started } = resolveSession(1_000_000 + SESSION_TIMEOUT_MS, stored)
    expect(started).toBe(false)
    expect(session.id).toBe('abc')
    expect(session.seconds).toBe(12)
  })

  it('starts another one after 30 minutes without activity', () => {
    const { session, started } = resolveSession(1_000_000 + SESSION_TIMEOUT_MS + 1, stored)
    expect(started).toBe(true)
    expect(session.id).not.toBe('abc')
    expect(session.seconds).toBe(0)
  })

  it('starts one when there is nothing stored', () => {
    expect(resolveSession(5, null).started).toBe(true)
  })
})

describe('what comes from the address', () => {
  it('reads the utm values and every parameter', () => {
    expect(utmOf('?utm_source=linkedin&utm_medium=social&utm_term=react')).toMatchObject({ source: 'linkedin', medium: 'social', term: 'react', campaign: undefined })
    expect(queryParamsOf('?a=1&b=dos')).toEqual({ a: '1', b: 'dos' })
  })

  it('the referrer is the site that sent the person, never our own', () => {
    expect(referrerHostOf('https://www.google.com/search?q=x', 'avotalent.app')).toBe('www.google.com')
    expect(referrerHostOf('https://avotalent.app/saved', 'avotalent.app')).toBeNull()
    expect(referrerHostOf('', 'avotalent.app')).toBeNull()
    expect(referrerHostOf('esto no es una dirección', 'avotalent.app')).toBeNull()
  })
})

describe('the session start and the page views', () => {
  it('the first page opens the session with its entry path, utm, language and device data', async () => {
    await trackPageView('/vacantes/react-developer')

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('/api/a/collect')
    expect(sent[0].body).toMatchObject({
      type: 'session_start',
      entry_path: '/vacantes/react-developer',
      utm: { source: 'LinkedIn', medium: 'social', campaign: 'vacante-auto' },
      query_params: { page: '2' },
    })
    expect(sent[0].body.session_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(sent[0].body.screen).toMatch(/^\d+x\d+$/)
  })

  it('later pages in the same session are page views, with the same session id', async () => {
    await trackPageView('/')
    await trackPageView('/saved')

    expect(sent.map(s => s.body.type)).toEqual(['session_start', 'page_view'])
    expect(sent[1].body).toMatchObject({ path: '/saved' })
    expect(sent[1].body.session_id).toBe(sent[0].body.session_id)
  })

  it('two notices of the same page almost together are one (React mounts twice in development)', async () => {
    await Promise.all([trackPageView('/'), trackPageView('/')])
    expect(sent.map(s => s.body.type)).toEqual(['session_start'])
  })

  it('a reload inside the same session is another page view, not another session', async () => {
    await trackPageView('/')
    resetWebAnalyticsForTests()           // la recarga borra lo que había en memoria; la sesión sigue guardada
    sent = []
    await trackPageView('/')

    expect(sent.map(s => s.body.type)).toEqual(['page_view'])
  })

  it('a new session starts after 30 minutes of inactivity', async () => {
    await trackPageView('/')
    const first = sent[0].body.session_id
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY)!)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, last: Date.now() - SESSION_TIMEOUT_MS - 1000 }))
    resetWebAnalyticsForTests()
    sent = []

    await trackPageView('/otra')

    expect(sent[0].body.type).toBe('session_start')
    expect(sent[0].body.session_id).not.toBe(first)
  })
})

describe('events', () => {
  it('goes after the session start (the first send is the one that gets the cookie), with its parameters', async () => {
    await trackEvent('click_view_job_detail', { slug: 'react-developer' })

    expect(sent.map(s => s.body.type)).toEqual(['session_start', 'event'])
    expect(sent[1].body).toMatchObject({ name: 'click_view_job_detail', params: { slug: 'react-developer' } })
  })

  it('does not send a conversion flag: the server decides what counts as one', async () => {
    await trackEvent('profile_completed', {}, true)
    expect(sent[1].body).not.toHaveProperty('is_conversion')
  })

  it('never throws, even if the network fails', async () => {
    global.fetch = vi.fn(async () => { throw new Error('sin red') }) as unknown as typeof fetch
    await expect(trackEvent('x_event')).resolves.toBeUndefined()
  })
})

describe('the heartbeat (active time)', () => {
  it('sends the seconds with the tab visible, and stops counting when it is hidden', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-30T15:00:00Z') })
    const stop = startWebAnalytics()
    await trackPageView('/')
    sent = []

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(sent.map(s => s.body)).toEqual([expect.objectContaining({ type: 'heartbeat', seconds: 10 })])

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    sent = []
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3)
    // con la pestaña oculta no se manda nada nuevo: el tiempo está pausado
    expect(sent.filter(s => s.body.type === 'heartbeat' && s.body.seconds > 10)).toHaveLength(0)
    stop()
  })

  it('on hide it sends the final seconds with sendBeacon so they are not lost', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-30T15:00:00Z') })
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
    const stop = startWebAnalytics()
    await trackPageView('/')

    await vi.advanceTimersByTimeAsync(4000)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(beacon).toHaveBeenCalledTimes(1)
    const [url, data] = beacon.mock.calls[0] as unknown as [string, string]
    expect(url).toBe('/api/a/collect')
    expect(JSON.parse(data)).toMatchObject({ type: 'heartbeat', seconds: 4 })
    stop()
  })
})

describe('user stitching', () => {
  it('asks the server to join this browser with the account, once per session, with the token', async () => {
    vi.mocked(getToken).mockReturnValue('tok-123')
    vi.mocked(getCachedUser).mockReturnValue({ id: 'user-1' })

    await trackPageView('/')
    await identifyUser()
    await identifyUser()

    const identifies = sent.filter(s => s.url === '/api/a/identify')
    expect(identifies).toHaveLength(1)
    expect(identifies[0].headers.Authorization).toBe('Bearer tok-123')
  })

  it('does nothing without a session', async () => {
    await trackPageView('/')
    await identifyUser()
    expect(sent.filter(s => s.url === '/api/a/identify')).toHaveLength(0)
  })
})

describe('opting out', () => {
  it('measures nothing in a browser that opened ?notrack=1', async () => {
    localStorage.setItem(NO_TRACK_KEY, '1')
    await trackPageView('/')
    await trackEvent('algo')
    expect(sent).toHaveLength(0)
  })
})
