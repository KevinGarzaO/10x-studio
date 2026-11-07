import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/session', () => ({ getToken: () => 'tok' }))
vi.mock('@/lib/web-analytics', () => ({ trackEvent: vi.fn() }))

import { enablePush, lastPushProblem } from '@/lib/push'

/** La suscripción solo se pide cuando el service worker ya está ACTIVO (si no, el navegador dice «no active Service Worker»). */
describe('enablePush', () => {
  const order: string[] = []
  const originalFetch = global.fetch

  beforeEach(() => {
    order.length = 0
    const active = { pushManager: { getSubscription: async () => null, subscribe: vi.fn(async () => { order.push('subscribe'); return { toJSON: () => ({ endpoint: 'https://push.example/abcdef', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) } }) } }) } }
    const installing = { active: null, ...active }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => undefined,
        register: async () => { order.push('register'); return installing },
        // «ready» solo se cumple cuando el worker pasó a activo
        ready: new Promise(resolve => setTimeout(() => { order.push('active'); resolve({ ...active, active: {} }) }, 20)),
      },
    })
    ;(window as any).PushManager = function () {}
    ;(globalThis as any).Notification = { permission: 'default', requestPermission: async () => 'granted' }
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith('/public-key')) return { ok: true, status: 200, json: async () => ({ key: 'BN2glxHKsFtLV7JbtXAybARvM5mef3DNJQL9BTRwB90GGwzqE7v2raG1z86uuxFUWtPHchPyRyZacO74gm_FP4g' }) }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }) as unknown as typeof fetch
  })
  afterEach(() => { global.fetch = originalFetch; delete (globalThis as any).Notification })

  it('waits for the service worker to be active before asking the browser for the subscription', async () => {
    expect(await enablePush('settings')).toBe('enabled')
    expect(order).toEqual(['register', 'active', 'subscribe'])
  })

  it('says why when the server has push off', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch
    expect(await enablePush('settings')).toBe('unavailable')
    expect(lastPushProblem).toContain('503')
  })

  it('remembers that the person closed the browser prompt without choosing (permission stays default), so it is not offered again right away', async () => {
    ;(globalThis as any).Notification = { permission: 'default', requestPermission: async () => 'default' }
    expect(await enablePush('application_answer')).toBe('denied')
    expect(localStorage.getItem('avo_push_dismissed_at')).not.toBeNull()
  })
})
