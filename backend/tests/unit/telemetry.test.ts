import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: { rpc } }))
vi.mock('@avotalent/core/http/middleware/community-auth.middleware', () => ({ communityAuthMiddleware: (_req: any, _res: any, next: any) => next() }))

import router from '../../src/routes/analytics/collect.routes'
import {
  scrub, pathOnly, parseStack, fingerprintOf, cleanContext, parseErrorPayload, parseFlowPayload, browserInfoOf, captureServerError,
} from '@avotalent/core/services/web-analytics/telemetry'
import { stepsByFlow } from '@avotalent/core/services/analytics/flows'

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
const FLOW = '4a1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
const CLIENT = 'b7c1f0de-1111-4222-8333-944455556666'
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const CHROME_STACK = `TypeError: Cannot read properties of undefined (reading 'title')
    at renderCard (https://avotalent.app/_next/static/chunks/app-1a2b3c.js?v=1:12:3456)
    at https://avotalent.app/_next/static/chunks/main.js:1:20
    at <anonymous>`
const FIREFOX_STACK = `renderCard@https://avotalent.app/_next/static/chunks/app.js:12:34
@https://avotalent.app/_next/static/chunks/main.js:1:20`

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: true, error: null })
  delete process.env.ANALYTICS_PROXY_SECRET
})

describe('scrub and pathOnly', () => {
  it('removes emails, tokens, JWTs and query strings from error text', () => {
    const text = scrub('Falló para ana@example.com con Bearer abcdefghijkl y https://x.com/a?token=secret123&y=2 y eyJhbGciOi.eyJzdWIiOiIx.abcdefgh y 0123456789abcdef0123456789abcdef01234567', 2000)
    expect(text).not.toContain('ana@example.com')
    expect(text).not.toContain('abcdefghijkl')
    expect(text).not.toContain('secret123')
    expect(text).not.toContain('eyJhbGci')
    expect(text).not.toContain('0123456789abcdef0123456789abcdef01234567')
    expect(text).toContain('[email]')
  })

  it('keeps only the path of an address', () => {
    expect(pathOnly('https://avotalent.app/vacantes/x?utm=1#top')).toBe('/vacantes/x')
    expect(pathOnly('/vacantes/x?email=a@b.com')).toBe('/vacantes/x')
    expect(pathOnly(undefined)).toBe('/')
    expect(pathOnly(' ')).toBe('/')
  })
})

describe('parseStack', () => {
  it('splits a Chrome stack into file, function, line and column, without domain or query', () => {
    expect(parseStack(CHROME_STACK)).toEqual([
      { file: '/_next/static/chunks/app-1a2b3c.js', fn: 'renderCard', line: 12, col: 3456 },
      { file: '/_next/static/chunks/main.js', fn: null, line: 1, col: 20 },
    ])
  })

  it('reads a Firefox / Safari stack too, and survives garbage', () => {
    expect(parseStack(FIREFOX_STACK)).toEqual([
      { file: '/_next/static/chunks/app.js', fn: 'renderCard', line: 12, col: 34 },
      { file: '/_next/static/chunks/main.js', fn: '', line: 1, col: 20 },
    ].map((frame) => ({ ...frame, fn: frame.fn || null })))
    expect(parseStack(undefined)).toEqual([])
    expect(parseStack('nada que ver')).toEqual([])
    expect(parseStack(Array.from({ length: 80 }, (_, i) => `at f${i} (https://a.com/x.js:${i}:1)`).join('\n'))).toHaveLength(30)
  })
})

describe('fingerprintOf', () => {
  const frames = parseStack(CHROME_STACK)
  it('is the same error when only numbers, ids or quoted text change, and different when the place or the message changes', () => {
    const a = fingerprintOf('TypeError', "Cannot read 'title' of item 12", frames)
    expect(fingerprintOf('TypeError', "Cannot read 'name' of item 99", frames)).toBe(a)
    expect(fingerprintOf('TypeError', "Cannot read 'title' of item 12", [{ ...frames[0], line: 99 }])).not.toBe(a)
    expect(fingerprintOf('RangeError', "Cannot read 'title' of item 12", frames)).not.toBe(a)
    expect(fingerprintOf('TypeError', 'otra cosa', frames)).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('parseErrorPayload', () => {
  it('builds the record: the fingerprint and frames are computed by the SERVER, whatever the browser says', () => {
    const record = parseErrorPayload({ name: 'TypeError', message: 'falló para ana@example.com', stack: CHROME_STACK, path: '/vacantes/x?token=abc', session_id: SESSION, fingerprint: 'forged', frames: [{ file: 'forged' }], source: 'backend', context: { step: 'submit', password: 'x', n: 3 } })!
    expect(record.fingerprint).not.toBe('forged')
    expect(record.frames[0].fn).toBe('renderCard')
    expect(record.path).toBe('/vacantes/x')
    expect(record.message).not.toContain('ana@example.com')
    expect(record.source).toBe('frontend') // "backend" no lo puede decir un navegador
    expect(record.context).toEqual({ step: 'submit', n: 3 })
    expect(record.session_id).toBe(SESSION)
  })

  it('accepts "api" as a source, defaults the name, and refuses what is not an error', () => {
    expect(parseErrorPayload({ message: 'x', source: 'api', name: '<script>' })).toMatchObject({ source: 'api', name: 'Error' })
    expect(parseErrorPayload({ message: ' ' })).toBeNull()
    expect(parseErrorPayload({})).toBeNull()
    expect(parseErrorPayload(null)).toBeNull()
    expect(parseErrorPayload({ message: 'x', session_id: 'nope' })!.session_id).toBeNull()
  })
})

describe('cleanContext', () => {
  it('keeps short values, drops anything that looks like a secret or has a strange key', () => {
    expect(cleanContext({ ok: 'yes', count: 2, flag: true, token: 'abc', Email: 'a@b.c', 'bad key!': 1, nested: { a: 1 }, nan: NaN })).toEqual({ ok: 'yes', count: 2, flag: true })
    expect(cleanContext([1])).toBeNull()
    expect(cleanContext({ authorization: 'x' })).toBeNull()
  })
})

describe('parseFlowPayload', () => {
  const ok = { flow_id: FLOW, session_id: SESSION, flow_name: 'job_application', step_name: 'click_apply', step_order: 1, path: '/vacantes/x?a=1', duration_ms: 1200.6, load_time_ms: 300, status: 'completed' }

  it('accepts a step of a known flow and cleans the numbers', () => {
    expect(parseFlowPayload(ok)).toMatchObject({ flow_name: 'job_application', step_order: 1, path: '/vacantes/x', duration_ms: 1201, status: 'completed', is_final: false, rage_clicks: 0 })
    expect(parseFlowPayload({ ...ok, step_order: 999, duration_ms: -5, load_time_ms: 'x', is_final: true, status: 'weird' })).toMatchObject({ step_order: 50, duration_ms: 0, load_time_ms: 0, is_final: true, status: 'completed' })
  })

  it('refuses unknown flows, bad steps and bad ids (the list of flows is closed)', () => {
    expect(parseFlowPayload({ ...ok, flow_name: 'hack' })).toBeNull()
    expect(parseFlowPayload({ ...ok, step_name: 'Bad Step' })).toBeNull()
    expect(parseFlowPayload({ ...ok, flow_id: 'x' })).toBeNull()
    expect(parseFlowPayload(null)).toBeNull()
  })
})

describe('browserInfoOf', () => {
  it('summarizes the User-Agent', () => {
    expect(browserInfoOf(CHROME)).toBe('Chrome 130 · Windows 10/11 · desktop')
  })
})

describe('captureServerError', () => {
  it('saves a server error with its path and account, and the same error again within a minute is not saved twice', () => {
    const error = new Error('Falló la consulta para ana@example.com')
    captureServerError(error, { path: '/api/community/posts?x=1', userId: 'user-1' })
    captureServerError(error, { path: '/api/community/posts', userId: 'user-1' })
    expect(rpc).toHaveBeenCalledTimes(1)
    const payload = rpc.mock.calls[0][1].p
    expect(payload).toMatchObject({ path: '/api/community/posts', source: 'backend', server_user_id: 'user-1', name: 'Error' })
    expect(payload.message).not.toContain('ana@example.com')
    expect(payload.frames.length).toBeGreaterThan(0)
  })

  it('never throws, even if the database fails or the error is not an Error', async () => {
    rpc.mockRejectedValue(new Error('boom'))
    expect(() => captureServerError('texto suelto', { path: '/x' })).not.toThrow()
    expect(() => captureServerError(undefined)).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/api/analytics', router)
  return a
}
const asProxy = (req: request.Test, extra: Record<string, string> = {}) => req.set({ 'x-avo-client-id': CLIENT, 'x-avo-ua': CHROME, ...extra })

describe('POST /error', () => {
  it('stores the error with the browser summary read from the User-Agent', async () => {
    await asProxy(request(app()).post('/api/analytics/error')).send({ name: 'TypeError', message: 'x', stack: CHROME_STACK, path: '/vacantes/x', session_id: SESSION }).expect(204)
    const payload = rpc.mock.calls[0][1].p
    expect(rpc.mock.calls[0][0]).toBe('analytics_record_error')
    expect(payload).toMatchObject({ client_id: CLIENT, session_id: SESSION, source: 'frontend', browser_info: 'Chrome 130 · Windows 10/11 · desktop' })
  })

  it('ignores what is not an error, robots, and a request without the proxy secret; a database failure still answers 204', async () => {
    await asProxy(request(app()).post('/api/analytics/error')).send({ message: '' }).expect(204)
    await asProxy(request(app()).post('/api/analytics/error'), { 'x-avo-ua': 'Googlebot/2.1' }).send({ message: 'x' }).expect(204)
    process.env.ANALYTICS_PROXY_SECRET = 's3cret'
    await asProxy(request(app()).post('/api/analytics/error')).send({ message: 'x' }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
    delete process.env.ANALYTICS_PROXY_SECRET
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await asProxy(request(app()).post('/api/analytics/error')).send({ message: 'x' }).expect(204)
  })

  it('has a limit per browser so an error inside a loop does not flood the database', async () => {
    const client = 'ffffffff-1111-4222-8333-944455556666'
    for (let i = 0; i < 70; i++) await request(app()).post('/api/analytics/error').set({ 'x-avo-client-id': client, 'x-avo-ua': CHROME }).send({ message: `x ${i}` }).expect(204)
    expect(rpc.mock.calls.length).toBe(60)
  })
})

describe('POST /flow', () => {
  it('stores a step of a known flow with this browser as the owner', async () => {
    await asProxy(request(app()).post('/api/analytics/flow')).send({ flow_id: FLOW, session_id: SESSION, flow_name: 'auth_login', step_name: 'submit', step_order: 1, load_time_ms: 2600 }).expect(204)
    expect(rpc).toHaveBeenCalledWith('analytics_record_flow_step', { p: expect.objectContaining({ flow_name: 'auth_login', step_name: 'submit', load_time_ms: 2600, client_id: CLIENT }) })
  })

  it('refuses unknown flows and robots', async () => {
    await asProxy(request(app()).post('/api/analytics/flow')).send({ flow_id: FLOW, flow_name: 'hack', step_name: 'start', step_order: 0 }).expect(204)
    await asProxy(request(app()).post('/api/analytics/flow'), { 'x-avo-ua': 'curl/8' }).send({ flow_id: FLOW, flow_name: 'auth_login', step_name: 'start', step_order: 0 }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('stepsByFlow', () => {
  it('orders the steps and computes the loss between one step and the next', () => {
    const row = (flow: string, step: string, order: number, reached: number, continued: number, final = false) => ({ flow_name: flow, step_name: step, step_order: order, reached, continued, is_final: final, avg_duration_ms: 100, avg_load_time_ms: 50, errors: 0, frustrated: 0, rage_clicks: 0 })
    const out = stepsByFlow([row('auth_login', 'success', 2, 40, 0, true), row('auth_login', 'start', 0, 100, 60), row('auth_login', 'submit', 1, 60, 40), row('auth_register', 'start', 0, 0, 0)])
    // se pierde lo que llegó y no siguió; el paso final no pierde a nadie
    expect(out.auth_login.map((step) => [step.name, step.reached, step.dropoffToNextPct])).toEqual([['start', 100, 40], ['submit', 60, 33.3], ['success', 40, null]])
    expect(out.auth_register[0].dropoffToNextPct).toBeNull()
  })
})
