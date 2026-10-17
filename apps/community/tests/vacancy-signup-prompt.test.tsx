import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthModal } from '@/components/community-hub'
import VacancyPage from '@/app/(main)/vacantes/[slug]/page'
import { ShellContext, type AuthRequest } from '@/lib/shell-context'
import { peekReturnTo } from '@/lib/return-to'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'backend-engineer-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/vacantes/backend-engineer-1',
}))

vi.mock('@/lib/session', () => ({
  getToken: () => null,
  getCachedUser: () => null,
  clearSession: vi.fn(),
}))

const vacancy = {
  id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe',
  content: '## Backend Engineer', original_text: '## Backend Engineer', source_url: 'https://boards.greenhouse.io/stripe/jobs/1',
  platform: 'greenhouse', author: { id: null, username: 'stripe', display_name: 'Stripe', photo_url: null },
  tags: [], votesCount: 0, commentsCount: 0, created_at: '2026-10-01T10:00:00Z', skills: ['python'], role_category: 'backend',
}

function renderPage(shell: { user: unknown; userLoaded: boolean }, requestAuth = vi.fn()) {
  render(
    <ShellContext.Provider value={{ ...shell, requestAuth, search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <VacancyPage />
    </ShellContext.Provider>,
  )
  return requestAuth
}

beforeEach(() => {
  push.mockClear()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState({}, '', '/vacantes/backend-engineer-1')
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => vacancy })) as unknown as typeof fetch
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

describe('AuthModal for a vacancy', () => {
  const request: AuthRequest = { variant: 'vacancy', subject: 'Backend Engineer — Stripe' }

  it('talks about the vacancy and promises to come back to it', () => {
    render(<AuthModal onClose={vi.fn()} request={request} />)

    expect(screen.getByText('¿Te interesa esta vacante?')).toBeTruthy()
    expect(screen.getByText('Backend Engineer — Stripe')).toBeTruthy()
    expect(screen.getByText(/volverás a esta vacante/i)).toBeTruthy()
  })

  it('remembers the vacancy and goes to signup', () => {
    render(<AuthModal onClose={vi.fn()} request={request} />)

    fireEvent.click(screen.getByRole('button', { name: /crear cuenta gratis/i }))

    expect(peekReturnTo()).toBe('/vacantes/backend-engineer-1')
    expect(push).toHaveBeenCalledWith('/signup')
  })

  it('does the same when the person already has an account and logs in', () => {
    render(<AuthModal onClose={vi.fn()} request={request} />)

    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    expect(peekReturnTo()).toBe('/vacantes/backend-engineer-1')
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('can be dismissed to keep reading', () => {
    const onClose = vi.fn()
    render(<AuthModal onClose={onClose} request={request} />)

    fireEvent.click(screen.getByRole('button', { name: /seguir viendo la vacante/i }))

    expect(onClose).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(peekReturnTo()).toBeNull()
  })

  it('keeps the general text when it was not asked for a vacancy', () => {
    render(<AuthModal onClose={vi.fn()} />)
    expect(screen.getByText('Desbloquea esta oportunidad')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /seguir viendo/i })).toBeNull()
  })
})

describe('the vacancy page for someone without an account', () => {
  it('asks to sign up when they arrive, naming the vacancy', async () => {
    const requestAuth = renderPage({ user: null, userLoaded: true })

    await waitFor(() => expect(requestAuth).toHaveBeenCalledTimes(1))
    expect(requestAuth).toHaveBeenCalledWith({ variant: 'vacancy', subject: 'Backend Engineer — Stripe' })
  })

  it('asks only once per session, not every time the page re-renders', async () => {
    const requestAuth = renderPage({ user: null, userLoaded: true })
    await waitFor(() => expect(requestAuth).toHaveBeenCalledTimes(1))

    renderPage({ user: null, userLoaded: true }, requestAuth)
    await screen.findAllByText('Backend Engineer')
    expect(requestAuth).toHaveBeenCalledTimes(1)
  })

  it('waits until the session is confirmed, so it does not bother someone who is logged in', async () => {
    const requestAuth = renderPage({ user: null, userLoaded: false })

    await screen.findAllByText('Backend Engineer')
    expect(requestAuth).not.toHaveBeenCalled()
  })

  it('never asks someone who already has an account', async () => {
    const requestAuth = renderPage({ user: { username: 'ana' }, userLoaded: true })

    await screen.findAllByText('Backend Engineer')
    expect(requestAuth).not.toHaveBeenCalled()
  })

  it('turns "Postularse" into the same sign up', async () => {
    const requestAuth = renderPage({ user: null, userLoaded: true })
    await waitFor(() => expect(requestAuth).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))

    expect(requestAuth).toHaveBeenCalledTimes(2)
    expect(requestAuth).toHaveBeenLastCalledWith({ variant: 'vacancy', subject: 'Backend Engineer — Stripe' })
  })
})
