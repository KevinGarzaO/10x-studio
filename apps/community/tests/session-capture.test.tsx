import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { SessionCapture } from '@/components/session-capture'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

// Los tokens de OAuth llegan como `#access_token=...` en cualquier página a la
// que Supabase decida regresar (si `redirect_to` no está en la lista blanca cae
// en el Site URL). Sin esto la sesión se pierde y todo regresa a /login.
describe('SessionCapture', () => {
  beforeEach(() => {
    replace.mockClear()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('saves tokens that arrive on any page and continues in /auth/callback', async () => {
    window.history.replaceState({}, '', '/#access_token=tok-1&refresh_token=ref-1')

    render(<SessionCapture />)

    await waitFor(() => expect(localStorage.getItem('avocado_token')).toBe('tok-1'))
    expect(localStorage.getItem('avocado_refresh_token')).toBe('ref-1')
    expect(replace).toHaveBeenCalledWith('/auth/callback')
    expect(window.location.hash).toBe('')
  })

  it('leaves the hash alone on /auth/callback, which reads it itself', async () => {
    window.history.replaceState({}, '', '/auth/callback#access_token=tok-2&refresh_token=ref-2')

    render(<SessionCapture />)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(replace).not.toHaveBeenCalled()
    expect(localStorage.getItem('avocado_token')).toBeNull()
    expect(window.location.hash).toContain('access_token=tok-2')
  })

  it('does nothing when there are no tokens in the URL', async () => {
    render(<SessionCapture />)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(replace).not.toHaveBeenCalled()
    expect(localStorage.getItem('avocado_token')).toBeNull()
  })
})
