import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHmac } from 'crypto'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { cleanLink, parseEvent, recordEvent, verifySignature, type WebhookDeps } from '../../services/email/resend-webhook'
import resendRoutes from '../../src/routes/webhooks/resend.routes'

const SECRET_BYTES = Buffer.from('una-llave-de-prueba-de-32-bytes!!')
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`
const sign = (id: string, timestamp: string, body: string) => `v1,${createHmac('sha256', SECRET_BYTES).update(`${id}.${timestamp}.${body}`).digest('base64')}`
const NOW = 1_800_000_000

const clickBody = (over: Record<string, unknown> = {}) => JSON.stringify({
  type: 'email.clicked', created_at: '2026-11-07T15:00:00.000Z',
  data: { email_id: 'em_1', to: ['Ana@Example.com'], click: { link: 'https://avotalent.app/vacantes/dev?utm_content=abc123&token=secreto#x', timestamp: '2026-11-07T15:00:01.000Z', ipAddress: '1.2.3.4', userAgent: 'Mozilla' }, ...over },
})

describe('verifySignature', () => {
  it('accepts a body signed with the secret and refuses a changed body, a wrong secret or an old timestamp', () => {
    const body = clickBody()
    const headers = { id: 'msg_1', timestamp: String(NOW), signature: sign('msg_1', String(NOW), body) }
    expect(verifySignature(body, headers, SECRET, NOW)).toBe(true)
    expect(verifySignature(body + ' ', headers, SECRET, NOW)).toBe(false)
    expect(verifySignature(body, headers, `whsec_${Buffer.from('otra-llave-otra-llave-otra-llave!').toString('base64')}`, NOW)).toBe(false)
    expect(verifySignature(body, headers, SECRET, NOW + 600)).toBe(false) // pasaron más de 5 minutos
    expect(verifySignature(body, { ...headers, signature: undefined }, SECRET, NOW)).toBe(false)
  })

  it('accepts any of several signatures (Resend sends two while a secret is rotated)', () => {
    const body = '{}'
    const good = sign('m', String(NOW), body)
    expect(verifySignature(body, { id: 'm', timestamp: String(NOW), signature: `v1,AAAA ${good}` }, SECRET, NOW)).toBe(true)
  })
})

describe('parseEvent', () => {
  it('keeps the click address without parameters or fragment, and never keeps the recipient, ip or browser in the event it stores', () => {
    const event = parseEvent(JSON.parse(clickBody()), 'msg_1')!
    expect(event).toMatchObject({ type: 'clicked', emailId: 'em_1', link: 'https://avotalent.app/vacantes/dev', recipient: 'ana@example.com' })
    expect(JSON.stringify(event)).not.toMatch(/1\.2\.3\.4|Mozilla|secreto|utm_content/)
  })

  it('reads the bounce type, and ignores event types we do not use', () => {
    expect(parseEvent({ type: 'email.bounced', data: { email_id: 'e', to: ['a@b.c'], bounce: { type: 'Permanent' } } }, 'm')).toMatchObject({ type: 'bounced', bounceType: 'Permanent' })
    expect(parseEvent({ type: 'email.scheduled', data: {} }, 'm')).toBeNull()
    expect(parseEvent('nada', 'm')).toBeNull()
  })

  it('cleanLink rejects things that are not addresses', () => {
    expect(cleanLink('no es una dirección')).toBeNull()
    expect(cleanLink(undefined)).toBeNull()
  })
})

function fakeDeps(over: Partial<WebhookDeps> = {}) {
  const inserted: Record<string, unknown>[] = []
  const calls = { suppressed: [] as string[], optedOut: [] as string[] }
  const seen = new Set<string>()
  const deps: WebhookDeps = {
    findSend: async (id) => (id === 'em_send' ? { user_id: 'u1', kind: 'perfil-pendiente-1' } : null),
    findInvitation: async (id) => (id === 'em_inv' ? { invitation_id: 'i1' } : null),
    findUserByEmail: async (email) => (email === 'ana@example.com' ? 'u2' : null),
    insert: async (row) => { const id = String(row.svix_id); if (seen.has(id)) return { duplicate: true }; seen.add(id); inserted.push(row); return { duplicate: false } },
    suppressInvitation: async (id) => { calls.suppressed.push(id) },
    optOutUser: async (id) => { calls.optedOut.push(id) },
    ...over,
  }
  return { deps, inserted, calls }
}

describe('recordEvent', () => {
  it('ties a click to the person through the email we sent, and never stores the address of the person', async () => {
    const { deps, inserted } = fakeDeps()
    await recordEvent(parseEvent(JSON.parse(clickBody({ email_id: 'em_send' })), 'msg_1')!, deps)
    expect(inserted[0]).toMatchObject({ event_type: 'clicked', user_id: 'u1', kind: 'perfil-pendiente-1', link: 'https://avotalent.app/vacantes/dev' })
    expect(JSON.stringify(inserted[0])).not.toContain('example.com')
  })

  it('falls back to the recipient to find the person for emails that are not in the send tables', async () => {
    const { deps, inserted } = fakeDeps()
    await recordEvent(parseEvent(JSON.parse(clickBody()), 'msg_2')!, deps)
    expect(inserted[0]).toMatchObject({ user_id: 'u2' })
  })

  it('a retried notice is never counted twice', async () => {
    const { deps, inserted } = fakeDeps()
    const event = parseEvent(JSON.parse(clickBody()), 'msg_3')!
    expect((await recordEvent(event, deps)).status).toBe('stored')
    expect((await recordEvent(event, deps)).status).toBe('duplicate')
    expect(inserted).toHaveLength(1)
  })

  it('a bounce or a complaint on an invitation takes that person out of the list', async () => {
    const { deps, calls } = fakeDeps()
    await recordEvent(parseEvent({ type: 'email.bounced', data: { email_id: 'em_inv', to: ['x@y.z'] } }, 'm1')!, deps)
    await recordEvent(parseEvent({ type: 'email.complained', data: { email_id: 'em_inv', to: ['x@y.z'] } }, 'm2')!, deps)
    expect(calls.suppressed).toEqual(['i1', 'i1'])
    expect(calls.optedOut).toEqual([])
  })

  it('a complaint from an account turns its emails off, but a bounce or an open does not', async () => {
    const { deps, calls } = fakeDeps()
    await recordEvent(parseEvent({ type: 'email.bounced', data: { email_id: 'em_send', to: ['a@b.c'] } }, 'b1')!, deps)
    await recordEvent(parseEvent({ type: 'email.opened', data: { email_id: 'em_send', to: ['a@b.c'] } }, 'o1')!, deps)
    expect(calls.optedOut).toEqual([])
    await recordEvent(parseEvent({ type: 'email.complained', data: { email_id: 'em_send', to: ['a@b.c'] } }, 'c1')!, deps)
    expect(calls.optedOut).toEqual(['u1'])
  })
})

describe('POST /api/webhooks/resend', () => {
  const previous = process.env.RESEND_WEBHOOK_SECRET
  beforeEach(() => { process.env.RESEND_WEBHOOK_SECRET = SECRET })
  afterEach(() => { if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = previous })

  const app = () => {
    const server = express()
    server.use('/api/webhooks/resend', express.raw({ type: 'application/json', limit: '1mb' }), resendRoutes)
    return server
  }
  const now = () => String(Math.floor(Date.now() / 1000))

  it('does nothing without the secret', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    await request(app()).post('/api/webhooks/resend').set('content-type', 'application/json').send('{}').expect(503)
  })

  it('refuses a notice with a bad signature', async () => {
    const body = clickBody()
    await request(app()).post('/api/webhooks/resend').set('content-type', 'application/json').set('svix-id', 'm').set('svix-timestamp', now()).set('svix-signature', 'v1,AAAA').send(body).expect(400)
  })

  it('answers 200 to a signed notice of a type we do not use, so Resend does not retry it', async () => {
    const body = JSON.stringify({ type: 'email.scheduled', data: {} })
    const ts = now()
    const res = await request(app()).post('/api/webhooks/resend').set('content-type', 'application/json').set('svix-id', 'm9').set('svix-timestamp', ts).set('svix-signature', sign('m9', ts, body)).send(body).expect(200)
    expect(res.body).toEqual({ status: 'ignored' })
  })
})
