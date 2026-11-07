import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import AuthCallbackPage from '@/app/auth/callback/page'
import { noteProviderClick, noteProviderReturn, safeReason, rememberedProvider } from '@/lib/auth-provider'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'

/**
 * El registro con LinkedIn / GitHub por proveedor: el clic, y cómo volvió (con sesión, negado, error). Solo un código de una lista cerrada.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/auth/callback',
  useSearchParams: () => new URLSearchParams(),
}))
let token: string | null = null
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session')
  return { ...actual, getToken: () => token, captureSessionFromUrl: vi.fn(), getValidToken: async () => token, getCachedUser: () => null }
})

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
let events: { event_name: string; params: Record<string, unknown> }[] = []
function stubFetch(syncOk = true, user: Record<string, unknown> = { created_at: '2020-01-01T00:00:00Z', profile_completed: true, provider: 'linkedin' }) {
  events = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u === '/api/a/collect') {
      const body = JSON.parse(String(init?.body))
      if (body.type === 'event' && body.name) events.push({ event_name: body.name, params: body.params ?? {} })
      return { ok: true, status: 204 }
    }
    if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
    if (u.includes('/auth/sync-user')) return syncOk ? { ok: true, json: async () => ({ user }) } : { ok: false, json: async () => ({ error: 'x' }) }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve() }
const returns = () => events.filter(event => event.event_name === 'auth_provider_return')

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests()
  token = null
  window.history.replaceState(null, '', '/auth/callback')
})

describe('safeReason', () => {
  it('keeps only codes from the closed list, never the provider text', () => {
    expect(safeReason('access_denied')).toBe('access_denied')
    expect(safeReason('Access_Denied')).toBe('access_denied')
    expect(safeReason('ana@example.com no pudo entrar')).toBe('other')
    expect(safeReason(undefined)).toBe('other')
  })
})

describe('provider click and return', () => {
  it('remembers which provider was tapped so the return can say it', () => {
    expect(rememberedProvider()).toBe('desconocido')
    noteProviderClick('github', 'signup')
    expect(rememberedProvider()).toBe('github')
    noteProviderReturn('success', { isNew: true })
    expect(rememberedProvider()).toBe('desconocido')
  })

  it('the callback records a success with the provider that was tapped', async () => {
    token = 'token'
    stubFetch()
    noteProviderClick('linkedin', 'wall')
    render(<AuthCallbackPage />)
    await waitFor(async () => { await flush(); expect(returns().length).toBeGreaterThan(0) })
    expect(returns()[0].params).toMatchObject({ provider: 'linkedin', outcome: 'success', is_new: false })
  })

  it('a provider that denies or cancels is recorded as denied, with only the code', async () => {
    stubFetch()
    noteProviderClick('github', 'login')
    window.history.replaceState(null, '', '/auth/callback#error=access_denied&error_description=El+usuario+ana%40example.com+cancelo')
    render(<AuthCallbackPage />)
    await waitFor(async () => { await flush(); expect(returns().length).toBeGreaterThan(0) })
    expect(returns()[0].params).toMatchObject({ provider: 'github', outcome: 'denied', reason: 'access_denied' })
    expect(JSON.stringify(returns()[0].params)).not.toContain('ana@example.com')
  })

  it('a failing server after the provider is recorded as sync_failed', async () => {
    token = 'token'
    stubFetch(false)
    noteProviderClick('linkedin', 'signup')
    render(<AuthCallbackPage />)
    await waitFor(async () => { await flush(); expect(returns().length).toBeGreaterThan(0) })
    expect(returns()[0].params).toMatchObject({ provider: 'linkedin', outcome: 'sync_failed' })
  })
})
