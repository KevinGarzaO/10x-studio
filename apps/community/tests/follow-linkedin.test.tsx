import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FollowLinkedIn } from '@/components/follow-linkedin'
import { LINKEDIN_COMPANY_URL, organizationSchema } from '@/lib/social'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'

/** Enlace a la página de AvoTalent en LinkedIn: se abre en otra pestaña, se anota el clic con su lugar, y los buscadores saben que es la misma AvoTalent. */
vi.mock('@/lib/session', () => ({ getToken: () => null, getValidToken: async () => null, getCachedUser: () => null }))

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
let events: { name: string; params: Record<string, unknown> }[] = []

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests()
  events = []
  global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (body?.type === 'event') events.push({ name: body.name, params: body.params })
    return { ok: true, status: 204 }
  }) as unknown as typeof fetch
})

describe('FollowLinkedIn', () => {
  it('links to the company page, opens in a new tab and does not leak the opener', () => {
    render(<FollowLinkedIn surface="footer" />)
    const link = screen.getByRole('link', { name: 'Síguenos en LinkedIn' })
    expect(link.getAttribute('href')).toBe('https://www.linkedin.com/company/avotalent')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(LINKEDIN_COMPANY_URL).toBe('https://www.linkedin.com/company/avotalent')
  })

  it('notes the click with the place it was in', async () => {
    render(<FollowLinkedIn surface="signup" />)
    fireEvent.click(screen.getByRole('link', { name: 'Síguenos en LinkedIn' }))
    await waitFor(() => expect(events.some(event => event.name === 'follow_linkedin_click' && event.params.surface === 'signup')).toBe(true))
  })
})

describe('organizationSchema', () => {
  it('tells search engines the LinkedIn page is the same AvoTalent as the site', () => {
    const schema = organizationSchema()
    expect(schema).toMatchObject({ '@type': 'Organization', name: 'AvoTalent', sameAs: ['https://www.linkedin.com/company/avotalent'] })
    expect(schema.url).toMatch(/^https:\/\//)
  })
})
