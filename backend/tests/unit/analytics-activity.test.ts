import { describe, it, expect, vi, beforeEach } from 'vitest'

const upserts = vi.hoisted(() => [] as { row: Record<string, unknown>; options: Record<string, unknown> }[])
const behavior = vi.hoisted(() => ({ error: null as unknown, throws: false }))

vi.mock('@avotalent/core/services/supabase.service', () => ({
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

import { recordActivity, resetActivityCache } from '@avotalent/core/services/analytics/activity'
import { nextPublication, publicationCronExpressions, PUBLICATION_SLOTS, PUBLICATION_DAYS } from '@avotalent/core/services/analytics/schedule'

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
  // 23 de octubre de 2026 es viernes; el 24, sábado; el 25, domingo; el 26, lunes. Se publica 4 al día, todos los días:
  // 8:30, 11:30, 14:30 y 18:30 de Monterrey (UTC-6).
  it('before 8:30 it is 8:30 the same day', () => {
    expect(nextPublication(new Date('2026-10-23T12:00:00Z')).toISOString()).toBe('2026-10-23T14:30:00.000Z') // 6:00 am -> 8:30
  })

  it('goes through the four posts of the day', () => {
    expect(nextPublication(new Date('2026-10-23T16:00:00Z')).toISOString()).toBe('2026-10-23T17:30:00.000Z') // 10:00 -> 11:30
    expect(nextPublication(new Date('2026-10-23T19:00:00Z')).toISOString()).toBe('2026-10-23T20:30:00.000Z') // 13:00 -> 14:30
    expect(nextPublication(new Date('2026-10-23T21:00:00Z')).toISOString()).toBe('2026-10-24T00:30:00.000Z') // 15:00 -> 18:30 (ya es el día siguiente en UTC)
  })

  it('after the last one of the day it is 8:30 of the next day, weekend included', () => {
    expect(nextPublication(new Date('2026-10-24T02:00:00Z')).toISOString()).toBe('2026-10-24T14:30:00.000Z') // viernes 20:00 -> sábado 8:30
    expect(nextPublication(new Date('2026-10-25T05:00:00Z')).toISOString()).toBe('2026-10-25T14:30:00.000Z') // sábado 23:00 -> domingo 8:30
    expect(nextPublication(new Date('2026-10-26T03:00:00Z')).toISOString()).toBe('2026-10-26T14:30:00.000Z') // domingo 21:00 -> lunes 8:30
  })

  it('publishes on Saturday and Sunday', () => {
    expect(nextPublication(new Date('2026-10-24T12:00:00Z')).toISOString()).toBe('2026-10-24T14:30:00.000Z') // sábado 6:00
    expect(nextPublication(new Date('2026-10-25T18:00:00Z')).toISOString()).toBe('2026-10-25T20:30:00.000Z') // domingo 12:00 -> 14:30
  })

  it('is always in the future', () => {
    const now = new Date('2026-10-26T14:30:00Z')
    expect(nextPublication(now).getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('publicationCronExpressions', () => {
  it('gives one cron expression per post time, in UTC, every day (the 18:30 of Monterrey is 00:30 UTC)', () => {
    expect(publicationCronExpressions()).toEqual(['30 14 * * *', '30 17 * * *', '30 20 * * *', '30 0 * * *'])
  })

  it('agrees with the times used by the alarm and the panel (one single definition)', () => {
    expect(PUBLICATION_SLOTS.map((slot) => `${slot.hour}:${slot.minute}`)).toEqual(['8:30', '11:30', '14:30', '18:30'])
    expect(PUBLICATION_DAYS).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
