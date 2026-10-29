import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Una base falsa: la publicación actual y, según el filtro que se pida, las filas que devuelve cada consulta.
const state: { current: Record<string, unknown> | null; byCompany: Record<string, unknown>[]; byRole: Record<string, unknown>[]; byAuthor: Record<string, unknown>[] } = { current: null, byCompany: [], byRole: [], byAuthor: [] }

function builder() {
  const filters: Record<string, unknown> = {}
  const q: Record<string, unknown> = {}
  for (const method of ['select', 'not', 'neq', 'gte', 'order', 'limit', 'in']) q[method] = () => q
  q.eq = (key: string, value: unknown) => { filters[key] = value; return q }
  q.maybeSingle = () => Promise.resolve({ data: state.current, error: null })
  q.then = (resolve: (value: unknown) => unknown) => {
    const rows = 'company' in filters ? state.byCompany : 'role_category' in filters ? state.byRole : 'author_id' in filters ? state.byAuthor : []
    return Promise.resolve({ data: rows, error: null }).then(resolve)
  }
  return q
}

vi.mock('../../services/supabase.service', () => ({ supabase: { from: () => builder() } }))
vi.mock('../../middleware/community-auth.middleware', () => ({ communityAuthMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }))

import postsRoutes from '../../src/routes/community/posts.routes'

const app = () => {
  const server = express()
  server.use(express.json())
  server.use('/posts', postsRoutes)
  return server
}

const row = (id: string, patch: Record<string, unknown> = {}) => ({ id, slug: `slug-${id}`, title: `Título ${id}`, type: 'job', company: 'Acme', created_at: '2026-10-28T00:00:00Z', community_post_tags: [{ tag: { name: 'react' } }], ...patch })

beforeEach(() => { state.current = null; state.byCompany = []; state.byRole = []; state.byAuthor = [] })

describe('GET /posts/:id/related', () => {
  it('en una vacante muestra otras vacantes de la misma empresa', async () => {
    state.current = { id: 'j0', type: 'job', author_id: null, company: 'Acme', role_category: 'backend' }
    state.byCompany = [row('j1'), row('j2')]
    state.byRole = [row('j3', { company: 'Otra' })]

    const res = await request(app()).get('/posts/j0/related').expect(200)

    expect(res.body.kind).toBe('company')
    expect(res.body.company).toBe('Acme')
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual(['j1', 'j2', 'j3'])
    expect(res.body.items[0]).toMatchObject({ slug: 'slug-j1', tags: ['react'] })
  })

  it('si la empresa no tiene más, completa con vacantes del mismo puesto', async () => {
    state.current = { id: 'j0', type: 'job', author_id: null, company: 'Acme', role_category: 'backend' }
    state.byRole = [row('j3', { company: 'Otra' })]

    const res = await request(app()).get('/posts/j0/related').expect(200)

    expect(res.body.kind).toBe('role')
    expect(res.body.items).toHaveLength(1)
  })

  it('en una discusión muestra otras publicaciones de la misma persona', async () => {
    state.current = { id: 'd0', type: 'discussion', author_id: 'u1', company: null, role_category: null }
    state.byAuthor = [row('d1', { type: 'discussion', company: null })]

    const res = await request(app()).get('/posts/d0/related').expect(200)

    expect(res.body.kind).toBe('author')
    expect(res.body.items[0]).toMatchObject({ id: 'd1', type: 'discussion' })
  })

  it('sin autor (artículo del equipo) o si no existe, no hay nada que mostrar', async () => {
    state.current = { id: 'e0', type: 'editorial', author_id: null, company: null, role_category: null }
    expect((await request(app()).get('/posts/e0/related').expect(200)).body).toEqual({ kind: 'none', items: [] })

    state.current = null
    expect((await request(app()).get('/posts/nada/related').expect(200)).body).toEqual({ kind: 'none', items: [] })
  })
})
