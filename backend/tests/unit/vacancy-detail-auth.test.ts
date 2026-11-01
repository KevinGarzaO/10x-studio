import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * El detalle completo de una vacante (descripción, enlace de postulación, contacto) solo se entrega con sesión; el feed, las
 * discusiones y lo que ve un buscador (/seo/vacancy/:slug) siguen abiertos.
 */
const state: { post: Record<string, unknown> | null; validTokens: Set<string> } = { post: null, validTokens: new Set() }

function builder(table: string) {
  const q: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'neq', 'gte', 'not', 'order', 'limit', 'range', 'contains']) q[method] = () => q
  // la publicación (o, en la otra tabla, el artículo del equipo que aquí no existe)
  q.single = () => Promise.resolve(table === 'community_posts' ? { data: state.post, error: state.post ? null : { message: 'no rows' } } : { data: null, error: { message: 'no rows' } })
  q.maybeSingle = () => Promise.resolve({ data: null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
  return q
}

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => builder(table),
    auth: { getUser: async (token: string) => (state.validTokens.has(token) ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }) },
  },
}))
vi.mock('../../middleware/community-auth.middleware', () => ({ communityAuthMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }))

import postsRoutes from '../../src/routes/community/posts.routes'

const app = () => {
  const server = express()
  server.use(express.json())
  server.use('/posts', postsRoutes)
  return server
}

const job = { id: '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f', slug: 'backend-1', type: 'job', title: 'Backend Engineer', company: 'Acme', content: 'Descripción completa', source_url: 'https://boards.greenhouse.io/acme/jobs/1', contacts: { email: 'rh@acme.com' }, author: null, community_post_tags: [], community_comments: [] }
const discussion = { ...job, id: '4f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f', slug: 'una-discusion', type: 'discussion', title: 'Una discusión', contacts: null, source_url: null }

beforeEach(() => { state.post = null; state.validTokens = new Set(['good-token']) })

describe('GET /posts/:id for a vacancy', () => {
  it('refuses a visitor without a session and hands over nothing from the vacancy', async () => {
    state.post = job
    const res = await request(app()).get('/posts/backend-1').expect(401)
    expect(res.body).toEqual({ error: 'Inicia sesión para ver esta vacante', code: 'auth_required' })
    expect(JSON.stringify(res.body)).not.toMatch(/Descripción|greenhouse|rh@acme|Backend Engineer/)
  })

  it('refuses a token that is not valid (an expired or made-up session is the same as no session)', async () => {
    state.post = job
    await request(app()).get('/posts/backend-1').set('Authorization', 'Bearer made-up').expect(401)
  })

  it('refuses by id as well as by slug', async () => {
    state.post = job
    await request(app()).get(`/posts/${job.id}`).expect(401)
  })

  it('gives the full vacancy to someone with a valid session', async () => {
    state.post = job
    const res = await request(app()).get('/posts/backend-1').set('Authorization', 'Bearer good-token')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Backend Engineer', content: 'Descripción completa', source_url: 'https://boards.greenhouse.io/acme/jobs/1' })
  })
})

describe('what stays open', () => {
  it('a discussion is still readable without a session', async () => {
    state.post = discussion
    const res = await request(app()).get('/posts/una-discusion')
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Una discusión')
  })

  it('the paths did not change: the list and the related ones still answer without a session', async () => {
    state.post = job
    expect((await request(app()).get('/posts/')).status).toBe(200)
    expect((await request(app()).get('/posts/backend-1/related')).status).not.toBe(401)
  })
})
