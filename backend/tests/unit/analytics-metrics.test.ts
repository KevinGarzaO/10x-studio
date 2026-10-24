import { describe, it, expect } from 'vitest'
import {
  acquisitionBySource,
  buildOverview,
  change,
  dayKey,
  groupPerformance,
  hourOf,
  pct,
  postPerformance,
  retention,
  topLandingPages,
  uniqueVisitors,
  windowStart,
  type LinkedInPostRow,
  type UserRow,
  type VisitRow,
} from '../../services/analytics/metrics'

// Sábado 24 de octubre de 2026, 12:00 en Monterrey (UTC-6) = 18:00 UTC.
const NOW = new Date('2026-10-24T18:00:00Z')

const visit = (visitor: string, createdAt: string, patch: Partial<VisitRow> = {}): VisitRow => ({
  visitor_id: visitor, source: null, medium: null, campaign: null, content: null, landing_path: '/', created_at: createdAt, ...patch,
})
const user = (id: string, createdAt: string, patch: Partial<UserRow> = {}): UserRow => ({
  id, created_at: createdAt, profile_completed: false, signup_source: null, signup_content: null, ...patch,
})
const post = (slug: string, patch: Partial<LinkedInPostRow> = {}): LinkedInPostRow => ({
  vacancy_slug: slug, company: 'Stripe', role_category: 'backend', linkedin_post_id: `urn:li:share:${slug}`, status: 'published',
  published_at: '2026-10-23T15:00:00Z', created_at: '2026-10-23T15:00:00Z', ...patch,
})

describe('days and hours are Monterrey time', () => {
  it('a late-night UTC instant still belongs to the previous Monterrey day', () => {
    expect(dayKey('2026-10-24T03:00:00Z')).toBe('2026-10-23')
    expect(dayKey('2026-10-24T06:00:00Z')).toBe('2026-10-24')
  })

  it('reads the hour in Monterrey time', () => {
    expect(hourOf('2026-10-24T14:30:00Z')).toBe(8)
    expect(hourOf('2026-10-24T19:30:00Z')).toBe(13)
  })

  it('a 3-day window starts at midnight Monterrey two days ago', () => {
    expect(windowStart(3, NOW).toISOString()).toBe('2026-10-22T06:00:00.000Z')
    expect(windowStart(1, NOW).toISOString()).toBe('2026-10-24T06:00:00.000Z')
  })
})

describe('percentages', () => {
  it('pct has one decimal and no invented 0% without a base', () => {
    expect(pct(26, 326)).toBe(8)
    expect(pct(1, 3)).toBe(33.3)
    expect(pct(5, 0)).toBeNull()
  })

  it('change compares with the previous period', () => {
    expect(change(150, 100)).toBe(50)
    expect(change(50, 100)).toBe(-50)
    expect(change(10, 0)).toBeNull()
  })
})

describe('visitors are distinct browsers, not entries', () => {
  it('counts a browser once however many times it came in', () => {
    const visits = [visit('a', '2026-10-24T10:00:00Z'), visit('a', '2026-10-24T16:00:00Z'), visit('b', '2026-10-24T11:00:00Z')]
    expect(visits).toHaveLength(3)
    expect(uniqueVisitors(visits)).toBe(2)
  })
})

describe('buildOverview', () => {
  const visits = [
    visit('a', '2026-10-24T10:00:00Z', { source: 'linkedin' }),
    visit('a', '2026-10-24T16:00:00Z', { source: 'linkedin' }),
    visit('b', '2026-10-23T10:00:00Z', { source: 'linkedin' }),
    visit('c', '2026-10-22T10:00:00Z'),
    // el periodo anterior (3 días antes de la ventana)
    visit('d', '2026-10-20T10:00:00Z'),
    // fuera de las dos ventanas
    visit('z', '2026-09-01T10:00:00Z'),
  ]
  const users = [
    user('u1', '2026-10-24T11:00:00Z', { profile_completed: true, signup_source: 'linkedin' }),
    user('u2', '2026-10-23T11:00:00Z', { signup_source: 'linkedin' }),
    user('u0', '2026-10-20T11:00:00Z'),
  ]

  it('counts distinct visitors, entries, signups and complete profiles of the period', () => {
    const overview = buildOverview({ visits, users, posts: [], days: 3, now: NOW })

    expect(overview.visitors).toBe(3)
    expect(overview.visits).toBe(4)
    expect(overview.signups).toBe(2)
    expect(overview.completedProfiles).toBe(1)
  })

  it('conversion is signups over visitors', () => {
    expect(buildOverview({ visits, users, posts: [], days: 3, now: NOW }).conversionPct).toBe(66.7)
  })

  it('compares with the period right before', () => {
    const overview = buildOverview({ visits, users, posts: [], days: 3, now: NOW })
    expect(overview.vs.visitors).toBe(200)
    expect(overview.vs.signups).toBe(100)
  })

  it('counts what came from LinkedIn', () => {
    const overview = buildOverview({
      visits, users, days: 3, now: NOW,
      posts: [post('x'), post('y', { status: 'failed', published_at: null, created_at: '2026-10-23T15:00:00Z' }), post('old', { published_at: '2026-09-01T00:00:00Z' })],
    })

    expect(overview.linkedin).toEqual({ visitors: 2, signups: 2, posts: 1, failedPosts: 1 })
  })

  it('gives one point per day, empty days included', () => {
    const overview = buildOverview({ visits, users, posts: [], days: 3, now: NOW })

    expect(overview.series.map(point => point.day)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24'])
    expect(overview.series.map(point => point.visitors)).toEqual([1, 1, 1])
    expect(overview.series.map(point => point.signups)).toEqual([0, 1, 1])
    expect(buildOverview({ visits: [], users: [], posts: [], days: 5, now: NOW }).series).toHaveLength(5)
  })
})

describe('postPerformance', () => {
  const visits = [
    visit('a', '2026-10-23T16:00:00Z', { source: 'linkedin', content: 'vac-1' }),
    visit('a', '2026-10-23T17:00:00Z', { source: 'linkedin', content: 'vac-1' }),
    visit('b', '2026-10-23T16:30:00Z', { source: 'linkedin', content: 'vac-1' }),
    visit('c', '2026-10-23T16:30:00Z', { source: 'google', content: 'vac-1' }),
    visit('d', '2026-10-23T16:30:00Z', { source: 'linkedin', content: 'vac-2' }),
  ]
  const users = [
    user('u1', '2026-10-23T18:00:00Z', { signup_source: 'linkedin', signup_content: 'vac-1' }),
    user('u2', '2026-10-23T18:00:00Z', { signup_source: 'google', signup_content: 'vac-1' }),
  ]

  it('credits each post with the distinct visitors and the signups that came through its link', () => {
    const [first] = postPerformance({ posts: [post('vac-1')], visits, users })

    expect(first).toMatchObject({ slug: 'vac-1', visitors: 2, signups: 1, conversionPct: 50 })
  })

  it('does not credit visits from other origins', () => {
    const [first] = postPerformance({ posts: [post('vac-1')], visits, users })
    expect(first.visitors).toBe(2)
  })

  it('a post nobody opened has zero, and no invented conversion', () => {
    const [first] = postPerformance({ posts: [post('vac-9')], visits, users })
    expect(first).toMatchObject({ visitors: 0, signups: 0, conversionPct: null })
  })

  it('leaves out posts that did not get published, newest first', () => {
    const rows = postPerformance({
      posts: [post('vac-1', { published_at: '2026-10-20T10:00:00Z' }), post('vac-2', { published_at: '2026-10-22T10:00:00Z' }), post('vac-3', { status: 'failed' })],
      visits, users,
    })
    expect(rows.map(row => row.slug)).toEqual(['vac-2', 'vac-1'])
  })
})

describe('groupPerformance', () => {
  const rows = [
    { slug: 'a', company: 'X', role: 'backend', publishedAt: null, linkedinPostId: null, visitors: 10, signups: 2, conversionPct: 20 },
    { slug: 'b', company: 'Y', role: 'backend', publishedAt: null, linkedinPostId: null, visitors: 20, signups: 1, conversionPct: 5 },
    { slug: 'c', company: 'Z', role: 'ventas', publishedAt: null, linkedinPostId: null, visitors: 50, signups: 0, conversionPct: 0 },
  ]

  it('groups, and compares groups of different size by visitors per post', () => {
    const groups = groupPerformance(rows, row => row.role)

    expect(groups[0]).toMatchObject({ key: 'ventas', posts: 1, visitors: 50, visitorsPerPost: 50 })
    expect(groups[1]).toMatchObject({ key: 'backend', posts: 2, visitors: 30, signups: 3, visitorsPerPost: 15, conversionPct: 10 })
  })

  it('skips the rows with no key', () => {
    expect(groupPerformance(rows, () => null)).toEqual([])
  })
})

describe('acquisitionBySource', () => {
  it('adds up visitors and signups by origin, medium and campaign, with no-origin as direct', () => {
    const rows = acquisitionBySource({
      visits: [
        visit('a', '2026-10-24T10:00:00Z', { source: 'linkedin', medium: 'social', campaign: 'vacante-auto' }),
        visit('a', '2026-10-24T12:00:00Z', { source: 'linkedin', medium: 'social', campaign: 'vacante-auto' }),
        visit('b', '2026-10-24T10:00:00Z'),
      ],
      users: [user('u1', '2026-10-24T11:00:00Z', { signup_source: 'linkedin', signup_medium: 'social', signup_campaign: 'vacante-auto' }), user('u2', '2026-10-24T11:00:00Z')],
    })

    expect(rows[0]).toEqual({ source: 'linkedin', medium: 'social', campaign: 'vacante-auto', visitors: 1, visits: 2, signups: 1, conversionPct: 100 })
    expect(rows[1]).toMatchObject({ source: '(directo)', visitors: 1, signups: 1 })
  })
})

describe('topLandingPages', () => {
  it('ranks the pages people enter by, counting distinct visitors', () => {
    const pages = topLandingPages([
      visit('a', '2026-10-24T10:00:00Z', { landing_path: '/vacantes/x' }),
      visit('a', '2026-10-24T11:00:00Z', { landing_path: '/vacantes/x' }),
      visit('b', '2026-10-24T10:00:00Z', { landing_path: '/vacantes/x' }),
      visit('c', '2026-10-24T10:00:00Z', { landing_path: null }),
    ])

    expect(pages).toEqual([{ path: '/vacantes/x', visitors: 2 }, { path: '/', visitors: 1 }])
  })
})

describe('retention', () => {
  const users = [
    user('u1', '2026-10-06T12:00:00Z'), // semana del 5 de octubre
    user('u2', '2026-10-07T12:00:00Z'),
    user('u3', '2026-10-20T12:00:00Z'), // semana del 19 de octubre
  ]
  const activity = [
    { user_id: 'u1', day: '2026-10-06' },
    { user_id: 'u2', day: '2026-10-07' },
    { user_id: 'u1', day: '2026-10-14' }, // u1 vuelve la semana siguiente
    { user_id: 'u3', day: '2026-10-20' },
    { user_id: 'u1', day: '2026-10-24' },
  ]

  it('counts active people today, this week and this month', () => {
    const result = retention({ activity, users, today: '2026-10-24' })

    expect(result.dau).toBe(1)
    expect(result.wau).toBe(2)
    expect(result.mau).toBe(3)
    expect(result.stickinessPct).toBe(33.3)
  })

  it('measures each signup week: how many came back in the weeks after', () => {
    const { cohorts } = retention({ activity, users, today: '2026-10-24', weeks: 3 })
    const first = cohorts.find(cohort => cohort.week === '2026-10-05')!

    expect(first.size).toBe(2)
    expect(first.retained[0]).toBe(100)
    expect(first.retained[1]).toBe(50)
    expect(first.retained[2]).toBe(50) // u1 vuelve el 24 de octubre, semana del 19
  })

  it('does not report weeks that have not happened yet', () => {
    const { cohorts } = retention({ activity, users, today: '2026-10-24', weeks: 3 })
    const recent = cohorts.find(cohort => cohort.week === '2026-10-19')!

    expect(recent.retained[0]).toBe(100)
    expect(recent.retained[1]).toBeNull()
  })

  it('says since when it has data, and reports nothing for weeks before that', () => {
    const result = retention({ activity: [{ user_id: 'u1', day: '2026-10-20' }], users, today: '2026-10-24', weeks: 3 })

    expect(result.trackingSince).toBe('2026-10-20')
    const first = result.cohorts.find(cohort => cohort.week === '2026-10-05')!
    expect(first.retained[0]).toBeNull()
  })

  it('works with no activity at all', () => {
    const result = retention({ activity: [], users: [], today: '2026-10-24' })
    expect(result).toMatchObject({ dau: 0, wau: 0, mau: 0, stickinessPct: null, trackingSince: null, cohorts: [] })
  })
})
