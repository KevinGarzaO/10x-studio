import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readAttribution, getAttribution, captureAttribution, isTrackingOff, trackVacancyEvent } from '@/lib/attribution'

const url = (search: string) => `https://avotalent.com/vacantes/x${search}`

describe('readAttribution', () => {
  it('reads the UTM values of the link', () => {
    expect(readAttribution('?utm_source=linkedin&utm_medium=social&utm_campaign=vacante-auto&utm_content=mi-vacante', '', 'avotalent.com', '/vacantes/mi-vacante')).toEqual({
      source: 'linkedin',
      medium: 'social',
      campaign: 'vacante-auto',
      content: 'mi-vacante',
      referrer: null,
      landingPath: '/vacantes/mi-vacante',
    })
  })

  it('uses the site the visit came from when there are no UTM', () => {
    expect(readAttribution('', 'https://www.google.com/search?q=x', 'avotalent.com', '/')?.referrer).toBe('www.google.com')
  })

  it('does not count moving between our own pages as an origin', () => {
    expect(readAttribution('', 'https://avotalent.com/saved', 'avotalent.com', '/')).toBeNull()
  })

  it('is null for a direct visit', () => {
    expect(readAttribution('', '', 'avotalent.com', '/')).toBeNull()
    expect(readAttribution('?foo=bar', '', 'avotalent.com', '/')).toBeNull()
  })
})

describe('captureAttribution / getAttribution', () => {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))

  function visit(search: string, referrer = '') {
    window.history.pushState({}, '', url(search).replace('https://avotalent.com', ''))
    Object.defineProperty(document, 'referrer', { value: referrer, configurable: true })
    captureAttribution()
  }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('keeps the origin for the signup', () => {
    visit('?utm_source=linkedin&utm_medium=social')
    expect(getAttribution()).toMatchObject({ source: 'linkedin', medium: 'social' })
  })

  it('attributes signup to the latest tracked post', () => {
    visit('?utm_source=linkedin&utm_content=post-1')
    visit('?utm_source=linkedin&utm_content=post-2')
    expect(getAttribution()?.content).toBe('post-2')
  })

  it('a direct visit later does not erase the origin', () => {
    visit('?utm_source=linkedin')
    sessionStorage.clear()
    visit('')
    expect(getAttribution()?.source).toBe('linkedin')
  })

  it('forgets an origin older than 30 days', () => {
    visit('?utm_source=linkedin')
    expect(getAttribution(Date.now() + 31 * 86400000)).toBeNull()
    expect(localStorage.getItem('avo_attribution')).toBeNull()
  })

  it('tells the backend about the visit once per session, with a visitor id and no personal data', () => {
    visit('?utm_source=linkedin')
    visit('?utm_source=linkedin')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(endpoint).toContain('/api/community/attribution/visit')
    const sent = JSON.parse(init.body)
    expect(sent.visitorId).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(sent.source).toBe('linkedin')
    expect(Object.keys(sent).sort()).toEqual(['campaign', 'content', 'landingPath', 'medium', 'referrer', 'source', 'visitorId'])
  })

  it('records distinct tracked posts visited in the same browser session', () => {
    visit('?utm_source=linkedin&utm_content=post-1')
    visit('?utm_source=linkedin&utm_content=post-2')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).content).toBe('post-1')
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body).content).toBe('post-2')
  })

  it('reports a direct visit too, so the visitors count is complete', () => {
    visit('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).source).toBeUndefined()
  })

  it('still works when the browser blocks storage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => visit('?utm_source=linkedin')).not.toThrow()
    expect(getAttribution()).toBeNull()
    getItem.mockRestore()
    setItem.mockRestore()
  })
})

describe('the team opts out of the measurements', () => {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
  const open = (search: string) => {
    window.history.pushState({}, '', `/${search}`)
    Object.defineProperty(document, 'referrer', { value: '', configurable: true })
    captureAttribution()
  }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('?notrack=1 stops counting that browser, from that very visit', () => {
    open('?notrack=1')

    expect(isTrackingOff()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays off on later visits and for vacancy views', () => {
    open('?notrack=1')
    sessionStorage.clear()
    open('')
    trackVacancyEvent('backend-1', 'view')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('?notrack=0 turns it back on', () => {
    open('?notrack=1')
    open('?notrack=0')

    expect(isTrackingOff()).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('counts a normal visitor', () => {
    open('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
