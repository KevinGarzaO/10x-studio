import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Feed, clearFeedCache } from '@/components/community-hub'
import { ShellContext } from '@/lib/shell-context'
import { resetErrorReporterForTests } from '@/lib/error-reporter'
import { resetWebAnalyticsForTests } from '@/lib/web-analytics'

/**
 * El error que se veía como "Cargando más posts..." para siempre en la vista "Discusiones": esa vista esconde las vacantes, pero el
 * feed seguía pidiendo página tras página de vacantes (cientos, de 10 en 10) porque lo que se ve nunca llena la pantalla.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

vi.mock('@/lib/session', () => ({
  getToken: () => null,
  getCachedUser: () => null,
  fetchJsonWithSession: async () => null,
  clearSession: vi.fn(),
}))

const base = { votesCount: 0, commentsCount: 0, tags: [], created_at: '2026-10-01T10:00:00Z', content: 'contenido' }
const jobPage = (page: number) => Array.from({ length: 10 }, (_, i) => ({
  ...base, id: `j${page}-${i}`, type: 'job', title: `Vacante ${page}-${i}`, slug: `vacante-${page}-${i}`, company: `Empresa ${page}-${i}`,
  author: { id: null, username: 'x', display_name: 'X', photo_url: null },
}))

let requests: string[]
/** Artículos del equipo y discusiones de miembros que devuelve el servidor (por defecto, ninguno). */
let editorial: unknown[] = []
let social: unknown[] = []
/** Si hay artículos de sobra: cada página de artículos llega llena (como el blog del equipo, que publica a diario). */
let endlessEditorial = false

function renderFeed() {
  return render(
    <ShellContext.Provider value={{ user: null, userLoaded: true, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <Feed />
    </ShellContext.Provider>,
  )
}

beforeEach(() => {
  clearFeedCache()
  localStorage.clear()
  resetErrorReporterForTests()
  resetWebAnalyticsForTests()
  requests = []
  editorial = []
  social = []
  endlessEditorial = false
  global.fetch = vi.fn(async (url: string) => {
    const u = String(url)
    requests.push(u)
    // la telemetría del propio sitio (rutas relativas) no es parte de lo que se prueba
    if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
    const page = Number(new URL(u).searchParams.get('page') ?? 1)
    // 600 vacantes de sobra (todas las páginas llegan llenas); ni artículos ni discusiones.
    if (u.includes('type=job')) return { ok: true, json: async () => ({ posts: jobPage(page) }) }
    if (u.includes('/posts/editorial')) return { ok: true, json: async () => ({ posts: endlessEditorial ? editorial.map((a: any) => ({ ...a, id: `${a.id}-p${page}` })) : page === 1 ? editorial : [] }) }
    if (u.includes('type=social')) return { ok: true, json: async () => ({ posts: page === 1 ? social : [] }) }
    return { ok: true, json: async () => ({ posts: [] }) }
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  ;(globalThis as any).__avoAnalyticsTest = false
})

const jobPages = () => requests.filter(url => url.includes('type=job')).length

describe('the Discusiones view', () => {
  it('does not keep paging through hidden vacancies: it stops and says there is nothing, instead of loading forever', async () => {
    renderFeed()
    await screen.findByText('Vacante 1-0')
    const beforeClick = jobPages()

    fireEvent.click(screen.getByRole('button', { name: 'Discusiones' }))

    // sin discusiones: se avisa, sin quedarse en "Cargando"
    await waitFor(() => expect(screen.getByText(/Nada con estos filtros/)).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('Cargando más posts...')).toBeNull()
    // y no pidió más páginas de vacantes que no se ven
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(jobPages() - beforeClick).toBeLessThanOrEqual(1)
  })

  it('in the Vacantes view it does keep loading vacancies as the person scrolls (what is hidden is only the other kind)', async () => {
    renderFeed()
    await screen.findByText('Vacante 1-0')
    fireEvent.click(screen.getByRole('button', { name: 'Vacantes' }))
    // el feed corto pide más solo, pero con un tope: no es infinito
    await waitFor(() => expect(jobPages()).toBeGreaterThan(1))
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(jobPages()).toBeLessThanOrEqual(12)
  })
})

describe('what each view shows while more vacancies can still arrive', () => {
  const article = { ...base, id: 'a1', type: 'editorial', title: 'Un artículo del equipo', author: { id: 'u1', username: 'ana', display_name: 'Ana', photo_url: null } }
  const discussion = { ...base, id: 's1', type: 'discussion', title: 'Una discusión de un miembro', author: { id: 'u3', username: 'beto', display_name: 'Beto', photo_url: null } }

  it('"Discusiones" shows the articles and discussions that exist (they used to wait forever for vacancies that were hidden: an empty list)', async () => {
    editorial = [article]
    social = [discussion]
    renderFeed()
    await screen.findByText('Vacante 1-0')
    fireEvent.click(screen.getByRole('button', { name: 'Discusiones' }))

    expect(await screen.findByText('Una discusión de un miembro')).toBeTruthy()
    expect(screen.getByText('Un artículo del equipo')).toBeTruthy()
    expect(screen.queryByText(/Nada con estos filtros/)).toBeNull()
    expect(screen.queryByText('Vacante 1-0')).toBeNull()
  })

  it('"Vacantes" shows every vacancy that was loaded, not only the first 4 (the gap of the next article, which never comes there)', async () => {
    // el blog tiene artículos de sobra: cada página llega llena (4) y el feed cree que SIEMPRE faltan artículos por traer
    editorial = [1, 2, 3, 4].map(n => ({ ...article, id: `a${n}`, title: `Artículo ${n}` }))
    endlessEditorial = true
    renderFeed()
    await screen.findByText('Vacante 1-0')
    fireEvent.click(screen.getByRole('button', { name: 'Vacantes' }))

    await waitFor(() => expect(screen.getAllByText(/^Vacante 1-\d$/).length).toBe(10))
    expect(screen.queryByText('Artículo 1')).toBeNull()
  })

  it('with a vacancy filter on, the articles are hidden and the vacancies are not cut at 4', async () => {
    editorial = [article]
    renderFeed()
    await screen.findByText('Vacante 1-0')
    fireEvent.click(screen.getByRole('button', { name: 'Remoto' }))

    // ninguna vacante de la prueba es remota: no hay nada que mostrar, pero tampoco se queda cargando para siempre
    await waitFor(() => expect(screen.getByText(/Nada con estos filtros/)).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('Cargando más posts...')).toBeNull()
  })
})

describe('what the error screen now sees', () => {
  const errorReports = () => requests.filter(url => url === '/api/a/error').length

  it('reports it when the feed asks for many pages in a row and the screen still does not fill up, instead of looping unseen', async () => {
    ;(globalThis as any).__avoAnalyticsTest = true
    const sent: any[] = []
    const inner = global.fetch
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/api/a/error') sent.push(JSON.parse(String(init?.body)))
      return (inner as typeof fetch)(url, init)
    }) as unknown as typeof fetch

    renderFeed()
    await screen.findByText('Vacante 1-0')
    fireEvent.click(screen.getByRole('button', { name: 'Vacantes' }))

    await waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 4000 })
    expect(sent[0].message).toContain('páginas seguidas')
    expect(sent[0].context).toMatchObject({ surface: 'feed', view: 'jobs' })
    expect(errorReports()).toBeGreaterThan(0)
  })

  it('reports a server error (5xx) of the feed as an API error, where before it only showed an empty feed', async () => {
    ;(globalThis as any).__avoAnalyticsTest = true
    const sent: any[] = []
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      requests.push(u)
      if (u === '/api/a/error') { sent.push(JSON.parse(String(init?.body))); return { ok: true, status: 204 } }
      if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
      if (u.includes('type=job')) return { ok: false, status: 502, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ posts: [] }) }
    }) as unknown as typeof fetch

    renderFeed()
    await waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 4000 })
    expect(sent[0]).toMatchObject({ name: 'ApiError', source: 'api' })
    expect(sent[0].message).toContain('HTTP 502')
    expect(sent[0].context.endpoint).toBe('/api/community/posts')
  })
})
