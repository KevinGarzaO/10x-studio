import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, missing: new Set<string>() }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    rpc,
    from: (table: string) => {
      const q: any = {}
      for (const name of ['eq', 'gte', 'order', 'range', 'select']) q[name] = () => q
      q.then = (resolve: any, reject: any) =>
        Promise.resolve(db.missing.has(table) ? { data: null, error: { message: `relation "${table}" does not exist` } } : { data: db.tables[table] ?? [], error: null }).then(resolve, reject)
      return q
    },
  },
}))

import { heatGrid, judgeDays, median, monterreyDay, expectedLinkedinPosts, type RhythmDayRow } from '../../services/analytics/rhythm'
import router from '../../src/routes/admin/analytics.routes'

/** Días consecutivos desde `start` (AAAA-MM-DD), con las personas activas que se pidan. */
function week(start: string, active: number[], patch: (index: number) => Partial<RhythmDayRow> = () => ({})): RhythmDayRow[] {
  return active.map((value, index) => {
    const date = new Date(`${start}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return {
      day: date.toISOString().slice(0, 10), dow: date.getUTCDay(), is_today: false, is_partial: false,
      active: value, new_active: 0, members_active: 0, from_linkedin: 0, from_email: 0, from_direct: value, from_other: 0, visit_only: 0, sessions: value, registrations: 0,
      ...patch(index),
    }
  })
}

describe('median', () => {
  it('takes the middle, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull()
    expect(median([5])).toBe(5)
    expect(median([9, 1, 5])).toBe(5)
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })
})

describe('judgeDays', () => {
  // 2026-10-04 es domingo. Cuatro domingos de 20 y un quinto de 6.
  const sundays = (last: number) => week('2026-10-04', Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? (i === 28 ? last : 20) : 10)))

  it('compares a day only with the same weekday of earlier weeks', () => {
    const judged = judgeDays(sundays(6))
    const lastSunday = judged[28]
    expect(lastSunday.dow).toBe(0)
    expect(lastSunday.baseline).toBe(20) // domingos anteriores, no los lunes de 10
    expect(lastSunday.baselineSamples).toBe(4)
    expect(lastSunday.vsBaselinePct).toBe(-70)
  })

  it('marks a slow day only when it is under half of its normal', () => {
    expect(judgeDays(sundays(6))[28].status).toBe('flojo')
    expect(judgeDays(sundays(10))[28].status).toBe('normal') // justo la mitad no es flojo
    expect(judgeDays(sundays(9))[28].status).toBe('flojo')
    expect(judgeDays(sundays(15))[28].status).toBe('normal')
  })

  it('says there is no base until it has at least 3 earlier weeks of that day, instead of inventing a comparison', () => {
    const judged = judgeDays(sundays(1))
    expect(judged[0].status).toBe('sin_base')
    expect(judged[7].status).toBe('sin_base') // 1 domingo antes
    expect(judged[14].status).toBe('sin_base') // 2
    expect(judged[14].baseline).toBeNull()
    expect(judged[14].vsBaselinePct).toBeNull()
    expect(judged[21].status).toBe('normal') // 3 domingos de 20 y este también de 20
  })

  it('uses the latest 4 weeks only', () => {
    const rows = week('2026-10-04', Array.from({ length: 50 }, (_, i) => (i % 7 === 0 ? (i < 21 ? 100 : 20) : 10)))
    const judged = judgeDays(rows)
    expect(judged[42].baselineSamples).toBe(4)
    expect(judged[42].baseline).toBe(20) // los domingos de 100 ya quedaron fuera de las últimas 4 semanas
  })

  it('does not call slow a day whose normal is tiny (half of 3 people is noise)', () => {
    const rows = week('2026-10-04', Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? (i === 28 ? 0 : 3) : 10)))
    expect(judgeDays(rows)[28].status).toBe('normal')
  })

  it('never judges today or the first, partial day, and never uses them as a sample', () => {
    const rows = week('2026-10-04', Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? 20 : 10)), (i) => ({ is_partial: i === 0, is_today: i === 35 }))
    const judged = judgeDays(rows)
    expect(judged[0].status).toBe('parcial')
    expect(judged[35].status).toBe('en_curso')
    // el primer domingo está incompleto: el 5.º domingo solo tiene 4 muestras buenas… y el segundo, 0 de 1 (no cuenta el parcial)
    expect(judged[7].baselineSamples).toBe(0)
    expect(judged[28].baselineSamples).toBe(3)
  })

  it('carries the origins and the people who already had an account', () => {
    const [row] = judgeDays(week('2026-10-31', [7], () => ({ from_linkedin: 1, from_email: 2, from_direct: 3, from_other: 1, members_active: 4, new_active: 2, visit_only: 5 })))
    expect(row.origins).toEqual({ linkedin: 1, email: 2, direct: 3, other: 1 })
    expect(row).toMatchObject({ membersActive: 4, newActive: 2, visitOnly: 5 })
  })
})

describe('heatGrid', () => {
  it('always gives 7 x 24 cells, an average per occurrence, and null where no hour was measured', () => {
    const cells = heatGrid([{ dow: 6, hour: 10, people: 9, occurrences: 3 }, { dow: 6, hour: 11, people: 0, occurrences: 2 }])
    expect(cells).toHaveLength(168)
    expect(cells.find((cell) => cell.dow === 6 && cell.hour === 10)).toMatchObject({ average: 3, people: 9, occurrences: 3 })
    expect(cells.find((cell) => cell.dow === 6 && cell.hour === 11)?.average).toBe(0) // medida y sin gente: un cero real
    expect(cells.find((cell) => cell.dow === 0 && cell.hour === 3)?.average).toBeNull() // nunca medida
  })
})

describe('helpers', () => {
  it('turns an instant into the Monterrey day', () => {
    expect(monterreyDay('2026-11-01T05:59:00Z')).toBe('2026-10-31') // 23:59 del 31 en Monterrey
    expect(monterreyDay('2026-11-01T06:00:00Z')).toBe('2026-11-01')
  })
  it('expects the LinkedIn posts of the schedule (4 a day, every day)', () => {
    for (let dow = 0; dow < 7; dow++) expect(expectedLinkedinPosts(dow)).toBe(4)
  })
})

describe('GET /web/rhythm', () => {
  const app = () => { const a = express(); a.use('/analytics', router); return a }
  const reply = (days: RhythmDayRow[], heat: unknown[]) => rpc.mockImplementation(async (name: string) => ({ data: name === 'analytics_rhythm_days' ? days : heat, error: null }))

  beforeEach(() => {
    rpc.mockReset()
    db.tables = {}
    db.missing = new Set()
  })

  it('answers with the last days judged against the same weekday, with what was published each day', async () => {
    const rows = week('2026-10-30', [3, 8])
    reply(rows, [{ dow: 6, hour: 10, people: 4, occurrences: 2 }])
    db.tables.linkedin_vacancy_posts = [{ published_at: '2026-10-31T14:30:00Z' }, { published_at: '2026-10-31T17:30:00Z' }]
    db.tables.email_quota = [{ sent_at: '2026-10-31T16:00:00Z' }]
    db.tables.product_changes = [{ shipped_at: '2026-10-31T20:00:00Z', title: 'Nuevo feed' }]

    const res = await request(app()).get('/analytics/web/rhythm?days=7')
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('analytics_rhythm_days', { p_days: 35 })
    expect(rpc).toHaveBeenCalledWith('analytics_rhythm_heatmap', { p_days: 7 })
    expect(res.body).toMatchObject({ ready: true, days: 7, trackedSince: '2026-10-30' })
    expect(res.body.heat).toHaveLength(168)
    const saturday = res.body.rows.find((row: any) => row.day === '2026-10-31')
    expect(saturday).toMatchObject({ active: 8, status: 'sin_base', linkedinPosts: 2, emailsSent: 1, changes: ['Nuevo feed'] })
  })

  it('keeps working when a publication table is missing, with zeros for it', async () => {
    reply(week('2026-10-30', [3]), [])
    db.missing.add('email_quota')
    const res = await request(app()).get('/analytics/web/rhythm')
    expect(res.body.ready).toBe(true)
    expect(res.body.rows[0].emailsSent).toBe(0)
  })

  it('says it is not ready, instead of showing zeros, when the migration is missing; and clamps days', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function analytics_rhythm_days does not exist' } })
    expect((await request(app()).get('/analytics/web/rhythm?days=999')).body).toEqual({ ready: false })
    expect(rpc).toHaveBeenCalledWith('analytics_rhythm_heatmap', { p_days: 30 })
  })
})
