import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Cada createClient() devuelve un cliente distinto y anotado, para saber cuál
// recibió cada llamada de Auth.
const clients = vi.hoisted(() => [] as any[])

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const client: any = {
      id: clients.length,
      auth: {
        signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null }),
        refreshSession: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't2' } }, error: null }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    }
    clients.push(client)
    return client
  }),
}))

vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (_req: any, _res: any, next: any) => next(),
}))

import authRouter from '../../src/routes/community/auth.routes'

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/community/auth', authRouter)
  return a
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('community auth never signs in on the shared service-role client', () => {
  // clients[0] es el cliente principal que crea supabase.service al importarse.
  it('login uses a throwaway client, not the data client', async () => {
    const main = clients[0]
    await request(app()).post('/api/community/auth/login').send({ email: 'a@b.co', password: 'x' }).expect(200)

    expect(main.auth.signInWithPassword).not.toHaveBeenCalled()
    const used = clients.filter(c => c !== main && c.auth.signInWithPassword.mock.calls.length > 0)
    expect(used).toHaveLength(1)
  })

  it('signup uses a throwaway client, not the data client', async () => {
    const main = clients[0]
    await request(app()).post('/api/community/auth/signup').send({ email: 'a@b.co', password: 'x', username: 'ana' }).expect(201)

    expect(main.auth.signUp).not.toHaveBeenCalled()
    expect(clients.filter(c => c !== main && c.auth.signUp.mock.calls.length > 0)).toHaveLength(1)
  })

  it('refresh uses a throwaway client, not the data client', async () => {
    const main = clients[0]
    await request(app()).post('/api/community/auth/refresh').send({ refresh_token: 'r' }).expect(200)

    expect(main.auth.refreshSession).not.toHaveBeenCalled()
    expect(clients.filter(c => c !== main && c.auth.refreshSession.mock.calls.length > 0)).toHaveLength(1)
  })

  it('creates a different client for every login', async () => {
    await request(app()).post('/api/community/auth/login').send({ email: 'a@b.co', password: 'x' })
    await request(app()).post('/api/community/auth/login').send({ email: 'c@d.co', password: 'y' })

    const loginClients = clients.filter(c => c.auth.signInWithPassword.mock.calls.length > 0)
    expect(loginClients).toHaveLength(2)
  })
})
