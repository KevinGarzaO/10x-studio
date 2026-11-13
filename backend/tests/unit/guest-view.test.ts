import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Sin sesión, una vacante dentro de una lista (el feed, el perfil de una empresa o de una persona) sale reducida a lo que pinta una
 * tarjeta: sin descripción, enlace de postulación, contactos ni texto original. Con sesión sale completa. Las demás publicaciones no
 * se tocan.
 */
const state: { rows: any[]; profile: any; validTokens: Set<string> } = { rows: [], profile: null, validTokens: new Set() }

function builder(table: string) {
  const q: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'neq', 'gte', 'not', 'order', 'limit', 'range', 'contains', 'or']) q[method] = () => q
  q.single = () => Promise.resolve(table === 'users' ? { data: state.profile, error: state.profile ? null : { message: 'no rows' } } : { data: null, error: { message: 'no rows' } })
  q.maybeSingle = () => Promise.resolve({ data: null, error: null })
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: table === 'community_posts' ? state.rows : [], error: null, count: table === 'community_posts' ? state.rows.length : 0 }).then(resolve)
  return q
}

vi.mock('@avotalent/core/services/supabase.service', () => ({
  supabase: {
    from: (table: string) => builder(table),
    auth: { getUser: async (token: string) => (state.validTokens.has(token) ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }) },
  },
}))
vi.mock('@avotalent/core/http/middleware/community-auth.middleware', () => ({ communityAuthMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }))

import { headerLinesOf, redactForGuest } from '@avotalent/core/services/community/guest-view'
import postsRoutes from '../../src/routes/community/posts.routes'
import usersRoutes from '../../src/routes/community/users.routes'
import companiesRoutes from '../../src/routes/community/companies.routes'

const app = () => {
  const server = express()
  server.use(express.json())
  server.use('/posts', postsRoutes)
  server.use('/users', usersRoutes)
  server.use('/companies', companiesRoutes)
  return server
}

const content = [
  '**Empresa:** Stripe',
  '**Rol:** Backend Engineer',
  '**Ubicación:** Dublín',
  '**Presupuesto:** USD 5k',
  '**Modalidad:** Remoto',
  '### Descripción',
  'Texto largo de la descripción que no debe salir.',
  '### Requisitos',
  '- Python',
  '### Contacto',
  'Escríbenos a rh@stripe.com o https://wa.me/5218112345678',
].join('\n')

const job = (patch: Record<string, unknown> = {}) => ({
  id: 'j1', slug: 'backend-1', title: 'Backend Engineer', type: 'job', company: 'Stripe', company_logo: null, location: 'Dublín', modalidad: 'Remoto',
  budget: 'USD 5k', seniority_level: 'senior', role_category: 'backend', skills: ['python'], platform: 'greenhouse', is_scraper_post: true,
  created_at: '2026-10-30T00:00:00Z', votes_count: 0, comments_count: 0, content,
  source_url: 'https://boards.greenhouse.io/stripe/jobs/1', source_name: 'Greenhouse', original_text: 'Texto original con rh@stripe.com',
  contacts: { emails: ['rh@stripe.com'], whatsapp: ['https://wa.me/5218112345678'] }, author_id: 'a1', scraped_at: '2026-10-29T00:00:00Z', columna_nueva_con_datos: 'secreto',
  author: null, community_post_tags: [{ tag: { name: 'python' } }], ...patch,
})

const SENSITIVE = /Texto largo|rh@stripe|wa\.me|greenhouse\.io|Texto original|secreto|Requisitos|Contacto/

beforeEach(() => { state.rows = []; state.profile = null; state.validTokens = new Set(['good-token']) })

describe('redactForGuest', () => {
  it('keeps what a feed card shows and leaves out everything else, including columns that do not exist yet', () => {
    const out: any = redactForGuest(job())
    expect(out).toMatchObject({ id: 'j1', slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', modalidad: 'Remoto', skills: ['python'], seniority_level: 'senior' })
    for (const hidden of ['source_url', 'source_name', 'original_text', 'contacts', 'author_id', 'scraped_at', 'columna_nueva_con_datos', 'community_post_tags']) expect(out).not.toHaveProperty(hidden)
    expect(out.content).toBe('**Empresa:** Stripe\n**Rol:** Backend Engineer\n**Ubicación:** Dublín\n**Presupuesto:** USD 5k\n**Modalidad:** Remoto')
  })

  it('leaves discussions and articles exactly as they are', () => {
    const discussion = { id: 'd1', type: 'discussion', title: 'Hola', content: 'texto libre con a@b.com', contacts: null }
    expect(redactForGuest(discussion)).toBe(discussion)
  })

  it('reduces a content with no header lines (HTML from an ATS) to nothing, never to the description', () => {
    expect(headerLinesOf('<div><p>Descripción larga</p></div>\nEscríbenos a rh@x.com')).toBe('')
    expect(headerLinesOf(null)).toBe('')
  })
})

describe('GET /posts (the feed list)', () => {
  it('without a session, hands over vacancies reduced to what a card shows', async () => {
    state.rows = [job()]
    const res = await request(app()).get('/posts?type=job').expect(200)
    expect(res.body.posts).toHaveLength(1)
    expect(res.body.posts[0]).toMatchObject({ title: 'Backend Engineer', company: 'Stripe', slug: 'backend-1' })
    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE)
  })

  it('an invalid token is the same as no session', async () => {
    state.rows = [job()]
    const res = await request(app()).get('/posts?type=job').set('Authorization', 'Bearer made-up').expect(200)
    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE)
  })

  it('with a valid session, delivers the whole vacancy as before', async () => {
    state.rows = [job()]
    const res = await request(app()).get('/posts?type=job').set('Authorization', 'Bearer good-token').expect(200)
    expect(res.body.posts[0]).toMatchObject({ source_url: 'https://boards.greenhouse.io/stripe/jobs/1', original_text: 'Texto original con rh@stripe.com' })
    expect(res.body.posts[0].content).toContain('Texto largo')
  })

  it('does not touch discussions for a visitor', async () => {
    state.rows = [{ id: 'd1', type: 'discussion', title: 'Hola', content: 'texto libre', author: null, community_post_tags: [] }]
    const res = await request(app()).get('/posts?type=social').expect(200)
    expect(res.body.posts[0].content).toBe('texto libre')
  })
})

describe('public profiles', () => {
  const profile = () => ({ id: 'u9', username: 'stripe', display_name: 'Stripe', account_type: 'company', company_slug: 'stripe', community_posts: [job()] })

  it('a company profile hands a visitor only the card data of its vacancies', async () => {
    state.profile = profile()
    const res = await request(app()).get('/companies/stripe').expect(200)
    expect(res.body.user.community_posts).toHaveLength(1)
    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE)
  })

  it('a person profile does the same', async () => {
    state.profile = profile()
    const res = await request(app()).get('/users/stripe').expect(200)
    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE)
  })

  it('with a session the profile is complete', async () => {
    state.profile = profile()
    const res = await request(app()).get('/companies/stripe').set('Authorization', 'Bearer good-token').expect(200)
    expect(res.body.user.community_posts[0].source_url).toContain('greenhouse.io')
  })
})
