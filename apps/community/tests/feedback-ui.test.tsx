import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileMenu } from '@/components/community-hub'
import { FeedbackSheet } from '@/components/feedback-sheet'
import { resetFeedbackCacheForTests } from '@/lib/feedback'
import { resetWebAnalyticsForTests } from '@/lib/web-analytics'

/**
 * «¿Qué te faltó?»: el botón del menú de la cuenta (solo para quien el servidor marca como elegible, y no sobre una vacante) y la hoja
 * que se abre. Solo el texto es obligatorio; se anota si se mostró, se descartó o se contestó.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/session', () => ({ getToken: () => 'tok', getCachedUser: () => null, clearSession: vi.fn(), fetchCurrentUser: vi.fn(async () => null) }))

type Call = { url: string; method: string; body?: any }
let calls: Call[] = []
let eligible = true
let sendStatus = 200

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = false
  resetFeedbackCacheForTests(); resetWebAnalyticsForTests()
  eligible = true; sendStatus = 200; calls = []
  window.history.pushState({}, '', '/')
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    if (call.url.endsWith('/feedback/eligibility')) return { ok: true, json: async () => ({ eligible, ready: true }) }
    if (call.url.endsWith('/feedback') && call.method === 'POST') return { ok: sendStatus === 200, status: sendStatus, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as unknown as typeof fetch
})
afterEach(() => { vi.restoreAllMocks() })

const user = { username: 'ana', display_name: 'Ana', photo_url: null }
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Cuenta' }))
const events = () => calls.filter(call => call.url.endsWith('/feedback/event')).map(call => call.body.kind)

describe('the menu entry', () => {
  it('shows "¿Qué te faltó?" only when the server says the account is eligible', async () => {
    render(<ProfileMenu user={user} />)
    openMenu()
    expect(await screen.findByRole('menuitem', { name: /¿Qué te faltó\?/ })).toBeTruthy()
  })

  it('does not show it to an account that is not eligible yet', async () => {
    eligible = false
    render(<ProfileMenu user={user} />)
    openMenu()
    await waitFor(() => expect(calls.some(call => call.url.endsWith('/feedback/eligibility'))).toBe(true))
    expect(screen.queryByRole('menuitem', { name: /¿Qué te faltó\?/ })).toBeNull()
  })

  it('does not even ask while the person is on a vacancy (they may be applying)', async () => {
    window.history.pushState({}, '', '/vacantes/backend-engineer-1')
    render(<ProfileMenu user={user} />)
    openMenu()
    await screen.findByRole('menuitem', { name: /Configuración/ })
    expect(calls.some(call => call.url.endsWith('/feedback/eligibility'))).toBe(false)
    expect(screen.queryByRole('menuitem', { name: /¿Qué te faltó\?/ })).toBeNull()
  })

  it('opens the sheet from the menu', async () => {
    render(<ProfileMenu user={user} />)
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: /¿Qué te faltó\?/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})

describe('the sheet', () => {
  it('needs text, sends it with the chosen topic and the page, notes it was shown and says thanks', async () => {
    window.history.pushState({}, '', '/postulaciones')
    const onClose = vi.fn()
    render(<FeedbackSheet onClose={onClose} />)
    await waitFor(() => expect(events()).toEqual(['shown']))

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByRole('alert')).toBeTruthy() // sin texto no se envía
    expect(calls.some(call => call.method === 'POST' && call.url.endsWith('/feedback'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Vacantes' }))
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: '  Busco vacantes de data en Colombia  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('¡Gracias!')).toBeTruthy()
    const post = calls.find(call => call.method === 'POST' && call.url.endsWith('/feedback'))!
    expect(post.body).toEqual({ text: 'Busco vacantes de data en Colombia', category: 'vacantes', page: '/postulaciones' })

    // contestado: cerrar ya no cuenta como «descartado»
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
    expect(events()).toEqual(['shown'])
  })

  it('closing without sending is noted as dismissed (so we know who opened it and did not answer)', async () => {
    render(<FeedbackSheet onClose={vi.fn()} />)
    await waitFor(() => expect(events()).toEqual(['shown']))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(events()).toEqual(['shown', 'dismissed']))
  })

  it('tells the person when they sent too many today, and keeps what they wrote', async () => {
    sendStatus = 429
    render(<FeedbackSheet onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: 'Otro comentario más' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('varias hoy')
    expect((screen.getByLabelText('Tu comentario') as HTMLTextAreaElement).value).toBe('Otro comentario más')
  })
})
