import { describe, it, expect, vi } from 'vitest'
import { installApiKey, needsApiKey } from '../lib/api-key'

const API = 'https://api.example.test'
const KEY = 'k'.repeat(32)

function fakeTarget() {
  const calls: Array<{ url: string; headers: Headers }> = []
  const target = {
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      calls.push({ url, headers: new Headers(init?.headers as HeadersInit | undefined ?? (input as Request).headers) })
      return new Response('ok')
    }) as unknown as typeof fetch,
  }
  return { target, calls }
}

describe('needsApiKey', () => {
  it('is true for our API paths and false for public images, other hosts and nothing', () => {
    expect(needsApiKey(`${API}/api/community/flags`, API)).toBe(true)
    expect(needsApiKey(`${API}/api/files/avatars/a.png`, API)).toBe(false)
    expect(needsApiKey('https://otro.example/api/x', API)).toBe(false)
    expect(needsApiKey(null, API)).toBe(false)
  })
})

describe('installApiKey', () => {
  it('does nothing without a key (production)', async () => {
    const { target, calls } = fakeTarget()
    const original = target.fetch
    const remove = installApiKey(target, API, '')
    expect(target.fetch).toBe(original)
    await target.fetch(`${API}/api/community/flags`)
    expect(calls[0].headers.get('x-api-key')).toBeNull()
    remove()
  })

  it('puts the key on every call to our API and on nothing else', async () => {
    const { target, calls } = fakeTarget()
    installApiKey(target, API, KEY)
    await target.fetch(`${API}/api/community/flags`)
    await target.fetch(`${API}/api/files/avatars/a.png`)
    await target.fetch('https://tercero.example/api/x')
    await target.fetch('/api/a/collect')
    expect(calls.map((call) => call.headers.get('x-api-key'))).toEqual([KEY, null, null, null])
  })

  it('keeps the caller headers (the session token) and does not overwrite a key the caller already set', async () => {
    const { target, calls } = fakeTarget()
    installApiKey(target, API, KEY)
    await target.fetch(`${API}/api/community/me`, { headers: { Authorization: 'Bearer t' } })
    await target.fetch(`${API}/api/community/me`, { headers: { 'x-api-key': 'propia' } })
    expect(calls[0].headers.get('Authorization')).toBe('Bearer t')
    expect(calls[0].headers.get('x-api-key')).toBe(KEY)
    expect(calls[1].headers.get('x-api-key')).toBe('propia')
  })

  it('handles a ready-made Request and restores fetch when removed', async () => {
    const { target, calls } = fakeTarget()
    const original = target.fetch
    const remove = installApiKey(target, API, KEY)
    await target.fetch(new Request(`${API}/api/community/stats`))
    expect(calls[0].headers.get('x-api-key')).toBe(KEY)
    remove()
    expect(target.fetch).toBe(original)
  })
})
