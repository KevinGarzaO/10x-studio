import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import VacancyPage from '@/app/(main)/vacantes/[slug]/page'
import { ShellContext } from '@/lib/shell-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'backend-engineer-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/vacantes/backend-engineer-1',
}))
vi.mock('@/lib/session', () => ({ getToken: () => null, getCachedUser: () => null, clearSession: vi.fn() }))

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString()

const vacancy = (createdAt: string) => ({
  id: 'v1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer-1', company: 'Stripe', company_logo: null,
  content: '## Backend Engineer', original_text: '## Backend Engineer', platform: 'greenhouse', source_url: 'https://boards.greenhouse.io/stripe/jobs/1',
  author: { id: null, username: 'stripe', display_name: 'Stripe', photo_url: null }, tags: [], votesCount: 0, commentsCount: 0,
  created_at: createdAt, skills: ['python'], role_category: 'backend',
})

let requested: string[] = []

function renderPage(createdAt: string) {
  requested = []
  global.fetch = vi.fn(async (url: string) => {
    requested.push(String(url))
    if (String(url).includes('/seo/vacancies')) {
      return { ok: true, json: async () => ({ vacancies: [{ id: 's1', slug: 'abierta', title: 'Vacante abierta parecida', company: 'Twilio', location: 'Remoto' }] }) }
    }
    return { ok: true, json: async () => vacancy(createdAt) }
  }) as unknown as typeof fetch
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo

  return render(
    <ShellContext.Provider value={{ user: { username: 'ana' }, userLoaded: true, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <VacancyPage />
    </ShellContext.Provider>,
  )
}

beforeEach(() => sessionStorage.clear())

describe('a vacancy older than 45 days', () => {
  it('still opens, says it no longer accepts applications, and has no apply button', async () => {
    renderPage(daysAgo(60))

    expect(await screen.findByText('Esta vacante ya no acepta solicitudes')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: 'Backend Engineer' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Postularse' })).toBeNull()
  })

  it('offers similar vacancies that are still open, looked up by its first skill and leaving itself out', async () => {
    const { container } = renderPage(daysAgo(60))

    await screen.findByText('Vacante abierta parecida')
    expect(container.querySelector('a[href="/vacantes/abierta"]')).toBeTruthy()
    const lookup = requested.find(url => url.includes('/seo/vacancies'))!
    expect(lookup).toContain('skill=python')
    expect(lookup).toContain('exclude=backend-engineer-1')
    expect(container.querySelector('a[href="/empleos"]')).toBeTruthy()
  })
})

describe('a vacancy that is still open', () => {
  it('shows no warning, keeps the apply button, and looks nothing up', async () => {
    renderPage(daysAgo(3))

    expect(await screen.findByRole('button', { name: 'Postularse' })).toBeTruthy()
    expect(screen.queryByText('Esta vacante ya no acepta solicitudes')).toBeNull()
    expect(requested.some(url => url.includes('/seo/vacancies'))).toBe(false)
  })
})
