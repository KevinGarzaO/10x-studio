import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import VacancyPage from '@/app/(main)/vacantes/[slug]/page'
import { ShellContext } from '@/lib/shell-context'
import { resetFlowTrackerForTests } from '@/lib/flow-tracker'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'

/**
 * "Postularse": siempre abre el sitio de la empresa en otra pestaña (nunca en un marco, que muchos ATS dejan en blanco), el flujo
 * se cierra como `external_apply`, y en pantallas chicas el botón va arriba (el panel de la empresa queda al final de la página).
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'backend-engineer-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/vacantes/backend-engineer-1',
}))
vi.mock('@/lib/session', () => ({ getToken: () => null, getCachedUser: () => null, clearSession: vi.fn() }))

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
const vacancy = (platform: string) => ({
  id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe',
  content: '**Empresa:** Stripe\n### Descripción\nTexto', platform, source_url: 'https://boards.greenhouse.io/stripe/jobs/1',
  author: { id: null, username: 'stripe', display_name: 'Stripe', photo_url: null },
  tags: [], votesCount: 0, commentsCount: 0, created_at: new Date().toISOString(), skills: ['python'], role_category: 'backend',
})

let flowSteps: { flow_name: string; step_name: string; is_final: boolean }[] = []

function setup(platform = 'greenhouse') {
  flowSteps = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u === '/api/a/flow') { flowSteps.push(JSON.parse(String(init?.body))); return { ok: true, status: 204 } }
    if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
    if (u.includes('/attribution/event')) return { ok: true, status: 204, json: async () => ({}) }
    return { ok: true, json: async () => vacancy(platform) }
  }) as unknown as typeof fetch
  render(
    <ShellContext.Provider value={{ user: { username: 'ana' } as never, userLoaded: true, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <VacancyPage />
    </ShellContext.Provider>,
  )
}

const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }

/** Simula una pantalla chica (o de escritorio) para el corte de 1080 px. */
function screenIs(kind: 'compact' | 'desktop') {
  window.matchMedia = ((query: string) => ({
    matches: kind === 'compact' && query.includes('max-width: 1080px'), media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests(); resetFlowTrackerForTests()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  screenIs('desktop')
})
afterEach(() => { ;(globalThis as any).__avoAnalyticsTest = false; vi.restoreAllMocks() })

describe('Postularse opens the company site in a new tab', () => {
  it.each(['greenhouse', 'lever', 'workable', 'platzi'])('for %s, with no frame at all (the old frame came out blank on many sites)', async (platform) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    setup(platform)

    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][1]).toBe('_blank')
    expect(String(open.mock.calls[0][2])).toContain('noopener')
    expect(String(open.mock.calls[0][2])).toContain('noreferrer')
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('says so on the page and always leaves a link in case the browser blocked the new tab', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null) // ventana bloqueada
    setup()

    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))

    const note = await screen.findByRole('status')
    expect(note.textContent).toContain('Abrimos el sitio de Stripe en otra pestaña')
    const link = within(note).getByRole('link', { name: 'ábrelo aquí' })
    expect(link.getAttribute('href')).toContain('greenhouse.io')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('closes the flow as completed (external_apply), for every platform, which is what the Flujos críticos screen counts', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
    setup('greenhouse')

    fireEvent.click(await screen.findByRole('button', { name: 'Postularse' }))
    await waitFor(() => expect(flowSteps.some(step => step.flow_name === 'job_application' && step.step_name === 'external_apply')).toBe(true))
    await flush()

    const done = flowSteps.find(step => step.step_name === 'external_apply')!
    expect(done.is_final).toBe(true)
    expect(flowSteps.filter(step => step.flow_name === 'job_application').map(step => step.step_name)).toEqual(['start', 'view_detail', 'click_apply', 'external_apply'])
  })
})

describe('where the button is', () => {
  it('on a big screen it lives in the company panel, once', async () => {
    screenIs('desktop')
    setup()
    const button = await screen.findByRole('button', { name: 'Postularse' })
    expect(button.closest('.detail-aside')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Postularse' })).toHaveLength(1)
  })

  it('on a small screen it goes at the top, inside the vacancy card under the title, and nowhere else', async () => {
    screenIs('compact')
    setup()
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(document.querySelector('.detail-apply-inline')).not.toBeNull())
    const inline = document.querySelector('.detail-apply-inline')!
    const button = within(inline as HTMLElement).getByRole('button', { name: 'Postularse' })

    expect(screen.getAllByRole('button', { name: 'Postularse' })).toHaveLength(1)
    expect(document.querySelector('.detail-aside')?.contains(button)).toBe(false)
    // viene después del título y antes de la descripción
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.compareDocumentPosition(inline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const body = document.querySelector('.detail-card-body')
    expect(body?.contains(inline)).toBe(true)
  })
})
