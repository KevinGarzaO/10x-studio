import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Feed } from '@/components/community-hub'
import { ShellContext } from '@/lib/shell-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

let token: string | null = null
vi.mock('@/lib/session', () => ({
  getToken: () => token,
  getCachedUser: () => null,
  clearSession: vi.fn(),
}))

const base = { votesCount: 0, commentsCount: 0, tags: [], created_at: '2026-10-01T10:00:00Z', content: 'contenido' }
const article = { ...base, id: 'a1', type: 'editorial', title: 'Un artículo de prueba', author: { id: 'u1', username: 'ana', display_name: 'Ana', photo_url: null } }
const job = { ...base, id: 'j1', type: 'job', title: 'Una vacante de prueba', slug: 'una-vacante', company: 'Stripe', author: { id: 'u2', username: 'stripe', display_name: 'Stripe', photo_url: null } }
const match = {
  sourceType: 'community', id: 'j9', title: 'Vacante que coincide', company: 'Twilio', companyLogo: null,
  roleCategory: 'backend', seniorityLevel: 'senior', skills: ['python'], url: '/vacantes/coincide',
  postDate: '2026-10-01T10:00:00Z', matchingSkills: 1, historyId: '', isSaved: false,
}

function renderFeed(user: unknown) {
  return render(
    <ShellContext.Provider value={{ user, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <Feed />
    </ShellContext.Provider>,
  )
}

beforeEach(() => {
  token = null
  global.fetch = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/feed/for-you')) return { ok: true, json: async () => ({ items: [match] }) }
    if (u.includes('/posts/editorial')) return { ok: true, json: async () => ({ posts: [article] }) }
    if (u.includes('type=job')) return { ok: true, json: async () => ({ posts: [job] }) }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
})

describe('single feed', () => {
  it('has no tabs: everything lives in one feed', async () => {
    renderFeed(null)
    await screen.findByText('Un artículo de prueba')

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('shows articles and vacancies to a visitor, each with its own badge, and no Para ti', async () => {
    const { container } = renderFeed(null)

    expect(await screen.findByText('Un artículo de prueba')).toBeTruthy()
    expect(screen.getByText('Una vacante de prueba')).toBeTruthy()
    expect(container.querySelector('.post-type-badge.is-article')?.textContent).toBe('ARTÍCULO')
    expect(container.querySelector('.post-card.job-card .post-type-badge')?.textContent).toBe('VACANTE')
    expect(screen.queryByText('PARA TI')).toBeNull()
    expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/feed/for-you'))).toBe(false)
  })

  it('adds the Para ti cards, clearly marked, for a signed-in person', async () => {
    token = 'tok'
    renderFeed({ id: 'u1', username: 'ana' })

    expect(await screen.findByText('Vacante que coincide')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('PARA TI')).toBeTruthy())
    expect(screen.getByText('Un artículo de prueba')).toBeTruthy()
    expect(screen.getByText('Una vacante de prueba')).toBeTruthy()
    expect(screen.getByText(/1 skill en común/)).toBeTruthy()
  })
})
