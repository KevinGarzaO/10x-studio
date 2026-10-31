import { describe, it, expect } from 'vitest'
import { isRangeNotSatisfiable } from '../../services/community/pagination'

describe('isRangeNotSatisfiable', () => {
  it('recognizes the PostgREST error for a page past the end, by code or by message', () => {
    expect(isRangeNotSatisfiable({ code: 'PGRST103', message: 'x' })).toBe(true)
    expect(isRangeNotSatisfiable({ message: 'Requested range not satisfiable' })).toBe(true)
    expect(isRangeNotSatisfiable(new Error('Requested Range Not Satisfiable'))).toBe(true)
  })

  it('does not hide any other error', () => {
    expect(isRangeNotSatisfiable({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isRangeNotSatisfiable(null)).toBe(false)
    expect(isRangeNotSatisfiable(undefined)).toBe(false)
    expect(isRangeNotSatisfiable('range')).toBe(false)
  })
})
