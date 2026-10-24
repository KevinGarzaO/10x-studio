import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString()

const data = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  errors: {} as Record<string, string>,
}))
const seen = vi.hoisted(() => ({ filters: [] as string[] }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        let single = false
        const q: any = {}
        for (const name of ['eq', 'not', 'in', 'gte', 'order', 'limit', 'range']) {
          q[name] = (...args: unknown[]) => { seen.filters.push(`${table}:${name}:${args.join(',')}`); return q }
        }
        q.maybeSingle = () => { single = true; return q }
        q.then = (resolve: any, reject: any) => {
          if (data.errors[table]) return Promise.resolve({ data: null, count: null, error: { message: data.errors[table] } }).then(resolve, reject)
          const rows = data.tables[table] ?? []
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, count: rows.length, error: null }).then(resolve, reject)
        }
        return q
      },
    }),
  },
}))

// El publicador necesita saber si el sitio público está configurado.
process.env.COMMUNITY_APP_URL = 'https://avotalent.app'

import router from '../../src/routes/admin/analytics.routes'

const app = () => {
  const a = express()
  a.use('/analytics', router)
  return a
}

beforeEach(() => {
  seen.filters.length = 0
  data.errors = {}
  data.tables = {
    landing_visits: [
      { visitor_id: 'a', source: 'linkedin', medium: 'social', campaign: 'vacante-auto', content: 'vac-1', landing_path: '/vacantes/vac-1', created_at: hoursAgo(5) },
      { visitor_id: 'a', source: 'linkedin', medium: 'social', campaign: 'vacante-auto', content: 'vac-1', landing_path: '/vacantes/vac-1', created_at: hoursAgo(4) },
      { visitor_id: 'b', source: 'linkedin', medium: 'social', campaign: 'vacante-auto', content: 'vac-1', landing_path: '/vacantes/vac-1', created_at: hoursAgo(3) },
      { visitor_id: 'c', source: null, medium: null, campaign: null, content: null, landing_path: '/', created_at: hoursAgo(2) },
    ],
    users: [
      { id: 'u1', username: 'ana', display_name: 'Ana', email: 'ana@x.com', user_kind: 'user', profile_completed: true, role_category: 'backend', seniority: 'senior', location: 'MX', signup_source: 'linkedin', signup_medium: 'social', signup_campaign: 'vacante-auto', signup_content: 'vac-1', created_at: hoursAgo(1) },
    ],
    linkedin_vacancy_posts: [
      { vacancy_slug: 'vac-1', company: 'Stripe', role_category: 'backend', linkedin_post_id: 'urn:li:share:1', status: 'published', published_at: hoursAgo(6), created_at: hoursAgo(6) },
      { vacancy_slug: 'vac-2', company: 'Twilio', role_category: 'ventas', linkedin_post_id: null, status: 'failed', published_at: null, created_at: hoursAgo(7) },
    ],
    community_posts: [{ id: 'p' }, { id: 'q' }],
    scraper_posts: [{ created_at: hoursAgo(1) }],
    linkedin_profiles: [{ first_name: 'Kevin', last_name: 'Garza', headline: 'Dev', photo_url: null, connected_at: hoursAgo(100), expires_at: new Date(Date.now() + 40 * 86400000).toISOString() }],
    user_activity_daily: [],
  }
})

describe('GET /analytics/overview', () => {
  it('counts visitors as distinct browsers, not entries', async () => {
    const res = await request(app()).get('/analytics/overview?days=7').expect(200)

    expect(res.body.visitors).toBe(3)
    expect(res.body.visits).toBe(4)
    expect(res.body.signups).toBe(1)
    expect(res.body.completedProfiles).toBe(1)
    expect(res.body.conversionPct).toBe(33.3)
  })

  it('brings what is on the system now', async () => {
    const res = await request(app()).get('/analytics/overview').expect(200)

    expect(res.body.totals).toMatchObject({ activeVacancies: 2, queuedVacancies: 1 })
    expect(res.body.days).toBe(30)
  })

  it('takes only 7, 30 or 90 days and falls back to 30', async () => {
    expect((await request(app()).get('/analytics/overview?days=7')).body.days).toBe(7)
    expect((await request(app()).get('/analytics/overview?days=90')).body.days).toBe(90)
    expect((await request(app()).get('/analytics/overview?days=5')).body.days).toBe(30)
    expect((await request(app()).get('/analytics/overview?days=abc')).body.days).toBe(30)
  })

  it('leaves out test accounts and scraper profiles', async () => {
    await request(app()).get('/analytics/overview')

    expect(seen.filters).toContain('users:eq:is_test_account,false')
    expect(seen.filters).toContain('users:not:is_scraper_profile,is,true')
  })

  it('says it plainly when something cannot be read', async () => {
    data.errors.landing_visits = 'tabla no existe'
    const res = await request(app()).get('/analytics/overview')
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/resumen/)
  })
})

describe('GET /analytics/linkedin', () => {
  it('shows each published post with the visitors and signups that came through its link', async () => {
    const res = await request(app()).get('/analytics/linkedin?days=7').expect(200)

    expect(res.body.posts).toHaveLength(1)
    expect(res.body.posts[0]).toMatchObject({ slug: 'vac-1', company: 'Stripe', visitors: 2, signups: 1, conversionPct: 50 })
    expect(res.body.totals).toMatchObject({ published: 1, failed: 1, visitors: 2, signups: 1 })
  })

  it('compares by role and by hour', async () => {
    const res = await request(app()).get('/analytics/linkedin').expect(200)

    expect(res.body.byRole[0]).toMatchObject({ key: 'backend', posts: 1 })
    expect(res.body.byHour).toHaveLength(1)
    expect(res.body.byHour[0].key).toMatch(/^\d\d:00$/)
  })

  it('reports the state of the connection and the publisher', async () => {
    const res = await request(app()).get('/analytics/linkedin').expect(200)

    expect(res.body.status).toMatchObject({ connected: true, name: 'Kevin Garza', siteUrlConfigured: true })
    expect(res.body.status.daysLeft).toBeGreaterThanOrEqual(39)
    expect(new Date(res.body.status.nextPublicationAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('shows whether the automatic publishing switch is on', async () => {
    delete process.env.LINKEDIN_VACANCY_POSTS
    expect((await request(app()).get('/analytics/linkedin')).body.status.publishing).toBe(false)

    process.env.LINKEDIN_VACANCY_POSTS = 'on'
    expect((await request(app()).get('/analytics/linkedin')).body.status.publishing).toBe(true)
    delete process.env.LINKEDIN_VACANCY_POSTS
  })

  it('says it is not connected when there is no profile', async () => {
    data.tables.linkedin_profiles = []
    const res = await request(app()).get('/analytics/linkedin').expect(200)
    expect(res.body.status).toMatchObject({ connected: false, name: null, daysLeft: null })
  })

  it('never returns the access token', async () => {
    data.tables.linkedin_profiles = [{ ...data.tables.linkedin_profiles[0], access_token: 'SECRETO' }]
    const res = await request(app()).get('/analytics/linkedin').expect(200)
    expect(JSON.stringify(res.body)).not.toContain('SECRETO')
  })
})

describe('GET /analytics/acquisition', () => {
  it('splits the traffic by origin, with no-origin as direct', async () => {
    const res = await request(app()).get('/analytics/acquisition?days=7').expect(200)

    expect(res.body.sources[0]).toMatchObject({ source: 'linkedin', visitors: 2, signups: 1 })
    expect(res.body.sources.some((row: { source: string }) => row.source === '(directo)')).toBe(true)
  })

  it('walks the funnel from visitors to the people who came back', async () => {
    data.tables.user_activity_daily = [{ user_id: 'u1', day: '2999-01-01' }]
    const res = await request(app()).get('/analytics/acquisition?days=7').expect(200)

    expect(res.body.funnel.map((step: { step: string }) => step.step)).toEqual(['Visitantes', 'Se registraron', 'Completaron su perfil', 'Volvieron otro día'])
    expect(res.body.funnel.map((step: { count: number }) => step.count)).toEqual([3, 1, 1, 1])
  })

  it('does not invent the people who came back when activity is not tracked yet', async () => {
    data.errors.user_activity_daily = 'tabla no existe'
    const res = await request(app()).get('/analytics/acquisition').expect(200)

    const last = res.body.funnel[3]
    expect(last.count).toBeNull()
    expect(last.pctOfPrevious).toBeNull()
  })

  it('lists the pages people enter by', async () => {
    const res = await request(app()).get('/analytics/acquisition').expect(200)
    expect(res.body.landingPages[0]).toEqual({ path: '/vacantes/vac-1', visitors: 2 })
  })
})

describe('GET /analytics/users', () => {
  it('lists real accounts with their origin, and groups them', async () => {
    const res = await request(app()).get('/analytics/users').expect(200)

    expect(res.body.total).toBe(1)
    expect(res.body.users[0]).toMatchObject({ username: 'ana', signup_source: 'linkedin', profile_completed: true })
    expect(res.body.byRole).toEqual([{ name: 'backend', total: 1 }])
    expect(res.body.bySource).toEqual([{ name: 'linkedin', total: 1 }])
  })

  it('brings the last day each person was active, when it is tracked', async () => {
    data.tables.user_activity_daily = [{ user_id: 'u1', day: '2026-10-20' }, { user_id: 'u1', day: '2026-10-23' }]
    const res = await request(app()).get('/analytics/users').expect(200)

    expect(res.body.activityTracked).toBe(true)
    expect(res.body.users[0].lastActive).toBe('2026-10-23')
  })

  it('never returns more than 500', async () => {
    await request(app()).get('/analytics/users?limit=99999')
    expect(seen.filters).toContain('users:limit:500')
  })
})

describe('GET /analytics/retention', () => {
  it('says it is not ready when activity is not being recorded yet, instead of showing zeros', async () => {
    data.errors.user_activity_daily = 'relation does not exist'
    const res = await request(app()).get('/analytics/retention').expect(200)
    expect(res.body).toEqual({ ready: false })
  })

  it('reports activity and cohorts once there is data', async () => {
    data.tables.user_activity_daily = [{ user_id: 'u1', day: new Date().toISOString().slice(0, 10) }]
    const res = await request(app()).get('/analytics/retention').expect(200)

    expect(res.body.ready).toBe(true)
    expect(res.body).toHaveProperty('dau')
    expect(res.body).toHaveProperty('cohorts')
  })
})
