import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const inserted = vi.hoisted(() => [] as Record<string, unknown>[])
const state = vi.hoisted(() => ({ recent: false, userId: null as string | null, insertError: null as string | null, account: null as { user_kind: string; is_test_account: boolean } | null }))
const filters = vi.hoisted(() => [] as string[])

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: {
      getUser: async (token: string) => (token === 'sesion-buena' && state.userId ? { data: { user: { id: state.userId } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }),
    },
    from: (table: string) => ({
      select: () => {
        const q: any = {}
        for (const name of ['eq', 'gte', 'is', 'limit']) q[name] = (...args: unknown[]) => { filters.push(`${table}:${name}:${args.join(',')}`); return q }
        q.maybeSingle = () => Promise.resolve({ data: table === 'users' ? state.account : null, error: null })
        q.then = (resolve: any) => Promise.resolve({ data: state.recent ? [{ id: 'x' }] : [], error: null }).then(resolve)
        return q
      },
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, ...row })
        return Promise.resolve({ error: state.insertError ? { message: state.insertError } : null })
      },
    }),
  },
}))

import router from '../../src/routes/community/attribution.routes'

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/attribution', router)
  return a
}

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const send = (body: Record<string, unknown>, token?: string, agent = BROWSER) => {
  const req = request(app()).post('/attribution/event').set('User-Agent', agent)
  return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body)
}

beforeEach(() => {
  inserted.length = 0
  filters.length = 0
  state.recent = false
  state.userId = null
  state.insertError = null
  state.account = null
})

describe('POST /attribution/event', () => {
  it('stores that someone opened a vacancy, and always answers 204', async () => {
    const res = await send({ visitorId: 'visitor-0001', slug: 'backend-engineer-1', event: 'view', source: 'linkedin' })

    expect(res.status).toBe(204)
    expect(inserted).toEqual([{ table: 'vacancy_events', vacancy_slug: 'backend-engineer-1', event: 'view', visitor_id: 'visitor-0001', user_id: null, source: 'linkedin' }])
  })

  it('stores a click on "Postularse"', async () => {
    await send({ visitorId: 'visitor-0001', slug: 'backend-engineer-1', event: 'apply' })
    expect(inserted[0]).toMatchObject({ event: 'apply' })
  })

  it('notes who it was when the request carries a session', async () => {
    state.userId = 'u1'
    await send({ visitorId: 'visitor-0001', slug: 'backend-engineer-1', event: 'apply' }, 'sesion-buena')
    expect(inserted[0]).toMatchObject({ user_id: 'u1' })
  })

  it('stores it anonymously when the session is not valid, instead of losing the event', async () => {
    await send({ visitorId: 'visitor-0001', slug: 'backend-engineer-1', event: 'view' }, 'token-malo')
    expect(inserted[0]).toMatchObject({ user_id: null })
  })

  it('does not count the same action twice in a row', async () => {
    state.recent = true
    const res = await send({ visitorId: 'visitor-0001', slug: 'backend-engineer-1', event: 'view' })

    expect(res.status).toBe(204)
    expect(inserted).toEqual([])
    expect(filters).toContain('vacancy_events:eq:vacancy_slug,backend-engineer-1')
    expect(filters).toContain('vacancy_events:eq:event,view')
  })

  it.each([
    [{ visitorId: 'no valido', slug: 'a-b', event: 'view' }],
    [{ visitorId: 'visitor-0001', slug: '', event: 'view' }],
    [{ visitorId: 'visitor-0001', slug: '../etc/passwd', event: 'view' }],
    [{ visitorId: 'visitor-0001', slug: 'x'.repeat(300), event: 'view' }],
    [{ visitorId: 'visitor-0001', slug: 'a-b', event: 'delete' }],
    [{ visitorId: 'visitor-0001', slug: 'a-b' }],
    [{}],
  ])('ignores a malformed event %j', async (body) => {
    const res = await send(body)
    expect(res.status).toBe(204)
    expect(inserted).toEqual([])
  })

  it('never breaks the page when the database fails', async () => {
    state.insertError = 'la tabla no existe'
    const res = await send({ visitorId: 'visitor-0001', slug: 'backend-engineer-1', event: 'view' })
    expect(res.status).toBe(204)
  })
})

describe('POST /attribution/event: robots', () => {
  it('does not count a robot opening a vacancy', async () => {
    const res = await send({ visitorId: 'visitor-bot-01', slug: 'backend-1', event: 'view' }, undefined, 'Mozilla/5.0 (compatible; Googlebot/2.1)')

    expect(res.status).toBe(204)
    expect(inserted).toEqual([])
  })

  it('does not count a request with no browser identification', async () => {
    await send({ visitorId: 'visitor-bot-02', slug: 'backend-1', event: 'view' }, undefined, '')
    expect(inserted).toEqual([])
  })
})

describe('POST /attribution/event: the team', () => {
  it('does not count an administrator opening vacancies', async () => {
    state.userId = 'admin-1'
    state.account = { user_kind: 'superadmin', is_test_account: false }
    const res = await send({ visitorId: 'visitor-team-01', slug: 'backend-1', event: 'view' }, 'sesion-buena')

    expect(res.status).toBe(204)
    expect(inserted).toEqual([])
  })

  it('does not count a test account either', async () => {
    state.userId = 'test-1'
    state.account = { user_kind: 'user', is_test_account: true }
    await send({ visitorId: 'visitor-team-02', slug: 'backend-1', event: 'view' }, 'sesion-buena')
    expect(inserted).toEqual([])
  })

  it('does count a real member', async () => {
    state.userId = 'u1'
    state.account = { user_kind: 'user', is_test_account: false }
    await send({ visitorId: 'visitor-real-01', slug: 'backend-1', event: 'view' }, 'sesion-buena')
    expect(inserted).toHaveLength(1)
  })
})
