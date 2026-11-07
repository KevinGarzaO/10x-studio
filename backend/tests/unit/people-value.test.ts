import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { ACTIVE_DAY_POINTS, ENGAGEMENT_DAYS, MAX_PER_ACTION, TEMPERATURE, VALUE_POINTS, buildPeopleValue, displayNameOf, reasonOf, summarize, temperatureOf, type DatedAction, type PersonInput } from '../../services/analytics/people-value'

// Sábado 7 de noviembre de 2026, mediodía en Monterrey.
const NOW = new Date('2026-11-07T18:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const person = (id: string, over: Partial<PersonInput> = {}): PersonInput => ({ id, email: `${id}@example.com`, name: `Persona ${id}`, photo_url: null, created_at: '2026-10-20T18:00:00Z', profile_completed: false, email_opt_out: false, email_prefs: null, ...over })
const run = (people: PersonInput[], actions: Record<string, DatedAction[]> = {}, days: Record<string, string[]> = {}) =>
  buildPeopleValue(people, new Map(Object.entries(actions)), new Map(Object.entries(days)), NOW)

describe('temperatureOf (it comes from the engagement)', () => {
  it('is hot from the hot threshold, warm from the warm one, cold below', () => {
    expect(temperatureOf(TEMPERATURE.hotAtLeast)).toBe('caliente')
    expect(temperatureOf(TEMPERATURE.hotAtLeast - 1)).toBe('tibio')
    expect(temperatureOf(TEMPERATURE.warmAtLeast)).toBe('tibio')
    expect(temperatureOf(TEMPERATURE.warmAtLeast - 1)).toBe('frio')
    expect(temperatureOf(0)).toBe('frio')
  })
})

describe('value (accumulated) and engagement (only the last days)', () => {
  it('splits the same actions between the two numbers by date', () => {
    const [row] = run([person('a', { profile_completed: true })], {
      a: [
        { action: 'profileComplete', at: ago(20) }, // viejo: solo valor
        { action: 'tappedApply', at: ago(30) }, // viejo: solo valor
        { action: 'tappedApply', at: ago(2) }, // reciente: valor y enganche
        { action: 'applied', at: ago(1) }, // reciente: valor y enganche
      ],
    })
    expect(row.value).toBe(VALUE_POINTS.profileComplete + 2 * VALUE_POINTS.tappedApply + VALUE_POINTS.applied)
    expect(row.engagement).toBe(VALUE_POINTS.tappedApply + VALUE_POINTS.applied)
  })

  it('applies the cap of repetitions to each number on its own', () => {
    // 5 guardados viejos y 5 recientes: el valor topa en 3 y el enganche topa en 3 (de los recientes).
    const actions: DatedAction[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ action: 'savedVacancy' as const, at: ago(30 + i) })),
      ...Array.from({ length: 5 }, (_, i) => ({ action: 'savedVacancy' as const, at: ago(1 + i * 0.1) })),
    ]
    const [row] = run([person('b')], { b: actions })
    expect(row.value).toBe(MAX_PER_ACTION * VALUE_POINTS.savedVacancy)
    expect(row.engagement).toBe(MAX_PER_ACTION * VALUE_POINTS.savedVacancy)
  })

  it('an action with no known date counts in the value, never in the engagement', () => {
    const [row] = run([person('c')], { c: [{ action: 'participated', at: null }] })
    expect(row.value).toBe(VALUE_POINTS.participated)
    expect(row.engagement).toBe(0)
    expect(row.events[0]).toMatchObject({ at: null, valuePoints: VALUE_POINTS.participated, engagementPoints: 0 })
  })

  it('an action that happens once is worth its points once, even if it is repeated', () => {
    const [row] = run([person('d')], { d: [{ action: 'participated', at: ago(1) }, { action: 'participated', at: ago(2) }] })
    expect(row.value).toBe(VALUE_POINTS.participated)
    expect(row.engagement).toBe(VALUE_POINTS.participated)
    expect(row.events.map((event) => event.valuePoints).sort()).toEqual([0, VALUE_POINTS.participated])
  })

  it('the engagement period follows ENGAGEMENT_DAYS', () => {
    const edge = run([person('e')], { e: [{ action: 'tappedApply', at: ago(ENGAGEMENT_DAYS - 0.5) }, { action: 'applied', at: ago(ENGAGEMENT_DAYS + 0.5) }] })[0]
    expect(edge.engagement).toBe(VALUE_POINTS.tappedApply)
    expect(edge.value).toBe(VALUE_POINTS.tappedApply + VALUE_POINTS.applied)
  })
})

describe('temperature, reason, photo and news', () => {
  it('the temperature follows the engagement, not the last activity', () => {
    // Entró hoy pero no hizo nada que sume: frío. Otra hizo mucho hace 2 días: caliente.
    const rows = run([person('x'), person('y')], {
      y: [{ action: 'applied', at: ago(2) }, { action: 'tappedApply', at: ago(2) }],
    }, { x: ['2026-11-07'], y: ['2026-11-05'] })
    // x entró hoy: su único punto es el del día activo, y con eso sigue frío. y suma sus dos acciones y su día activo.
    expect(rows[0]).toMatchObject({ temperature: 'frio', engagement: ACTIVE_DAY_POINTS, daysSinceActive: 0, lastActiveDay: '2026-11-07' })
    expect(rows[1]).toMatchObject({ temperature: 'caliente', engagement: VALUE_POINTS.applied + VALUE_POINTS.tappedApply + ACTIVE_DAY_POINTS })
  })

  it('writes the sentence that explains the temperature', () => {
    expect(reasonOf(8, 'caliente')).toBe(`Caliente: sumó 8 puntos de uso en los últimos ${ENGAGEMENT_DAYS} días (desde ${TEMPERATURE.hotAtLeast} es caliente).`)
    expect(reasonOf(0, 'frio')).toBe(`Frío: no sumó puntos de uso en los últimos ${ENGAGEMENT_DAYS} días.`)
    expect(reasonOf(1, 'frio')).toContain('sumó solo 1 punto de uso')
    expect(reasonOf(3, 'tibio', { actionPoints: 2, activeDays: 1, profileComplete: true })).toBe(
      `Tibio: sumó 3 puntos de uso en los últimos ${ENGAGEMENT_DAYS} días (2 puntos por acciones y 1 día activo) (de ${TEMPERATURE.warmAtLeast} a ${TEMPERATURE.hotAtLeast - 1} es tibio). Completar el perfil no cuenta como enganche.`,
    )
  })

  it('passes the photo and name for the table, and whether the person accepts community news', () => {
    const rows = run([person('p', { photo_url: 'https://x/p.png' }), person('q', { email_prefs: { community: false } }), person('r', { email_opt_out: true })])
    expect(rows[0]).toMatchObject({ photoUrl: 'https://x/p.png', name: 'Persona p', acceptsCommunityNews: true })
    expect(rows[1].acceptsCommunityNews).toBe(false)
    expect(rows[2].acceptsCommunityNews).toBe(false)
  })

  it('"came back another day" is valued once, and in the engagement only when a recent day exists', () => {
    const old = run([person('s')], { s: [{ action: 'returnedAnotherDay', at: ago(20) }] })[0]
    expect(old).toMatchObject({ value: VALUE_POINTS.returnedAnotherDay, engagement: 0 })
    const recent = run([person('t')], { t: [{ action: 'returnedAnotherDay', at: ago(20) }, { action: 'returnedAnotherDay', at: ago(1) }] })[0]
    expect(recent).toMatchObject({ value: VALUE_POINTS.returnedAnotherDay, engagement: VALUE_POINTS.returnedAnotherDay })
  })

  it('email clicks add to the value and to the engagement, with the same cap', () => {
    const row = run([person('u')], { u: Array.from({ length: 6 }, (_, i) => ({ action: 'emailClick' as const, at: ago(i * 0.2) })) })[0]
    expect(row.value).toBe(MAX_PER_ACTION * VALUE_POINTS.emailClick)
    expect(row.engagement).toBe(MAX_PER_ACTION * VALUE_POINTS.emailClick)
    expect(row.emailClicks).toBe(6)
  })
})

describe('summarize (what the product agent reads)', () => {
  it('only counts, with the engagement distribution, and no emails, names, photos or ids', () => {
    const rows = run([person('a', { photo_url: 'https://x/a.png' }), person('b'), person('c')], {
      a: [{ action: 'applied', at: ago(1) }, { action: 'tappedApply', at: ago(1) }],
      b: [{ action: 'savedVacancy', at: ago(40) }],
    })
    const summary = summarize(rows)
    expect(summary.total).toBe(3)
    expect(summary.byTemperature).toEqual({ caliente: 1, tibio: 0, frio: 2 })
    expect(summary.engagementDistribution).toEqual([{ points: 0, people: 2 }, { points: 6, people: 1 }])
    expect(summary.byEngagementRange.find((row) => row.range === '6 a 8')?.people).toBe(1)
    expect(summary.byEngagementRange.map((row) => row.range)).toEqual(['0', '1 a 2', '3 a 5', '6 a 8', '9 o más'])
    expect(summary.activeDaysDistribution).toHaveLength(ENGAGEMENT_DAYS + 1)
    const text = JSON.stringify(summary)
    expect(text).not.toMatch(/example\.com|x\/a\.png|Persona|"id"|"email"|photo/)
  })
})

describe('why an action gives 0', () => {
  it('"came back another day" counts once: the second return says so, even though the cap of repetitions is 3', () => {
    const [row] = run([person('a')], { a: [{ action: 'returnedAnotherDay', at: ago(2) }, { action: 'returnedAnotherDay', at: ago(0.5) }] })
    const [recent, first] = row.events // más reciente primero
    expect(first).toMatchObject({ valuePoints: VALUE_POINTS.returnedAnotherDay, engagementPoints: VALUE_POINTS.returnedAnotherDay, notes: [] })
    expect(recent.valuePoints).toBe(0)
    expect(recent.notes).toEqual(['Valor: esta acción se cuenta una sola vez y ya se contó'])
  })

  it('a repeatable action past the cap says it reached the cap', () => {
    const [row] = run([person('b')], { b: Array.from({ length: 4 }, (_, i) => ({ action: 'savedVacancy' as const, at: ago(1 + i * 0.1) })) })
    expect(row.events.filter((event) => event.valuePoints === 0)).toHaveLength(1)
    expect(row.events.find((event) => event.valuePoints === 0)!.notes[0]).toContain(`tope de ${MAX_PER_ACTION}`)
  })

  it('an old action says it is outside the period, and one with no date says the date is unknown', () => {
    const [row] = run([person('c')], { c: [{ action: 'applied', at: ago(30) }, { action: 'tappedApply', at: null }] })
    const old = row.events.find((event) => event.action === 'applied')!
    const undated = row.events.find((event) => event.action === 'tappedApply')!
    expect(old).toMatchObject({ valuePoints: VALUE_POINTS.applied, engagementPoints: 0 })
    expect(old.notes[0]).toContain('pasó hace más de')
    expect(undated.notes[0]).toContain('no se sabe la fecha')
  })
})

describe('displayNameOf', () => {
  it('takes the real name from display_name (users.name is empty), then name, then the username, and never the email', () => {
    expect(displayNameOf({ display_name: 'Raúl Adolfo Torres Vargas', name: null, username: 'ingrauladolfo' })).toBe('Raúl Adolfo Torres Vargas')
    expect(displayNameOf({ display_name: '  ', name: 'Ana', username: 'ana1' })).toBe('Ana')
    expect(displayNameOf({ display_name: null, name: null, username: 'ana1' })).toBe('ana1')
    expect(displayNameOf({})).toBeNull()
  })
})

describe('setting up the account is not using the app', () => {
  it('completing the profile counts in the value but not in the engagement, and its row says why', () => {
    const [row] = run([person('a', { profile_completed: true })], { a: [{ action: 'profileComplete', at: ago(1) }] })
    expect(row.value).toBe(VALUE_POINTS.profileComplete)
    expect(row.engagement).toBe(0)
    expect(row.events[0]).toMatchObject({ valuePoints: VALUE_POINTS.profileComplete, engagementPoints: 0 })
    expect(row.events[0].notes).toEqual(['Enganche: completar el perfil es configurar la cuenta, no usar la app, así que solo cuenta en el valor'])
  })

  it('the case that motivated it: 6 points from the profile and coming back are NOT hot, only the coming back counts', () => {
    const [row] = run([person('b', { profile_completed: true })], {
      b: [{ action: 'profileComplete', at: ago(2) }, { action: 'returnedAnotherDay', at: ago(1) }],
    })
    expect(row.value).toBe(VALUE_POINTS.profileComplete + VALUE_POINTS.returnedAnotherDay) // 6
    expect(row.engagement).toBe(VALUE_POINTS.returnedAnotherDay) // 3
    expect(row.temperature).toBe('tibio')
    expect(row.reason).toContain('Completar el perfil no cuenta como enganche.')
  })
})

describe('distinct active days in the last 7', () => {
  const rows = (days: string[], rulesOverride?: { activeDayPoints: number }) =>
    buildPeopleValue([person('d')], new Map(), new Map([['d', days]]), NOW, rulesOverride ? { excluded: ['profileComplete'], ...rulesOverride } : undefined)[0]

  it('counts each distinct Monterrey day once, only inside the period, from 0 to 7', () => {
    // El periodo termina hoy (7 nov): del 1 al 7 de noviembre. El 31 de octubre queda fuera; el 5 se repite.
    const row = rows(['2026-10-31', '2026-11-01', '2026-11-05', '2026-11-05', '2026-11-07'])
    expect(row.activeDays7).toBe(3)
    expect(row.activeDays7List).toEqual(['2026-11-07', '2026-11-05', '2026-11-01'])
    expect(rows([]).activeDays7).toBe(0)
    expect(rows(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']).activeDays7).toBe(ENGAGEMENT_DAYS)
  })

  it('adds ACTIVE_DAY_POINTS per day to the engagement (not to the value), with a weight that can be changed', () => {
    const row = rows(['2026-11-05', '2026-11-07'])
    expect(row.activeDayPoints).toBe(2 * ACTIVE_DAY_POINTS)
    expect(row.engagement).toBe(2 * ACTIVE_DAY_POINTS)
    expect(row.value).toBe(0)
    expect(rows(['2026-11-05', '2026-11-07'], { activeDayPoints: 0 }).engagement).toBe(0)
    expect(rows(['2026-11-05', '2026-11-07'], { activeDayPoints: 2 }).engagement).toBe(4)
  })

  it('the sentence explains where the points come from when there are active days', () => {
    const [row] = buildPeopleValue([person('e')], new Map([['e', [{ action: 'savedVacancy' as const, at: ago(1) }, { action: 'savedVacancy' as const, at: ago(2) }]]]), new Map([['e', ['2026-11-06', '2026-11-07']]]), NOW)
    expect(row.engagement).toBe(2 * VALUE_POINTS.savedVacancy + 2 * ACTIVE_DAY_POINTS)
    expect(row.reason).toContain('2 puntos por acciones y 2 días activos')
  })
})
