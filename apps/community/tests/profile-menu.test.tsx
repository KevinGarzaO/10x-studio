import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfileMenu } from '@/components/community-hub'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

const user = { username: 'ana', display_name: 'Ana', photo_url: null }

beforeEach(() => {
  localStorage.setItem('avocado_token', 't')
  localStorage.setItem('avocado_refresh_token', 'r')
  localStorage.setItem('avocado_user', JSON.stringify(user))
  Object.defineProperty(window, 'location', { value: { href: '/' }, writable: true })
})

describe('ProfileMenu logout', () => {
  it('clears the session and sends the person to /login', () => {
    render(<ProfileMenu user={user} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cuenta' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }))

    expect(localStorage.getItem('avocado_token')).toBeNull()
    expect(localStorage.getItem('avocado_refresh_token')).toBeNull()
    expect(localStorage.getItem('avocado_user')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('offers no logout to a visitor without a session', () => {
    render(<ProfileMenu user={null} />)
    expect(screen.queryByRole('menuitem', { name: /cerrar sesión/i })).toBeNull()
  })
})
