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

/** Lo que el servidor entrega sin sesión (/seo/vacancy/:slug): campos públicos, sin contenido completo ni enlace de postulación. */
const publicVersion = {
  id: 'v1', slug: 'backend-engineer-1', title: 'Backend Engineer', company: 'Stripe', company_logo: null, location: null, modalidad: null,
  seniority_level: null, role_category: 'backend', skills: ['python'], budget: null, created_at: '2026-10-01T10:00:00Z',
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
  // Como el servidor de verdad: sin sesión el detalle se rechaza (401) y solo está la versión pública, sin contenido ni contacto.
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/api/community/seo/vacancy/')) return { ok: true, status: 200, json: async () => ({ vacancy: publicVersion }) }
    return { ok: false, status: 401, json: async () => ({ error: 'Inicia sesión para ver esta vacante', code: 'auth_required' }) }
  }) as unknown as typeof fetch
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

  it('shows LinkedIn and GitHub first, above the email buttons', () => {
    render(<AuthModal onClose={vi.fn()} request={request} />)

    const linkedin = screen.getByRole('button', { name: /continuar con linkedin/i })
    const github = screen.getByRole('button', { name: /continuar con github/i })
    const signup = screen.getByRole('button', { name: /crear cuenta gratis/i })
    const login = screen.getByRole('button', { name: /iniciar sesión/i })
    const DOCUMENT_POSITION_FOLLOWING = 4

    expect(linkedin.compareDocumentPosition(signup) & DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(github.compareDocumentPosition(signup) & DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(linkedin.compareDocumentPosition(github) & DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(signup.compareDocumentPosition(login) & DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // El botón de seguir leyendo ya no existe: cerrar es la X o el fondo.
    expect(screen.queryByRole('button', { name: /seguir viendo/i })).toBeNull()
  })

  it('keeps the general text when it was not asked for a vacancy', () => {
    render(<AuthModal onClose={vi.fn()} />)
    expect(screen.getByText('Desbloquea esta oportunidad')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /seguir viendo/i })).toBeNull()
  })
})

describe('the vacancy page for someone without an account', () => {
  it('works from the public version only: the full detail was refused and nothing of it is on screen', async () => {
    const requestAuth = renderPage({ user: null, userLoaded: true })

    await waitFor(() => expect(requestAuth).toHaveBeenCalledTimes(1))
    const urls = (global.fetch as any).mock.calls.map((call: unknown[]) => String(call[0]))
    expect(urls.some((url: string) => url.endsWith('/api/community/posts/backend-engineer-1'))).toBe(true)
    expect(urls.some((url: string) => url.includes('/api/community/seo/vacancy/backend-engineer-1'))).toBe(true)
    // no se buscó el contenido de la empresa (Greenhouse) porque no hay enlace de origen sin sesión
    expect(urls.some((url: string) => url.includes('greenhouse'))).toBe(false)
  })

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

  it('leaves a trace in the analytics: that the wall was shown, and whether this browser had a session before', async () => {
    ;(globalThis as any).__avoAnalyticsTest = true
    const walls: any[] = []
    const base = global.fetch
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/api/a/collect' && init?.body) {
        const body = JSON.parse(String(init.body))
        if (body.type === 'event' && body.name === 'auth_wall_shown') walls.push(body.params)
        return { ok: true, status: 204 }
      }
      return (base as typeof fetch)(url, init)
    }) as unknown as typeof fetch

    try {
      localStorage.setItem('avo_had_session', '1') // este navegador tuvo una sesión y la perdió
      const requestAuth = renderPage({ user: null, userLoaded: true })
      await waitFor(() => expect(requestAuth).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(walls).toHaveLength(1))
      expect(walls[0]).toEqual({ surface: 'vacancy', had_session_before: true, in_app: 'no' })
    } finally {
      ;(globalThis as any).__avoAnalyticsTest = false
    }
  })
})
