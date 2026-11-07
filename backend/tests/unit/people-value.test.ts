import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { MAX_PER_ACTION, TEMPERATURE, VALUE_POINTS, buildPeopleValue, summarize, temperatureOf, type PersonSignals } from '../../services/analytics/people-value'

// Sábado 7 de noviembre de 2026, mediodía en Monterrey.
const NOW = new Date('2026-11-07T18:00:00Z')
const empty = (): PersonSignals => ({ savedVacancies: new Map(), tappedApply: new Map(), applied: new Map(), activeDays: new Map(), participated: new Set(), emailClicks: new Map() })
const person = (id: string, over: Partial<{ email: string; created_at: string; profile_completed: boolean }> = {}) => ({ id, email: `${id}@example.com`, created_at: '2026-10-20T18:00:00Z', profile_completed: false, ...over })

describe('temperatureOf', () => {
  it('is hot up to 3 days, warm up to 7, and cold beyond or when never active', () => {
    expect([0, 3].map(temperatureOf)).toEqual(['caliente', 'caliente'])
    expect([4, 7].map(temperatureOf)).toEqual(['tibio', 'tibio'])
    expect([8, 40].map(temperatureOf)).toEqual(['frio', 'frio'])
    expect(temperatureOf(null)).toBe('frio')
    expect(TEMPERATURE.hotWithinDays).toBe(3)
  })
})

describe('buildPeopleValue', () => {
  it('adds the points of each action and reads the temperature from the last active day', () => {
    const signals = empty()
    signals.activeDays.set('a', ['2026-10-20', '2026-11-05']) // volvió otro día; hace 2 días: caliente
    signals.savedVacancies.set('a', 2)
    signals.tappedApply.set('a', 1)
    signals.applied.set('a', 1)
    signals.participated.add('a')
    const [row] = buildPeopleValue([person('a', { profile_completed: true })], signals, NOW)
    expect(row.value).toBe(VALUE_POINTS.profileComplete + 2 * VALUE_POINTS.savedVacancy + VALUE_POINTS.tappedApply + VALUE_POINTS.applied + VALUE_POINTS.returnedAnotherDay + VALUE_POINTS.participated)
    expect(row).toMatchObject({ temperature: 'caliente', lastActiveDay: '2026-11-05', daysSinceActive: 2 })
  })

  it('a repeated action stops adding after the cap, and the signup day alone is not "came back"', () => {
    const signals = empty()
    signals.savedVacancies.set('b', 50)
    signals.activeDays.set('b', ['2026-10-20']) // solo el día de su registro
    const [row] = buildPeopleValue([person('b')], signals, NOW)
    expect(row.parts.savedVacancies).toBe(MAX_PER_ACTION)
    expect(row.parts.returnedAnotherDay).toBe(false)
    expect(row.value).toBe(MAX_PER_ACTION * VALUE_POINTS.savedVacancy)
    expect(row.temperature).toBe('frio') // 18 días sin actividad
  })

  it('a person with no activity at all is cold with value 0', () => {
    const [row] = buildPeopleValue([person('c')], empty(), NOW)
    expect(row).toMatchObject({ value: 0, temperature: 'frio', lastActiveDay: null, daysSinceActive: null })
  })

  it('email clicks add points once the webhook feeds them, and opens never do', () => {
    const signals = empty()
    signals.emailClicks.set('d', 2)
    expect(buildPeopleValue([person('d')], signals, NOW)[0].value).toBe(2 * VALUE_POINTS.emailClick)
  })
})

describe('summarize (what the product agent reads)', () => {
  it('only counts by temperature and by value range, with no emails, names or ids', () => {
    const signals = empty()
    signals.activeDays.set('a', ['2026-11-06']); signals.participated.add('a')
    signals.activeDays.set('b', ['2026-11-02'])
    const summary = summarize(buildPeopleValue([person('a', { profile_completed: true }), person('b'), person('c')], signals, NOW))
    expect(summary.total).toBe(3)
    expect(summary.byTemperature).toEqual({ caliente: 1, tibio: 1, frio: 1 })
    expect(summary.byValueRange.find((row) => row.range === '8 a 14')?.people).toBe(1) // a: 3 + 5 = 8
    const text = JSON.stringify(summary)
    expect(text).not.toContain('example.com')
    expect(text).not.toMatch(/"id"|"email"/)
  })
})
