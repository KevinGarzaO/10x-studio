import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
const rpcState = vi.hoisted(() => ({ impl: null as null | unknown }))
const db = vi.hoisted(() => ({ tables: {} as Record<string, any>, filters: [] as string[], errors: {} as Record<string, string> }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    rpc,
    from: (table: string) => {
      const q: any = {}
      for (const name of ['eq', 'neq', 'gte', 'in', 'or', 'order', 'limit', 'range', 'select']) {
        q[name] = (...args: unknown[]) => { db.filters.push(`${table}:${name}:${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(',')}`); return q }
      }
      const result = () => {
        if (db.errors[table]) return { data: null, count: null, error: { message: db.errors[table] } }
        const rows = db.tables[table] ?? []
        return { data: rows, count: Array.isArray(rows) ? rows.length : null, error: null }
      }
      q.maybeSingle = () => Promise.resolve({ ...result(), data: (db.tables[table] ?? [])[0] ?? null })
      q.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject)
      return q
    },
  },
}))

import router from '../../src/routes/admin/analytics.routes'

const app = () => {
  const a = express()
  a.use('/analytics', router)
  return a
}

const ID = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
const session = (patch: Record<string, unknown> = {}) => ({
  session_id: ID, user_id: null, client_id: 'client-aaaa-1', person_key: 'client-aaaa-1', entry_path: '/vacantes/react', exit_path: '/saved', country: 'MX', region: 'NLE', city: 'Monterrey',
  latitude: 25.6866, longitude: -100.3161, device_category: 'desktop', operating_system: 'Windows', browser: 'Chrome', language: 'es-MX', utm_source: 'linkedin', referrer_host: 'linkedin.com',
  is_new_visitor: true, page_views_count: 2, duration_seconds: 34, is_engaged: true, has_conversion: false, created_at: '2026-10-30T15:00:00Z', last_activity_at: '2026-10-30T15:01:00Z', ...patch,
})

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: [], error: null })
  db.tables = {}
  db.filters = []
  db.errors = {}
})

describe('GET /web/geo, /web/pages and /web/events', () => {
  const segmentRow = (grp: string) => ({ grp, visits: 10, people: 5, new_people: 3, new_active: 2, returning_people: 2, returning_active: 1, registered: 1, registered_active: 1, anonymous: 4, anonymous_active: 2, registered_new: 1, active: 3 })

  it('brings the city points, and the countries and regions with the same distinction of people', async () => {
    rpcState.impl = null
    rpc.mockImplementation(async (name: string, args: any) => ({ data: name === 'analytics_segments' ? [segmentRow(args.p_group)] : [{ fn: name }], error: null }))
    const res = await request(app()).get('/analytics/web/geo?days=30').expect(200)

    expect(res.body.points).toEqual([{ fn: 'analytics_geo_points' }])
    expect(res.body.countries[0]).toMatchObject({ label: 'country', people: 5, newActive: 2, newVisitOnly: 1, registeredNew: 1, conversionPct: 50 })
    expect(res.body.regions[0].label).toBe('region')
    expect(rpc).toHaveBeenCalledWith('analytics_segments', expect.objectContaining({ p_group: 'country' }))
  })

  it('says it is not ready when the migration was not applied', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.analytics_segments in the schema cache' } })
    const res = await request(app()).get('/analytics/web/geo').expect(200)
    expect(res.body).toEqual({ ready: false })
  })

  it('answers the pages and the events', async () => {
    rpc.mockImplementation(async (name: string) => ({ data: [{ fn: name }], error: null }))
    expect((await request(app()).get('/analytics/web/pages').expect(200)).body.pages).toEqual([{ fn: 'analytics_pages' }])
    expect((await request(app()).get('/analytics/web/events').expect(200)).body.events).toEqual([{ fn: 'analytics_events_summary' }])
  })
})

describe('GET /web/live', () => {
  it('lists the sessions with activity in the last minutes, newest first, with who they are', async () => {
    db.tables.analytics_real_sessions = [session({ user_id: 'u1' }), session({ session_id: 'otra' })]
    db.tables.users = [{ id: 'u1', username: 'ana', display_name: 'Ana', email: 'ana@x.com' }]
    const res = await request(app()).get('/analytics/web/live?minutes=5').expect(200)

    expect(res.body.ready).toBe(true)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions[0].user).toEqual({ username: 'ana', displayName: 'Ana', email: 'ana@x.com' })
    expect(res.body.sessions[1].user).toBeNull()
    expect(db.filters.some((f) => f.startsWith('analytics_real_sessions:gte:last_activity_at'))).toBe(true)
    expect(db.filters).toContain('analytics_real_sessions:order:last_activity_at,{"ascending":false}')
  })
})

describe('GET /web/sessions', () => {
  it('lists the sessions of a page, with the total, newest first', async () => {
    db.tables.analytics_real_sessions = [session(), session({ session_id: 'b' })]
    const res = await request(app()).get('/analytics/web/sessions?page=2&pageSize=10').expect(200)

    expect(res.body).toMatchObject({ ready: true, page: 2, pageSize: 10, total: 2 })
    expect(db.filters).toContain('analytics_real_sessions:range:10,19')
    expect(db.filters).toContain('analytics_real_sessions:order:created_at,{"ascending":false}')
  })

  it('brings the Clarity recording of each session when there is one, and null when there is not', async () => {
    db.tables.analytics_real_sessions = [session(), session({ session_id: 'b' })]
    db.tables.analytics_clarity_links = [{ session_id: ID, clarity_session_url: 'https://clarity.microsoft.com/player/abc/u1/s1' }]
    const res = await request(app()).get('/analytics/web/sessions').expect(200)
    expect(res.body.sessions[0].clarity_url).toBe('https://clarity.microsoft.com/player/abc/u1/s1')
    expect(res.body.sessions[1].clarity_url).toBeNull()
  })

  it('still lists the sessions (without video) when the Clarity migration has not been applied', async () => {
    db.tables.analytics_real_sessions = [session()]
    db.errors.analytics_clarity_links = 'relation "analytics_clarity_links" does not exist'
    const res = await request(app()).get('/analytics/web/sessions').expect(200)
    expect(res.body.ready).toBe(true)
    expect(res.body.sessions[0].clarity_url).toBeNull()
  })

  it('applies the filters the panel offers, and ignores values that are not valid', async () => {
    await request(app()).get('/analytics/web/sessions?device=mobile&country=mx&source=LinkedIn&engaged=1&conversion=1&visitor=new').expect(200)
    expect(db.filters).toEqual(expect.arrayContaining([
      'analytics_real_sessions:eq:device_category,mobile',
      'analytics_real_sessions:eq:country,MX',
      'analytics_real_sessions:eq:utm_source,linkedin',
      'analytics_real_sessions:eq:is_engaged,true',
      'analytics_real_sessions:eq:has_conversion,true',
      'analytics_real_sessions:eq:is_new_visitor,true',
    ]))

    db.filters = []
    await request(app()).get('/analytics/web/sessions?device=toaster&country=MEXICO&visitor=otro').expect(200)
    expect(db.filters.some((f) => f.includes(':eq:device_category') || f.includes(':eq:country') || f.includes(':eq:is_new_visitor'))).toBe(false)
  })

  it('searches across page, city, country, source, site and language, without letting the text break the filter', async () => {
    await request(app()).get('/analytics/web/sessions?q=' + encodeURIComponent('mty),id.eq.1%')).expect(200)
    const filter = db.filters.find((f) => f.startsWith('analytics_real_sessions:or:'))
    expect(filter).toContain('city.ilike.%mty')
    expect(filter).toContain('language.ilike')
    expect(filter).not.toContain('),id')
  })

  it('caps the page size', async () => {
    await request(app()).get('/analytics/web/sessions?pageSize=99999').expect(200)
    expect(db.filters).toContain('analytics_real_sessions:range:0,99')
  })

  it('filters by one person (all their visits)', async () => {
    await request(app()).get('/analytics/web/sessions?person=client-aaaa-1').expect(200)
    expect(db.filters).toContain('analytics_real_sessions:eq:person_key,client-aaaa-1')
    db.filters = []
    await request(app()).get('/analytics/web/sessions?person=' + encodeURIComponent("x' OR '1'='1")).expect(200)
    expect(db.filters.some((f) => f.includes(':eq:person_key'))).toBe(false)
  })
})

describe('GET /web/sessions/:id', () => {
  it('gives the whole session: every page with its time, every event with its parameters, and the other visits of that person', async () => {
    db.tables.analytics_sessions = [session({ user_id: 'u1' })]
    db.tables.analytics_page_views = [{ id: 1, path: '/vacantes/react', query_params: { page: '2' }, created_at: '2026-10-30T15:00:00Z' }, { id: 2, path: '/saved', query_params: null, created_at: '2026-10-30T15:00:20Z' }]
    db.tables.analytics_events = [{ id: 1, event_name: 'click_view_job_detail', event_params: { slug: 'react' }, is_conversion: false, created_at: '2026-10-30T15:00:05Z' }]
    db.tables.users = [{ id: 'u1', username: 'ana', display_name: 'Ana', email: 'ana@x.com' }]
    const res = await request(app()).get(`/analytics/web/sessions/${ID}`).expect(200)

    expect(res.body.session).toMatchObject({ city: 'Monterrey', latitude: 25.6866, user: { username: 'ana' } })
    expect(res.body.pageViews.map((v: any) => v.path)).toEqual(['/vacantes/react', '/saved'])
    expect(res.body.events[0]).toMatchObject({ event_name: 'click_view_job_detail', event_params: { slug: 'react' } })
    expect(res.body.otherSessions).toBeDefined()
    expect(db.filters).toContain(`analytics_sessions:neq:session_id,${ID}`)
    expect(db.filters.some((f) => f.startsWith('analytics_sessions:or:client_id.eq.client-aaaa-1,user_id.eq.u1'))).toBe(true)
  })

  it('an anonymous visitor only finds their own browser', async () => {
    db.tables.analytics_sessions = [session()]
    await request(app()).get(`/analytics/web/sessions/${ID}`).expect(200)
    expect(db.filters.some((f) => f === 'analytics_sessions:or:client_id.eq.client-aaaa-1')).toBe(true)
  })

  it('refuses an id that is not a UUID and answers 404 for one that does not exist', async () => {
    await request(app()).get('/analytics/web/sessions/no-es-uuid').expect(400)
    await request(app()).get(`/analytics/web/sessions/${ID}`).expect(404)
  })
})

describe('GET /web/retention', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })
  const person = (key: string, patch: Record<string, unknown> = {}) => ({ person_key: key, is_registered: false, first_day: '2026-10-01', is_new: false, days_active: 2, return_days: 1, last_active: today, active_days: [today], ...patch })

  it('puts the people, the daily series and the cohorts together, counting who came back among those who could', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'analytics_people_activity') return { data: [person('u1', { is_registered: true }), person('c1', { return_days: 0, first_day: today, is_new: true }), person('c2', { return_days: 0, days_active: 1, is_new: true })], error: null }
      if (name === 'analytics_active_users') return { data: [{ day: '2026-10-29', dau: 1, wau: 3, mau: 4 }, { day: today, dau: 2, wau: 3, mau: 4 }], error: null }
      if (name === 'analytics_retention_cohorts') return { data: [{ cohort_week: '2026-10-26', cohort_size: 3, week_offset: 0, retained: 3, retained_pct: 100 }], error: null }
      return { data: [], error: null }
    })
    db.tables.users = [{ id: 'u1', username: 'ana', display_name: 'Ana', photo_url: null, profile_completed: true }]
    const res = await request(app()).get('/analytics/web/retention?days=30').expect(200)

    expect(res.body.ready).toBe(true)
    expect(res.body.summary).toMatchObject({ dau: 2, mau: 4, stickinessPct: 50, activePeople: 3, newActive: 2, returningActive: 1, eligible: 2, returned: 1, returnRatePct: 50 })
    expect(res.body.people[0]).toMatchObject({ key: 'u1', registered: true, username: 'ana', displayName: 'Ana', returnDays: 1, activeToday: true })
    expect(res.body.people[1]).toMatchObject({ registered: false, username: null })
    expect(res.body.cohorts).toEqual([{ week: '2026-10-26', size: 3, retained: [{ offset: 0, count: 3, pct: 100 }] }])
    expect(rpc).toHaveBeenCalledWith('analytics_people_activity', { p_days: 30, p_limit: 1000 })
  })

  it('says it is not ready when the migration was not applied', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.analytics_people_activity in the schema cache' } })
    const res = await request(app()).get('/analytics/web/retention').expect(200)
    expect(res.body).toEqual({ ready: false })
  })
})
