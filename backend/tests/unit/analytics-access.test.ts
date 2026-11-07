import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { analyticsAccess, stripPeople, SERVICE_READABLE } from '../../middleware/analytics-access.middleware'

const KEY = 'k'.repeat(40)

function app() {
  const server = express()
  const studio = (_req: express.Request, res: express.Response) => { res.status(401).json({ error: 'sesión' }) }
  const router = express.Router()
  router.get('/overview', (_req, res) => { res.json({ total: 3, people: [{ email: 'a@b.c' }], nested: { user: { email: 'x' }, keep: 1 } }) })
  router.get('/users', (_req, res) => { res.json({ users: [{ email: 'a@b.c' }] }) })
  router.get('/web/sessions', (_req, res) => { res.json({ sessions: [] }) })
  router.post('/overview', (_req, res) => { res.json({ wrote: true }) })
  server.use('/api/admin/analytics', analyticsAccess(studio as never), router)
  return server
}

describe('analyticsAccess', () => {
  const previous = process.env.ANALYTICS_SERVICE_KEY
  const withKey = (value: string | undefined) => { if (value === undefined) delete process.env.ANALYTICS_SERVICE_KEY; else process.env.ANALYTICS_SERVICE_KEY = value }

  it('opens an aggregated route with the right key and strips the people from the answer', async () => {
    withKey(KEY)
    const res = await request(app()).get('/api/admin/analytics/overview').set('x-analytics-key', KEY)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ total: 3, nested: { keep: 1 } })
    withKey(previous)
  })

  it('falls back to the normal session guard for a wrong key, no key, or a route that carries people', async () => {
    withKey(KEY)
    expect((await request(app()).get('/api/admin/analytics/overview').set('x-analytics-key', 'x'.repeat(40))).status).toBe(401)
    expect((await request(app()).get('/api/admin/analytics/overview')).status).toBe(401)
    expect((await request(app()).get('/api/admin/analytics/users').set('x-analytics-key', KEY)).status).toBe(401)
    expect((await request(app()).get('/api/admin/analytics/web/sessions').set('x-analytics-key', KEY)).status).toBe(401)
    withKey(previous)
  })

  it('never writes through the key, and does nothing when the server has no key (or a short one)', async () => {
    withKey(KEY)
    expect((await request(app()).post('/api/admin/analytics/overview').set('x-analytics-key', KEY)).status).toBe(401)
    withKey(undefined)
    expect((await request(app()).get('/api/admin/analytics/overview').set('x-analytics-key', '')).status).toBe(401)
    withKey('corta')
    expect((await request(app()).get('/api/admin/analytics/overview').set('x-analytics-key', 'corta')).status).toBe(401)
    withKey(previous)
  })

  it('the readable list has no route with sessions, live people or users', () => {
    for (const path of ['/me', '/users', '/web/live', '/web/sessions', '/web/sessions/:id']) expect(SERVICE_READABLE.has(path)).toBe(false)
  })

  it('the list of people with emails is never readable by the key, only the counts are', () => {
    expect(SERVICE_READABLE.has('/people-value')).toBe(false)
    expect(SERVICE_READABLE.has('/people-value/summary')).toBe(true)
  })

  it('stripPeople goes through arrays and keeps the numbers', () => {
    expect(stripPeople([{ n: 1, email: 'x' }, { n: 2, profile: {} }])).toEqual([{ n: 1 }, { n: 2 }])
  })
})
