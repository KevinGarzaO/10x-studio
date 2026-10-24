import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const tables = vi.hoisted(() => ({ data: {} as Record<string, any[]> }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('no') }) },
    from: (table: string) => {
      const q: any = {}
      let ids: string[] | null = null
      for (const name of ['select', 'order', 'eq', 'or', 'range', 'limit', 'maybeSingle']) q[name] = () => q
      q.in = (column: string, values: string[]) => { if (column === 'id') ids = values; return q }
      q.then = (resolve: any, reject: any) => {
        let rows = tables.data[table] ?? []
        if (ids) rows = rows.filter(row => ids!.includes(row.id))
        return Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve, reject)
      }
      return q
    },
  },
}))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (_req: any, _res: any, next: any) => next(),
}))

import postsRouter from '../../src/routes/community/posts.routes'
import { clearPopularityCache, popularityScore, rankByPopularity } from '../../services/vacancies/popularity'

const app = () => {
  const a = express()
  a.use('/api/community/posts', postsRouter)
  return a
}

const job = (id: string, createdAt: string) => ({
  id, slug: `vac-${id}`, type: 'job', platform: 'lever', company: `Empresa ${id}`, created_at: createdAt,
  author: null, community_post_tags: [], votes_count: 0, comments_count: 0,
})

describe('popularityScore', () => {
  it('weighs saving and applying more than just looking', () => {
    expect(popularityScore({ views: 10, saves: 0, applies: 0 })).toBe(10)
    expect(popularityScore({ views: 0, saves: 1, applies: 0 })).toBe(3)
    expect(popularityScore({ views: 0, saves: 0, applies: 1 })).toBe(5)
    expect(popularityScore({ views: 4, saves: 2, applies: 1 })).toBe(15)
  })
})

describe('rankByPopularity', () => {
  const items = [
    { id: 'viejaPopular', created_at: '2026-10-01T00:00:00Z' },
    { id: 'nuevaSinNadie', created_at: '2026-10-24T00:00:00Z' },
    { id: 'nuevaMenos', created_at: '2026-10-23T00:00:00Z' },
  ]
  const stats: Record<string, { views: number; saves: number; applies: number }> = {
    viejaPopular: { views: 20, saves: 2, applies: 1 },
    nuevaSinNadie: { views: 0, saves: 0, applies: 0 },
    nuevaMenos: { views: 3, saves: 0, applies: 0 },
  }

  it('puts the most popular first, then the newest among the ones nobody has opened', () => {
    expect(rankByPopularity(items, item => stats[item.id]).map(item => item.id)).toEqual(['viejaPopular', 'nuevaMenos', 'nuevaSinNadie'])
  })

  it('breaks ties by date, newest first', () => {
    const tied = [{ id: 'a', created_at: '2026-10-01T00:00:00Z' }, { id: 'b', created_at: '2026-10-02T00:00:00Z' }]
    expect(rankByPopularity(tied, () => ({ views: 1, saves: 0, applies: 0 })).map(item => item.id)).toEqual(['b', 'a'])
  })
})

describe('GET /posts?type=job&sort=popular', () => {
  beforeEach(() => {
    clearPopularityCache()
    tables.data = {
      community_posts: [job('1', '2026-10-03T10:00:00Z'), job('2', '2026-10-02T10:00:00Z'), job('3', '2026-10-01T10:00:00Z')],
      vacancy_events: [
        // la 3 la abrieron dos personas; una de ellas se postuló. Recargar no cuenta dos veces.
        { vacancy_slug: 'vac-3', event: 'view', visitor_id: 'a' },
        { vacancy_slug: 'vac-3', event: 'view', visitor_id: 'a' },
        { vacancy_slug: 'vac-3', event: 'view', visitor_id: 'b' },
        { vacancy_slug: 'vac-3', event: 'apply', visitor_id: 'b' },
        { vacancy_slug: 'vac-2', event: 'view', visitor_id: 'a' },
      ],
      user_vacancy_history: [{ source_id: '2' }, { source_id: '2' }],
    }
  })

  it('orders by popularity, not by date', async () => {
    const res = await request(app()).get('/api/community/posts?type=job&sort=popular').expect(200)

    // 3: 2 vistas + 1 postulación = 7 · 2: 1 vista + 2 guardados = 7 · 1: sin nada
    expect(res.body.posts.map((p: any) => p.id)).toEqual(['2', '3', '1'])
  })

  it('brings each vacancy\'s views, saves and applies, counting each person once', async () => {
    const res = await request(app()).get('/api/community/posts?type=job&sort=popular').expect(200)
    const byId = Object.fromEntries(res.body.posts.map((p: any) => [p.id, p.stats]))

    expect(byId['3']).toEqual({ views: 2, saves: 0, applies: 1 })
    expect(byId['2']).toEqual({ views: 1, saves: 2, applies: 0 })
    expect(byId['1']).toEqual({ views: 0, saves: 0, applies: 0 })
  })

  it('paginates after ordering', async () => {
    const res = await request(app()).get('/api/community/posts?type=job&sort=popular&page=2&limit=2').expect(200)

    expect(res.body.posts.map((p: any) => p.id)).toEqual(['1'])
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 })
  })
})
