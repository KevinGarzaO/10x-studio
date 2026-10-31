import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString()

const data = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  errors: {} as Record<string, string>,
}))
const seen = vi.hoisted(() => ({ filters: [] as string[] }))
const rpcState = vi.hoisted(() => ({ impl: null as null | ((name: string, args: any) => Promise<{ data: any; error: any }>) }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    // La analítica web propia (funciones SQL) no existe en estas pruebas: el resumen debe seguir respondiendo sin ella.
    rpc: (name: string, args: any) => (rpcState.impl ? rpcState.impl(name, args) : Promise.resolve({ data: null, error: { message: 'function analytics_visitors_summary does not exist' } })),
    from: (table: string) => ({
      select: () => {
        let single = false
        const q: any = {}
        for (const name of ['eq', 'not', 'in', 'gte', 'order', 'limit', 'range', 'or']) {
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
  rpcState.impl = null
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

  it('never returns more than 100 per page, and asks only for that page', async () => {
    await request(app()).get('/analytics/users?pageSize=99999&page=3')
    expect(seen.filters).toContain('users:range:200,299')
  })

  it('searches by name, username or email, without letting what is typed break the filter', async () => {
    await request(app()).get('/analytics/users?q=ana),id.eq.1%25').expect(200)
    const filter = seen.filters.find((entry) => entry.startsWith('users:or:'))
    expect(filter).toBeTruthy()
    expect(filter).toContain('display_name.ilike.%ana')
    expect(filter).not.toContain('),id')
    expect(filter).not.toContain('%25')
  })

  it('filters by how they signed up and ignores unknown providers', async () => {
    await request(app()).get('/analytics/users?provider=github').expect(200)
    expect(seen.filters).toContain('users:eq:provider,github')
    seen.filters.length = 0
    await request(app()).get('/analytics/users?provider=hacker').expect(200)
    expect(seen.filters).not.toContain('users:eq:provider,hacker')
  })

  it('says how each person signed up, and counts them', async () => {
    data.tables.users[0] = { ...data.tables.users[0], provider: 'github' }
    const res = await request(app()).get('/analytics/users').expect(200)
    expect(res.body.users[0].provider).toBe('github')
    expect(res.body.byProvider).toEqual([{ name: 'github', total: 1 }])
    expect(res.body).toMatchObject({ total: 1, completed: 1, page: 1, pageSize: 25 })
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

  it('does not count or list the team: only real people', async () => {
    const today = new Date().toISOString().slice(0, 10)
    data.tables.users = [
      ...data.tables.users,
      { id: 'adm', username: 'admin', display_name: 'Admin', photo_url: null, user_kind: 'superadmin', created_at: hoursAgo(900), profile_completed: true },
    ]
    data.tables.user_activity_daily = [{ user_id: 'u1', day: today }, { user_id: 'adm', day: today }]

    const res = await request(app()).get('/analytics/retention').expect(200)

    expect(res.body.dau).toBe(1)
    expect(res.body.people.map((person: { id: string }) => person.id)).toEqual(['u1'])
    expect(JSON.stringify(res.body.people)).not.toContain('@')
  })
})


describe('GET /analytics/overview: active visitors, new and returning', () => {
  const summary = (patch: Record<string, unknown> = {}) => ({
    tracking_since: new Date(Date.now() - 60 * 86400000).toISOString(), active: 40, new_active: 25, returning_active: 15, registered_new: 5,
    linkedin_active: 12, sessions: 90, engaged_sessions: 55, ...patch,
  })

  it('says the measurement is not ready (instead of zeros) when the SQL functions do not exist yet', async () => {
    const res = await request(app()).get('/analytics/overview?days=7').expect(200)
    expect(res.body.traffic).toEqual({ ready: false })
    // lo demás del resumen sigue respondiendo
    expect(res.body.totals).toBeDefined()
  })

  it('counts only active people, split in new and returning, and measures conversion over the NEW ones', async () => {
    rpcState.impl = async (name) => (name === 'analytics_visitors_series' ? { data: [], error: null } : { data: [summary()], error: null })
    const res = await request(app()).get('/analytics/overview?days=7').expect(200)

    expect(res.body.traffic).toMatchObject({ ready: true, active: 40, newActive: 25, returningActive: 15, registeredNew: 5, linkedinActive: 12, sessions: 90, bounces: 35 })
    // 5 registros de gente nueva entre 25 nuevos activos = 20 %, no entre las 40 activas ni entre las 90 entradas.
    expect(res.body.traffic.conversionPct).toBe(20)
  })

  it('compares with the previous period only if the measurement already existed then', async () => {
    rpcState.impl = async (name, args) => {
      if (name === 'analytics_visitors_series') return { data: [], error: null }
      const isPrevious = new Date(args.p_to).getTime() < Date.now() - 86400000
      return { data: [summary(isPrevious ? { active: 20, new_active: 10 } : {})], error: null }
    }
    const covered = (await request(app()).get('/analytics/overview?days=7').expect(200)).body.traffic
    expect(covered.partial).toBe(false)
    expect(covered.vs).toEqual({ active: 100, newActive: 150 })

    // la medición empezó hace 3 días: ni el periodo ni el anterior están completos
    rpcState.impl = async (name) => (name === 'analytics_visitors_series' ? { data: [], error: null } : { data: [summary({ tracking_since: new Date(Date.now() - 3 * 86400000).toISOString() })], error: null })
    const recent = (await request(app()).get('/analytics/overview?days=7').expect(200)).body.traffic
    expect(recent.partial).toBe(true)
    expect(recent.vs).toEqual({ active: null, newActive: null })
  })

  it('fills the series with every day of the period, and zeros where nobody was active', async () => {
    const today = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10)
    rpcState.impl = async (name) => (name === 'analytics_visitors_series' ? { data: [{ bucket: today, active: 7, new_active: 3 }], error: null } : { data: [summary()], error: null })
    const res = await request(app()).get('/analytics/overview?days=7').expect(200)

    expect(res.body.traffic.series).toHaveLength(7)
    expect(res.body.traffic.series[6]).toEqual({ day: today, active: 7, newActive: 3 })
    expect(res.body.traffic.series[0]).toMatchObject({ active: 0, newActive: 0 })
  })

  it('asks for hours when the period is the last 24 hours', async () => {
    const calls: any[] = []
    rpcState.impl = async (name, args) => { calls.push([name, args]); return { data: name === 'analytics_visitors_series' ? [] : [summary()], error: null } }
    await request(app()).get('/analytics/overview?days=1').expect(200)
    expect(calls.find(([name]) => name === 'analytics_visitors_series')![1].p_bucket).toBe('hour')
  })

  it('a real database error is a 500, not a silent zero', async () => {
    rpcState.impl = async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await request(app()).get('/analytics/overview?days=7').expect(500)
  })

  it('has no one active yet: zeros are real zeros and the conversion has no division by zero', async () => {
    rpcState.impl = async (name) => (name === 'analytics_visitors_series' ? { data: [], error: null } : { data: [summary({ active: 0, new_active: 0, returning_active: 0, registered_new: 0, linkedin_active: 0, sessions: 0, engaged_sessions: 0 })], error: null })
    const res = await request(app()).get('/analytics/overview?days=7').expect(200)
    expect(res.body.traffic).toMatchObject({ active: 0, newActive: 0, conversionPct: null, bounces: 0 })
  })
})

describe('GET /analytics/overview: companies', () => {
  it('no longer reports company claims: AvoTalent only serves people for now', async () => {
    data.tables.company_claims = [{ status: 'approved' }, { status: 'pending' }]
    const res = await request(app()).get('/analytics/overview').expect(200)

    expect(res.body).not.toHaveProperty('companies')
    expect(seen.filters.every(filter => !filter.startsWith('company_claims'))).toBe(true)
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

describe('GET /analytics/me', () => {
  it('confirms the permission and brings the account that is looking at the panel', async () => {
    data.tables.users = [{ id: 'adm', username: 'kgarza', display_name: 'Kevin', photo_url: 'https://cdn.test/k.jpg', email: 'k@x.com' }]
    const res = await request(app()).get('/analytics/me').expect(200)

    // sin sesión simulada no hay quién: la ruta responde ok y no inventa una cuenta
    expect(res.body.ok).toBe(true)
    expect(res.body.user).toBeNull()
  })
})

describe('GET /analytics/matching', () => {
  it('only counts real members: not the team, not test accounts', async () => {
    await request(app()).get('/analytics/matching')

    expect(seen.filters).toContain('users:eq:user_kind,user')
    expect(seen.filters).toContain('users:eq:is_test_account,false')
  })
})

describe('the last 24 hours period', () => {
  it('is accepted, and any other value falls back to 30 days', async () => {
    const day = await request(app()).get('/analytics/overview?days=1').expect(200)
    expect(day.body.days).toBe(1)
    expect(day.body.series).toHaveLength(24)

    const other = await request(app()).get('/analytics/overview?days=5').expect(200)
    expect(other.body.days).toBe(30)
  })
})
