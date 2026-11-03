import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApplyPrompt } from '@/components/apply-prompt'

/**
 * Después de contestar «¿Ya te postulaste?» (cualquiera de las tres respuestas) se invita a activar los avisos push para darle
 * seguimiento a esa vacante: «Sí, activar» pide el permiso, «Ahora no» no vuelve a molestar por unos días. Todo se mide.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))
vi.mock('@/lib/session', () => ({ getToken: () => 'tok', getCachedUser: () => null, clearSession: vi.fn(), fetchCurrentUser: vi.fn(async () => null) }))

const push = vi.hoisted(() => ({
  offer: true,
  enablePush: vi.fn(async () => 'enabled'),
  recordPushEvent: vi.fn(async () => undefined),
  rememberPushDismissed: vi.fn(),
}))
vi.mock('@/lib/push', () => ({
  shouldOfferPush: () => push.offer,
  enablePush: push.enablePush,
  recordPushEvent: push.recordPushEvent,
  rememberPushDismissed: push.rememberPushDismissed,
}))

const application = { id: 'a1', vacancyId: 'v1', slug: 'backend-engineer-1', title: 'Backend Engineer', company: 'stripe', host: null, status: 'clicked', clickedAt: new Date().toISOString(), appliedAt: null }

beforeEach(() => {
  push.offer = true
  push.enablePush.mockClear(); push.recordPushEvent.mockClear(); push.rememberPushDismissed.mockClear()
  global.fetch = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.endsWith('/applications/pending')) return { ok: true, json: async () => ({ application }) }
    if (/\/answer$/.test(u)) return { ok: true, json: async () => ({ application: { ...application, status: 'applied' } }) }
    return { ok: true, status: 204, json: async () => ({}) }
  }) as unknown as typeof fetch
})

describe.each([['Sí, ya me postulé'], ['Todavía no'], ['Más tarde']])('after answering "%s"', label => {
  it('invites to turn the notifications on, naming the vacancy, and counts that the invitation was shown', async () => {
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp('^' + label) }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('¿Quieres estar más atento a Backend Engineer?')
    expect(dialog.textContent).toContain('no perderte de nada')
    expect(push.recordPushEvent).toHaveBeenCalledWith('prompt_shown', 'application_answer')
  })
})

describe('the invitation', () => {
  async function openOffer() {
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: /^Sí, ya/ }))
    await screen.findByRole('button', { name: 'Sí, activar avisos' })
  }

  it('"Sí, activar avisos" asks for the permission from here and then thanks the person (they said they applied)', async () => {
    await openOffer()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, activar avisos' }))
    await waitFor(() => expect(push.enablePush).toHaveBeenCalledWith('application_answer'))
    expect(await screen.findByText(/La guardamos en/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Ahora no" remembers it for a while, counts it, and does not ask for any permission', async () => {
    await openOffer()
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(push.rememberPushDismissed).toHaveBeenCalled()
    expect(push.recordPushEvent).toHaveBeenCalledWith('prompt_dismissed', 'application_answer')
    expect(push.enablePush).not.toHaveBeenCalled()
    expect(await screen.findByText(/La guardamos en/)).toBeTruthy()
  })

  it('is not offered when the browser cannot, already decided, or said "ahora no" recently', async () => {
    push.offer = false
    render(<ApplyPrompt enabled />)
    fireEvent.click(await screen.findByRole('button', { name: /^Sí, ya/ }))
    expect(await screen.findByText(/La guardamos en/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sí, activar avisos' })).toBeNull()
    expect(push.recordPushEvent).not.toHaveBeenCalled()
  })
})
