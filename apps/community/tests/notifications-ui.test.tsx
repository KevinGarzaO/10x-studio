import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsList } from '@/components/notifications-list'
import { NotificationPrefs } from '@/components/notification-prefs'
import { timeAgo } from '@/lib/notifications'

vi.mock('@/lib/session', () => ({ getToken: () => 'token' }))
vi.mock('next/link', () => ({ default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => <a href={href} onClick={onClick} className={className}>{children}</a> }))

const NOW = Date.now()
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60000).toISOString()

const calls: { url: string; method: string; body?: string }[] = []
let listResponse: unknown = { notifications: [], unread: 0 }
let prefs = { digest: true, alerts: true }

beforeEach(() => {
  calls.length = 0
  listResponse = { notifications: [], unread: 0 }
  prefs = { digest: true, alerts: true }
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined })
    if (String(url).endsWith('/preferences') && init?.method === 'PUT') {
      prefs = { ...prefs, ...JSON.parse(String(init.body)) }
      return { ok: true, json: async () => ({ preferences: prefs }) }
    }
    if (String(url).endsWith('/preferences')) return { ok: true, json: async () => ({ preferences: prefs }) }
    if (String(url).endsWith('/read-all') || /\/read$/.test(String(url))) return { ok: true, json: async () => ({ ok: true }) }
    return { ok: true, json: async () => listResponse }
  }) as unknown as typeof fetch
})

describe('la página de notificaciones', () => {
  it('sin avisos dice la verdad: nada de personas ni actividad inventadas', async () => {
    render(<NotificationsList />)

    expect(await screen.findByText(/todavía no tienes avisos/i)).toBeInTheDocument()
    expect(screen.queryByText(/Lucía Ramírez|Mateo Lima/)).toBeNull()
    expect(screen.queryByRole('button', { name: /marcar todo leído/i })).toBeNull()
  })

  it('muestra los avisos reales, con su enlace y el punto de los no leídos', async () => {
    listResponse = {
      unread: 1,
      notifications: [
        { id: 'a', type: 'comment', message: 'Ana comentó tu publicación «Hola»', link: '/post/1', read: false, created_at: iso(5) },
        { id: 'b', type: 'match', message: 'Nueva vacante con 87 % de compatibilidad: Dev', link: '/vacantes/dev', read: true, created_at: iso(60 * 30) },
      ],
    }
    render(<NotificationsList />)

    expect(await screen.findByText('Ana comentó tu publicación «Hola»')).toBeInTheDocument()
    expect(screen.getByText('hace 5 min')).toBeInTheDocument()
    expect(screen.getByText('hace 1 día')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Sin leer')).toHaveLength(1)
    expect(screen.getByText('Ana comentó tu publicación «Hola»').closest('a')).toHaveAttribute('href', '/post/1')
  })

  it('"Marcar todo leído" avisa al servidor y quita los puntos', async () => {
    listResponse = { unread: 1, notifications: [{ id: 'a', type: 'comment', message: 'Ana comentó', link: '/post/1', read: false, created_at: iso(5) }] }
    render(<NotificationsList />)

    await userEvent.click(await screen.findByRole('button', { name: /marcar todo leído/i }))

    await waitFor(() => expect(screen.queryByLabelText('Sin leer')).toBeNull())
    expect(calls.some(call => call.url.endsWith('/read-all') && call.method === 'POST')).toBe(true)
  })

  it('al abrir un aviso lo marca como leído', async () => {
    listResponse = { unread: 1, notifications: [{ id: 'a', type: 'comment', message: 'Ana comentó', link: '/post/1', read: false, created_at: iso(5) }] }
    render(<NotificationsList />)

    await userEvent.click(await screen.findByText('Ana comentó'))

    expect(calls.some(call => call.url.endsWith('/a/read') && call.method === 'POST')).toBe(true)
  })
})

describe('los correos que quiere recibir', () => {
  it('muestra los dos interruptores con lo guardado', async () => {
    prefs = { digest: false, alerts: true }
    render(<NotificationPrefs />)

    expect(await screen.findByRole('checkbox', { name: 'Resumen semanal de vacantes' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Alertas de coincidencia fuerte' })).toBeChecked()
  })

  it('al apagar uno lo guarda', async () => {
    render(<NotificationPrefs />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Alertas de coincidencia fuerte' }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Alertas de coincidencia fuerte' })).not.toBeChecked())
    expect(calls.find(call => call.method === 'PUT')?.body).toBe(JSON.stringify({ alerts: false }))
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
  })
})

describe('timeAgo', () => {
  it('habla en minutos, horas y días', () => {
    expect(timeAgo(iso(0), NOW)).toBe('ahora')
    expect(timeAgo(iso(45), NOW)).toBe('hace 45 min')
    expect(timeAgo(iso(60 * 5), NOW)).toBe('hace 5 h')
    expect(timeAgo(iso(60 * 24 * 3), NOW)).toBe('hace 3 días')
  })
})
