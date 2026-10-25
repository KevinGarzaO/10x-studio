import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VacancyStats } from '@/components/vacancy-stats'
import { PostCard } from '@/components/community-hub'
import { ShellContext } from '@/lib/shell-context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

describe('VacancyStats', () => {
  const titles = (container: HTMLElement) => [...container.querySelectorAll('li')].map(li => li.getAttribute('title'))

  it('always shows the three numbers, zeros included', () => {
    const { container } = render(<VacancyStats stats={{ views: 128, saves: 0, applies: 6 }} />)
    expect(titles(container)).toEqual(['128 vistas', '0 guardados', '6 postulaciones'])
  })

  it('shows zeros when nobody has opened the vacancy yet, and also when there is no data', () => {
    expect(titles(render(<VacancyStats stats={{ views: 0, saves: 0, applies: 0 }} />).container)).toEqual(['0 vistas', '0 guardados', '0 postulaciones'])
    expect(titles(render(<VacancyStats />).container)).toEqual(['0 vistas', '0 guardados', '0 postulaciones'])
  })

  it('names each number', () => {
    render(<VacancyStats stats={{ views: 1, saves: 0, applies: 0 }} detailed />)

    expect(screen.getByText('vista')).toBeTruthy()
    expect(screen.getByText('guardados')).toBeTruthy()
    expect(screen.getByText('postulaciones')).toBeTruthy()
  })

  it('uses the singular for one', () => {
    expect(titles(render(<VacancyStats stats={{ views: 1, saves: 1, applies: 1 }} />).container)).toEqual(['1 vista', '1 guardado', '1 postulación'])
  })

  it('adds the comments to the same row when they are given', () => {
    const { container } = render(<VacancyStats stats={{ views: 1, saves: 0, applies: 0 }} comments={3} />)
    expect([...container.querySelectorAll('li')].map(li => li.getAttribute('title'))).toEqual(['1 vista', '0 guardados', '0 postulaciones', '3 comentarios'])
  })

  it('abbreviates thousands', () => {
    const { container } = render(<VacancyStats stats={{ views: 1500, saves: 0, applies: 0 }} />)
    expect(container.textContent).toContain('1.5k')
  })

  it('is bigger in the detail', () => {
    const { container } = render(<VacancyStats stats={{ views: 1, saves: 1, applies: 1 }} detailed />)
    expect(container.querySelector('.vacancy-stats.is-detailed')).toBeTruthy()
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

  it('shows views, saves, applies and comments in one row, with no separate button or footer', () => {
    const { container } = renderCard({ ...job, commentsCount: 5, stats: { views: 40, saves: 3, applies: 2 } })

    const titles = [...container.querySelectorAll('.vacancy-stats li')].map(li => li.getAttribute('title'))
    expect(titles).toEqual(['40 vistas', '3 guardados', '2 postulaciones', '5 comentarios'])
    expect(container.querySelector('.jc-cta')).toBeNull()
    expect(container.querySelector('.engagement')).toBeNull()
  })

  it('an article card has the same kind of row: votes, comments and reading time', () => {
    const article = { ...job, type: 'editorial', title: 'Un artículo', votesCount: 7, commentsCount: 2, word_count: 800 }
    const { container } = renderCard(article)

    const texts = [...container.querySelectorAll('.vacancy-stats li')].map(li => li.textContent?.replace(/\s+/g, ' ').trim())
    expect(texts).toEqual(['7 votos', '2 comentarios', '4 min de lectura'])
  })

  it('voting on an article moves its number', () => {
    const article = { ...job, type: 'editorial', title: 'Un artículo', votesCount: 7, commentsCount: 0 }
    const { container } = renderCard(article)

    fireEvent.click(container.querySelector('.vote-button')!)
    expect(container.querySelector('.vote-button')?.textContent).toContain('8')
  })
})
