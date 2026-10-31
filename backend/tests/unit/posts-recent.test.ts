import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Registra cada llamada encadenada a la consulta de community_posts.
const log = vi.hoisted(() => ({ calls: [] as string[] }))
const rows = vi.hoisted(() => ({ list: [] as any[], error: null as null | { code?: string; message: string } }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('no') }) },
    from: () => {
      const q: any = {}
      for (const name of ['select', 'order', 'eq', 'in', 'or', 'range']) {
        q[name] = (...args: unknown[]) => { log.calls.push(`${name}:${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(',')}`); return q }
      }
      q.then = (resolve: any, reject: any) =>
        Promise.resolve(rows.error ? { data: null, count: null, error: rows.error } : { data: rows.list, count: rows.list.length, error: null }).then(resolve, reject)
      return q
    },
  },
}))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (_req: any, _res: any, next: any) => next(),
}))

import postsRouter from '../../src/routes/community/posts.routes'

const app = () => {
  const a = express()
  a.use('/api/community/posts', postsRouter)
  return a
}

const job = (id: string, company: string, createdAt: string) => ({
  id, company, type: 'job', created_at: createdAt, author: null, community_post_tags: [], votes_count: 0, comments_count: 0,
})

beforeEach(() => {
  log.calls = []
  rows.list = []
  rows.error = null
})

describe('GET /posts?type=job&sort=recent', () => {
  it('orders by creation date, newest first, with the id as tiebreak', async () => {
    await request(app()).get('/api/community/posts?type=job&sort=recent&page=1&limit=20').expect(200)

    expect(log.calls).toContain('order:created_at,{"ascending":false}')
    expect(log.calls).toContain('order:id,{"ascending":false}')
    expect(log.calls.filter(c => c.startsWith('order:')).map(c => c.split(',')[0])).toEqual(['order:created_at', 'order:id'])
  })

  it('paginates in the database instead of loading every vacancy', async () => {
    await request(app()).get('/api/community/posts?type=job&sort=recent&page=3&limit=20').expect(200)

    expect(log.calls).toContain('range:40,59')
  })

  it('keeps the database order and does not regroup the vacancies by company', async () => {
    rows.list = [
      job('1', 'Twilio', '2026-10-03T10:00:00Z'),
      job('2', 'Twilio', '2026-10-03T09:00:00Z'),
      job('3', 'Asana', '2026-10-03T08:00:00Z'),
      job('4', 'Twilio', '2026-10-02T08:00:00Z'),
    ]

    const res = await request(app()).get('/api/community/posts?type=job&sort=recent').expect(200)

    expect(res.body.posts.map((p: any) => p.id)).toEqual(['1', '2', '3', '4'])
  })

  it('keeps the old company mix when sort=recent is not asked for', async () => {
    rows.list = [
      job('1', 'Twilio', '2026-10-03T10:00:00Z'),
      job('2', 'Twilio', '2026-10-03T09:00:00Z'),
      job('3', 'Asana', '2026-10-03T08:00:00Z'),
    ]

    await request(app()).get('/api/community/posts?type=job').expect(200)

    expect(log.calls).toContain('order:is_scraper_post,{"ascending":true}')
    expect(log.calls.some(c => c.startsWith('range:'))).toBe(false)
  })
})

describe('a page after the last one', () => {
  // PostgREST contesta "Requested range not satisfiable" cuando el desplazamiento pasa del final. Antes eso era un 500, y el
  // feed (que pide la página siguiente para saber si hay más) lo repetía en cada página.
  const outOfRange = { code: 'PGRST103', message: 'Requested range not satisfiable' }

  it('answers an empty page for the member posts, not a 500', async () => {
    rows.error = outOfRange
    const res = await request(app()).get('/api/community/posts?type=social&page=2&limit=4').expect(200)
    expect(res.body.posts).toEqual([])
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 4 })
  })

  it('answers an empty page for the vacancies and for the editorial articles too', async () => {
    rows.error = outOfRange
    expect((await request(app()).get('/api/community/posts?type=job&sort=recent&page=9&limit=10').expect(200)).body.posts).toEqual([])
    expect((await request(app()).get('/api/community/posts/editorial?page=5&limit=4').expect(200)).body.posts).toEqual([])
  })

  it('still answers 500 for a real database error', async () => {
    rows.error = { code: '42P01', message: 'relation does not exist' }
    await request(app()).get('/api/community/posts?type=social&page=1&limit=4').expect(500)
    await request(app()).get('/api/community/posts/editorial?page=1&limit=4').expect(500)
  })
})
