import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, inserted: [] as { table: string; row: any }[], upserted: [] as any[], updated: [] as any[] }))

vi.mock('@avotalent/core/services/supabase.service', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {}
      for (const name of ['select', 'eq', 'neq', 'is', 'gte', 'limit']) q[name] = () => q
      q.maybeSingle = async () => ({ data: (state.tables[table] ?? [])[0] ?? null, error: null })
      q.single = async () => ({ data: { id: 'sub-1' }, error: null })
      q.then = (resolve: any) => Promise.resolve({ data: state.tables[table] ?? [], count: (state.tables[table] ?? []).length, error: null }).then(resolve)
      q.insert = async (row: any) => { state.inserted.push({ table, row }); return { error: null } }
      q.upsert = (row: any) => { state.upserted.push({ table, row }); return q }
      q.update = (patch: any) => { state.updated.push({ table, patch }); return q }
      return q
    },
  },
}))
vi.mock('@avotalent/core/http/middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => { req.userId = 'ana'; next() },
}))

import pushRoutes from '../../src/routes/community/push.routes'
import { buildPayload, canPush, pushConfig, pushEnabled, pushToUser, pushWelcome, pushTest, MAX_PUSHES_PER_DAY, type PushDeps } from '@avotalent/core/services/push/push'
import { buildPushSummary } from '@avotalent/core/services/analytics/push'

const config = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' }
const SUB = { id: 's1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' }

function deps(extra: Partial<PushDeps> = {}) {
  const log = { sent: [] as string[], revoked: [] as string[], recorded: [] as any[] }
  const value: PushDeps = {
    config: () => config, enabled: () => true, loadPrefs: async () => null, sentLast24h: async () => 0, subscriptions: async () => [SUB],
    send: async (sub) => { log.sent.push(sub.id); return { ok: true } }, revoke: async (id) => { log.revoked.push(id) }, record: async (event) => { log.recorded.push(event) }, now: () => new Date(), ...extra,
  }
  return { value, log }
}

describe('config', () => {
  it('is off without both keys, and only on with PUSH_NOTIFICATIONS=on', () => {
    expect(pushConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(pushConfig({ VAPID_PUBLIC_KEY: 'a' } as NodeJS.ProcessEnv)).toBeNull()
    const env = { VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' } as NodeJS.ProcessEnv
    expect(pushEnabled(env)).toBe(false)
    expect(pushEnabled({ ...env, PUSH_NOTIFICATIONS: 'on' } as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('buildPayload / canPush', () => {
  it('marks the link as coming from push, keeps the path, and trims the text', () => {
    const payload = buildPayload({ type: 'application', message: 'x'.repeat(300), link: '/postulaciones' }, 'nid-1')
    expect(payload.url).toBe('/postulaciones?utm_source=push&utm_medium=notificacion&utm_campaign=application')
    expect(payload.body).toHaveLength(140)
    expect(buildPayload({ type: 'match', message: 'm', link: '/vacantes/x?a=1' }).url).toContain('?a=1&utm_source=push')
    expect(buildPayload({ type: 'match', message: 'm', link: 'https://evil.example' }).url.startsWith('/?')).toBe(true)
  })
  it('caps at 3 a day and respects the switch', () => {
    expect(canPush(MAX_PUSHES_PER_DAY - 1, null)).toBe(true)
    expect(canPush(MAX_PUSHES_PER_DAY, null)).toBe(false)
    expect(canPush(0, { push: false })).toBe(false)
  })
})

describe('pushToUser', () => {
  const input = { userId: 'ana', type: 'application', message: 'Cómo te fue', link: '/postulaciones' }
  it('sends to every active device and records each one', async () => {
    const { value, log } = deps({ subscriptions: async () => [SUB, { ...SUB, id: 's2', endpoint: 'https://push.example/def' }] })
    expect(await pushToUser(input, value)).toEqual({ status: 'done', sent: 2, failed: 0 })
    expect(log.recorded.map(event => event.kind)).toEqual(['sent', 'sent'])
    expect(new Set(log.recorded.map(event => event.nid)).size).toBe(1) // un aviso = un nid, aunque sean dos dispositivos
  })
  it('does nothing when it is off, for types without push, with no devices, over the cap or switched off by the person', async () => {
    expect((await pushToUser(input, deps({ enabled: () => false }).value)).status).toBe('skipped')
    expect((await pushToUser({ ...input, type: 'comment' }, deps().value)).status).toBe('skipped')
    expect((await pushToUser(input, deps({ subscriptions: async () => [] }).value)).status).toBe('skipped')
    expect((await pushToUser(input, deps({ sentLast24h: async () => 3 }).value)).status).toBe('skipped')
    expect((await pushToUser(input, deps({ loadPrefs: async () => ({ push: false }) }).value)).status).toBe('skipped')
  })
  it('revokes a device the browser dropped (410) and records the failure, without breaking', async () => {
    const { value, log } = deps({ send: async () => ({ ok: false, gone: true, reason: '410' }) })
    expect(await pushToUser(input, value)).toEqual({ status: 'done', sent: 0, failed: 1 })
    expect(log.revoked).toEqual(['s1'])
    expect(log.recorded[0].kind).toBe('failed')
  })
  it('never throws', async () => {
    expect((await pushToUser(input, deps({ subscriptions: async () => { throw new Error('boom') } }).value)).status).toBe('skipped')
  })
})

describe('routes', () => {
  const app = () => { const server = express(); server.use(express.json()); server.use('/push', pushRoutes); return server }
  const sub = { endpoint: 'https://push.example/abcdef', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) } }

  it('stores a subscription for the person and records the permission', async () => {
    state.upserted = []; state.inserted = []
    await request(app()).post('/push/subscribe').send({ subscription: sub, surface: 'application_answer' }).expect(200)
    expect(state.upserted[0].row).toMatchObject({ user_id: 'ana', endpoint: sub.endpoint, revoked_at: null })
    expect(state.inserted.find(item => item.row.kind === 'permission_granted')?.row).toMatchObject({ user_id: 'ana', surface: 'application_answer' })
  })
  it('refuses a malformed subscription or an endpoint that is not https', async () => {
    await request(app()).post('/push/subscribe').send({ subscription: { endpoint: 'http://x', keys: {} } }).expect(400)
    await request(app()).post('/push/subscribe').send({}).expect(400)
  })
  it('records only the invitation events the browser can report, never a granted permission by itself', async () => {
    state.inserted = []
    await request(app()).post('/push/event').send({ kind: 'prompt_shown', surface: 'settings' }).expect(200)
    await request(app()).post('/push/event').send({ kind: 'permission_granted' }).expect(400)
    await request(app()).post('/push/event').send({ kind: 'sent' }).expect(400)
    expect(state.inserted.map(item => item.row.kind)).toEqual(['prompt_shown'])
  })
  it('counts a click only for a notification that was really sent, and rejects a bad id', async () => {
    const nid = '11111111-1111-4111-8111-111111111111'
    state.inserted = []
    state.tables.push_events = []
    await request(app()).post('/push/click').send({ nid }).expect(200)
    expect(state.inserted).toHaveLength(0) // ese aviso no existe
    await request(app()).post('/push/click').send({ nid: 'no-es-uuid' }).expect(400)
  })
})

describe('buildPushSummary', () => {
  it('reads the invitation funnel, delivery and the click rate by type', () => {
    const summary = buildPushSummary([
      { kind: 'prompt_shown', notification_type: '', events: 20, people: 15 },
      { kind: 'permission_granted', notification_type: '', events: 6, people: 6 },
      { kind: 'permission_denied', notification_type: '', events: 2, people: 2 },
      { kind: 'prompt_dismissed', notification_type: '', events: 12, people: 10 },
      { kind: 'sent', notification_type: 'application', events: 8, people: 4 },
      { kind: 'sent', notification_type: 'match', events: 2, people: 2 },
      { kind: 'click', notification_type: 'application', events: 3, people: 3 },
      { kind: 'failed', notification_type: 'match', events: 1, people: 1 },
    ], 7, { active: 6, activatedInPeriod: 6 })
    expect(summary.invitation).toEqual({ shown: 20, accepted: 6, denied: 2, dismissed: 12, acceptRatePct: 30 })
    expect(summary.delivery).toMatchObject({ sent: 10, failed: 1, clicked: 3, clickRatePct: 30 })
    expect(summary.byType.find(row => row.type === 'application')).toMatchObject({ sent: 8, clicked: 3, clickRatePct: 37.5 })
    expect(buildPushSummary([], 7, { active: 0, activatedInPeriod: 0 }).invitation.acceptRatePct).toBeNull()
  })
})

describe('pushWelcome (la notificación de muestra)', () => {
  it('sends one sample to the device just activated, records it as welcome, and does not need the daily cap', async () => {
    const { value, log } = deps({ sentLast24h: async () => 99 })
    expect(await pushWelcome({ userId: 'ana', subscription: SUB }, value)).toEqual({ status: 'done', sent: 1, failed: 0 })
    expect(log.recorded[0]).toMatchObject({ kind: 'sent', notification_type: 'welcome', subscription_id: 's1' })
  })
  it('does nothing when push is off, and records a failure without throwing', async () => {
    expect((await pushWelcome({ userId: 'ana', subscription: SUB }, deps({ enabled: () => false }).value)).status).toBe('skipped')
    const { value, log } = deps({ send: async () => ({ ok: false, gone: true, reason: '410' }) })
    expect(await pushWelcome({ userId: 'ana', subscription: SUB }, value)).toEqual({ status: 'done', sent: 0, failed: 1 })
    expect(log.revoked).toEqual(['s1'])
  })
})

describe('pushTest (aviso de prueba del panel)', () => {
  it('says what is missing when push is not configured', async () => {
    expect(await pushTest('ana', deps({ config: () => null, enabled: () => false }).value)).toEqual({ enabled: false, hasKeys: false, devices: [] })
    expect(await pushTest('ana', deps({ enabled: () => false }).value)).toMatchObject({ enabled: false, hasKeys: true })
  })
  it('sends to every device, gives the detail of each one and ignores the daily cap', async () => {
    const results = [{ ok: true as const }, { ok: false as const, gone: false, reason: '403: bad key' }]
    let n = 0
    const { value, log } = deps({ sentLast24h: async () => 99, subscriptions: async () => [SUB, { ...SUB, id: 's2', endpoint: 'https://push.example/def' }], send: async () => results[n++] })
    expect((await pushTest('ana', value)).devices).toEqual([{ id: 's1', ok: true }, { id: 's2', ok: false, reason: '403: bad key' }])
    expect(log.recorded.map(event => [event.kind, event.notification_type])).toEqual([['sent', 'test'], ['failed', 'test']])
  })
})
