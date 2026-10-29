import { describe, it, expect } from 'vitest'
import { compactStats } from '@/lib/feed-stats'

describe('compactStats', () => {
  it('joins only the numbers that say something', () => {
    expect(compactStats({ views: 40, saves: 3, applies: 2 }, 5)).toBe('40 vistas · 3 guardados · 2 postulaciones · 5 comentarios')
    expect(compactStats({ views: 40, saves: 0, applies: 0 })).toBe('40 vistas')
  })

  it('counts views only from 5, so one lonely view is not shown', () => {
    expect(compactStats({ views: 4, saves: 0, applies: 0 })).toBeNull()
    expect(compactStats({ views: 5, saves: 0, applies: 0 })).toBe('5 vistas')
  })

  it('uses the singular for one', () => {
    expect(compactStats({ views: 0, saves: 1, applies: 1 }, 1)).toBe('1 guardado · 1 postulación · 1 comentario')
  })

  it('has nothing to say without data', () => {
    expect(compactStats(undefined)).toBeNull()
    expect(compactStats(null, 0)).toBeNull()
    expect(compactStats({ views: 0, saves: 0, applies: 0 }, 0)).toBeNull()
  })
})
