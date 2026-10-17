import { describe, it, expect, beforeAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../services/supabase.service', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from: () => ({}) },
  createAuthClient: () => ({}),
}))

vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => next(),
}))

import authRouter from '../../src/routes/community/auth.routes'

function app() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/auth', authRouter)
  return app
}

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.COMMUNITY_APP_URL = 'http://localhost:3002'
})

describe('GET /oauth/:provider', () => {
  it('sends LinkedIn to the OIDC provider key Supabase actually has enabled', async () => {
    const res = await request(app()).get('/api/community/auth/oauth/linkedin')

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('https://example.supabase.co/auth/v1/authorize')
    expect(res.headers.location).toContain('provider=linkedin_oidc')
    expect(res.headers.location).toContain(
      `redirect_to=${encodeURIComponent('http://localhost:3002/auth/callback')}`,
    )
  })

  it('keeps GitHub on its own provider key', async () => {
    const res = await request(app()).get('/api/community/auth/oauth/github')

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('provider=github')
    expect(res.headers.location).not.toContain('linkedin')
  })

  it('rejects providers we do not support', async () => {
    const res = await request(app()).get('/api/community/auth/oauth/twitter')
    expect(res.status).toBe(400)
  })
})
