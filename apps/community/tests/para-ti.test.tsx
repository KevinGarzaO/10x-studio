import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ParaTiPage from '@/app/(main)/para-ti/page'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/para-ti',
}))
vi.mock('@/lib/session', () => ({
  getToken: () => 'tok',
  fetchCurrentUser: async () => ({ id: 'u1', username: 'ana' }),
}))

const base = {
  company: 'Stripe', companyLogo: null, roleCategory: 'backend', seniorityLevel: 'senior',
  skills: ['python'], postDate: '2026-10-01T10:00:00Z', historyId: '', isSaved: false,
}
const community = { ...base, sourceType: 'community', id: 'c1', title: 'Python en comunidad', url: '/vacantes/python-comunidad', matchingSkills: 2 }
const scraper = { ...base, sourceType: 'scraper', id: 's1', title: 'Python del scraper', company: 'Twilio', url: 'https://example.com/job', matchingSkills: 1 }
const noMatch = { ...base, sourceType: 'community', id: 'c2', title: 'Sin coincidencia', url: '/vacantes/nada', matchingSkills: 0 }

let openResponse: { ok: boolean; body: unknown }

beforeEach(() => {
  push.mockReset()
  openResponse = { ok: true, body: { url: '/vacantes/python-del-scraper' } }
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/for-you/open')) return { ok: openResponse.ok, json: async () => openResponse.body }
    return { ok: true, json: async () => ({ items: [community, scraper, noMatch] }) }
  }) as unknown as typeof fetch
})

describe('Para ti', () => {
  it('shows only the vacancies that really match the person’s skills', async () => {
    render(<ParaTiPage />)

    expect(await screen.findByText('Python en comunidad')).toBeTruthy()
    expect(screen.getByText('Python del scraper')).toBeTruthy()
    expect(screen.queryByText('Sin coincidencia')).toBeNull()
    expect(screen.getByText(/2 skills en común/)).toBeTruthy()
    expect(screen.getByText(/1 skill en común/)).toBeTruthy()
  })

  it('opens a community vacancy on its detail page', async () => {
    render(<ParaTiPage />)
    await screen.findByText('Python en comunidad')

    fireEvent.click(screen.getAllByRole('button', { name: /Ver vacante/ })[0])

    expect(push).toHaveBeenCalledWith('/vacantes/python-comunidad')
  })

  it('promotes a scraper vacancy and opens its detail page, not the external site', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<ParaTiPage />)
    await screen.findByText('Python del scraper')

    fireEvent.click(screen.getAllByRole('button', { name: /Ver vacante/ })[1])

    await waitFor(() => expect(push).toHaveBeenCalledWith('/vacantes/python-del-scraper'))
    const [, init] = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/for-you/open'))
    expect(JSON.parse(init.body)).toEqual({ sourceId: 's1', url: 'https://example.com/job' })
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back to the original link when there is no detail page', async () => {
    openResponse = { ok: true, body: { url: null } }
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    render(<ParaTiPage />)
    await screen.findByText('Python del scraper')

    fireEvent.click(screen.getAllByRole('button', { name: /Ver vacante/ })[1])

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.com/job', '_blank', 'noopener,noreferrer'))
    expect(push).not.toHaveBeenCalled()
  })

  it('explains the empty state when nothing matches', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items: [noMatch] }) })) as unknown as typeof fetch
    render(<ParaTiPage />)

    expect(await screen.findByText(/no hay vacantes que coincidan con tus skills/i)).toBeTruthy()
  })
})
