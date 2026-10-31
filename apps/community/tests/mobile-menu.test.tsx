import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommunityShell } from '@/components/shell'

let pathname = '/'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname,
}))
vi.mock('@/lib/session', () => ({
  getToken: () => 'tok',
  getCachedUser: () => ({ id: 'u1', username: 'ana', display_name: 'Ana' }),
  fetchCurrentUser: async () => ({ id: 'u1', username: 'ana', display_name: 'Ana' }),
  clearSession: vi.fn(),
  fetchJsonWithSession: async () => null,
}))
vi.mock('@/components/profile-gate', () => ({ ProfileGate: () => null }))

beforeEach(() => {
  pathname = '/'
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
})

const drawer = (container: HTMLElement) => container.querySelector('.mobile-drawer') as HTMLElement

describe('the mobile menu', () => {
  it('opens with the hamburger and the button becomes a close button', async () => {
    const { container } = render(<CommunityShell><p>feed</p></CommunityShell>)
    expect(drawer(container)).not.toHaveClass('open')

    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))

    expect(drawer(container)).toHaveClass('open')
    expect(screen.getAllByRole('button', { name: 'Cerrar menú' }).length).toBeGreaterThan(0)
  })

  it('closes by itself when a link inside it is tapped, so the page that opens is not hidden behind it', async () => {
    const { container } = render(<CommunityShell><p>feed</p></CommunityShell>)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))

    fireEvent.click(within(drawer(container)).getByRole('link', { name: /guardadas/i }))

    expect(drawer(container)).not.toHaveClass('open')
  })

  it('closes by itself when the page changes', async () => {
    const { container, rerender } = render(<CommunityShell><p>feed</p></CommunityShell>)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(drawer(container)).toHaveClass('open')

    pathname = '/puestos/backend'
    rerender(<CommunityShell><p>otra</p></CommunityShell>)

    expect(drawer(container)).not.toHaveClass('open')
  })
})
