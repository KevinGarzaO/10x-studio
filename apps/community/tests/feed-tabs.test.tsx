import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeedTabs, navTabs, FOR_YOU_TAB } from '@/components/community-hub'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

describe('feed destinations', () => {
  it('offers only Feed and Vacantes to a visitor', () => {
    expect(navTabs(false).map(t => t.label)).toEqual(['Feed', 'Vacantes & Freelance'])
  })

  it('adds Para ti, last, for a signed-in person', () => {
    expect(navTabs(true).map(t => t.label)).toEqual(['Feed', 'Vacantes & Freelance', FOR_YOU_TAB])
  })

  it('no longer offers Últimos Envíos or Showcase Projects', () => {
    const labels = navTabs(true).map(t => t.label).join('|')
    expect(labels).not.toMatch(/Últimos|Showcase/)
  })
})

describe('FeedTabs', () => {
  it('marks the active tab and reports the one picked', () => {
    const onSelect = vi.fn()
    render(<FeedTabs activeTab="Feed" signedIn onSelect={onSelect} />)

    expect(screen.getByRole('tab', { name: /Feed/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: /Para ti/ }))
    expect(onSelect).toHaveBeenCalledWith(FOR_YOU_TAB)
  })

  it('hides Para ti without a session', () => {
    render(<FeedTabs activeTab="Feed" signedIn={false} onSelect={vi.fn()} />)
    expect(screen.queryByRole('tab', { name: /Para ti/ })).toBeNull()
  })
})
