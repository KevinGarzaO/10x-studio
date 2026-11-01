import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import express from 'express'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../services/supabase.service', () => ({ supabase: { rpc } }))

import { TimingAggregator, apiTiming, bucketOf, flushTimings, percentileMs, summarizeTimings, loadTimingSummary, routeOf, type TimingItem, type TimingRow } from '../../services/performance/api-timing'

const sql = fs.readFileSync(path.join(__dirname, '../../sql/api-timing-migration.sql'), 'utf8')

describe('bucketOf', () => {
  it('puts a duration in the first range that holds it', () => {
    expect([0, 50, 51, 100, 250, 500, 1000, 2500, 5000, 5001, 99999].map(bucketOf)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7])
  })
})

describe('TimingAggregator', () => {
  const at = new Date('2026-11-01T15:42:10Z')

  it('adds per hour, method and route, counting errors only for 5xx', () => {
    const timing = new TimingAggregator()
    timing.observe({ method: 'GET', route: '/api/community/posts', status: 200, ms: 120, at })
    timing.observe({ method: 'GET', route: '/api/community/posts', status: 404, ms: 40, at })
    timing.observe({ method: 'GET', route: '/api/community/posts', status: 500, ms: 3000, at })
    timing.observe({ method: 'POST', route: '/api/community/posts', status: 201, ms: 80, at })
    timing.observe({ method: 'GET', route: '/api/community/posts', status: 200, ms: 60, at: new Date('2026-11-01T16:01:00Z') })

    const items = timing.drain()
    expect(items).toHaveLength(3)
    const getFirstHour = items.find((item) => item.method === 'GET' && item.hour === '2026-11-01T15:00:00.000Z')!
    expect(getFirstHour).toMatchObject({ requests: 3, errors: 1, sum_ms: 3160, max_ms: 3000 })
    expect(getFirstHour.buckets).toEqual([1, 0, 1, 0, 0, 0, 1, 0])
    expect(timing.drain()).toEqual([]) // lo entregado se vacía
  })

  it('gives a batch back when it could not be saved, merging with what came in meanwhile', () => {
    const timing = new TimingAggregator()
    timing.observe({ method: 'GET', route: '/r', status: 200, ms: 10, at })
    const batch = timing.drain()
    timing.observe({ method: 'GET', route: '/r', status: 200, ms: 700, at })
    timing.restore(batch)
    const [merged] = timing.drain()
    expect(merged).toMatchObject({ requests: 2, sum_ms: 710, max_ms: 700 })
  })

  it('stops growing at its cap, so a database that stays down cannot fill the memory', () => {
    const timing = new TimingAggregator(3)
    for (let i = 0; i < 10; i++) timing.observe({ method: 'GET', route: `/r${i}`, status: 200, ms: 5, at })
    expect(timing.size).toBe(3)
  })
})

describe('percentileMs / summarizeTimings', () => {
  it('estimates the median and p95 with the upper limit of the range where they fall', () => {
    // 90 rápidas (<=50), 5 de <=250 y 5 de <=2500
    const buckets = [90, 0, 5, 0, 0, 5, 0, 0]
    expect(percentileMs(buckets, 0.5, 2400)).toBe(50)
    expect(percentileMs(buckets, 0.95, 2400)).toBe(250)
    expect(percentileMs(buckets, 0.99, 2400)).toBe(2400) // el límite del rango (2500) no pasa del máximo real
    expect(percentileMs([0, 0, 0, 0, 0, 0, 0, 4], 0.5, 9000)).toBe(9000) // el último rango usa el máximo
    expect(percentileMs([0, 0, 0, 0, 0, 0, 0, 0], 0.5, 0)).toBe(0)
  })

  const row = (patch: Partial<TimingRow>): TimingRow => ({ method: 'GET', route: '/a', requests: 10, errors: 0, sum_ms: 1000, max_ms: 300, b0: 5, b1: 3, b2: 2, b3: 0, b4: 0, b5: 0, b6: 0, b7: 0, ...patch })

  it('ranks routes by the total time they consume and marks the slow ones (p95 over 1 s)', () => {
    const rows = summarizeTimings([
      row({ route: '/rapida', requests: 1000, sum_ms: 40000 }),
      row({ route: '/lenta', requests: 20, errors: 2, sum_ms: 60000, max_ms: 6000, b0: 0, b1: 0, b2: 0, b3: 0, b4: 5, b5: 10, b6: 4, b7: 1 }),
    ])
    expect(rows.map((r) => r.route)).toEqual(['/lenta', '/rapida'])
    expect(rows[0]).toMatchObject({ requests: 20, errorPct: 10, avgMs: 3000, totalSeconds: 60, sharePct: 60, slow: true })
    expect(rows[1]).toMatchObject({ avgMs: 40, sharePct: 40, slow: false })
  })

  it('reads the big numbers the database returns as text', () => {
    const [one] = summarizeTimings([row({ requests: '12', sum_ms: '2400', b0: '12', b1: '0', b2: '0' })])
    expect(one).toMatchObject({ requests: 12, avgMs: 200 })
  })
})

describe('apiTiming middleware', () => {
  it('measures by the route Express declared, not by the address asked for, and skips what is not the API', async () => {
    const timing = new TimingAggregator()
    const app = express()
    app.use(apiTiming(timing))
    const posts = express.Router()
    posts.get('/', (_req, res) => { res.json([]) })
    posts.get('/:id', (req, res) => { res.json({ id: req.params.id }) })
    posts.get('/boom', (_req, res) => { res.status(500).end() })
    app.use('/api/community/posts', posts)
    app.get('/api/analytics/collect', (_req, res) => { res.status(204).end() })
    app.get('/uploads/x.png', (_req, res) => { res.end() })

    await request(app).get('/api/community/posts/')
    await request(app).get('/api/community/posts/uno')
    await request(app).get('/api/community/posts/dos')
    await request(app).get('/api/community/posts/boom?x=1')
    await request(app).get('/api/no-existe/loquesea')
    await request(app).get('/api/analytics/collect')
    await request(app).get('/uploads/x.png')
    await request(app).options('/api/community/posts/')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const items = timing.drain()
    const byRoute = Object.fromEntries(items.map((item) => [item.route, item]))
    expect(Object.keys(byRoute).sort()).toEqual(['(sin ruta)', '/api/community/posts', '/api/community/posts/:id'])
    expect(byRoute['/api/community/posts/:id'].requests).toBe(3) // uno, dos y boom caen en :id (boom va después de :id)
    expect(routeOf({ baseUrl: '/api/x', route: { path: '/' } } as any)).toBe('/api/x')
    expect(routeOf({ baseUrl: '/api/x', route: { path: /^\/a/ } } as any)).toBe('(ruta con patrón)')
  })
})

describe('flushTimings', () => {
  beforeEach(() => rpc.mockReset())
  const feed = (timing: TimingAggregator) => timing.observe({ method: 'GET', route: '/r', status: 200, ms: 10 })

  it('sends what it has and empties the memory', async () => {
    rpc.mockResolvedValue({ data: 1, error: null })
    const timing = new TimingAggregator()
    feed(timing)
    expect(await flushTimings(timing)).toBe(1)
    expect(rpc).toHaveBeenCalledWith('api_timing_record', { p: expect.any(Array) })
    expect(timing.size).toBe(0)
  })

  it('keeps it in memory when the database fails, and never throws', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function api_timing_record does not exist' } })
    const timing = new TimingAggregator()
    feed(timing)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await flushTimings(timing)).toBe(0)
    expect(timing.size).toBe(1)
  })

  it('does nothing when there is nothing to send', async () => {
    expect(await flushTimings(new TimingAggregator())).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('loadTimingSummary', () => {
  it('says the migration is missing instead of showing an empty table', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function api_timing_summary does not exist' } })
    expect(await loadTimingSummary(24)).toEqual({ ready: false })
  })
})

describe('api-timing-migration.sql (Postgres real)', () => {
  let db: PGlite
  const q = async (text: string, params?: unknown[]) => (await db.query<any>(text, params as any[])).rows
  const batch = (items: Partial<TimingItem>[]) => JSON.stringify(items.map((item) => ({ hour: '2026-10-01T15:00:00Z', method: 'GET', route: '/api/community/posts', requests: 1, errors: 0, sum_ms: 100, max_ms: 100, buckets: [0, 1, 0, 0, 0, 0, 0, 0], ...item })))

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec(sql)
    await db.exec(sql) // idempotente
  }, 60000)
  afterAll(async () => { await db?.close() })

  it('adds the batches that arrive for the same hour, method and route', async () => {
    expect((await q('SELECT api_timing_record($1::jsonb) AS saved', [batch([{}, { requests: 2, errors: 1, sum_ms: 5000, max_ms: 4000, buckets: [0, 0, 0, 0, 0, 0, 2, 0] }])]))[0].saved).toBe(2)
    const [row] = await q('SELECT * FROM api_timing_hourly')
    expect(row).toMatchObject({ requests: 3, errors: 1, max_ms: 4000, b1: 1, b6: 2 })
    expect(Number(row.sum_ms)).toBe(5100)
  })

  it('ignores a malformed row without dropping the good ones, and anything that is not a list', async () => {
    const saved = await q(
      'SELECT api_timing_record($1::jsonb) AS saved',
      [batch([{ route: '/api/otra' }, { method: 'get' as any }, { buckets: [1, 2] as any }, { route: '' }, { requests: 'x' as any }])],
    )
    expect(saved[0].saved).toBe(1)
    expect((await q(`SELECT api_timing_record('{"a":1}'::jsonb) AS saved`))[0].saved).toBe(0)
  })

  it('summarizes the last hours, the route that took most time first', async () => {
    await q('SELECT api_timing_record($1::jsonb)', [batch([{ route: '/api/lenta', hour: new Date().toISOString(), requests: 4, sum_ms: 20000, max_ms: 7000, buckets: [0, 0, 0, 0, 0, 1, 1, 2] }])])
    const rows = await q('SELECT * FROM api_timing_summary(24)')
    expect(rows[0].route).toBe('/api/lenta')
    expect(Number(rows[0].b7)).toBe(2)
    // la fila de hace días (2026-11-01 15:00) ya no entra en 24 horas (es de octubre)
    expect(rows.find((row) => row.route === '/api/community/posts')).toBeUndefined()
  })

  it('is closed to the public roles and open to the server', async () => {
    const [grants] = await q(`SELECT has_function_privilege('anon', 'api_timing_record(jsonb)', 'EXECUTE') AS anon, has_function_privilege('service_role', 'api_timing_summary(int)', 'EXECUTE') AS server`)
    expect(grants).toEqual({ anon: false, server: true })
    expect((await q(`SELECT relrowsecurity FROM pg_class WHERE relname = 'api_timing_hourly'`))[0].relrowsecurity).toBe(true)
  })
})
