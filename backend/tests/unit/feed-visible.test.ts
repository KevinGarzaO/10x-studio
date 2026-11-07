import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { buildFeedVisible, type FeedRow } from '../../services/analytics/feed-visible'

const row = (role: string | null, hidden: boolean | null, at: string | null = null): FeedRow => ({ role_category: role, hidden_from_feed: hidden, hidden_at: at })

describe('buildFeedVisible', () => {
  it('counts open, visible and hidden vacancies, in total and per role', () => {
    const view = buildFeedVisible([
      row('backend', false), row('backend', true, '2026-11-07T04:15:00Z'), row('backend', null), row('ventas', true, '2026-11-08T09:30:00Z'), row('ventas', true, '2026-11-07T04:15:00Z'),
    ])
    expect(view).toMatchObject({ open: 5, visible: 2, hidden: 3, hiddenPct: 60, lastHiddenAt: '2026-11-08T09:30:00Z' })
    expect(view.byRole).toEqual([{ role: 'backend', open: 3, visible: 2, hidden: 1 }, { role: 'ventas', open: 2, visible: 0, hidden: 2 }])
  })

  it('treats a vacancy with no hidden mark as visible and a missing role as its own group', () => {
    const view = buildFeedVisible([row(null, null), row(null, false)])
    expect(view).toMatchObject({ open: 2, visible: 2, hidden: 0, hiddenPct: 0, lastHiddenAt: null })
    expect(view.byRole).toEqual([{ role: 'sin_puesto', open: 2, visible: 2, hidden: 0 }])
  })

  it('does not divide by zero with no vacancies', () => {
    expect(buildFeedVisible([])).toMatchObject({ open: 0, visible: 0, hidden: 0, hiddenPct: null })
  })
})
