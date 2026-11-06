import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { ApplyPrompt } from '@/components/apply-prompt'
import { MyApplications } from '@/components/my-applications'
import { PostCard, type FeedPost } from '@/components/community-hub'
import VacancyPage from '@/app/(main)/vacantes/[slug]/page'
import { ShellContext } from '@/lib/shell-context'
import { announceApplication } from '@/lib/applications'
import { resetFlowTrackerForTests } from '@/lib/flow-tracker'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'

/**
 * Mis postulaciones: la franja «¿Ya te postulaste?», la marca «Postulada» en el feed y en el detalle, el aviso del sitio oficial
 * antes de salir y la página de seguimiento.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'backend-engineer-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/postulaciones',
}))
let token: string | null = 'tok'
vi.mock('@/lib/session', () => ({ getToken: () => token, getCachedUser: () => null, clearSession: vi.fn(), fetchCurrentUser: vi.fn(async () => null) }))

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
type Call = { url: string; method: string; body?: any }
let calls: Call[] = []
let pending: unknown = null
let list: unknown[] = []
let failAnswers = false

const application = (patch: Record<string, unknown> = {}) => ({
  id: 'a1', vacancyId: 'v1', slug: 'backend-engineer-1', title: 'Backend Engineer', company: 'stripe', host: 'boards.greenhouse.io',
  status: 'clicked', clickedAt: new Date().toISOString(), appliedAt: null, ...patch,
})

function mockApi() {
  calls = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    const call: Call = { url: u, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
    if (u.endsWith('/applications/pending')) return { ok: true, json: async () => ({ application: pending }) }
    if (/\/applications\/[^/]+\/answer$/.test(u)) {
      if (failAnswers) return { ok: false, status: 500, json: async () => ({}) }
      const answer = call.body.answer
      return { ok: true, json: async () => ({ application: application({ status: answer === 'later' ? 'clicked' : answer }) }) }
    }
    if (/\/applications\/[^/]+$/.test(u) && call.method === 'PATCH') return { ok: true, json: async () => ({ application: application({ status: call.body.status }) }) }
    if (/\/applications\/[^/]+$/.test(u) && call.method === 'DELETE') return { ok: true, status: 204 }
    if (u.endsWith('/applications') && call.method === 'GET') return { ok: true, json: async () => ({ applications: list }) }
    if (u.endsWith('/applications') && call.method === 'POST') return { ok: true, status: 201, json: async () => ({ application: application() }) }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests(); resetFlowTrackerForTests()
  token = 'tok'; pending = null; list = []; failAnswers = false
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  mockApi()
})
afterEach(() => { ;(globalThis as any).__avoAnalyticsTest = false; vi.restoreAllMocks() })

describe('the "¿Ya te postulaste?" strip', () => {
  it('shows up when the server has an attempt to ask about, naming the vacancy and the company', async () => {
    pending = application()
    render(<ApplyPrompt enabled />)
    const strip = await screen.findByRole('dialog')
    expect(strip.textContent).toContain('¿Ya te postulaste a Backend Engineer en Stripe?')
    expect(within(strip).getByRole('button', { name: /^Sí, ya/ })).toBeTruthy()
    expect(within(strip).getByRole('button', { name: /^Todavía no/ })).toBeTruthy()
    expect(within(strip).getByRole('button', { name: /^Más tarde/ })).toBeTruthy()
  })

  it('shows nothing when there is nothing to ask, when the person has no session, or when it is not enabled', async () => {
    render(<ApplyPrompt enabled />)
    await waitFor(() => expect(calls.some(call => call.url.endsWith('/applications/pending'))).toBe(true))
    expect(screen.queryByRole('status')).toBeNull()

    calls = []
    render(<ApplyPrompt enabled={false} />)
    token = null
    render(<ApplyPrompt enabled />)
    await act(async () => { await Promise.resolve() })
    expect(calls.filter(call => call.url.includes('/applications'))).toHaveLength(0)
  })

  it.each([['Sí, ya', 'applied'], ['Todavía no', 'not_yet'], ['Más tarde', 'later']])('"%s" sends the answer %s and closes the strip', async (label, answer) => {
    pending = application()
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp('^' + (label as string)) }))

    await waitFor(() => expect(calls.some(call => call.method === 'POST' && call.url.endsWith('/applications/a1/answer') && call.body.answer === answer)).toBe(true))
    await waitFor(() => expect(screen.queryByText(/¿Ya te postulaste a/)).toBeNull())
  })

  it('on "Sí, ya" thanks the person and points to Mis postulaciones', async () => {
    pending = application()
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: /^Sí, ya/ }))

    const thanks = await screen.findByText(/La guardamos en/)
    expect(within(thanks.parentElement as HTMLElement).getByRole('link', { name: 'Mis postulaciones' }).getAttribute('href')).toBe('/postulaciones')
  })

  it('keeps the strip when the answer could not be saved, so the person can try again', async () => {
    pending = application()
    failAnswers = true
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: /^Sí, ya/ }))
    await waitFor(() => expect(calls.some(call => call.url.endsWith('/answer'))).toBe(true))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText(/¿Ya te postulaste a/)).toBeTruthy()
  })

  it('tells the open screens (detail, feed cards) when something is answered', async () => {
    pending = application()
    const seen: unknown[] = []
    window.addEventListener('avo:application-changed', event => seen.push((event as CustomEvent).detail))
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: /^Sí, ya/ }))
    await waitFor(() => expect(seen).toContainEqual({ vacancyId: 'v1', status: 'applied' }))
  })
})

describe('the "Postulada" mark in the feed', () => {
  const post = (patch: Partial<FeedPost> = {}) => ({
    id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe', content: '', tags: [], votesCount: 0, commentsCount: 0,
    created_at: new Date().toISOString(), author: { id: null, username: 'x', display_name: 'X', photo_url: null }, ...patch,
  }) as FeedPost

  it('appears on a vacancy the person already applied to (and on interview, offer and "no avanzó"), not on the others', () => {
    for (const [status, shown] of [['applied', true], ['interview', true], ['offer', true], ['rejected', true], ['clicked', false], ['not_yet', false], [null, false]] as const) {
      const { unmount } = render(<PostCard post={post({ applicationStatus: status })} onAuthRequired={vi.fn()} />)
      expect(!!screen.queryByText('Postulada')).toBe(shown)
      unmount()
    }
  })

  it('shows up without reloading when the person answers the strip', async () => {
    render(<PostCard post={post()} onAuthRequired={vi.fn()} />)
    expect(screen.queryByText('Postulada')).toBeNull()
    act(() => announceApplication({ vacancyId: 'v1', status: 'applied' }))
    expect(await screen.findByText('Postulada')).toBeTruthy()
    act(() => announceApplication({ vacancyId: 'otra', status: 'applied' })) // de otra vacante: no cambia nada aquí
  })
})

describe('the vacancy page', () => {
  const vacancy = (patch: Record<string, unknown> = {}) => ({
    id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe', content: '**Empresa:** Stripe', platform: 'greenhouse',
    source_url: 'https://www.boards.greenhouse.io/stripe/jobs/1', author: { id: null, username: 'stripe', display_name: 'Stripe', photo_url: null },
    tags: [], votesCount: 0, commentsCount: 0, created_at: new Date().toISOString(), skills: ['python'], role_category: 'backend', ...patch,
  })
  function renderPage(vac: Record<string, unknown>) {
    const base = global.fetch
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/community/posts/backend-engineer-1')) return { ok: true, status: 200, json: async () => vac }
      return (base as typeof fetch)(url, init)
    }) as unknown as typeof fetch
    render(
      <ShellContext.Provider value={{ user: { username: 'ana' } as never, userLoaded: true, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
        <VacancyPage />
      </ShellContext.Provider>,
    )
  }

  it('says where the button leads, before leaving: the official site, with its domain', async () => {
    renderPage(vacancy())
    await screen.findByRole('button', { name: 'Postularse' })
    expect(screen.getByText(/sitio oficial de la empresa/).closest('p')!.textContent).toContain('boards.greenhouse.io')
    expect(screen.getByText(/AvoTalent no recibe lo que escribas allá/)).toBeTruthy()
  })

  it('saves the attempt when the person leaves to apply, so the strip can ask when they come back', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage(vacancy())
    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))
    await waitFor(() => expect(calls.some(call => call.method === 'POST' && call.url.endsWith('/api/community/applications') && call.body.vacancyId === 'v1')).toBe(true))
  })

  it('marks the vacancy as "Postulada" when the person already applied, and when they answer the strip', async () => {
    renderPage(vacancy({ applicationStatus: 'applied' }))
    expect(await screen.findByText('Ya te postulaste')).toBeTruthy()
    // ya dijo que se postuló: no vuelve a ver «Postularse», pero puede abrir otra vez el sitio de la empresa
    expect(screen.queryByRole('button', { name: 'Postularse' })).toBeNull()
    expect(screen.getByRole('link', { name: 'abrir el sitio de la empresa otra vez' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Postulada')
    expect(within(screen.getByRole('status')).getByRole('link', { name: 'ver en Mis postulaciones' }).getAttribute('href')).toBe('/postulaciones')
  })

  it('does not mark it when they only left or said "todavía no"', async () => {
    renderPage(vacancy({ applicationStatus: 'not_yet' }))
    // con toda la suite corriendo junta la página tarda más en pintarse: más margen para no fallar por lentitud
    await screen.findByRole('button', { name: 'Postularse' }, { timeout: 5000 })
    expect(screen.queryByText(/ver en Mis postulaciones/)).toBeNull()
    act(() => announceApplication({ vacancyId: 'v1', status: 'applied' }))
    expect(await screen.findByText(/ver en Mis postulaciones/, undefined, { timeout: 4000 })).toBeTruthy()
  })
})

describe('Mis postulaciones (the page)', () => {
  it('lists them with their status, the site they went to, and says it is the person who sets the status', async () => {
    list = [application({ status: 'applied', appliedAt: new Date().toISOString() }), application({ id: 'a2', vacancyId: 'v2', title: 'Analista', company: 'acme', status: 'clicked', host: null, closed: true })]
    render(<MyApplications />)

    expect(await screen.findByRole('heading', { name: 'Mis postulaciones' })).toBeTruthy()
    expect(await screen.findByText('Backend Engineer')).toBeTruthy()
    expect(screen.getByText('boards.greenhouse.io')).toBeTruthy()
    expect(screen.getByText(/Tú pones el estado/)).toBeTruthy()
    expect(screen.getByText('ya no acepta solicitudes')).toBeTruthy()
    expect(screen.getByText(/1 postulada de 2/)).toBeTruthy()
    expect((screen.getByLabelText('Estado de Backend Engineer') as HTMLSelectElement).value).toBe('applied')
  })

  it('lets the person change a status and remove one', async () => {
    list = [application({ status: 'applied', appliedAt: new Date().toISOString() })]
    render(<MyApplications />)
    const select = (await screen.findByLabelText('Estado de Backend Engineer')) as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'interview' } })
    await waitFor(() => expect(calls.some(call => call.method === 'PATCH' && call.body.status === 'interview')).toBe(true))
    await waitFor(() => expect((screen.getByLabelText('Estado de Backend Engineer') as HTMLSelectElement).value).toBe('interview'))

    fireEvent.click(screen.getByRole('button', { name: /Quitar Backend Engineer/ }))
    await waitFor(() => expect(calls.some(call => call.method === 'DELETE')).toBe(true))
    await waitFor(() => expect(screen.queryByText('Backend Engineer')).toBeNull())
  })

  it('invites to the first application when the list is empty, and asks for a session when there is none', async () => {
    render(<MyApplications />)
    expect(await screen.findByText(/Todavía no has salido a postularte/)).toBeTruthy()

    token = null
    render(<MyApplications />)
    expect(await screen.findByText('Inicia sesión para ver tus postulaciones')).toBeTruthy()
  })
})
