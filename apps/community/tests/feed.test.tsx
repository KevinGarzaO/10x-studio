import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Feed, clearFeedCache, rememberFeedPosition } from '@/components/community-hub'
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
const social = { ...base, id: 's1', type: 'discussion', title: 'Una discusión de un miembro', author: { id: 'u3', username: 'beto', display_name: 'Beto', photo_url: null } }
const match = {
  sourceType: 'community', id: 'j9', title: 'Vacante que coincide', company: 'Twilio', companyLogo: null,
  roleCategory: 'backend', seniorityLevel: 'senior', skills: ['python'], url: '/vacantes/coincide',
  postDate: '2026-10-01T10:00:00Z', matchingSkills: 1, historyId: '', isSaved: false,
}

function renderFeed(user: unknown) {
  return render(
    <ShellContext.Provider value={{ user, userLoaded: true, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <Feed />
    </ShellContext.Provider>,
  )
}

beforeEach(() => {
  clearFeedCache()
  token = null
  global.fetch = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/feed/for-you')) return { ok: true, json: async () => ({ items: [match] }) }
    if (u.includes('/posts/editorial')) return { ok: true, json: async () => ({ posts: [article] }) }
    if (u.includes('type=social')) return { ok: true, json: async () => ({ posts: [social] }) }
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
    expect(container.querySelector('.is-for-you')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Para ti' })).toBeNull()
    expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/feed/for-you'))).toBe(false)
  })

  it('adds the Para ti cards, clearly marked, for a signed-in person', async () => {
    token = 'tok'
    const { container } = renderFeed({ id: 'u1', username: 'ana' })

    expect(await screen.findByText('Vacante que coincide')).toBeTruthy()
    await waitFor(() => expect(container.querySelector('.post-card.is-for-you')).toBeTruthy())
    expect(screen.getByText('Un artículo de prueba')).toBeTruthy()
    expect(screen.getByText('Una vacante de prueba')).toBeTruthy()
    expect(screen.getByText(/1 skill en común/)).toBeTruthy()
  })

  it('asks for the vacancies ordered by popularity', async () => {
    renderFeed(null)
    await screen.findByText('Una vacante de prueba')

    const urls = (global.fetch as any).mock.calls.map((c: any[]) => String(c[0]))
    expect(urls.some((u: string) => u.includes('type=job') && u.includes('sort=popular'))).toBe(true)
  })

  it('asks for the vacancies WITH the session, so the server knows which ones you saved', async () => {
    token = 'tok'
    renderFeed({ id: 'u1', username: 'ana' })
    await screen.findByText('Una vacante de prueba')

    const call = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('type=job'))
    expect(call[1].headers.Authorization).toBe('Bearer tok')
  })

  describe('coming back from a vacancy', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('scrolls back to where the person was, instead of leaving them wherever the page ended', async () => {
      const first = renderFeed(null)
      await screen.findByText('Una vacante de prueba')

      Object.defineProperty(window, 'scrollY', { value: 840, configurable: true })
      rememberFeedPosition() // se llama al abrir una tarjeta
      first.unmount()

      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      renderFeed(null)
      await screen.findByText('Una vacante de prueba')

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 840))
    })

    it('shows the feed as it was at once, without loading it again', async () => {
      const first = renderFeed(null)
      await screen.findByText('Una vacante de prueba')
      rememberFeedPosition()
      first.unmount()

      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      ;(global.fetch as any).mockClear()
      renderFeed(null)

      expect(screen.getByText('Una vacante de prueba')).toBeTruthy()
      expect((global.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/posts/editorial'))).toHaveLength(0)

      // deja que terminen los reintentos de posición antes de la siguiente prueba
      await new Promise(resolve => setTimeout(resolve, 500))
    })

    it('does not scroll anywhere when the feed is opened fresh', async () => {
      const first = renderFeed(null)
      await screen.findByText('Una vacante de prueba')
      first.unmount()

      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      renderFeed(null)
      await screen.findByText('Una vacante de prueba')
      await new Promise(resolve => setTimeout(resolve, 500))

      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  it('shows what the members publish next to the team articles', async () => {
    renderFeed(null)

    expect(await screen.findByText('Una discusión de un miembro')).toBeTruthy()
    expect(screen.getByText('Un artículo de prueba')).toBeTruthy()
  })

  it('invites a member to publish, and does not invite a visitor', async () => {
    const member = renderFeed({ id: 'u1', username: 'ana' })
    await screen.findByText('Una vacante de prueba')
    expect(member.container.querySelector('a[href="/publicar"].feed-compose')).toBeTruthy()
    member.unmount()
    clearFeedCache()

    const visitor = renderFeed(null)
    await screen.findByText('Una vacante de prueba')
    expect(visitor.container.querySelector('.feed-compose')).toBeNull()
  })
})

describe('la cabecera y los filtros del feed', () => {
  const stats = { members: 21, companies: 40, vacancies: 426, openVacancies: 462, newVacanciesToday: 18 }
  const remote = { ...job, id: 'j2', title: 'Vacante remota', slug: 'remota', modalidad: 'Remoto', seniority_level: 'senior' }
  const onsite = { ...job, id: 'j3', title: 'Vacante presencial', slug: 'presencial', modalidad: 'Presencial', seniority_level: 'junior' }

  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/community/stats')) return { ok: true, json: async () => stats }
      if (u.includes('/feed/for-you')) return { ok: true, json: async () => ({ items: [match] }) }
      if (u.includes('/posts/editorial')) return { ok: true, json: async () => ({ posts: [article] }) }
      if (u.includes('type=social')) return { ok: true, json: async () => ({ posts: [social] }) }
      if (u.includes('type=job')) return { ok: true, json: async () => ({ posts: [remote, onsite] }) }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch
  })

  it('saluda por el nombre y resume lo que hay: vacantes abiertas, nuevas hoy y las que encajan', async () => {
    token = 'tok'
    renderFeed({ id: 'u1', username: 'ana', display_name: 'Ana López' })

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeTruthy()
    expect(await screen.findByText('462 vacantes abiertas · 18 nuevas hoy · 1 encaja contigo')).toBeTruthy()
  })

  it('a un visitante le da el resumen sin las que encajan, y sin el filtro "Para ti"', async () => {
    renderFeed(null)

    expect(await screen.findByText('462 vacantes abiertas · 18 nuevas hoy')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Para ti' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mi nivel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remoto' })).toBeTruthy()
  })

  it('"Vacantes" quita las discusiones y "Discusiones" quita las vacantes', async () => {
    renderFeed(null)
    await screen.findByText('Vacante remota')

    await userEvent.click(screen.getByRole('button', { name: 'Vacantes' }))
    expect(screen.queryByText('Una discusión de un miembro')).toBeNull()
    expect(screen.getByText('Vacante remota')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Discusiones' }))
    expect(screen.queryByText('Vacante remota')).toBeNull()
    expect(screen.getByText('Una discusión de un miembro')).toBeTruthy()
  })

  it('"Remoto" deja solo las vacantes remotas, y se puede quitar', async () => {
    renderFeed(null)
    await screen.findByText('Vacante presencial')

    await userEvent.click(screen.getByRole('button', { name: 'Remoto' }))
    expect(screen.queryByText('Vacante presencial')).toBeNull()
    expect(screen.getByText('Vacante remota')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Remoto' }))
    expect(screen.getByText('Vacante presencial')).toBeTruthy()
  })

  it('"Para ti" muestra solo lo que encaja y "Mi nivel" solo vacantes de tu nivel', async () => {
    token = 'tok'
    renderFeed({ id: 'u1', username: 'ana', seniority: 'senior' })
    await screen.findByText('Vacante que coincide')

    await userEvent.click(screen.getByRole('button', { name: 'Para ti' }))
    expect(screen.getByText('Vacante que coincide')).toBeTruthy()
    expect(screen.queryByText('Vacante remota')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Todo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mi nivel' }))
    expect(screen.getByText('Vacante remota')).toBeTruthy()
    expect(screen.queryByText('Vacante presencial')).toBeNull()
  })

  it('si los filtros no dejan nada, lo dice y ofrece quitarlos', async () => {
    renderFeed(null)
    await screen.findByText('Vacante remota')

    await userEvent.click(screen.getByRole('button', { name: 'Discusiones' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remoto' }))

    expect(await screen.findByText('Nada con estos filtros.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    expect(await screen.findByText('Vacante remota')).toBeTruthy()
  })

  it('con pocos skills muestra el avance del perfil en una barra, no un párrafo', async () => {
    token = 'tok'
    renderFeed({ id: 'u1', username: 'ana', account_type: 'candidate', skills: ['react', 'python'], photo_url: 'x', role_category: 'backend', seniority: 'senior', location: 'MX', work_modality: 'Remoto' })

    expect(await screen.findByText('Perfil al 83 %')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Avance de tu perfil' })).toHaveAttribute('aria-valuenow', '83')
    expect(screen.getByRole('link', { name: 'Agregar skills' })).toHaveAttribute('href', '/settings')
  })
})
