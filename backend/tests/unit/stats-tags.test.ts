import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({
  catalog: [] as { name: string; label: string }[],
  handTags: [] as { tag: { name: string } }[],
  posts: [] as { skills?: unknown; role_category?: string }[],
}))
const filters = vi.hoisted(() => [] as string[])

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const q: any = {}
        for (const name of ['eq', 'in', 'gte', 'not', 'limit']) q[name] = (...args: unknown[]) => { filters.push(`${table}:${name}:${args.join(',')}`); return q }
        q.then = (resolve: any, reject: any) => {
          const data = table === 'skills' ? state.catalog : table === 'community_post_tags' ? state.handTags : state.posts
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        }
        return q
      },
    }),
  },
}))

import statsRouter from '../../src/routes/community/stats.routes'

const app = () => {
  const a = express()
  a.use('/stats', statsRouter)
  return a
}

beforeEach(() => {
  filters.length = 0
  state.catalog = [
    { name: 'python', label: 'Python' },
    { name: 'ia', label: 'IA / Machine Learning' },
    { name: 'sql', label: 'SQL' },
  ]
  state.handTags = []
  state.posts = []
})

describe('GET /stats/tags', () => {
  it('ranks the skills the open vacancies ask for the most, with their readable name', async () => {
    state.posts = [{ skills: ['python', 'sql'] }, { skills: ['python', 'ia'] }, { skills: ['python'] }, { skills: ['sql'] }]

    const res = await request(app()).get('/stats/tags?limit=3').expect(200)

    expect(res.body.tags).toEqual([
      { name: 'python', label: 'Python', skill: true, count: 3 },
      { name: 'sql', label: 'SQL', skill: true, count: 2 },
      { name: 'ia', label: 'IA / Machine Learning', skill: true, count: 1 },
    ])
  })

  it('counts a skill once per vacancy, and ignores anything that is not in the catalog', async () => {
    state.posts = [{ skills: ['python', 'python', 'cobol'] }, { skills: null }]

    const res = await request(app()).get('/stats/tags').expect(200)

    expect(res.body.tags).toEqual([{ name: 'python', label: 'Python', skill: true, count: 1 }])
  })

  it('looks only at open vacancies, the same ones the jobs pages list', async () => {
    await request(app()).get('/stats/tags')

    expect(filters).toContain('community_posts:eq:type,job')
    const since = filters.find(f => f.startsWith('community_posts:gte:created_at,'))!.split(',')[1]
    const days = (Date.now() - Date.parse(since)) / 86400000
    expect(days).toBeGreaterThan(44.9)
    expect(days).toBeLessThan(45.1)
  })

  it('keeps the topics people wrote by hand, flagged as having no jobs page', async () => {
    state.handTags = [{ tag: { name: 'tema-libre' } }, { tag: { name: 'tema-libre' } }, { tag: { name: 'python' } }]

    const res = await request(app()).get('/stats/tags').expect(200)

    expect(res.body.tags).toEqual([
      { name: 'tema-libre', label: 'tema-libre', skill: false, count: 2 },
      { name: 'python', label: 'Python', skill: true, count: 1 },
    ])
  })

  it('never returns more than 30 topics', async () => {
    state.catalog = Array.from({ length: 50 }, (_, i) => ({ name: `s${i}`, label: `S${i}` }))
    state.posts = [{ skills: state.catalog.map(skill => skill.name) }]

    const res = await request(app()).get('/stats/tags?limit=999').expect(200)

    expect(res.body.tags).toHaveLength(30)
  })

  it('only counts vacancies of the focus roles, so sales jobs never become a trending topic', async () => {
    await request(app()).get('/stats/tags')

    const filter = filters.find(f => f.startsWith('community_posts:in:role_category,'))!
    expect(filter).toContain('backend')
    expect(filter).toContain('frontend')
    expect(filter).not.toContain('ventas')
  })
})

describe('GET /stats/roles', () => {
  it('ranks the focus roles by open vacancies, with the address of their page', async () => {
    state.posts = [
      { role_category: 'backend' }, { role_category: 'backend' }, { role_category: 'ux_ui' },
    ]

    const res = await request(app()).get('/stats/roles').expect(200)

    expect(res.body.roles).toEqual([
      expect.objectContaining({ role: 'backend', slug: 'backend', count: 2 }),
      expect.objectContaining({ role: 'ux_ui', slug: 'ux-ui', count: 1 }),
    ])
    expect(res.body.roles[0].label).toBeTruthy()
  })

  it('asks only for focus roles, unless all of them are requested', async () => {
    await request(app()).get('/stats/roles')
    expect(filters.find(f => f.startsWith('community_posts:in:role_category,'))).not.toContain('ventas')

    filters.length = 0
    await request(app()).get('/stats/roles?all=1')
    expect(filters.find(f => f.startsWith('community_posts:in:role_category,'))).toContain('ventas')
  })

  it('never returns "otro": it is not a role anyone can open', async () => {
    await request(app()).get('/stats/roles?all=1')
    expect(filters.find(f => f.startsWith('community_posts:in:role_category,'))).not.toContain('otro')
  })
})
