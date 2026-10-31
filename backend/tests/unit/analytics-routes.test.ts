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
    // `.range` existe porque las lecturas largas de funciones se piden por páginas.
    rpc: (name: string, args: any) => {
      const result = rpcState.impl ? rpcState.impl(name, args) : Promise.resolve({ data: null, error: { message: 'function analytics_visitors_summary does not exist' } })
      return Object.assign(result, { range: () => result })
    },
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


describe('LA distinción de personas en el panel (nuevas/recurrentes, activas/solo visita, registradas/anónimas)', () => {
  /** Una fila de analytics_segments como la devuelve la base. */
  const sql = (grp: string, patch: Record<string, unknown> = {}) => ({
    grp, visits: 120, people: 60, new_people: 40, new_active: 25, returning_people: 20, returning_active: 15, registered: 12, registered_active: 12,
    anonymous: 48, anonymous_active: 28, registered_new: 5, active: 40, ...patch,
  })
  const groups = (extra: Record<string, any[]> = {}) => async (name: string, args: any) => {
    if (name === 'analytics_visitors_series') return { data: [], error: null }
    if (name === 'analytics_segments') return { data: extra[args.p_group] ?? [sql(args.p_group === 'all' ? 'Todo el sitio' : args.p_group)], error: null }
    return { data: null, error: { message: `function ${name} does not exist` } }
  }

  describe('overview', () => {
    it('says the measurement is not ready (instead of zeros) when the SQL functions do not exist yet', async () => {
      const res = await request(app()).get('/analytics/overview?days=7').expect(200)
      expect(res.body.traffic).toEqual({ ready: false })
      expect(res.body.totals).toBeDefined()
    })

    it('splits the people: new and returning, active and visit only, registered and anonymous, and measures conversion over the new ACTIVE ones', async () => {
      rpcState.impl = groups()
      const res = await request(app()).get('/analytics/overview?days=7').expect(200)

      expect(res.body.traffic.ready).toBe(true)
      expect(res.body.traffic.segments).toMatchObject({
        visits: 120, people: 60, active: 40,
        newPeople: 40, newActive: 25, newVisitOnly: 15,
        returningPeople: 20, returningActive: 15, returningVisitOnly: 5,
        registered: 12, anonymous: 48, registeredNew: 5,
      })
      // 5 registros de gente nueva entre 25 nuevas ACTIVAS = 20 %: no entre las 40 activas, ni entre las 40 nuevas, ni entre las visitas.
      expect(res.body.traffic.segments.conversionPct).toBe(20)
    })

    it('compares with the previous period only if the measurement already existed then', async () => {
      data.tables.analytics_sessions = [{ created_at: new Date(Date.now() - 60 * 86400000).toISOString() }]
      rpcState.impl = async (name, args) => {
        if (name === 'analytics_segments' && args.p_group === 'all' && new Date(args.p_to).getTime() < Date.now() - 86400000) return { data: [sql('Todo el sitio', { active: 20, new_active: 10 })], error: null }
        return groups()(name, args)
      }
      const covered = (await request(app()).get('/analytics/overview?days=7').expect(200)).body.traffic
      expect(covered.partial).toBe(false)
      expect(covered.vs).toEqual({ active: 100, newActive: 150 })

      data.tables.analytics_sessions = [{ created_at: new Date(Date.now() - 3 * 86400000).toISOString() }]
      const recent = (await request(app()).get('/analytics/overview?days=7').expect(200)).body.traffic
      expect(recent.partial).toBe(true)
      expect(recent.vs).toEqual({ active: null, newActive: null })
    })

    it('asks for hours when the period is the last 24 hours, and fills the series with every bucket', async () => {
      const calls: any[] = []
      rpcState.impl = async (name, args) => { calls.push([name, args]); return groups()(name, args) }
      const res = await request(app()).get('/analytics/overview?days=1').expect(200)
      expect(calls.find(([name]) => name === 'analytics_visitors_series')![1].p_bucket).toBe('hour')
      expect(res.body.traffic.series).toHaveLength(24)
    })

    it('nobody came: zeros are real zeros, and the conversion has no division by zero', async () => {
      rpcState.impl = groups({ all: [] })
      const res = await request(app()).get('/analytics/overview?days=7').expect(200)
      expect(res.body.traffic.segments).toMatchObject({ people: 0, newActive: 0, conversionPct: null })
    })

    it('a real database error is a 500, not a silent zero', async () => {
      rpcState.impl = async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await request(app()).get('/analytics/overview?days=7').expect(500)
    })
  })

  describe('vacancies', () => {
    const vac = (slug: string | null, patch: Record<string, unknown> = {}) => ({
      slug, viewers: 20, viewers_active: 12, viewers_new: 14, viewers_new_active: 6, viewers_returning: 6, viewers_registered: 5, viewers_anonymous: 15, applicants: 5, applicants_active: 5, ...patch,
    })

    it('segments the people who opened each vacancy: registered vs anonymous, new vs returning, and of the new ones who are active', async () => {
      data.tables.community_posts = [{ id: 'p1', slug: 'vac-1', title: 'Backend en Stripe', company: 'Stripe', role_category: 'backend' }]
      data.tables.user_vacancy_history = [{ source_id: 'p1' }, { source_id: 'p1' }]
      rpcState.impl = async (name) => (name === 'analytics_vacancy_segments' ? { data: [vac(null, { viewers: 30 }), vac('vac-1'), vac('vac-2', { viewers: 10, viewers_active: 4 })], error: null } : { data: null, error: { message: 'function does not exist' } })

      const res = await request(app()).get('/analytics/vacancies?days=30').expect(200)

      expect(res.body).toMatchObject({ ready: true, source: 'segments' })
      expect(res.body.totals).toMatchObject({ viewers: 30, vacancies: 2, saved: 2 })
      expect(res.body.top[0]).toMatchObject({
        slug: 'vac-1', title: 'Backend en Stripe', viewers: 20, viewersActive: 12, viewersVisitOnly: 8,
        viewersNew: 14, viewersNewActive: 6, viewersNewVisitOnly: 8, viewersReturning: 6, viewersRegistered: 5, viewersAnonymous: 15, applicants: 5, saved: 2,
      })
      // la tasa de postulación es de las personas ACTIVAS que abrieron: 5 de 12
      expect(res.body.top[0].applyRatePct).toBe(41.7)
      expect(res.body.top[1]).toMatchObject({ slug: 'vac-2', title: 'vac-2', saved: 0 })
    })

    it('says the period is incomplete when the measurement started after it began', async () => {
      data.tables.analytics_sessions = [{ created_at: new Date(Date.now() - 2 * 86400000).toISOString() }]
      rpcState.impl = async (name) => (name === 'analytics_vacancy_segments' ? { data: [], error: null } : { data: null, error: { message: 'function does not exist' } })
      const res = await request(app()).get('/analytics/vacancies?days=30').expect(200)
      expect(res.body.partial).toBe(true)
    })

    it('falls back to the old per-browser count, saying so, when the SQL functions do not exist yet', async () => {
      data.tables.vacancy_events = [{ vacancy_slug: 'vac-1', event: 'view', visitor_id: 'a' }]
      const res = await request(app()).get('/analytics/vacancies?days=30').expect(200)
      expect(res.body.source).toBe('legacy')
    })

    it('no one opened a vacancy yet: zeros and no division by zero', async () => {
      rpcState.impl = async (name) => (name === 'analytics_vacancy_segments' ? { data: [], error: null } : { data: null, error: { message: 'function does not exist' } })
      const res = await request(app()).get('/analytics/vacancies?days=30').expect(200)
      expect(res.body.totals).toMatchObject({ viewers: 0, applicants: 0, applyRatePct: null })
      expect(res.body.top).toEqual([])
    })

    it('a real database error is a 500, not a silent zero', async () => {
      rpcState.impl = async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await request(app()).get('/analytics/vacancies?days=30').expect(500)
    })
  })

  describe('acquisition', () => {
    it('gives every channel and entry page the same distinction, and a funnel in people', async () => {
      rpcState.impl = groups({
        channel: [sql('linkedin / social / vacante-auto', { people: 30 }), sql('(direct) / (none) / (not set)', { people: 25 })],
        landing: [sql('/vacantes/react')],
      })
      const res = await request(app()).get('/analytics/acquisition?days=30').expect(200)

      expect(res.body.source).toBe('segments')
      expect(res.body.channels[0]).toMatchObject({ label: 'linkedin / social / vacante-auto', people: 30, newPeople: 40, newActive: 25, newVisitOnly: 15, registeredNew: 5, conversionPct: 20 })
      expect(res.body.landing[0].label).toBe('/vacantes/react')
      expect(res.body.funnel.slice(0, 4)).toEqual([
        { step: 'Personas que entraron', count: 60, pctOfPrevious: null },
        { step: 'Activas (hicieron algo)', count: 40, pctOfPrevious: 66.7 },
        { step: 'Nuevas activas', count: 25, pctOfPrevious: 62.5 },
        { step: 'Se registraron (de las nuevas activas)', count: 5, pctOfPrevious: 20 },
      ])
    })

    it('falls back to the old count, saying so, when the SQL function does not exist', async () => {
      const res = await request(app()).get('/analytics/acquisition?days=30').expect(200)
      expect(res.body.source).toBe('legacy')
      expect(res.body.funnel[0].step).toBe('Visitantes')
    })

    it('a real database error is a 500, not a silent zero', async () => {
      rpcState.impl = async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await request(app()).get('/analytics/acquisition?days=30').expect(500)
    })
  })

  describe('linkedin', () => {
    const post = (slug: string, role: string, company: string) => ({ vacancy_slug: slug, company, role_category: role, linkedin_post_id: `urn:${slug}`, status: 'published', published_at: new Date(Date.now() - 7200000).toISOString(), created_at: new Date(Date.now() - 7200000).toISOString() })

    it('gives each post and the whole of LinkedIn the same distinction', async () => {
      data.tables.linkedin_vacancy_posts = [post('vac-1', 'backend', 'Stripe'), post('vac-2', 'backend', 'Twilio')]
      rpcState.impl = groups({
        linkedin_post: [sql('vac-1', { people: 30, new_people: 20, new_active: 10, registered_new: 2 })],
        linkedin: [sql('LinkedIn', { people: 55 })],
      })
      const res = await request(app()).get('/analytics/linkedin?days=30').expect(200)

      expect(res.body.source).toBe('segments')
      expect(res.body.posts.find((row: any) => row.slug === 'vac-1').segments).toMatchObject({ people: 30, newPeople: 20, newActive: 10, newVisitOnly: 10, registeredNew: 2, conversionPct: 20 })
      // una publicación que nadie visitó sigue saliendo, en cero real
      expect(res.body.posts.find((row: any) => row.slug === 'vac-2').segments).toMatchObject({ people: 0, newActive: 0, conversionPct: null })
      expect(res.body.totals.segments.people).toBe(55)
      // los grupos suman las personas de sus publicaciones y comparan por personas por publicación
      expect(res.body.byRole[0]).toMatchObject({ key: 'backend', posts: 2, peoplePerPost: 15 })
    })

    it('falls back to the old count, saying so, when the SQL function does not exist', async () => {
      const res = await request(app()).get('/analytics/linkedin?days=30').expect(200)
      expect(res.body.source).toBe('legacy')
    })
  })

  describe('web segments (Tráfico web)', () => {
    it('asks for several breakdowns at once, each with the distinction', async () => {
      rpcState.impl = groups()
      const res = await request(app()).get('/analytics/web/segments?list=language,device_category&days=7').expect(200)
      expect(Object.keys(res.body.groups)).toEqual(['language', 'device_category'])
      expect(res.body.groups.language[0]).toMatchObject({ newActive: 25, registeredNew: 5 })
    })

    it('refuses a breakdown that is not on the closed list, without touching the database', async () => {
      rpcState.impl = groups()
      await request(app()).get('/analytics/web/segments?list=client_id').expect(400)
      await request(app()).get('/analytics/web/segments?list=' + encodeURIComponent('language; DROP TABLE users')).expect(400)
      await request(app()).get('/analytics/web/segments').expect(400)
    })

    it('says it is not ready when the migration was not applied', async () => {
      const res = await request(app()).get('/analytics/web/segments?list=language').expect(200)
      expect(res.body).toEqual({ ready: false })
    })
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
