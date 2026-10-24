import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { readFileSync } from 'fs'
import { join } from 'path'

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, superadmin: false }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: {
      getUser: async (token: string) =>
        token === 'bueno' && session.user ? { data: { user: session.user }, error: null } : { data: { user: null }, error: { message: 'invalid' } },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_superadmin: session.superadmin }, error: null }) }) }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}))

import { studioAuth, isBlogPublic, isLinkedInPublic, STUDIO_ROOT_PATHS } from '../../middleware/studio-auth.middleware'

const app = (guard: ReturnType<typeof studioAuth>) => {
  const a = express()
  a.use('/', guard, (_req, res) => { res.json({ ok: true }) })
  return a
}

beforeEach(() => {
  session.user = { id: 'u1', email: 'a@b.com' }
  session.superadmin = true
})

describe('studioAuth', () => {
  it('turns away a request with no session', async () => {
    await request(app(studioAuth())).get('/settings').expect(401)
  })

  it('turns away a token that is not valid', async () => {
    await request(app(studioAuth())).get('/settings').set('Authorization', 'Bearer malo').expect(401)
  })

  it('turns away a signed-in person who is not a superadmin', async () => {
    session.superadmin = false
    await request(app(studioAuth())).get('/settings').set('Authorization', 'Bearer bueno').expect(403)
  })

  it('lets a superadmin through', async () => {
    await request(app(studioAuth())).get('/settings').set('Authorization', 'Bearer bueno').expect(200)
  })

  it('leaves the public routes open', async () => {
    const guard = studioAuth({ isPublic: req => req.path === '/abierta' })
    await request(app(guard)).get('/abierta').expect(200)
    await request(app(guard)).get('/cerrada').expect(401)
  })

  it('does not ask credentials of the browser pre-flight request', async () => {
    await request(app(studioAuth())).options('/settings').expect(200)
  })

  it('only guards its own routes when it shares the mount with others', async () => {
    const guard = studioAuth({ onlyFor: req => STUDIO_ROOT_PATHS.test(req.path) })
    await request(app(guard)).get('/community/posts').expect(200)
    await request(app(guard)).get('/settings').expect(401)
    await request(app(guard)).get('/topics').expect(401)
  })
})

describe('which routes stay open', () => {
  const req = (method: string, path: string) => ({ method, path }) as never

  it('LinkedIn: only the OAuth window routes', () => {
    for (const path of ['/auth', '/callback', '/proxy-image']) expect(isLinkedInPublic(req('GET', path))).toBe(true)
    for (const path of ['/profile', '/posts', '/registry']) expect(isLinkedInPublic(req('GET', path))).toBe(false)
    expect(isLinkedInPublic(req('POST', '/post'))).toBe(false)
    expect(isLinkedInPublic(req('DELETE', '/profile'))).toBe(false)
  })

  it('blog: reading a published article is public, everything else is not', () => {
    expect(isBlogPublic(req('GET', '/'))).toBe(true)
    expect(isBlogPublic(req('GET', '/mi-articulo'))).toBe(true)

    for (const path of ['/content-stats', '/content-items', '/dashboard-stats', '/web-posts', '/web-posts/abc', '/analytics/summary', '/abc/analytics']) {
      expect(isBlogPublic(req('GET', path))).toBe(false)
    }
    for (const method of ['POST', 'PUT', 'DELETE']) expect(isBlogPublic(req(method, '/mi-articulo'))).toBe(false)
  })

  it('the Studio paths that hang from /api are the ones to guard, and the community ones are not', () => {
    for (const path of ['/topics', '/history', '/calendar', '/settings', '/templates', '/campaigns', '/generate', '/generate/substack', '/suggest', '/suggest/web']) {
      expect(STUDIO_ROOT_PATHS.test(path)).toBe(true)
    }
    for (const path of ['/community/posts', '/community/auth/login', '/substack/posts', '/linkedin/auth', '/settingsx']) {
      expect(STUDIO_ROOT_PATHS.test(path)).toBe(false)
    }
  })
})

describe('the server wiring', () => {
  const index = readFileSync(join(__dirname, '../../index.ts'), 'utf8').replace(/\r\n/g, '\n')

  it('no longer uses the placeholder that let everyone through', () => {
    expect(index).not.toContain('authMiddleware')
  })

  it('guards every Studio route group and the analytics panel', () => {
    for (const mount of ["'/api/substack'", "'/api/users'", "'/api/blog'", "'/api/linkedin'", "'/api/admin/analytics'"]) {
      expect(index).toMatch(new RegExp(`app\\.use\\(${mount.replace(/\//g, '\\/')}, studioAuth\\(`))
    }
    expect(index.match(/app\.use\('\/api', studioAuth\(\{ onlyFor/g)).toHaveLength(2)
  })

  it('keeps the OAuth callback reachable without a session', () => {
    expect(index).toMatch(/app\.get\('\/api\/linkedin\/callback', linkedinCallback\)/)
  })
})
