import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { prioritizeByDemand } from '../../services/scraper/demand-priority'

const post = (title: string, date: string) => ({ text: `${title}\ndescripcion`, postDate: date })

describe('prioritizeByDemand', () => {
  const demand = { backend: 5 }

  it('keeps the vacancies of roles that have candidates first, then the most recent, when the cap cuts', () => {
    const newSales = post('Sales Manager', '2026-11-05')
    const oldBackend = post('Backend Engineer', '2026-10-20')
    const newBackend = post('Senior Backend Developer', '2026-11-01')
    const result = prioritizeByDemand([newSales, oldBackend, newBackend], demand, 2)
    expect(result).toEqual([newBackend, oldBackend])
  })

  it('does not drop anything that fits under the cap, and orders by recency inside each group', () => {
    const a = post('Sales Manager', '2026-11-01')
    const b = post('Sales Representative', '2026-11-04')
    expect(prioritizeByDemand([a, b], demand, 5)).toEqual([b, a])
  })

  it('without demand data it behaves like before: most recent first', () => {
    const old = post('Backend Engineer', '2026-10-01')
    const fresh = post('Sales Manager', '2026-11-04')
    expect(prioritizeByDemand([old, fresh], undefined, 1)).toEqual([fresh])
    expect(prioritizeByDemand([old, fresh], {}, 1)).toEqual([fresh])
  })
})
