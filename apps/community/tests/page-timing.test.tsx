import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/lib/session', () => ({
  getToken: vi.fn(() => null as string | null),
  getCachedUser: vi.fn(() => null as { id?: string } | null),
}))

import { usePageReady } from '@/lib/page-timing'
import { resetFlowTrackerForTests } from '@/lib/flow-tracker'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'

/** Cuánto tarda el feed y la vacante en estar listos, medido en el navegador y mandado como un flujo (view_feed / view_vacancy). */
const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
let sent: any[] = []
const steps = () => sent.filter(item => item.url === '/api/a/flow').map(item => item.body)
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests()
  resetFlowTrackerForTests()
  sent = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return { ok: true, status: 204 }
  }) as unknown as typeof fetch
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined })
})

afterEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = false
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePageReady', () => {
  it('starts when the screen opens and closes with the time it took once it has content', async () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { rerender } = renderHook(({ ready }) => usePageReady('view_feed', ready), { initialProps: { ready: false } })
    await flush()
    expect(steps().map(step => [step.flow_name, step.step_name])).toEqual([['view_feed', 'start']])

    now = 3400 // 2.4 s después
    rerender({ ready: true })
    await flush()

    const done = steps()[1]
    expect(done).toMatchObject({ flow_name: 'view_feed', step_name: 'ready', is_final: true, status: 'completed', load_time_ms: 2400 })
  })

  it('measures only once, even if the screen keeps re-rendering', async () => {
    const { rerender } = renderHook(({ ready }) => usePageReady('view_feed', ready), { initialProps: { ready: true } })
    rerender({ ready: true })
    rerender({ ready: true })
    await flush()
    expect(steps().filter(step => step.step_name === 'ready')).toHaveLength(1)
  })

  it('measures a vacancy again when a different one is opened, and not when only the loading flag flickers', async () => {
    const { rerender } = renderHook(({ ready, slug }) => usePageReady('view_vacancy', ready, slug), { initialProps: { ready: true, slug: 'una' } })
    await flush()
    rerender({ ready: false, slug: 'una' }) // se vuelve a pedir el detalle al iniciar sesión
    rerender({ ready: true, slug: 'una' })
    await flush()
    expect(steps().filter(step => step.step_name === 'ready')).toHaveLength(1)

    rerender({ ready: false, slug: 'otra' })
    rerender({ ready: true, slug: 'otra' })
    await flush()
    expect(steps().filter(step => step.flow_name === 'view_vacancy' && step.step_name === 'ready')).toHaveLength(2)
  })
})
