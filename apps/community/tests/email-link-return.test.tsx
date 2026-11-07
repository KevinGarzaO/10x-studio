import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import AuthCallbackPage from '@/app/auth/callback/page'
import { saveReturnTo, peekReturnTo } from '@/lib/return-to'

/**
 * Correo directo (W): quien abre un enlace de un correo sin sesión inicia sesión (también con LinkedIn o GitHub) y regresa a ESA página.
 * Sin tokens dentro del enlace: solo una ruta del propio sitio guardada en el navegador.
 */
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/auth/callback',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session')
  return { ...actual, getToken: () => 'token', captureSessionFromUrl: vi.fn(), getValidToken: async () => 'token', getCachedUser: () => null }
})

function stubSyncUser(user: Record<string, unknown>) {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/auth/sync-user')) return { ok: true, json: async () => ({ user }) }
    return { ok: true, status: 204, json: async () => ({}) }
  }) as unknown as typeof fetch
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); replace.mockClear() })

describe('coming back from LinkedIn/GitHub', () => {
  it('an existing account with a complete profile goes back to the page it came for, and the saved path is used up', async () => {
    saveReturnTo('/vacantes/backend-engineer-1')
    stubSyncUser({ created_at: '2020-01-01T00:00:00Z', profile_completed: true, provider: 'linkedin' })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/vacantes/backend-engineer-1'))
    expect(peekReturnTo()).toBeNull()
  })

  it('without a saved page it goes home, as before', async () => {
    stubSyncUser({ created_at: '2020-01-01T00:00:00Z', profile_completed: true, provider: 'github' })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })

  it('an incomplete profile still goes to onboarding first and keeps the saved page for the end', async () => {
    saveReturnTo('/vacantes/backend-engineer-1')
    stubSyncUser({ created_at: '2020-01-01T00:00:00Z', profile_completed: false, provider: 'linkedin' })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
    expect(peekReturnTo()).toBe('/vacantes/backend-engineer-1')
  })
})

describe('only paths of our own site are ever kept', () => {
  it('refuses another site, so the email link cannot be used to send people elsewhere', () => {
    saveReturnTo('https://evil.example/login')
    saveReturnTo('//evil.example')
    expect(peekReturnTo()).toBeNull()
  })
})
