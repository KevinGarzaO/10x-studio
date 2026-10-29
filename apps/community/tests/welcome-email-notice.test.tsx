import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthPage } from '@/components/account-pages'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/signup',
}))

vi.mock('@/lib/session', () => ({
  getToken: () => null,
  captureSessionFromUrl: () => false,
  fetchCurrentUser: vi.fn(async () => null),
  saveSession: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
})

// El correo de bienvenida se avisa en el registro; el resto del flujo (botones, campos) no cambia.
describe('welcome email notice', () => {
  it('tells people who sign up that a welcome email is coming', () => {
    render(<AuthPage mode="signup" />)

    expect(screen.getByText(/te enviaremos un correo de bienvenida/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument()
  })

  it('does not show it when logging in', () => {
    render(<AuthPage mode="login" />)

    expect(screen.queryByText(/correo de bienvenida/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})
