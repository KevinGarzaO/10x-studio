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
      { id: 'u1', username: 'ana', display_name: 'Ana', email: 'ana@x.com', photo_url: 'https://cdn.test/ana.jpg', user_kind: 'user', profile_completed: true, role_category: 'backend', seniority: 'senior', location: 'MX', signup_source: 'linkedin', signup_medium: 'social', signup_campaign: 'vacante-auto', signup_content: 'vac-1', created_at: hoursAgo(1) },
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
    expect(res.body.users[0]).toMatchObject({ username: 'ana', signup_source: 'linkedin', profile_completed: true, photo_url: 'https://cdn.test/ana.jpg' })
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

  it('does not count the team in the active numbers, but lists them in the table', async () => {
    const today = new Date().toISOString().slice(0, 10)
    data.tables.users = [
      ...data.tables.users,
      { id: 'adm', username: 'admin', display_name: 'Admin', photo_url: null, user_kind: 'superadmin', created_at: hoursAgo(900), profile_completed: true },
    ]
    data.tables.user_activity_daily = [{ user_id: 'u1', day: today }, { user_id: 'adm', day: today }]

    const res = await request(app()).get('/analytics/retention').expect(200)

    expect(res.body.dau).toBe(1)
    expect(res.body.people.map((person: { id: string }) => person.id).sort()).toEqual(['adm', 'u1'])
    expect(res.body.people.find((person: { id: string }) => person.id === 'adm').counted).toBe(false)
    expect(JSON.stringify(res.body.people)).not.toContain('@')
  })
})

describe('GET /analytics/overview: companies', () => {
  it('reports how many companies claimed their profile and how many wait for approval', async () => {
    data.tables.company_claims = [{ status: 'approved' }, { status: 'approved' }, { status: 'pending' }, { status: 'rejected' }]
    const res = await request(app()).get('/analytics/overview').expect(200)

    expect(res.body.companies).toEqual({ claimed: 2, pendingClaims: 1 })
  })

  it('is zero when there are no claims', async () => {
    const res = await request(app()).get('/analytics/overview').expect(200)
    expect(res.body.companies).toEqual({ claimed: 0, pendingClaims: 0 })
  })
})

describe('GET /analytics/vacancies', () => {
  beforeEach(() => {
    data.tables.vacancy_events = [
      { vacancy_slug: 'vac-1', event: 'view', visitor_id: 'a' },
      { vacancy_slug: 'vac-1', event: 'view', visitor_id: 'a' },
      { vacancy_slug: 'vac-1', event: 'view', visitor_id: 'b' },
      { vacancy_slug: 'vac-1', event: 'apply', visitor_id: 'a' },
    ]
    data.tables.user_vacancy_history = [{ source_id: 'p1' }, { source_id: 'p1' }]
    data.tables.community_posts = [{ id: 'p1', slug: 'vac-1', title: 'Backend Engineer', company: 'Stripe', role_category: 'backend' }]
  })

  it('counts a browser once per vacancy and gives the rate of apply clicks', async () => {
    const res = await request(app()).get('/analytics/vacancies?days=7').expect(200)

    expect(res.body.ready).toBe(true)
    expect(res.body.totals).toMatchObject({ views: 2, applies: 1, viewers: 2, applyRatePct: 50 })
  })

  it('names each vacancy and adds how many people saved it', async () => {
    const res = await request(app()).get('/analytics/vacancies').expect(200)

    expect(res.body.top[0]).toMatchObject({ slug: 'vac-1', title: 'Backend Engineer', company: 'Stripe', role: 'backend', views: 2, applies: 1, saved: 2 })
    expect(res.body.totals.saved).toBe(2)
  })

  it('says the events are not being recorded yet instead of showing zeros', async () => {
    data.errors.vacancy_events = 'relation "vacancy_events" does not exist'
    const res = await request(app()).get('/analytics/vacancies').expect(200)
    expect(res.body).toEqual({ ready: false })
  })

  it('does not break when nobody has opened a vacancy yet', async () => {
    data.tables.vacancy_events = []
    const res = await request(app()).get('/analytics/vacancies').expect(200)
    expect(res.body.top).toEqual([])
    expect(res.body.totals.applyRatePct).toBeNull()
  })
})

describe('GET /analytics/alerts', () => {
  it('returns the alerts, serious ones first', async () => {
    data.tables.linkedin_profiles = []
    const res = await request(app()).get('/analytics/alerts').expect(200)

    expect(res.body.alerts[0]).toMatchObject({ id: 'linkedin-disconnected', level: 'bad' })
  })

  it('is quiet when LinkedIn is connected and there is nothing wrong', async () => {
    process.env.LINKEDIN_VACANCY_POSTS = 'on'
    data.tables.landing_visits = []
    data.tables.users = []
    data.tables.linkedin_vacancy_posts = []
    const res = await request(app()).get('/analytics/alerts').expect(200)
    delete process.env.LINKEDIN_VACANCY_POSTS

    // Solo puede quedar, a lo más, el aviso de publicaciones que faltan según la hora de hoy.
    expect(res.body.alerts.filter((alert: { level: string }) => alert.level === 'bad')).toEqual([])
  })
})

describe('GET /analytics/matching', () => {
  beforeEach(() => {
    data.tables.users = [
      { id: 'u1', username: 'ana', display_name: 'Ana', photo_url: null, role_category: 'backend', seniority: 'senior', skills: ['python', 'aws'], work_modality: 'Remoto' },
      { id: 'u2', username: 'sin-puesto', display_name: 'Sin puesto', photo_url: null, role_category: null, seniority: null, skills: [], work_modality: null },
    ]
    data.tables.community_posts = [
      { slug: 'vac-1', title: 'Backend Engineer', company: 'Stripe', role_category: 'backend', seniority_level: 'senior', skills: ['python', 'aws'], modalidad: 'Remoto' },
      { slug: 'vac-2', title: 'Contador', company: 'Acme', role_category: 'finanzas', seniority_level: 'senior', skills: ['accounting'], modalidad: 'Presencial' },
    ]
    data.tables.user_skill_levels = []
  })

  it('scores each person against the open vacancies with the same engine as "Para ti"', async () => {
    const res = await request(app()).get('/analytics/matching').expect(200)

    expect(res.body).toMatchObject({ candidates: 1, vacancies: 2, withoutRole: 1 })
    expect(res.body.people[0]).toMatchObject({ name: 'Ana', skills: 2, matches: 1 })
    expect(res.body.people[0].bestScore).toBeGreaterThanOrEqual(70)
    expect(res.body.vacancyCoverage).toMatchObject({ withCandidates: 1, withNone: 1 })
  })

  it('counts the people who have not chosen a role apart, since they cannot see "Para ti"', async () => {
    const res = await request(app()).get('/analytics/matching').expect(200)
    expect(res.body.withoutRole).toBe(1)
    expect(res.body.people.map((person: { name: string }) => person.name)).not.toContain('Sin puesto')
  })

  it('looks only at real people', async () => {
    await request(app()).get('/analytics/matching')

    expect(seen.filters).toContain('users:eq:is_test_account,false')
    expect(seen.filters).toContain('users:not:is_scraper_profile,is,true')
    expect(seen.filters).toContain('users:eq:account_type,candidate')
  })

  it('never returns emails', async () => {
    data.tables.users[0] = { ...data.tables.users[0], email: 'ana@secreto.com' }
    const res = await request(app()).get('/analytics/matching').expect(200)
    expect(JSON.stringify(res.body)).not.toContain('ana@secreto.com')
  })
})
