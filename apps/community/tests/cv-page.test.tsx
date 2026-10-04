import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PublicCvPage from '@/app/cv/[username]/page'

vi.mock('next/navigation', () => ({
  useParams: () => ({ username: 'ana' }),
  useRouter: () => ({ push: vi.fn() }),
}))

let token: string | null = null
vi.mock('@/lib/session', () => ({ getToken: () => token }))

const CATALOG = { skills: [{ name: 'nodejs', label: 'Node.js' }], aliases: [] }

const cvResponse = {
  profile: {
    username: 'ana',
    display_name: 'Ana Pérez',
    photo_url: null,
    title: 'Desarrollo Backend',
    role_category: 'backend',
    seniority: 'senior',
    location: 'Monterrey, MX',
    work_modality: 'Remoto',
    skills: ['nodejs'],
    website: null,
    github_url: null,
  },
  cv: { summary: 'Ingeniera backend', experience: [{ company: 'Stripe', position: 'Backend', startDate: '2022-03', endDate: null }] },
  isPublic: true,
  isOwner: false,
}

let cvStatus: number
let cvBody: unknown

beforeEach(() => {
  token = null
  cvStatus = 200
  cvBody = cvResponse
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/api/community/skills')) return { ok: true, status: 200, json: async () => CATALOG }
    return { ok: cvStatus >= 200 && cvStatus < 300, status: cvStatus, json: async () => cvBody }
  }) as unknown as typeof fetch
})

const cvCall = () => (global.fetch as any).mock.calls.find((c: any[]) => /\/users\/ana\/cv$/.test(String(c[0])))

describe('the online CV page', () => {
  it('shows a public CV to a visitor, without needing a session', async () => {
    render(<PublicCvPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeTruthy()
    expect(screen.getByText('Ingeniera backend')).toBeTruthy()
    expect(screen.getByText('Desarrollo Backend · Senior')).toBeTruthy()
    expect(cvCall()[1]).toBeUndefined()
  })

  it('shows the skills with their visible name, not their identifier', async () => {
    render(<PublicCvPage />)

    expect(await screen.findByText('Node.js')).toBeTruthy()
    expect(screen.queryByText('nodejs')).toBeNull()
  })

  it('says the CV is not available, without telling a private one from a missing one', async () => {
    cvStatus = 404
    cvBody = { error: 'CV no encontrado' }
    render(<PublicCvPage />)

    expect(await screen.findByText('Este CV no está disponible')).toBeTruthy()
    expect(screen.getByText(/no exista o que su dueño no lo haya hecho público/)).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeNull()
  })

  it('asks the server with the session when there is one, so an owner can see a private CV', async () => {
    token = 'tok'
    render(<PublicCvPage />)

    await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })
    expect(cvCall()[1].headers.Authorization).toBe('Bearer tok')
  })

  it('tells the owner when only they can see it, and how to share it', async () => {
    cvBody = { ...cvResponse, isPublic: false, isOwner: true }
    render(<PublicCvPage />)

    expect(await screen.findByText(/Solo tú ves este CV/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Configuración' }).getAttribute('href')).toBe('/settings')
  })

  it('does not show that notice for a public CV', async () => {
    cvBody = { ...cvResponse, isPublic: true, isOwner: true }
    render(<PublicCvPage />)

    await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })
    expect(screen.queryByText(/Solo tú ves este CV/)).toBeNull()
  })

  it('reports a failure to load instead of staying blank', async () => {
    cvStatus = 500
    cvBody = {}
    render(<PublicCvPage />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos cargar este CV/)
  })

  it('prints through the browser', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<PublicCvPage />)
    await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })

    fireEvent.click(screen.getByRole('button', { name: /Imprimir o guardar PDF/ }))

    expect(print).toHaveBeenCalled()
  })

  it('does not break on a stored CV that came damaged', async () => {
    cvBody = { ...cvResponse, cv: 'basura' }
    render(<PublicCvPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeTruthy()
  })
})
