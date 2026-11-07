import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import {
  ENGAGEMENT_STATES, buildHistorySummary, cutOf, engagementState, indexHistory, lastCompletedWeekStart, mondayOf, readHorizon, snapshotRow, weekCounts,
  type HistoryData, type HistoryRow, type WeekPoint,
} from '../../services/analytics/engagement-history'

describe('weeks (Monday to Sunday, Monterrey)', () => {
  it('finds the Monday of any day and the week that just ended', () => {
    expect(mondayOf('2026-11-07')).toBe('2026-11-02') // sábado
    expect(mondayOf('2026-11-09')).toBe('2026-11-09') // lunes
    expect(mondayOf('2026-11-08')).toBe('2026-11-02') // domingo
    // Un lunes a las 00:10 de Monterrey (06:10 UTC): la semana que acaba de terminar empezó el lunes anterior.
    expect(lastCompletedWeekStart(new Date('2026-11-09T06:10:00Z'))).toBe('2026-11-02')
    // El domingo por la noche todavía es la misma semana: la última cerrada es la anterior.
    expect(lastCompletedWeekStart(new Date('2026-11-09T05:00:00Z'))).toBe('2026-10-26')
  })

  it('the cut is Monday 00:00 in Monterrey (06:00 UTC)', () => {
    expect(cutOf('2026-11-09')).toBe('2026-11-09T06:00:00.000Z')
  })
})

const point = (week: string, active: number, participation = 0): WeekPoint => ({ week_start: week, active_days_7: active, discussions: participation, comments: 0, votes: 0 })
const OLD = '2026-01-05T00:00:00Z' // registrada hace mucho: nunca «nueva»
const LAST = '2026-11-02'

describe('engagementState', () => {
  it('is new for an account with fewer than the configured weeks since signup', () => {
    expect(engagementState([point('2026-10-26', 3, 1)], '2026-10-20T00:00:00Z', LAST)).toBe('nueva')
    expect(ENGAGEMENT_STATES.newWithinWeeks).toBe(4)
  })

  it('is committed with activity in 3 of the last 4 weeks and participation in 2 different weeks', () => {
    const weeks = [point('2026-10-12', 2, 1), point('2026-10-19', 0), point('2026-10-26', 3, 1), point('2026-11-02', 1)]
    expect(engagementState(weeks, OLD, LAST)).toBe('comprometida')
  })

  it('active in 3 of 4 weeks but with participation in only 1 is just active, not committed', () => {
    const weeks = [point('2026-10-12', 2, 1), point('2026-10-19', 1), point('2026-10-26', 3), point('2026-11-02', 1)]
    expect(engagementState(weeks, OLD, LAST)).toBe('activa')
  })

  it('was committed and dropped is at risk', () => {
    const weeks = [point('2026-09-14', 2, 1), point('2026-09-21', 2, 1), point('2026-09-28', 2), point('2026-10-05', 2), point('2026-10-12', 0), point('2026-10-19', 1), point('2026-10-26', 0), point('2026-11-02', 0)]
    expect(engagementState(weeks, OLD, LAST)).toBe('en_riesgo')
  })

  it('is dormant with no activity in the last 4 weeks', () => {
    const weeks = [point('2026-09-28', 3, 1), point('2026-10-05', 0), point('2026-10-12', 0), point('2026-10-19', 0), point('2026-10-26', 0), point('2026-11-02', 0)]
    expect(engagementState(weeks, OLD, LAST)).toBe('dormida')
    expect(engagementState([], OLD, LAST)).toBe('dormida')
  })

  it('is reactivated when it comes back after being dormant for the configured weeks', () => {
    const weeks = [point('2026-09-28', 3), point('2026-10-05', 0), point('2026-10-12', 0), point('2026-10-19', 0), point('2026-10-26', 0), point('2026-11-02', 2)]
    expect(engagementState(weeks, OLD, LAST)).toBe('reactivada')
  })

  it('weeks with no snapshot count as no known activity', () => {
    // Solo hay foto de la semana de hace dos meses: lo demás es silencio.
    expect(engagementState([point('2026-09-07', 4, 1)], OLD, LAST)).toBe('dormida')
  })
})

const data = (over: Partial<HistoryData> = {}): HistoryData => ({
  people: [{ id: 'a', created_at: '2026-10-01T00:00:00Z', accepts_news: true }, { id: 'b', created_at: '2026-10-01T00:00:00Z', accepts_news: false }],
  activity: [], posts: [], comments: [], votes: [], emailSends: [], emailClicks: [], pushClicks: [],
  ...over,
})

describe('weekCounts', () => {
  const base = data({
    activity: [{ user_id: 'a', day: '2026-11-02' }, { user_id: 'a', day: '2026-11-04' }, { user_id: 'a', day: '2026-10-27' }, { user_id: 'a', day: '2026-10-12' }],
    posts: [{ id: 'p1', author_id: 'a', created_at: '2026-11-03T18:00:00Z' }, { id: 'p2', author_id: 'b', created_at: '2026-10-28T18:00:00Z' }],
    comments: [
      { author_id: 'a', post_id: 'p2', created_at: '2026-11-04T18:00:00Z' }, // a le contesta a b (respuesta dada)
      { author_id: 'a', post_id: 'p1', created_at: '2026-11-04T19:00:00Z' }, // a se contesta a sí misma: no es respuesta dada
      { author_id: 'b', post_id: 'p1', created_at: '2026-11-05T18:00:00Z' }, // b le contesta a a (respuesta recibida)
    ],
    votes: [{ user_id: 'a', created_at: '2026-11-03T18:00:00Z' }, { user_id: 'a', created_at: null }],
    emailSends: [{ user_id: 'a', created_at: '2026-11-03T18:00:00Z' }],
    emailClicks: [{ user_id: 'a', occurred_at: '2026-11-04T18:00:00Z' }],
    pushClicks: [{ user_id: 'a', created_at: '2026-11-05T18:00:00Z' }, { user_id: 'b', created_at: '2026-11-05T18:00:00Z' }],
  })

  it('counts what has a date inside the week, the replies given to others and received from others', () => {
    const counts = weekCounts(base, indexHistory(base), 'a', '2026-11-02')
    expect(counts).toMatchObject({ active_days_7: 2, discussions: 1, comments: 2, votes: 1, replies_given: 1, replies_received: 1, emails_sent: 1, email_clicks: 1, push_clicks: 1 })
  })

  it('counts the weeks with activity among the last 4, this one included', () => {
    expect(weekCounts(base, indexHistory(base), 'a', '2026-11-02').active_weeks_4).toBe(3) // 2 nov, 26 oct, 12 oct (la del 19 oct no)
  })

  it('a person with nothing gets zeros, never undefined', () => {
    expect(weekCounts(base, indexHistory(base), 'b', '2026-11-02')).toMatchObject({ active_days_7: 0, discussions: 0, comments: 1, votes: 0, replies_given: 1, push_clicks: 1 })
  })
})

describe('snapshotRow', () => {
  const base = data()
  it('weekly rows carry the live value, engagement and temperature, and a separate commercial flag that is empty today', () => {
    const row = snapshotRow(base, indexHistory(base), base.people[0], '2026-11-02', 'semanal', { value: 9, engagement: 6, temperature: 'caliente' })
    expect(row).toMatchObject({ kind: 'semanal', week_start: '2026-11-02', value: 9, engagement: 6, temperature: 'caliente', accepts_news: true, accepts_commercial: null })
    expect(row.cut_at).toBe('2026-11-09T06:00:00.000Z')
  })

  it('reconstructed rows leave value, engagement and temperature empty (they did not exist)', () => {
    const row = snapshotRow(base, indexHistory(base), base.people[1], '2026-10-26', 'reconstruida')
    expect(row).toMatchObject({ kind: 'reconstruida', value: null, engagement: null, temperature: null, accepts_news: false })
  })

  it('stores only counts and dates: no text of any publication', () => {
    const row = snapshotRow(base, indexHistory(base), base.people[0], '2026-11-02', 'semanal')
    expect(Object.keys(row).sort()).toEqual([
      'accepts_commercial', 'accepts_news', 'active_days_7', 'active_weeks_4', 'comments', 'cut_at', 'discussions', 'email_clicks', 'emails_sent', 'engagement', 'kind', 'push_clicks',
      'replies_given', 'replies_received', 'temperature', 'user_id', 'value', 'votes', 'week_start',
    ])
  })
})

const row = (user: string, week: string, over: Partial<HistoryRow> = {}): HistoryRow => ({ user_id: user, kind: 'semanal', week_start: week, value: null, engagement: null, temperature: null, active_days_7: 0, discussions: 0, comments: 0, votes: 0, replies_given: 0, replies_received: 0, ...over })

describe('readHorizon and buildHistorySummary (what the agent reads)', () => {
  const rows: HistoryRow[] = [
    row('a', '2026-10-19', { active_days_7: 2, discussions: 1 }), row('a', '2026-10-26', { active_days_7: 1, comments: 1, replies_given: 1 }), row('a', '2026-11-02', { active_days_7: 3, replies_received: 1 }),
    row('b', '2026-10-26', { active_days_7: 1 }),
    row('c', '2026-11-02', { active_days_7: 0 }),
    row('a', '2026-11-07', { kind: 'base', temperature: 'caliente' }), row('b', '2026-11-07', { kind: 'base', temperature: 'caliente' }), row('c', '2026-11-07', { kind: 'base', temperature: 'frio' }),
  ]

  it('reads the active weeks, the repeated participation and the reciprocity inside the horizon', () => {
    const reading = readHorizon(rows, ['a', 'b', 'c'], '2026-11-02', 4)
    expect(reading).toMatchObject({ weeks: 4, weeksWithData: 3, people: 3, repeatedParticipation: 1, reciprocity: 1 })
    expect(reading.activeWeeksDistribution).toEqual([{ activeWeeks: 0, people: 1 }, { activeWeeks: 1, people: 1 }, { activeWeeks: 3, people: 1 }])
  })

  it('counts how many of the hot people of the base photo are still active in the last closed week, with no names', () => {
    const states = new Map([['a', 'comprometida' as const], ['b', 'activa' as const], ['c', 'dormida' as const]])
    const summary = buildHistorySummary(rows, states, ['a', 'b', 'c'], '2026-11-02')
    expect(summary.hotBaseline).toEqual({ hot: 2, stillActive: 1 }) // a sigue activa; b no tiene foto de la última semana
    expect(summary.byState).toMatchObject({ comprometida: 1, activa: 1, dormida: 1, nueva: 0 })
    expect(summary.snapshots).toEqual({ weeklyWeeks: 3, reconstructedWeeks: 0, hasBaseline: true })
    expect(JSON.stringify(summary)).not.toMatch(/"user_id"|@|"email"/)
  })

  it('does not break with no photos at all', () => {
    const summary = buildHistorySummary([], new Map(), [], null)
    expect(summary).toMatchObject({ ready: true, hotBaseline: null, snapshots: { weeklyWeeks: 0, reconstructedWeeks: 0, hasBaseline: false } })
  })
})
