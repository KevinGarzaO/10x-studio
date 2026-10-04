import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthPage } from '@/components/account-pages'
import { saveReturnTo, peekReturnTo } from '@/lib/return-to'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  push.mockClear()
  localStorage.clear()
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ session: { access_token: 'tok', refresh_token: 'ref' }, user: { id: 'u1' } }),
  })) as unknown as typeof fetch
})

async function submit(mode: 'login' | 'signup') {
  const { container } = render(<AuthPage mode={mode} />)
  fireEvent.change(container.querySelector('#auth-email')!, { target: { value: 'ana@correo.com' } })
  fireEvent.change(container.querySelector('#auth-password')!, { target: { value: 'secreto123' } })
  if (mode === 'signup') {
    fireEvent.change(container.querySelector('#auth-username')!, { target: { value: 'ana' } })
  }
  fireEvent.submit(container.querySelector('form')!)
}

describe('coming back to the vacancy after signing in', () => {
  it('a login sends the person back to the vacancy they were looking at', async () => {
    saveReturnTo('/vacantes/backend-engineer-1')

    await submit('login')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/vacantes/backend-engineer-1'))
  })

  it('a login with nothing saved goes to the home page, as before', async () => {
    await submit('login')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('a signup goes through the onboarding first, and keeps the vacancy for the end', async () => {
    saveReturnTo('/vacantes/backend-engineer-1')

    await submit('signup')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding'))
    expect(peekReturnTo()).toBe('/vacantes/backend-engineer-1')
  })
})
