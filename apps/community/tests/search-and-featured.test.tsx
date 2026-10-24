import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SearchBox, toItems, type SearchResults } from '@/components/search-box'
import { RightSidebar } from '@/components/community-hub'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

let token: string | null = null
vi.mock('@/lib/session', () => ({ getToken: () => token, getCachedUser: () => null, clearSession: vi.fn() }))

const results: SearchResults = {
  q: 'back',
  vacancies: [{ slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', location: 'MX', modalidad: 'Remoto', seniority: 'senior' }],
  people: [{ username: 'ana', displayName: 'Ana Pérez', photoUrl: null, roleCategory: 'backend', seniority: 'senior' }],
  companies: [{ name: 'Stripe', slug: 'stripe', logo: null }],
  skills: [{ name: 'python', label: 'Python' }],
  roles: [{ role: 'backend', slug: 'backend', label: 'Desarrollo Backend' }],
}

beforeEach(() => {
  push.mockClear()
  token = null
})

describe('toItems', () => {
  it('lists the groups in order: vacancies, people, companies, skills, roles', () => {
    expect(toItems(results).map(item => item.group)).toEqual(['Vacantes', 'Personas', 'Empresas', 'Skills', 'Puestos'])
  })

  it('sends each result to its own page', () => {
    expect(toItems(results).map(item => item.href)).toEqual(['/vacantes/backend-1', '/users/ana', '/empresas/stripe', '/empleos/python', '/puestos/backend'])
  })

  it('is empty with no results', () => {
    expect(toItems(null)).toEqual([])
  })
})

describe('SearchBox', () => {
  function mockSearch(body: unknown = results) {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch
  }

  it('does not search with fewer than two letters', async () => {
    mockSearch()
    render(<SearchBox />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } })

    await new Promise(resolve => setTimeout(resolve, 400))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows the real results grouped once you stop typing', async () => {
    mockSearch()
    render(<SearchBox />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'back' } })

    expect(await screen.findByText('Backend Engineer')).toBeTruthy()
    for (const group of ['Vacantes', 'Personas', 'Empresas', 'Skills', 'Puestos']) expect(screen.getByText(group)).toBeTruthy()
    expect(String((global.fetch as any).mock.calls[0][0])).toContain('/api/community/discover/search?q=back')
  })

  it('sends the session when there is one, so people show up', async () => {
    token = 'tok'
    mockSearch()
    render(<SearchBox />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ana' } })

    await screen.findByText('Ana Pérez')
    expect((global.fetch as any).mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('opens the highlighted result with Enter, and moves with the arrows', async () => {
    mockSearch()
    render(<SearchBox />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'back' } })
    await screen.findByText('Backend Engineer')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(push).toHaveBeenCalledWith('/users/ana')
  })

  it('says so when nothing matches', async () => {
    mockSearch({ q: 'zzz', vacancies: [], people: [], companies: [], skills: [], roles: [] })
    render(<SearchBox />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } })

    expect(await screen.findByText(/sin resultados para «zzz»/i)).toBeTruthy()
  })

  it('closes with Escape', async () => {
    mockSearch()
    render(<SearchBox />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'back' } })
    await screen.findByText('Backend Engineer')

    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Backend Engineer')).toBeNull())
  })
})

describe('the right column', () => {
  const featuredBody = { users: [{ username: 'ana', displayName: 'Ana Pérez', photoUrl: null, roleCategory: 'backend', seniority: 'senior', skills: ['python'], validatedSkills: 2 }] }
  const popularBody = {
    posts: [{ id: 'j1', slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', company_logo: null, modalidad: 'Remoto', seniority_level: 'senior', stats: { views: 12, saves: 1, applies: 0 } }],
  }

  beforeEach(() => {
    token = 'tok'
    global.fetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/discover/featured-users')) return { ok: true, json: async () => featuredBody }
      if (u.includes('sort=popular')) return { ok: true, json: async () => popularBody }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch
  })

  it('shows featured users instead of conversations, with how many skills they validated', async () => {
    render(<RightSidebar onUnlock={vi.fn()} />)

    expect(await screen.findByText('Usuarios destacados')).toBeTruthy()
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText(/2 skills validados/)).toBeTruthy()
    expect(screen.queryByText('Conversaciones')).toBeNull()
  })

  it('links each person to their profile', async () => {
    render(<RightSidebar onUnlock={vi.fn()} />)
    const link = (await screen.findByText('Ana Pérez')).closest('a')!
    expect(link.getAttribute('href')).toBe('/users/ana')
  })

  it('asks for the featured users with the session', async () => {
    render(<RightSidebar onUnlock={vi.fn()} />)
    await screen.findByText('Ana Pérez')

    const call = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/discover/featured-users'))
    expect(call[1].headers.Authorization).toBe('Bearer tok')
  })

  it('shows the most popular vacancies, with their views', async () => {
    render(<RightSidebar onUnlock={vi.fn()} />)

    expect(await screen.findByText('Oportunidades destacadas')).toBeTruthy()
    expect(screen.getByText('Backend Engineer')).toBeTruthy()
    expect(screen.getByText('12 vistas')).toBeTruthy()
  })

  it('has no featured-users widget when the API brings nobody', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: [], posts: [] }) })) as unknown as typeof fetch
    render(<RightSidebar onUnlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('La comunidad')).toBeTruthy())
    expect(screen.queryByText('Usuarios destacados')).toBeNull()
  })
})
