import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { CommunityShell } from '@/components/shell'
import { AuthModal, ProfileMenu } from '@/components/community-hub'

let pathname = '/'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname,
}))

let sessionUser: unknown = null
vi.mock('@/lib/session', () => ({
  getToken: () => null,
  getCachedUser: () => sessionUser,
  fetchCurrentUser: async () => sessionUser,
  clearSession: vi.fn(),
}))
vi.mock('@/components/profile-gate', () => ({ ProfileGate: () => null }))

beforeEach(() => {
  pathname = '/'
  sessionUser = null
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
})

const Secret = () => <p>Vacante con datos privados</p>

describe('the app needs an account', () => {
  it('shows a visitor no vacancy information, only the way in', async () => {
    pathname = '/saved'
    render(<CommunityShell><Secret /></CommunityShell>)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/crea tu cuenta para entrar/i)).toBeTruthy()
    expect(screen.queryByText('Vacante con datos privados')).toBeNull()
    expect(screen.queryByText(/oportunidades destacadas/i)).toBeNull()
  })

  it('cannot be dismissed: no close button', async () => {
    pathname = '/saved'
    render(<CommunityShell><Secret /></CommunityShell>)
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: /cerrar/i })).toBeNull()
  })

  it.each(['/post/abc', '/users/ana', '/saved', '/empresas/stripe', '/profile'])('closes %s to a visitor', async path => {
    pathname = path
    render(<CommunityShell><Secret /></CommunityShell>)

    await screen.findByRole('dialog')
    expect(screen.queryByText('Vacante con datos privados')).toBeNull()
  })

  it('leaves the pages Google indexes open, without the gate', async () => {
    for (const path of ['/', '/empleos', '/puestos/backend']) {
      pathname = path
      const { unmount } = render(<CommunityShell><Secret /></CommunityShell>)
      expect(await screen.findByText('Vacante con datos privados')).toBeTruthy()
      expect(screen.queryByText(/crea tu cuenta para entrar/i)).toBeNull()
      unmount()
    }
  })

  it('lets a visitor see the feed, but not the vacancy widgets next to it', async () => {
    pathname = '/'
    render(<CommunityShell><Secret /></CommunityShell>)

    expect(await screen.findByText('Vacante con datos privados')).toBeTruthy()
    expect(screen.queryByText(/oportunidades destacadas/i)).toBeNull()
  })

  it('lets a member in', async () => {
    sessionUser = { id: 'u1', username: 'ana', display_name: 'Ana' }
    render(<CommunityShell><Secret /></CommunityShell>)

    expect(await screen.findByText('Vacante con datos privados')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('AuthModal', () => {
  it('has a close button by default', () => {
    render(<AuthModal onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeTruthy()
  })

  it('has none when it is locked', () => {
    render(<AuthModal onClose={vi.fn()} locked />)
    expect(screen.queryByRole('button', { name: /cerrar/i })).toBeNull()
  })
})

describe('the top bar for a visitor', () => {
  it('offers to log in or sign up instead of a "?" avatar', () => {
    render(<ProfileMenu user={null} />)

    expect(screen.getByRole('link', { name: /iniciar sesión/i }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: /crear cuenta/i }).getAttribute('href')).toBe('/signup')
    expect(screen.queryByText('?')).toBeNull()
  })
})
