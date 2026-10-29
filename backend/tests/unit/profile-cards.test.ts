import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Una base falsa mínima: cada consulta se resuelve según la tabla y los filtros que se pidan.
type Row = Record<string, unknown>
const state: { users: Row[]; posts: Row[]; selected: string[] } = { users: [], posts: [], selected: [] }

function builder(table: string) {
  const filters: [string, unknown][] = []
  let head = false
  const rows = () => (table === 'users' ? state.users : state.posts).filter(row => filters.every(([key, value]) => row[key] === value))
  const q: Record<string, unknown> = {
    select: (columns: string, options?: { head?: boolean }) => { if (table === 'users') state.selected.push(columns); head = !!options?.head; return q },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return q },
    gte: () => q,
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(head ? { count: rows().length, error: null } : { data: rows(), error: null }).then(resolve),
  }
  return q
}

vi.mock('../../services/supabase.service', () => ({ supabase: { from: (table: string) => builder(table) } }))

import cardsRoutes from '../../src/routes/community/cards.routes'

const app = () => {
  const server = express()
  server.use('/cards', cardsRoutes)
  return server
}

beforeEach(() => {
  state.selected = []
  state.users = [
    { username: 'ana', handle: null, display_name: 'Ana López', name: null, photo_url: 'https://x/a.png', bio: 'Hola', location: 'MX', role_category: 'backend', seniority: 'senior', created_at: '2026-10-05T12:00:00Z', email: 'secreto@x.com' },
    { username: 'acme', handle: null, display_name: 'Acme', name: null, photo_url: 'https://x/logo.png', bio: 'Empresa', location: 'Remoto', account_type: 'company', company_slug: 'acme', created_at: '2026-09-01T00:00:00Z' },
  ]
  state.posts = [{ type: 'job', company: 'Acme' }, { type: 'job', company: 'Acme' }, { type: 'job', company: 'Otra' }]
})

describe('GET /cards/user/:username', () => {
  it('da solo lo público de la persona, sin correo ni nada privado', async () => {
    const res = await request(app()).get('/cards/user/ana').expect(200)

    expect(res.body.card).toEqual({ kind: 'user', name: 'Ana López', username: 'ana', photo_url: 'https://x/a.png', bio: 'Hola', location: 'MX', role_category: 'backend', seniority: 'senior', joined_at: '2026-10-05T12:00:00Z' })
    expect(JSON.stringify(res.body)).not.toContain('secreto')
    // Y ni siquiera pide columnas privadas a la base.
    expect(state.selected.join(' ')).not.toMatch(/email|cv|phone|is_superadmin/)
  })

  it('una persona que no existe es 404', async () => {
    await request(app()).get('/cards/user/nadie').expect(404)
  })
})

describe('GET /cards/company/:slug', () => {
  it('muestra la empresa con cuántas vacantes abiertas tiene', async () => {
    const res = await request(app()).get('/cards/company/acme').expect(200)

    expect(res.body.card).toMatchObject({ kind: 'company', name: 'Acme', slug: 'acme', photo_url: 'https://x/logo.png', open_vacancies: 2 })
  })

  it('una empresa sin cuenta propia se arma con el nombre que manda el feed', async () => {
    state.users = []
    const res = await request(app()).get('/cards/company/otra?name=Otra').expect(200)

    expect(res.body.card).toMatchObject({ kind: 'company', name: 'Otra', open_vacancies: 1, photo_url: null })
  })

  it('sin cuenta ni nombre no hay de qué hablar: 404', async () => {
    state.users = []
    await request(app()).get('/cards/company/nada').expect(404)
  })
})
