import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VacancyStats } from '@/components/vacancy-stats'
import { PostCard } from '@/components/community-hub'
import { ShellContext } from '@/lib/shell-context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

describe('VacancyStats', () => {
  it('on a card only shows the numbers that have something', () => {
    const { container } = render(<VacancyStats stats={{ views: 128, saves: 0, applies: 6 }} />)

    const items = [...container.querySelectorAll('li')].map(li => li.getAttribute('title'))
    expect(items).toEqual(['128 vistas', '6 postulaciones'])
  })

  it('shows nothing when nobody has opened the vacancy yet', () => {
    const { container } = render(<VacancyStats stats={{ views: 0, saves: 0, applies: 0 }} />)
    expect(container.querySelector('ul')).toBeNull()
  })

  it('in the detail it always shows the three, named', () => {
    render(<VacancyStats stats={{ views: 1, saves: 0, applies: 0 }} detailed />)

    expect(screen.getByText('vista')).toBeTruthy()
    expect(screen.getByText('guardados')).toBeTruthy()
    expect(screen.getByText('postulaciones')).toBeTruthy()
  })

  it('uses the singular for one', () => {
    const { container } = render(<VacancyStats stats={{ views: 1, saves: 1, applies: 1 }} />)
    expect([...container.querySelectorAll('li')].map(li => li.getAttribute('title'))).toEqual(['1 vista', '1 guardado', '1 postulación'])
  })

  it('abbreviates thousands', () => {
    const { container } = render(<VacancyStats stats={{ views: 1500, saves: 0, applies: 0 }} />)
    expect(container.textContent).toContain('1.5k')
  })
})

describe('a vacancy card', () => {
  const job = {
    id: 'j1', type: 'job', title: 'Backend Engineer', slug: 'backend-engineer', company: 'Stripe', content: 'x', tags: [],
    votesCount: 0, commentsCount: 0, created_at: '2026-10-20T00:00:00Z', author: { id: 'a', username: 's', display_name: 'S', photo_url: null },
  } as any

  const renderCard = (post: any) => render(
    <ShellContext.Provider value={{ user: null, userLoaded: true, requestAuth: vi.fn(), search: '', activeTag: null, setActiveTag: vi.fn() }}>
      <PostCard post={post} />
    </ShellContext.Provider>,
  )

  it('shows how popular it is instead of a comments count and a button', () => {
    const { container } = renderCard({ ...job, stats: { views: 40, saves: 3, applies: 2 } })

    expect(container.querySelectorAll('.vacancy-stats li')).toHaveLength(3)
    expect(container.querySelector('.jc-cta')).toBeNull()
    expect(container.querySelector('.engagement')).toBeNull()
  })
})
