import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { RightSidebar } from '@/components/community-hub'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

let statsBody: unknown

beforeEach(() => {
  statsBody = { members: 3, companies: 15, vacancies: 495 }
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).endsWith('/api/community/stats')) return { ok: true, json: async () => statsBody }
    return { ok: true, json: async () => ({ posts: [] }) }
  }) as unknown as typeof fetch
})

function widget() {
  return screen.getByText('La comunidad').closest('section') as HTMLElement
}

describe('La comunidad widget', () => {
  it('splits real members, companies and vacancies', async () => {
    render(<RightSidebar onUnlock={vi.fn()} />)

    await waitFor(() => expect(within(widget()).getByText('495')).toBeTruthy())
    const stats = widget()
    expect(within(stats).getByText('3').nextElementSibling?.textContent).toBe('miembros')
    expect(within(stats).getByText('15').nextElementSibling?.textContent).toBe('empresas')
    expect(within(stats).getByText('495').nextElementSibling?.textContent).toBe('vacantes')
  })

  it('no longer shows the generic publications count', async () => {
    render(<RightSidebar onUnlock={vi.fn()} />)

    await waitFor(() => expect(within(widget()).getByText('495')).toBeTruthy())
    expect(within(widget()).queryByText('publicaciones')).toBeNull()
  })

  it('shows a dash for a figure an older backend does not send', async () => {
    statsBody = { members: 21, posts: 495 }
    render(<RightSidebar onUnlock={vi.fn()} />)

    await waitFor(() => expect(within(widget()).getByText('21')).toBeTruthy())
    expect(within(widget()).getAllByText('—')).toHaveLength(2)
  })
})
