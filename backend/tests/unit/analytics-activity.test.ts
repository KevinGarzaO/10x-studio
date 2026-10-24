import { describe, it, expect, vi, beforeEach } from 'vitest'

const upserts = vi.hoisted(() => [] as { row: Record<string, unknown>; options: Record<string, unknown> }[])
const behavior = vi.hoisted(() => ({ error: null as unknown, throws: false }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
        if (behavior.throws) throw new Error('boom')
        upserts.push({ row: { table, ...row }, options })
        return Promise.resolve({ error: behavior.error })
      },
    }),
  },
}))

import { recordActivity, resetActivityCache } from '../../services/analytics/activity'
import { nextPublication } from '../../services/analytics/schedule'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  upserts.length = 0
  behavior.error = null
  behavior.throws = false
  resetActivityCache()
})

describe('recordActivity', () => {
  it('writes one row per person and day, ignoring duplicates', async () => {
    recordActivity('u1', new Date('2026-10-24T18:00:00Z'))
    await flush()

    expect(upserts).toEqual([{ row: { table: 'user_activity_daily', user_id: 'u1', day: '2026-10-24' }, options: { onConflict: 'user_id,day', ignoreDuplicates: true } }])
  })

  it('does not write again for the same person on the same day', async () => {
    const now = new Date('2026-10-24T18:00:00Z')
    recordActivity('u1', now)
    recordActivity('u1', new Date('2026-10-24T20:00:00Z'))
    recordActivity('u2', now)
    await flush()

    expect(upserts.map(upsert => upsert.row.user_id)).toEqual(['u1', 'u2'])
  })

  it('writes again on the next day', async () => {
    recordActivity('u1', new Date('2026-10-24T18:00:00Z'))
    recordActivity('u1', new Date('2026-10-25T18:00:00Z'))
    await flush()

    expect(upserts.map(upsert => upsert.row.day)).toEqual(['2026-10-24', '2026-10-25'])
  })

  it('counts the day in Monterrey time, not UTC', async () => {
    recordActivity('u1', new Date('2026-10-25T03:00:00Z')) // 9 pm del 24 en Monterrey
    await flush()
    expect(upserts[0].row.day).toBe('2026-10-24')
  })

  it('tries again later if the write failed', async () => {
    behavior.error = { message: 'tabla no existe' }
    recordActivity('u1', new Date('2026-10-24T18:00:00Z'))
    await flush()

    behavior.error = null
    recordActivity('u1', new Date('2026-10-24T18:05:00Z'))
    await flush()

    expect(upserts).toHaveLength(2)
  })

  it('never breaks the request: not with a failing database, nor with no person', () => {
    behavior.throws = true
    expect(() => recordActivity('u1')).not.toThrow()
    expect(() => recordActivity(undefined)).not.toThrow()
  })
})

describe('nextPublication', () => {
  // 24 de octubre de 2026 es sábado.
  it('on a publishing day before 8:30 it is 8:30 the same day', () => {
    expect(nextPublication(new Date('2026-10-24T12:00:00Z')).toISOString()).toBe('2026-10-24T14:30:00.000Z') // 6:00 am Monterrey -> 8:30
  })

  it('between the two it is 1:30 pm', () => {
    expect(nextPublication(new Date('2026-10-24T16:00:00Z')).toISOString()).toBe('2026-10-24T19:30:00.000Z') // 10:00 am -> 1:30 pm
  })

  it('after the last one on Saturday it skips Sunday and goes to Monday 8:30', () => {
    expect(nextPublication(new Date('2026-10-25T02:00:00Z')).toISOString()).toBe('2026-10-26T14:30:00.000Z')
  })

  it('on Sunday it is Monday 8:30', () => {
    expect(nextPublication(new Date('2026-10-25T18:00:00Z')).toISOString()).toBe('2026-10-26T14:30:00.000Z')
  })

  it('is always in the future', () => {
    const now = new Date('2026-10-26T14:30:00Z')
    expect(nextPublication(now).getTime()).toBeGreaterThan(now.getTime())
  })
})
