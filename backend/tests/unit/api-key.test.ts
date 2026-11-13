import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiKeyGate, apiKeyMode, apiKeyStats, isApiKeyExempt, parseApiKeys, resetApiKeyStats } from '../../middleware/api-key.middleware'

const WEB = 'w'.repeat(32)
const PANEL = 'p'.repeat(32)
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

function app(vars: Record<string, string>, logs: string[] = []) {
  const server = express()
  server.use(apiKeyGate(env(vars), (message) => logs.push(message)))
  server.get('/', (_req, res) => res.send('ok'))
  server.get('/api/community/flags', (req, res) => res.json({ client: (req as express.Request & { apiClient?: string }).apiClient ?? null }))
  server.get('/api/files/avatars/a.png', (_req, res) => res.send('img'))
  server.get('/api/community/auth/oauth/github', (_req, res) => res.send('redirect'))
  server.post('/api/webhooks/resend', (_req, res) => res.send('hook'))
  server.options('/api/community/flags', (_req, res) => res.status(204).end())
  return server
}

beforeEach(() => resetApiKeyStats())

describe('parsing and mode', () => {
  it('reads named keys, ignores bad names and short keys', () => {
    expect(parseApiKeys(`web:${WEB},panel:${PANEL}`).map((entry) => entry.name)).toEqual(['web', 'panel'])
    expect(parseApiKeys(`Web:${WEB},corta:abc,:${WEB},sin-dos-puntos`)).toEqual([])
    expect(parseApiKeys(undefined)).toEqual([])
  })

  it('is off without keys, enforcing with keys unless the mode says otherwise', () => {
    expect(apiKeyMode(env({}))).toBe('off')
    expect(apiKeyMode(env({ API_KEY_MODE: 'enforce' }))).toBe('off')
    expect(apiKeyMode(env({ API_KEYS: `web:${WEB}` }))).toBe('enforce')
    expect(apiKeyMode(env({ API_KEYS: `web:${WEB}`, API_KEY_MODE: 'report' }))).toBe('report')
    expect(apiKeyMode(env({ API_KEYS: `web:${WEB}`, API_KEY_MODE: 'off' }))).toBe('off')
    expect(apiKeyMode(env({ API_KEYS: `web:${WEB}`, API_KEY_MODE: 'cosa' }))).toBe('enforce')
  })
})

describe('enforce', () => {
  const vars = { API_KEYS: `web:${WEB},panel:${PANEL}` }

  it('refuses a request without a key or with a wrong one, and runs nothing', async () => {
    const server = app(vars)
    expect((await request(server).get('/api/community/flags')).status).toBe(401)
    expect((await request(server).get('/api/community/flags').set('x-api-key', 'x'.repeat(32))).status).toBe(401)
    expect((await request(server).get('/api/community/flags').set('x-api-key', 'corta')).status).toBe(401)
    expect(apiKeyStats()).toMatchObject({ missing: 1, invalid: 2 })
  })

  it('accepts either named key and tells the route which client called', async () => {
    const server = app(vars)
    expect((await request(server).get('/api/community/flags').set('x-api-key', WEB)).body).toEqual({ client: 'web' })
    expect((await request(server).get('/api/community/flags').set('x-api-key', PANEL)).body).toEqual({ client: 'panel' })
    expect(apiKeyStats().byClient).toEqual({ web: 1, panel: 1 })
  })

  it('keeps open what cannot send headers or has its own signature', async () => {
    const server = app(vars)
    expect((await request(server).get('/')).status).toBe(200)
    expect((await request(server).options('/api/community/flags')).status).toBe(204)
    expect((await request(server).get('/api/files/avatars/a.png')).status).toBe(200)
    expect((await request(server).get('/api/community/auth/oauth/github')).status).toBe(200)
    expect((await request(server).post('/api/webhooks/resend')).status).toBe(200)
  })

  it('the exemption list is exact: nearby paths still need the key', () => {
    for (const [method, path] of [['GET', '/api/files/x'], ['GET', '/api/community/favicon/a'], ['GET', '/api/linkedin/callback'], ['POST', '/api/community/push/click'], ['GET', '/sitemap.xml'], ['OPTIONS', '/api/anything']] as const) expect(isApiKeyExempt(method, path), path).toBe(true)
    for (const [method, path] of [['GET', '/api/community/auth/login'], ['GET', '/api/linkedin/other'], ['POST', '/api/community/push/subscribe'], ['GET', '/api/admin/analytics/overview'], ['GET', '/api/filesx']] as const) expect(isApiKeyExempt(method, path), path).toBe(false)
  })
})

describe('report (the safe way to try it in production)', () => {
  it('lets everything through but counts and logs what would have been refused', async () => {
    const logs: string[] = []
    const server = app({ API_KEYS: `web:${WEB}`, API_KEY_MODE: 'report' }, logs)
    expect((await request(server).get('/api/community/flags')).status).toBe(200)
    expect((await request(server).get('/api/community/flags').set('x-api-key', 'x'.repeat(32))).status).toBe(200)
    expect((await request(server).get('/api/community/flags').set('x-api-key', WEB)).status).toBe(200)
    expect(apiKeyStats()).toMatchObject({ missing: 1, invalid: 1, byClient: { web: 1 } })
    expect(logs.length).toBe(1)
    expect(logs[0]).toContain('modo report')
  })
})

describe('off', () => {
  it('does nothing', async () => {
    expect((await request(app({})).get('/api/community/flags')).status).toBe(200)
    expect((await request(app({ API_KEYS: `web:${WEB}`, API_KEY_MODE: 'off' })).get('/api/community/flags')).status).toBe(200)
  })
})
