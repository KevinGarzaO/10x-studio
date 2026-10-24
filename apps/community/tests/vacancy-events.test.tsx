import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { trackVacancyEvent } from '@/lib/attribution'
import VacancyPage from '@/app/(main)/vacantes/[slug]/page'
import { ShellContext } from '@/lib/shell-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'backend-engineer-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/vacantes/backend-engineer-1',
}))

let token: string | null = null
vi.mock('@/lib/session', () => ({ getToken: () => token, getCachedUser: () => null, clearSession: vi.fn() }))

let events: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []

function stubFetch(vacancy?: Record<string, unknown>) {
  events = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/attribution/event')) {
      events.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: (init?.headers ?? {}) as Record<string, string> })
      return { ok: true, status: 204, json: async () => ({}) }
    }
    return { ok: true, json: async () => vacancy ?? {} }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  token = null
  localStorage.clear()
  sessionStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

describe('trackVacancyEvent', () => {
  it('sends the event with the browser id, and no personal data', () => {
    stubFetch()
    trackVacancyEvent('backend-engineer-1', 'view')

    expect(events).toHaveLength(1)
    expect(events[0].url).toContain('/api/community/attribution/event')
    expect(events[0].body).toMatchObject({ slug: 'backend-engineer-1', event: 'view' })
    expect(String(events[0].body.visitorId)).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(Object.keys(events[0].body).sort()).toEqual(['event', 'slug', 'source', 'visitorId'].filter(key => key in events[0].body).sort())
  })

  it('counts a view once per session and vacancy, so reloading does not inflate it', () => {
    stubFetch()
    trackVacancyEvent('vac-1', 'view')
    trackVacancyEvent('vac-1', 'view')
    trackVacancyEvent('vac-2', 'view')

    expect(events.map(event => event.body.slug)).toEqual(['vac-1', 'vac-2'])
  })

  it('counts every click on apply (the server ignores a double click)', () => {
    stubFetch()
    trackVacancyEvent('vac-1', 'apply')
    trackVacancyEvent('vac-1', 'apply')

    expect(events).toHaveLength(2)
  })

  it('carries the session when there is one', () => {
    stubFetch()
    token = 'mi-token'
    trackVacancyEvent('vac-1', 'apply')

    expect(events[0].headers.Authorization).toBe('Bearer mi-token')
  })

  it('does nothing without a vacancy, and never throws if the network fails', () => {
    stubFetch()
    trackVacancyEvent('', 'view')
    expect(events).toHaveLength(0)

    global.fetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(() => trackVacancyEvent('vac-1', 'apply')).not.toThrow()
  })
})

describe('the vacancy page', () => {
  const vacancy = {
    id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe', company_logo: null,
    content: '## Backend Engineer', original_text: '## Backend Engineer', platform: 'greenhouse', source_url: 'https://boards.greenhouse.io/stripe/jobs/1',
    author: { id: null, username: 'stripe', display_name: 'Stripe', photo_url: null }, tags: [], votesCount: 0, commentsCount: 0,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(), skills: ['python'], role_category: 'backend',
  }

  function renderPage(user: unknown) {
    stubFetch(vacancy)
    const requestAuth = vi.fn()
    render(
      <ShellContext.Provider value={{ user, userLoaded: true, requestAuth, search: '', activeTag: null, setActiveTag: vi.fn() }}>
        <VacancyPage />
      </ShellContext.Provider>,
    )
    return requestAuth
  }

  it('notes that the vacancy was opened', async () => {
    renderPage({ username: 'ana' })

    await waitFor(() => expect(events.some(event => event.body.event === 'view' && event.body.slug === 'backend-engineer-1')).toBe(true))
  })

  it('notes a click on apply, from someone with an account', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage({ username: 'ana' })

    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))

    await waitFor(() => expect(events.some(event => event.body.event === 'apply')).toBe(true))
    open.mockRestore()
  })

  it('notes the intent to apply from a visitor without an account too, and asks them to sign up', async () => {
    const requestAuth = renderPage(null)
    await waitFor(() => expect(requestAuth).toHaveBeenCalled())
    requestAuth.mockClear()

    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))

    await waitFor(() => expect(events.some(event => event.body.event === 'apply')).toBe(true))
    expect(requestAuth).toHaveBeenCalled()
  })
})
