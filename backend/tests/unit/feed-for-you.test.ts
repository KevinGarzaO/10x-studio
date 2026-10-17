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
  const person = { id: 'user-1', role_category: 'backend', seniority: 'senior', skills: ['python', 'docker'], work_modality: 'Remoto' }

  const scraper = (id: string, patch: Record<string, unknown> = {}) => ({
    id, text: `## Vacante ${id}`, company: 'Acme', company_logo: null, role_category: 'backend', seniority_level: 'senior',
    skills: ['python'], url: `https://x/${id}`, post_date: '2026-10-01', created_at: '2026-10-01', work_modality: 'remote', ...patch,
  })
  const community = (id: string, patch: Record<string, unknown> = {}) => ({
    id, title: `Publicada ${id}`, company: 'Acme', company_logo: null, role_category: 'backend', seniority_level: 'senior',
    skills: ['python'], slug: `publicada-${id}`, created_at: '2026-10-01', modalidad: 'Remoto', ...patch,
  })

  const load = async () => (await request(app()).get('/api/community/feed/for-you').expect(200)).body

  beforeEach(() => {
    tables.users = { data: person, error: null }
    tables.user_vacancy_history = { data: [], error: null }
  })

  it('only returns vacancies that share at least one skill with the person', async () => {
    tables.scraper_posts = {
      data: [
        scraper('s1', { skills: ['python', 'go'] }),
        scraper('s2', { skills: ['java'] }),
        scraper('s3', { skills: [] , role_category: 'marketing' }),
      ],
      error: null,
    }
    tables.community_posts = { data: [community('c1', { skills: ['PYTHON'] }), community('c2', { skills: ['react'] })], error: null }

    const body = await load()

    expect(body.items.map((i: any) => i.id).sort()).toEqual(['c1', 's1'])
    expect(body.items.every((i: any) => i.matchingSkills > 0)).toBe(true)
    expect(body.total).toBe(2)
  })

  it('says how well each one fits and which skills are shared', async () => {
    tables.scraper_posts = { data: [], error: null }
    tables.community_posts = { data: [community('c1', { skills: ['python', 'docker', 'aws'] })], error: null }

    const [item] = (await load()).items

    expect(item.sharedSkills).toEqual(['python', 'docker'])
    expect(item.matchingSkills).toBe(2)
    expect(item.matchScore).toBeGreaterThan(80)
    expect(item.matchScore).toBeLessThanOrEqual(100)
  })

  it('puts the better fit first, whatever its date', async () => {
    tables.scraper_posts = { data: [], error: null }
    tables.community_posts = {
      data: [
        community('weak', { seniority_level: 'junior', modalidad: 'Presencial', created_at: '2026-10-03', skills: ['python', 'a', 'b', 'c'], role_category: 'devops' }),
        community('strong', { skills: ['python', 'docker'], created_at: '2026-09-01' }),
      ],
      error: null,
    }

    const body = await load()

    expect(body.items[0].id).toBe('strong')
  })

  it('also offers a close role, which the old exact-role filter dropped', async () => {
    tables.users = { data: { ...person, role_category: 'fullstack' }, error: null }
    tables.scraper_posts = { data: [], error: null }
    tables.community_posts = { data: [community('c1', { role_category: 'backend', skills: ['python'] })], error: null }

    expect((await load()).items.map((i: any) => i.id)).toEqual(['c1'])
  })

  it('does not offer an unrelated role even if it shares a skill', async () => {
    tables.scraper_posts = { data: [], error: null }
    tables.community_posts = { data: [community('c1', { role_category: 'marketing', skills: ['python'] })], error: null }

    expect((await load()).items).toEqual([])
  })

  it('keeps a vacancy whose level is unknown, instead of dropping it', async () => {
    tables.scraper_posts = { data: [], error: null }
    tables.community_posts = { data: [community('c1', { seniority_level: null, skills: ['python'] })], error: null }

    expect((await load()).items.map((i: any) => i.id)).toEqual(['c1'])
  })

  it('asks for the role (not the level) before it can match', async () => {
    tables.users = { data: { ...person, role_category: null }, error: null }

    await request(app()).get('/api/community/feed/for-you').expect(400)
  })

  it('works for someone whose level is not set yet', async () => {
    tables.users = { data: { ...person, seniority: null }, error: null }
    tables.scraper_posts = { data: [], error: null }
    tables.community_posts = { data: [community('c1')], error: null }

    expect((await load()).items).toHaveLength(1)
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
