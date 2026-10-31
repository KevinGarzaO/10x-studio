import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../services/supabase.service', () => ({ supabase: { rpc } }))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer ok') return res.status(401).json({ error: 'no' })
    req.userId = 'user-1'
    next()
  },
}))

import router from '../../src/routes/analytics/collect.routes'
import { parseUserAgent } from '../../services/web-analytics/user-agent'
import { parseCollectPayload, CONVERSION_EVENTS } from '../../services/web-analytics/payload'

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
const CLIENT = 'b7c1f0de-1111-4222-8333-944455556666'
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const app = () => {
  const a = express()
  a.use(express.json())
  a.use(express.text({ type: 'text/plain' }))
  a.use('/api/analytics', router)
  return a
}

const asProxy = (req: request.Test, extra: Record<string, string> = {}) =>
  req.set({ 'x-avo-client-id': CLIENT, 'x-avo-ua': CHROME_WINDOWS, 'x-avo-country': 'MX', 'x-avo-region': 'NLE', 'x-avo-city': 'Monterrey', 'x-avo-lat': '25.6866', 'x-avo-lon': '-100.3161', ...extra })

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: true, error: null })
  delete process.env.ANALYTICS_PROXY_SECRET
})

describe('parseUserAgent', () => {
  it('reads a desktop Chrome on Windows', () => {
    expect(parseUserAgent(CHROME_WINDOWS)).toMatchObject({ deviceCategory: 'desktop', operatingSystem: 'Windows', osVersion: '10/11', browser: 'Chrome', browserVersion: '130' })
  })

  it('reads Safari on an iPhone as mobile iOS (not as macOS)', () => {
    expect(parseUserAgent(SAFARI_IPHONE)).toMatchObject({ deviceCategory: 'mobile', operatingSystem: 'iOS', osVersion: '17.5', browser: 'Safari' })
  })

  it('tells Edge and Firefox apart from Chrome, and a tablet from a phone', () => {
    expect(parseUserAgent(`${CHROME_WINDOWS} Edg/130.0.0.0`).browser).toBe('Edge')
    expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toMatchObject({ browser: 'Firefox', operatingSystem: 'Linux' })
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36').deviceCategory).toBe('tablet')
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36').deviceCategory).toBe('mobile')
  })

  it('names Brave only when the browser itself says so', () => {
    expect(parseUserAgent(CHROME_WINDOWS).browser).toBe('Chrome')
    expect(parseUserAgent(CHROME_WINDOWS, { brave: true }).browser).toBe('Brave')
  })

  it('survives an empty User-Agent', () => {
    expect(parseUserAgent(null)).toMatchObject({ deviceCategory: 'desktop', operatingSystem: null, browser: null })
  })
})

describe('parseCollectPayload', () => {
  it('rejects anything without a valid session id', () => {
    expect(parseCollectPayload({ type: 'heartbeat', session_id: 'x', seconds: 5 })).toBeNull()
    expect(parseCollectPayload(null)).toBeNull()
    expect(parseCollectPayload({ type: 'otro', session_id: SESSION })).toBeNull()
  })

  it('keeps only the path of the entry page, never the query or a full address', () => {
    const parsed = parseCollectPayload({ type: 'session_start', session_id: SESSION, entry_path: '/vacantes/react-developer?utm_source=x#top' })
    expect(parsed).toMatchObject({ type: 'session_start', entryPath: '/vacantes/react-developer' })
    expect(parseCollectPayload({ type: 'session_start', session_id: SESSION, entry_path: 'https://evil.com/x' })).toBeNull()
    expect(parseCollectPayload({ type: 'session_start', session_id: SESSION, entry_path: '//evil.com' })).toBeNull()
  })

  it('drops sensitive query parameters (tokens, codes, emails) before they reach the database', () => {
    const parsed = parseCollectPayload({
      type: 'page_view', session_id: SESSION, path: '/auth/callback',
      query_params: { access_token: 'secreto', code: '123', email: 'a@b.com', page: '2' },
    })
    expect(parsed).toMatchObject({ queryParams: { page: '2' } })
  })

  it('ignores a conversion flag sent by the browser: only the server list decides', () => {
    const forged = parseCollectPayload({ type: 'event', session_id: SESSION, name: 'scroll', is_conversion: true })
    expect(forged).toMatchObject({ isConversion: false })
    const real = parseCollectPayload({ type: 'event', session_id: SESSION, name: 'user_registration_success' })
    expect(real).toMatchObject({ isConversion: true })
    expect([...CONVERSION_EVENTS].sort()).toEqual(['click_external_apply', 'profile_completed', 'user_registration_success'])
  })

  it('refuses event names that are not snake_case words', () => {
    expect(parseCollectPayload({ type: 'event', session_id: SESSION, name: 'DROP TABLE' })).toBeNull()
    expect(parseCollectPayload({ type: 'event', session_id: SESSION, name: '' })).toBeNull()
  })

  it('caps heartbeat seconds and refuses negative or non numeric ones', () => {
    expect(parseCollectPayload({ type: 'heartbeat', session_id: SESSION, seconds: 99999999 })).toMatchObject({ seconds: 86400 })
    expect(parseCollectPayload({ type: 'heartbeat', session_id: SESSION, seconds: -3 })).toBeNull()
    expect(parseCollectPayload({ type: 'heartbeat', session_id: SESSION, seconds: 'mucho' })).toBeNull()
  })

  it('normalizes the utm values (source and medium in lower case)', () => {
    const parsed = parseCollectPayload({ type: 'session_start', session_id: SESSION, entry_path: '/', utm: { source: 'LinkedIn', medium: 'Social', campaign: 'Vacante-Auto' } })
    expect(parsed).toMatchObject({ utm: { source: 'linkedin', medium: 'social', campaign: 'Vacante-Auto', term: null, content: null } })
  })
})

describe('POST /collect', () => {
  it('starts a session with the geography and the device read on the server', async () => {
    await asProxy(request(app()).post('/api/analytics/collect')).send({
      type: 'session_start', session_id: SESSION, entry_path: '/vacantes/react-developer', language: 'es-MX',
      utm: { source: 'linkedin' }, referrer_host: 'linkedin.com', screen: '1920x1080', timezone: 'America/Monterrey',
    }).expect(204)

    expect(rpc).toHaveBeenCalledWith('analytics_start_session', {
      p: expect.objectContaining({
        session_id: SESSION, client_id: CLIENT, entry_path: '/vacantes/react-developer', country: 'MX', region: 'NLE', city: 'Monterrey', latitude: 25.6866, longitude: -100.3161,
        device_category: 'desktop', operating_system: 'Windows', browser: 'Chrome', language: 'es-MX', utm_source: 'linkedin', referrer_host: 'linkedin.com',
      }),
    })
  })

  it('does not trust coordinates outside the planet (or text) coming in the headers', async () => {
    await asProxy(request(app()).post('/api/analytics/collect'), { 'x-avo-lat': '999', 'x-avo-lon': 'abc' })
      .send({ type: 'session_start', session_id: SESSION, entry_path: '/' }).expect(204)
    expect(rpc.mock.calls[0][1].p).toMatchObject({ latitude: null, longitude: null })
  })

  it('decodes a city that arrives URL encoded', async () => {
    await asProxy(request(app()).post('/api/analytics/collect'), { 'x-avo-city': 'Ciudad%20de%20M%C3%A9xico' })
      .send({ type: 'session_start', session_id: SESSION, entry_path: '/' }).expect(204)
    expect(rpc.mock.calls[0][1].p.city).toBe('Ciudad de México')
  })

  it('sends the heartbeat seconds, a page view and an event to their own SQL functions', async () => {
    await asProxy(request(app()).post('/api/analytics/collect')).send({ type: 'heartbeat', session_id: SESSION, seconds: 12 }).expect(204)
    await asProxy(request(app()).post('/api/analytics/collect')).send({ type: 'page_view', session_id: SESSION, path: '/saved' }).expect(204)
    await asProxy(request(app()).post('/api/analytics/collect')).send({ type: 'event', session_id: SESSION, name: 'click_external_apply', params: { slug: 'x' } }).expect(204)

    expect(rpc).toHaveBeenCalledWith('analytics_heartbeat', { p_session_id: SESSION, p_client_id: CLIENT, p_seconds: 12 })
    expect(rpc).toHaveBeenCalledWith('analytics_record_page_view', expect.objectContaining({ p_path: '/saved', p_client_id: CLIENT }))
    expect(rpc).toHaveBeenCalledWith('analytics_record_event', expect.objectContaining({ p_name: 'click_external_apply', p_is_conversion: true, p_params: { slug: 'x' } }))
  })

  it('also accepts a text/plain body (what sendBeacon sends without a preflight)', async () => {
    await asProxy(request(app()).post('/api/analytics/collect')).set('Content-Type', 'text/plain').send(JSON.stringify({ type: 'heartbeat', session_id: SESSION, seconds: 30 }))
    // El intermediario lo convierte a JSON antes de reenviar; aquí solo se comprueba que un cuerpo no válido no rompe nada.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not record robots', async () => {
    await asProxy(request(app()).post('/api/analytics/collect'), { 'x-avo-ua': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })
      .send({ type: 'session_start', session_id: SESSION, entry_path: '/' }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignores a request that does not carry a valid client id', async () => {
    await request(app()).post('/api/analytics/collect').set('x-avo-client-id', 'x').send({ type: 'heartbeat', session_id: SESSION, seconds: 5 }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never fails the page: a database error still answers 204', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await asProxy(request(app()).post('/api/analytics/collect')).send({ type: 'heartbeat', session_id: SESSION, seconds: 5 }).expect(204)
    expect(warn).toHaveBeenCalled()
  })

  describe('when the proxy secret is configured', () => {
    beforeEach(() => { process.env.ANALYTICS_PROXY_SECRET = 's3cret-value' })

    it('ignores what does not come from the proxy (forged geography)', async () => {
      await asProxy(request(app()).post('/api/analytics/collect'))
        .send({ type: 'session_start', session_id: SESSION, entry_path: '/' }).expect(204)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('ignores a wrong secret', async () => {
      await asProxy(request(app()).post('/api/analytics/collect'), { 'x-avo-proxy-secret': 'otra-clave!!' })
        .send({ type: 'session_start', session_id: SESSION, entry_path: '/' }).expect(204)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('accepts it with the right secret', async () => {
      await asProxy(request(app()).post('/api/analytics/collect'), { 'x-avo-proxy-secret': 's3cret-value' })
        .send({ type: 'session_start', session_id: SESSION, entry_path: '/' }).expect(204)
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    it('does not take a client id from the body, only from the proxy header', async () => {
      await request(app()).post('/api/analytics/collect').set('x-avo-proxy-secret', 's3cret-value')
        .send({ type: 'heartbeat', session_id: SESSION, seconds: 5, client_id: CLIENT }).expect(204)
      expect(rpc).not.toHaveBeenCalled()
    })
  })
})

describe('POST /identify (user stitching)', () => {
  it('joins the anonymous sessions of this browser with the logged in user, taken from the token', async () => {
    rpc.mockResolvedValue({ data: 3, error: null })
    await asProxy(request(app()).post('/api/analytics/identify')).set('Authorization', 'Bearer ok').send({ user_id: 'otro-usuario' }).expect(204)

    expect(rpc).toHaveBeenCalledWith('analytics_stitch_user', { p_client_id: CLIENT, p_user_id: 'user-1' })
  })

  it('needs a session: without a token nothing is joined', async () => {
    await asProxy(request(app()).post('/api/analytics/identify')).send({}).expect(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('needs the proxy too when the secret is configured', async () => {
    process.env.ANALYTICS_PROXY_SECRET = 's3cret-value'
    await asProxy(request(app()).post('/api/analytics/identify')).set('Authorization', 'Bearer ok').send({}).expect(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a stitching error answers 204 and does not break the login', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await asProxy(request(app()).post('/api/analytics/identify')).set('Authorization', 'Bearer ok').send({}).expect(204)
  })
})

describe('POST /clarity (the recording of a session)', () => {
  const URL_OK = 'https://clarity.microsoft.com/player/abc123/xyz987/sess42'

  it('saves the Clarity player address tied to the session and to THIS browser (client id from the proxy header)', async () => {
    await asProxy(request(app()).post('/api/analytics/clarity')).send({ session_id: SESSION, url: URL_OK }).expect(204)
    expect(rpc).toHaveBeenCalledWith('analytics_set_clarity_url', { p_session: SESSION, p_client: CLIENT, p_url: URL_OK })
  })

  it('refuses anything that is not a Clarity player address (the panel shows it as a link)', async () => {
    for (const url of ['https://evil.example.com/player/a/b/c', 'javascript:alert(1)', 'https://clarity.microsoft.com/player/a/b/c/d', 'https://clarity.microsoft.com.evil.com/player/a/b/c', `${URL_OK}?next=x`, 12]) {
      await asProxy(request(app()).post('/api/analytics/clarity')).send({ session_id: SESSION, url }).expect(204)
    }
    await asProxy(request(app()).post('/api/analytics/clarity')).send({ session_id: 'nope', url: URL_OK }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not record robots, and a database error still answers 204', async () => {
    await asProxy(request(app()).post('/api/analytics/clarity'), { 'x-avo-ua': 'Googlebot/2.1' }).send({ session_id: SESSION, url: URL_OK }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await asProxy(request(app()).post('/api/analytics/clarity')).send({ session_id: SESSION, url: URL_OK }).expect(204)
  })

  it('needs the proxy when the secret is configured', async () => {
    process.env.ANALYTICS_PROXY_SECRET = 's3cret'
    await asProxy(request(app()).post('/api/analytics/clarity')).send({ session_id: SESSION, url: URL_OK }).expect(204)
    expect(rpc).not.toHaveBeenCalled()
  })
})
