import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SavedVacancies } from '@/components/saved-vacancies'
import VacancyPage from '@/app/(main)/vacantes/[slug]/page'
import { ShellContext } from '@/lib/shell-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'backend-engineer-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/saved',
}))

let token: string | null = 'tok'
vi.mock('@/lib/session', () => ({
  getToken: () => token,
  getCachedUser: () => null,
  clearSession: vi.fn(),
  fetchCurrentUser: vi.fn(async () => null),
}))

const item = (patch: Record<string, unknown> = {}) => ({
  id: 'h1', source_type: 'community', source_id: 'v1', title: 'Backend Engineer', company: 'stripe', company_logo: null,
  role_category: 'backend', seniority_level: 'senior', skills: ['python', 'aws'], url: '/vacantes/backend-engineer-1',
  saved_at: new Date().toISOString(), ...patch,
})

let calls: { url: string; method: string; body?: any }[] = []

function mockApi(saved: unknown[]) {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (String(url).includes('/history?saved=true')) return { ok: true, json: async () => ({ items: saved }) }
    if (String(url).includes('/history/save')) return { ok: true, json: async () => ({ item: { id: 'h-new' } }) }
    if (String(url).includes('/history/') && init?.method === 'DELETE') return { ok: true, json: async () => ({}) }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  token = 'tok'
  calls = []
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

describe('/saved', () => {
  it('lists the vacancies the person saved, newest first, with a link to each', async () => {
    mockApi([
      item({ id: 'old', title: 'Vacante vieja', saved_at: '2026-09-01T00:00:00Z', source_id: 'v0', url: '/vacantes/vieja' }),
      item({ id: 'new', title: 'Vacante nueva', saved_at: '2026-10-03T00:00:00Z', url: '/vacantes/nueva' }),
    ])

    const { container } = render(<SavedVacancies />)

    await screen.findByText('Vacante nueva')
    const titles = [...container.querySelectorAll('.saved-item h2')].map(h => h.textContent)
    expect(titles).toEqual(['Vacante nueva', 'Vacante vieja'])
    expect(container.querySelector('a[href="/vacantes/nueva"]')).toBeTruthy()
    expect(screen.getByText('2 vacantes')).toBeTruthy()
  })

  it('asks only for the saved ones', async () => {
    mockApi([item()])
    render(<SavedVacancies />)
    await screen.findByText('Backend Engineer')

    expect(calls.some(c => c.url.includes('/api/community/history?saved=true'))).toBe(true)
  })

  it('shows the role, level, company and skills of each one', async () => {
    mockApi([item()])
    render(<SavedVacancies />)

    await screen.findByText('Backend Engineer')
    expect(screen.getByText('Desarrollo Backend')).toBeTruthy()
    expect(screen.getByText('Senior')).toBeTruthy()
    expect(screen.getByText('python')).toBeTruthy()
  })

  it('removes a vacancy from the list and from the server', async () => {
    mockApi([item()])
    render(<SavedVacancies />)
    await screen.findByText('Backend Engineer')

    fireEvent.click(screen.getByRole('button', { name: /quitar backend engineer/i }))

    await waitFor(() => expect(screen.queryByText('Backend Engineer')).toBeNull())
    expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/history/h1'))).toBe(true)
    expect(screen.getByText(/aún no guardas ninguna vacante/i)).toBeTruthy()
  })

  it('explains how to save when there is nothing yet', async () => {
    mockApi([])
    render(<SavedVacancies />)
    expect(await screen.findByText(/aún no guardas ninguna vacante/i)).toBeTruthy()
  })

  it('asks to sign in without a session, and does not call the server', async () => {
    token = null
    mockApi([])
    render(<SavedVacancies />)

    expect(await screen.findByText(/inicia sesión para ver tus guardados/i)).toBeTruthy()
    expect(calls.some(c => c.url.includes('/history'))).toBe(false)
  })

  it('opens a vacancy that is still in the scraper staging area at its original link', async () => {
    mockApi([item({ source_type: 'scraper', url: 'https://boards.greenhouse.io/x/jobs/1' })])
    const { container } = render(<SavedVacancies />)

    await screen.findByText('Backend Engineer')
    const link = container.querySelector('a[href="https://boards.greenhouse.io/x/jobs/1"]')!
    expect(link.getAttribute('target')).toBe('_blank')
  })
})

describe('saving from the vacancy page', () => {
  const vacancy = {
    id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe', company_logo: null,
    content: '## Backend Engineer', original_text: '## Backend Engineer', platform: 'greenhouse', source_url: 'https://boards.greenhouse.io/stripe/jobs/1',
    author: { id: null, username: 'stripe', display_name: 'Stripe', photo_url: null }, tags: [], votesCount: 0, commentsCount: 0,
    created_at: '2026-10-01T10:00:00Z', skills: ['python'], role_category: 'backend', seniority_level: 'senior',
  }

  function renderPage(post: Record<string, unknown>, shell: { user: unknown } = { user: { username: 'ana' } }, requestAuth = vi.fn()) {
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (String(url).includes('/history/save')) return { ok: true, json: async () => ({ item: { id: 'h-new' } }) }
      if (String(url).includes('/history/') && init?.method === 'DELETE') return { ok: true, json: async () => ({}) }
      return { ok: true, json: async () => post }
    }) as unknown as typeof fetch
    render(
      <ShellContext.Provider value={{ ...shell, userLoaded: true, requestAuth, search: '', activeTag: null, setActiveTag: vi.fn() }}>
        <VacancyPage />
      </ShellContext.Provider>,
    )
    return requestAuth
  }

  it('shows a save button next to the level and modality', async () => {
    renderPage(vacancy)

    const save = await screen.findByRole('button', { name: /guardar vacante/i })
    const chips = save.closest('.detail-chips')!
    expect(chips.textContent).toMatch(/Senior/)
  })

  it('saves the vacancy so it shows up in /saved', async () => {
    renderPage(vacancy)

    fireEvent.click(await screen.findByRole('button', { name: /guardar vacante/i }))

    await screen.findByRole('button', { name: /quitar de guardados/i })
    const save = calls.find(c => c.url.includes('/history/save'))!
    expect(save.method).toBe('POST')
    expect(save.body).toMatchObject({
      sourceType: 'community', sourceId: 'v1', title: 'Backend Engineer', roleCategory: 'backend', seniorityLevel: 'senior',
      skills: ['python'], url: '/vacantes/backend-engineer-1',
    })
  })

  it('arrives already marked when the person had saved it', async () => {
    renderPage({ ...vacancy, isSaved: true, historyId: 'h-old' })

    expect(await screen.findByRole('button', { name: /quitar de guardados/i })).toBeTruthy()
  })

  it('un-saves it', async () => {
    renderPage({ ...vacancy, isSaved: true, historyId: 'h-old' })

    fireEvent.click(await screen.findByRole('button', { name: /quitar de guardados/i }))

    await screen.findByRole('button', { name: /guardar vacante/i })
    expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/history/h-old'))).toBe(true)
  })

  it('asks a visitor without an account to sign up instead of saving', async () => {
    const requestAuth = renderPage(vacancy, { user: null })
    await waitFor(() => expect(requestAuth).toHaveBeenCalled())
    requestAuth.mockClear()

    fireEvent.click(await screen.findByRole('button', { name: /guardar vacante/i }))

    expect(requestAuth).toHaveBeenCalledWith({ variant: 'vacancy', subject: 'Backend Engineer — Stripe' })
    expect(calls.some(c => c.url.includes('/history/save'))).toBe(false)
  })
})
