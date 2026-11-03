import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthModal } from '@/components/community-hub'
import AuthCallbackPage from '@/app/auth/callback/page'
import { resetFlowTrackerForTests } from '@/lib/flow-tracker'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'
import { markSessionKnown } from '@/lib/session-marker'

/**
 * Registro e inicio de sesión con LinkedIn/GitHub. La pantalla de registro que sale sobre una vacante es por donde más gente se registra
 * y antes no medía nada: esos registros no aparecían como completos. Y al volver del proveedor, un registro real se cerraba solo si la
 * persona había empezado en /signup.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/vacantes/backend-engineer-1',
  useSearchParams: () => new URLSearchParams(),
}))
let token: string | null = null
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session')
  return { ...actual, getToken: () => token, captureSessionFromUrl: vi.fn(), getValidToken: async () => token, getCachedUser: () => null }
})

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
let steps: { flow_name: string; step_name: string; is_final: boolean }[] = []
const names = (flow: string) => steps.filter(step => step.flow_name === flow).map(step => step.step_name + (step.is_final ? '*' : ''))
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve() }

function stubFetch(user: Record<string, unknown>) {
  steps = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u === '/api/a/flow') { steps.push(JSON.parse(String(init?.body))); return { ok: true, status: 204 } }
    if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
    if (u.includes('/auth/sync-user')) return { ok: true, json: async () => ({ user }) }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

const realLocation = window.location
function mockLocation() {
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '', pathname: '/vacantes/backend-engineer-1', hash: '', search: '' } })
}

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests(); resetFlowTrackerForTests()
  token = null
  mockLocation()
})
afterEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = false
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  vi.restoreAllMocks()
})

describe('the sign-up screen over a vacancy now measures the attempt', () => {
  it('a new visitor who taps LinkedIn starts a REGISTRATION attempt and the step that leaves for the provider', async () => {
    stubFetch({})
    render(<AuthModal onClose={vi.fn()} request={{ variant: 'vacancy', subject: 'Backend Engineer — Stripe' }} />)

    fireEvent.click(screen.getByRole('button', { name: /continuar con linkedin/i }))
    await flush()

    expect(names('auth_register')).toEqual(['start', 'oauth_redirect'])
    expect(names('auth_login')).toEqual([])
    expect(window.location.href).toContain('/api/community/auth/oauth/linkedin')
  })

  it('a browser that already had a session starts a LOGIN attempt instead', async () => {
    stubFetch({})
    markSessionKnown()
    render(<AuthModal onClose={vi.fn()} request={{ variant: 'vacancy', subject: 'Backend Engineer — Stripe' }} />)

    fireEvent.click(screen.getByRole('button', { name: /continuar con github/i }))
    await flush()

    expect(names('auth_login')).toEqual(['start', 'oauth_redirect'])
    expect(names('auth_register')).toEqual([])
  })
})

describe('coming back from the provider', () => {
  it('closes the registration that started on the vacancy sign-up screen (the case that was lost)', async () => {
    stubFetch({ id: 'u1', created_at: new Date().toISOString(), provider: 'linkedin', profile_completed: false })
    render(<AuthModal onClose={vi.fn()} request={{ variant: 'vacancy', subject: 'x' }} />)
    fireEvent.click(screen.getByRole('button', { name: /continuar con linkedin/i }))
    await flush()

    token = 'tok'
    render(<AuthCallbackPage />)
    await waitFor(() => expect(names('auth_register')).toContain('oauth_success*'))

    expect(names('auth_register')).toEqual(['start', 'oauth_redirect', 'oauth_success*'])
  })

  it('records a real registration even when no attempt was open (opened in another tab, storage lost, or went straight to the provider)', async () => {
    stubFetch({ id: 'u2', created_at: new Date().toISOString(), provider: 'linkedin', profile_completed: false })
    token = 'tok'

    render(<AuthCallbackPage />)
    await waitFor(() => expect(names('auth_register')).toContain('oauth_success*'))

    expect(names('auth_register')).toEqual(['start', 'oauth_success*'])
  })

  it('an existing account is a LOGIN, not a registration, whatever screen it started from', async () => {
    stubFetch({ id: 'u3', created_at: '2026-09-01T10:00:00Z', provider: 'linkedin', profile_completed: true })
    token = 'tok'

    render(<AuthCallbackPage />)
    await waitFor(() => expect(names('auth_login')).toContain('oauth_success*'))

    expect(names('auth_login')).toEqual(['start', 'oauth_success*'])
    expect(names('auth_register')).toEqual([])
  })
})
