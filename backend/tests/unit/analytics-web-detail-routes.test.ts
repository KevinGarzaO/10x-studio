import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
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

describe('GET /web/dimension and /web/dimensions', () => {
  it('asks the SQL function for one breakdown and returns its rows', async () => {
    rpc.mockResolvedValue({ data: [{ value: 'es-MX', sessions: 5 }], error: null })
    const res = await request(app()).get('/analytics/web/dimension?dimension=language&days=7').expect(200)

    expect(rpc).toHaveBeenCalledWith('analytics_dimension', { p_days: 7, p_dimension: 'language', p_limit: 50 })
    expect(res.body).toMatchObject({ ready: true, dimension: 'language', rows: [{ value: 'es-MX', sessions: 5 }] })
  })

  it('refuses a breakdown that is not on the closed list, without touching the database', async () => {
    await request(app()).get('/analytics/web/dimension?dimension=client_id').expect(400)
    await request(app()).get('/analytics/web/dimension?dimension=' + encodeURIComponent('language; DROP TABLE users')).expect(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks for several breakdowns at once, keyed by name', async () => {
    rpc.mockImplementation(async (_name: string, args: any) => ({ data: [{ value: args.p_dimension, sessions: 1 }], error: null }))
    const res = await request(app()).get('/analytics/web/dimensions?list=language,browser,device_category').expect(200)

    expect(Object.keys(res.body.dimensions)).toEqual(['language', 'browser', 'device_category'])
    expect(res.body.dimensions.browser[0].value).toBe('browser')
  })

  it('does not accept too many or unknown breakdowns', async () => {
    await request(app()).get('/analytics/web/dimensions?list=language,otro').expect(400)
    await request(app()).get('/analytics/web/dimensions').expect(400)
  })

  it('says it is not ready when the detail migration was not applied', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.analytics_dimension in the schema cache' } })
    const res = await request(app()).get('/analytics/web/dimension?dimension=language').expect(200)
    expect(res.body).toEqual({ ready: false })
  })
})

describe('GET /web/geo, /web/pages and /web/events', () => {
  it('brings the city points, the countries and the regions together', async () => {
    rpc.mockImplementation(async (name: string) => ({ data: [{ fn: name }], error: null }))
    const res = await request(app()).get('/analytics/web/geo?days=30').expect(200)

    expect(res.body.points).toEqual([{ fn: 'analytics_geo_points' }])
    expect(res.body.countries).toEqual([{ fn: 'analytics_dimension' }])
    expect(rpc).toHaveBeenCalledWith('analytics_dimension', { p_days: 30, p_dimension: 'country', p_limit: 250 })
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
