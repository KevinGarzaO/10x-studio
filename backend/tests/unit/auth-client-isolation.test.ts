import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Cada createClient() devuelve un cliente distinto y anotado, para saber cuál
// recibió cada llamada de Auth.
const clients = vi.hoisted(() => [] as any[])
// Lo que responde Supabase al renovar la sesión (cada prueba puede cambiarlo).
const refreshReply = vi.hoisted(() => ({ value: { data: { user: { id: 'u1' }, session: { access_token: 't2' } }, error: null } as any }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const client: any = {
      id: clients.length,
      auth: {
        signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null }),
        refreshSession: vi.fn(async () => refreshReply.value),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
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
  refreshReply.value = { data: { user: { id: 'u1' }, session: { access_token: 't2' } }, error: null }
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

describe('refresh tells the browser whether the session is really gone', () => {
  it('answers 401 when Supabase rejects the token (already used, expired or revoked): the person must sign in again', async () => {
    refreshReply.value = { data: { session: null, user: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token: Already Used' } }
    const res = await request(app()).post('/api/community/auth/refresh').send({ refresh_token: 'r' }).expect(401)
    expect(res.body.error).toContain('Already Used')
  })

  it('answers 503 when Supabase did not answer well (network, 5xx): the browser must keep the session', async () => {
    refreshReply.value = { data: { session: null, user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } }
    await request(app()).post('/api/community/auth/refresh').send({ refresh_token: 'r' }).expect(503)
    refreshReply.value = { data: { session: null, user: null }, error: { name: 'AuthApiError', status: 502, message: 'bad gateway' } }
    await request(app()).post('/api/community/auth/refresh').send({ refresh_token: 'r' }).expect(503)
  })

  it('still answers 400 without a refresh token and 200 with the new session', async () => {
    await request(app()).post('/api/community/auth/refresh').send({}).expect(400)
    const res = await request(app()).post('/api/community/auth/refresh').send({ refresh_token: 'r' }).expect(200)
    expect(res.body.session.access_token).toBe('t2')
  })
})
