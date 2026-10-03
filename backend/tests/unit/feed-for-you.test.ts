import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Datos por tabla; cada prueba los reemplaza.
const tables = vi.hoisted(() => ({} as Record<string, any>))
const syncMock = vi.hoisted(() => vi.fn())

function chain(table: string) {
  const result = () => tables[table] ?? { data: null, error: null }
  const c: any = {}
  for (const method of ['select', 'eq', 'limit', 'order', 'upsert', 'insert', 'update']) c[method] = () => c
  c.single = () => Promise.resolve(result())
  c.maybeSingle = () => Promise.resolve(result())
  c.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject)
  return c
}

vi.mock('../../services/supabase.service', () => ({
  supabase: { from: (table: string) => chain(table) },
}))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => { req.userId = 'user-1'; next() },
}))
vi.mock('../../services/scraper/sync', () => ({ syncVacancyToCommunity: syncMock }))

import feedRouter from '../../src/routes/community/feed.routes'

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/community/feed', feedRouter)
  return a
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key]
  syncMock.mockReset()
})

describe('GET /for-you', () => {
  it('only returns vacancies that share at least one skill with the person', async () => {
    tables.users = { data: { id: 'user-1', role_category: 'backend', seniority: 'senior', skills: ['python'] }, error: null }
    tables.scraper_posts = {
      data: [
        { id: 's1', text: 'Con python', company: 'A', skills: ['python', 'go'], url: 'https://a', post_date: '2026-10-01' },
        { id: 's2', text: 'Sin match', company: 'B', skills: ['java'], url: 'https://b', post_date: '2026-10-02' },
        { id: 's3', text: 'Sin skills', company: 'C', skills: [], url: 'https://c', post_date: '2026-10-03' },
      ],
      error: null,
    }
    tables.community_posts = {
      data: [
        { id: 'c1', title: 'Python dev', company: 'D', skills: ['PYTHON'], slug: 'python-dev', created_at: '2026-10-01' },
        { id: 'c2', title: 'React dev', company: 'E', skills: ['react'], slug: 'react-dev', created_at: '2026-10-02' },
      ],
      error: null,
    }
    tables.user_vacancy_history = { data: [], error: null }

    const res = await request(app()).get('/api/community/feed/for-you').expect(200)

    expect(res.body.items.map((i: any) => i.id).sort()).toEqual(['c1', 's1'])
    expect(res.body.items.every((i: any) => i.matchingSkills > 0)).toBe(true)
    expect(res.body.total).toBe(2)
  })
})

describe('POST /for-you/open', () => {
  it('rejects a request without sourceId', async () => {
    await request(app()).post('/api/community/feed/for-you/open').send({}).expect(400)
  })

  it('promotes a staged vacancy and returns its detail page', async () => {
    tables.scraper_posts = { data: { id: 's1', post_type: 'vacancy', is_spam: false }, error: null }
    tables.community_posts = { data: { id: 'c9', slug: 'python-dev-a' }, error: null }
    syncMock.mockResolvedValue('c9')

    const res = await request(app()).post('/api/community/feed/for-you/open').send({ sourceId: 's1' }).expect(200)

    expect(syncMock).toHaveBeenCalledWith('s1')
    expect(res.body).toEqual({ url: '/vacantes/python-dev-a' })
  })

  it('never promotes spam or something that is not a vacancy', async () => {
    tables.scraper_posts = { data: { id: 's1', post_type: 'vacancy', is_spam: true }, error: null }
    const spam = await request(app()).post('/api/community/feed/for-you/open').send({ sourceId: 's1' }).expect(200)
    expect(spam.body).toEqual({ url: null })

    tables.scraper_posts = { data: { id: 's2', post_type: 'profile', is_spam: false }, error: null }
    const profile = await request(app()).post('/api/community/feed/for-you/open').send({ sourceId: 's2' }).expect(200)
    expect(profile.body).toEqual({ url: null })

    expect(syncMock).not.toHaveBeenCalled()
  })

  it('answers url null when the company already has an owner', async () => {
    tables.scraper_posts = { data: { id: 's1', post_type: 'vacancy', is_spam: false }, error: null }
    syncMock.mockResolvedValue(null)

    const res = await request(app()).post('/api/community/feed/for-you/open').send({ sourceId: 's1' }).expect(200)
    expect(res.body).toEqual({ url: null })
  })

  it('finds the vacancy by its original link when the staging row is already gone', async () => {
    tables.scraper_posts = { data: null, error: null }
    tables.community_posts = { data: { id: 'c9', slug: 'ya-promovida' }, error: null }

    const res = await request(app())
      .post('/api/community/feed/for-you/open')
      .send({ sourceId: 'gone', url: 'https://a' })
      .expect(200)

    expect(syncMock).not.toHaveBeenCalled()
    expect(res.body).toEqual({ url: '/vacantes/ya-promovida' })
  })
})
