import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { readAll } from '../../services/analytics/read'
import { ttlCache } from '../../services/analytics/cache'

describe('readAll', () => {
  it('reads every page, in order, even when pages are requested at the same time', async () => {
    const total = 3500
    const build = vi.fn(async (from: number, to: number) => ({
      data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i),
      error: null,
    }))
    const rows = await readAll<number>(build)
    expect(rows).toHaveLength(total)
    expect(rows.slice(995, 1005)).toEqual([995, 996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004])
  })

  it('stops at the first error', async () => {
    const build = async (from: number) => (from === 1000 ? { data: null, error: { message: 'boom' } } : { data: new Array(1000).fill(1), error: null })
    await expect(readAll(build)).rejects.toThrow('boom')
  })
})

describe('ttlCache', () => {
  afterEach(() => { process.env.NODE_ENV = 'test' })

  const appWith = (calls: { n: number }) => {
    const app = express()
    app.use(ttlCache(60_000, (path) => path === '/me'))
    app.get('/data', (_req, res) => res.json({ n: ++calls.n }))
    app.get('/me', (_req, res) => res.json({ n: ++calls.n }))
    return app
  }

  it('answers a repeated query from memory, and recalculates with ?fresh=1', async () => {
    process.env.NODE_ENV = 'production'
    const calls = { n: 0 }
    const app = appWith(calls)
    expect((await request(app).get('/data?days=30')).body.n).toBe(1)
    expect((await request(app).get('/data?days=30')).body.n).toBe(1)
    expect((await request(app).get('/data?days=7')).body.n).toBe(2)
    expect((await request(app).get('/data?days=30&fresh=1')).body.n).toBe(3)
    expect((await request(app).get('/data?days=30')).body.n).toBe(3)
  })

  it('never keeps what it was told to skip', async () => {
    process.env.NODE_ENV = 'production'
    const calls = { n: 0 }
    const app = appWith(calls)
    await request(app).get('/me')
    expect((await request(app).get('/me')).body.n).toBe(2)
  })

  it('keeps nothing under test, so every test sees its own data', async () => {
    const calls = { n: 0 }
    const app = appWith(calls)
    await request(app).get('/data')
    expect((await request(app).get('/data')).body.n).toBe(2)
  })
})
