import { describe, it, expect } from 'vitest'
import { buildAlerts, TRAFFIC_WITHOUT_SIGNUPS, TOKEN_WARNING_DAYS, type AlertInput } from '../../services/analytics/alerts'
import { expectedPublicationsToday } from '../../services/analytics/schedule'
import { vacancyEngagement } from '../../services/analytics/metrics'

/** Un día normal y sano: nada que avisar. */
const healthy = (patch: Partial<AlertInput> = {}): AlertInput => ({
  recent: { attributedVisitors: 60, signups: 5 },
  linkedin: { connected: true, daysLeft: 40, publishing: true, siteUrlConfigured: true, failedLast24h: 0, publishedToday: 2, expectedToday: 2 },
  ...patch,
})

const ids = (input: AlertInput) => buildAlerts(input).map(alert => alert.id)

describe('buildAlerts', () => {
  it('says nothing on a healthy day', () => {
    expect(buildAlerts(healthy())).toEqual([])
  })

  describe('visitors with an identified origin but no signups', () => {
    it('is serious when enough people arrived in 48 hours and nobody signed up', () => {
      const alerts = buildAlerts(healthy({ recent: { attributedVisitors: 80, signups: 0 } }))

      expect(alerts[0]).toMatchObject({ id: 'signups-stalled', level: 'bad' })
      expect(alerts[0].detail).toContain('80 visitantes')
    })

    it('does not warn with little traffic: zero out of a few is just chance', () => {
      expect(ids(healthy({ recent: { attributedVisitors: TRAFFIC_WITHOUT_SIGNUPS - 1, signups: 0 } }))).toEqual([])
    })

    it('does not warn once someone signed up', () => {
      expect(ids(healthy({ recent: { attributedVisitors: 300, signups: 1 } }))).toEqual([])
    })

    it('the threshold sits where zero signups is not plausible by chance at the real conversion (about 8%)', () => {
      const chanceOfZero = Math.pow(1 - 0.08, TRAFFIC_WITHOUT_SIGNUPS)
      expect(chanceOfZero).toBeLessThan(0.05)
    })

    it('direct traffic is not counted: on Oct 23 only 11 of the 66 entries had an origin, so there was no alarm to raise', () => {
      // 55 de las 66 entradas eran directas (pruebas propias y robots): la regla recibe solo las 11 con origen.
      expect(ids(healthy({ recent: { attributedVisitors: 11 + 7, signups: 0 } }))).toEqual([])
    })
  })

  describe('LinkedIn', () => {
    const linkedin = (patch: Partial<AlertInput['linkedin']>): AlertInput => healthy({ linkedin: { ...healthy().linkedin, ...patch } })

    it('is serious when it is not connected, and says nothing else about publishing', () => {
      expect(ids(linkedin({ connected: false, publishing: true, failedLast24h: 3 }))).toEqual(['linkedin-disconnected'])
    })

    it('is serious when the permission expired', () => {
      expect(buildAlerts(linkedin({ daysLeft: -1 }))[0]).toMatchObject({ id: 'linkedin-expired', level: 'bad' })
    })

    it('warns before the permission expires, from the warning window on', () => {
      expect(ids(linkedin({ daysLeft: TOKEN_WARNING_DAYS }))).toEqual(['linkedin-expiring'])
      expect(ids(linkedin({ daysLeft: TOKEN_WARNING_DAYS + 1 }))).toEqual([])
    })

    it('warns when automatic publishing is switched off', () => {
      expect(ids(linkedin({ publishing: false }))).toEqual(['publisher-off'])
    })

    it('is serious when publishing is on but the public site address is missing', () => {
      expect(buildAlerts(linkedin({ siteUrlConfigured: false }))[0]).toMatchObject({ id: 'site-url-missing', level: 'bad' })
    })

    it('is serious when a post failed in the last day', () => {
      const alert = buildAlerts(linkedin({ failedLast24h: 2 }))[0]
      expect(alert).toMatchObject({ id: 'posts-failed', level: 'bad' })
      expect(alert.title).toContain('2')
    })

    it('warns when fewer posts went out today than should have', () => {
      const alert = buildAlerts(linkedin({ publishedToday: 1, expectedToday: 2 }))[0]
      expect(alert).toMatchObject({ id: 'posts-missed', level: 'warn' })
      expect(alert.detail).toContain('2')
    })

    it('does not complain about missing posts when publishing is off: that is already said', () => {
      expect(ids(linkedin({ publishing: false, publishedToday: 0, expectedToday: 2 }))).toEqual(['publisher-off'])
    })
  })

  it('puts the serious ones first', () => {
    const order = buildAlerts(healthy({
      recent: { attributedVisitors: 90, signups: 0 },
      linkedin: { ...healthy().linkedin, daysLeft: 3, failedLast24h: 1 },
    }))

    expect(order.map(alert => alert.level)).toEqual(['bad', 'bad', 'warn'])
  })
})

describe('expectedPublicationsToday', () => {
  // 23 de octubre de 2026 es viernes; el 24, sábado. Monterrey es UTC-6.
  const at = (isoUtc: string) => expectedPublicationsToday(new Date(isoUtc))

  it('is none before the first post time', () => {
    expect(at('2026-10-23T13:00:00Z')).toBe(0) // 7:00 am
  })

  it('gives a margin after the hour, because the cron takes a moment', () => {
    expect(at('2026-10-23T14:35:00Z')).toBe(0) // 8:35: todavía dentro del margen
    expect(at('2026-10-23T14:55:00Z')).toBe(1) // 8:55
  })

  it('is two after the second post time', () => {
    expect(at('2026-10-23T20:00:00Z')).toBe(2) // 2:00 pm
  })

  it('is none at the weekend', () => {
    expect(at('2026-10-24T20:00:00Z')).toBe(0) // sábado
    expect(at('2026-10-25T20:00:00Z')).toBe(0) // domingo
  })
})

describe('vacancyEngagement', () => {
  const event = (slug: string, kind: 'view' | 'apply', visitor: string) => ({ vacancy_slug: slug, event: kind, visitor_id: visitor })

  it('counts a browser once per vacancy, however many times it opened it', () => {
    const result = vacancyEngagement([event('a', 'view', 'v1'), event('a', 'view', 'v1'), event('a', 'view', 'v2'), event('a', 'apply', 'v1'), event('a', 'apply', 'v1')])

    expect(result).toMatchObject({ views: 2, applies: 1, viewers: 2, applyRatePct: 50 })
  })

  it('counts the same browser separately on each vacancy', () => {
    const result = vacancyEngagement([event('a', 'view', 'v1'), event('b', 'view', 'v1')])
    expect(result.views).toBe(2)
    expect(result.viewers).toBe(1)
  })

  it('ranks the vacancies by how many people opened them', () => {
    const result = vacancyEngagement([
      event('poco', 'view', 'v1'),
      event('mucho', 'view', 'v1'), event('mucho', 'view', 'v2'), event('mucho', 'view', 'v3'),
      event('mucho', 'apply', 'v1'),
    ])

    expect(result.byVacancy.map(row => row.slug)).toEqual(['mucho', 'poco'])
    expect(result.byVacancy[0]).toEqual({ slug: 'mucho', views: 3, applies: 1, applyRatePct: 33.3 })
  })

  it('has no invented rate when nobody opened anything', () => {
    expect(vacancyEngagement([])).toEqual({ views: 0, applies: 0, viewers: 0, applyRatePct: null, byVacancy: [] })
  })

  it('lists a vacancy that only has apply clicks', () => {
    expect(vacancyEngagement([event('a', 'apply', 'v1')]).byVacancy).toEqual([{ slug: 'a', views: 0, applies: 1, applyRatePct: null }])
  })
})
