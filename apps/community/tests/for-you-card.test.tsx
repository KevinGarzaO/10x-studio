import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ForYouCard } from '@/components/for-you-card'
import type { MatchedItem } from '@/lib/mixed-feed'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
vi.mock('@/lib/session', () => ({ getToken: () => 'tok', getCachedUser: () => null }))

const community: MatchedItem = {
  sourceType: 'community', id: 'c1', title: 'Python en comunidad', company: 'Stripe', companyLogo: null,
  roleCategory: 'backend', seniorityLevel: 'senior', skills: ['python', 'aws'], url: '/vacantes/python-comunidad',
  postDate: '2026-10-01T10:00:00Z', matchingSkills: 2, historyId: '', isSaved: false,
}
const scraper: MatchedItem = {
  ...community, sourceType: 'scraper', id: 's1', title: 'Python del scraper', company: 'Twilio',
  url: 'https://example.com/job', matchingSkills: 1,
}

let openResponse: { ok: boolean; body: unknown }

beforeEach(() => {
  push.mockReset()
  openResponse = { ok: true, body: { url: '/vacantes/python-del-scraper' } }
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/for-you/open')) return { ok: openResponse.ok, json: async () => openResponse.body }
    return { ok: true, json: async () => ({ item: { id: 'h1' } }) }
  }) as unknown as typeof fetch
})

describe('ForYouCard', () => {
  it('is identifiable as Para ti and says how many skills match', () => {
    render(<ForYouCard item={community} />)

    expect(screen.getByText('PARA TI')).toBeTruthy()
    expect(screen.getByText(/2 skills en común/)).toBeTruthy()
    expect(screen.getByRole('article').className).toContain('is-for-you')
  })

  it('uses the singular for a single shared skill', () => {
    render(<ForYouCard item={scraper} />)
    expect(screen.getByText(/1 skill en común/)).toBeTruthy()
  })

  it('opens a community vacancy on its detail page', () => {
    render(<ForYouCard item={community} />)

    fireEvent.click(screen.getByRole('button', { name: /Ver vacante/ }))

    expect(push).toHaveBeenCalledWith('/vacantes/python-comunidad')
  })

  it('promotes a scraper vacancy and opens its detail page, not the external site', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<ForYouCard item={scraper} />)

    fireEvent.click(screen.getByRole('button', { name: /Ver vacante/ }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/vacantes/python-del-scraper'))
    const call = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/for-you/open'))
    expect(JSON.parse(call[1].body)).toEqual({ sourceId: 's1', url: 'https://example.com/job' })
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back to the original link when there is no detail page', async () => {
    openResponse = { ok: true, body: { url: null } }
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    render(<ForYouCard item={scraper} />)

    fireEvent.click(screen.getByRole('button', { name: /Ver vacante/ }))

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.com/job', '_blank', 'noopener,noreferrer'))
    expect(push).not.toHaveBeenCalled()
  })

  it('saves and unsaves the vacancy', async () => {
    render(<ForYouCard item={community} />)
    const save = screen.getByRole('button', { name: 'Guardar' })

    fireEvent.click(save)
    await waitFor(() => expect(save.className).toContain('saved'))

    fireEvent.click(save)
    await waitFor(() => expect(save.className).not.toContain('saved'))
  })
})
