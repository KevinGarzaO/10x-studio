import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

async function load(projectId: string) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', projectId)
  ;(globalThis as any).__avoClarityTest = true
  return import('@/lib/clarity')
}

let calls: unknown[][] = []

beforeEach(() => {
  localStorage.clear()
  calls = []
  ;(window as any).clarity = (...args: unknown[]) => { calls.push(args) }
})

afterEach(() => {
  vi.unstubAllEnvs()
  ;(globalThis as any).__avoClarityTest = false
  delete (window as any).clarity
})

describe('Clarity', () => {
  it('is off without a project id, and in a browser with ?notrack=1', async () => {
    let clarity = await load('')
    expect(clarity.clarityEnabled()).toBe(false)
    clarity.linkClaritySession({ userId: 'u1', sessionId: 's1', path: '/' })
    expect(calls).toEqual([])

    clarity = await load('abc123')
    expect(clarity.clarityEnabled()).toBe(true)
    localStorage.setItem('avo_no_track', '1')
    expect(clarity.clarityEnabled()).toBe(false)
  })

  it('gives Clarity our account and session ids (identify) plus filterable tags, never name or email', async () => {
    const clarity = await load('abc123')
    clarity.linkClaritySession({ userId: 'user-1', sessionId: 'session-1', path: '/vacantes/x', userKind: 'user' })

    expect(calls).toContainEqual(['identify', 'user-1', 'session-1', '/vacantes/x'])
    expect(calls).toContainEqual(['set', 'account', 'registered'])
    expect(calls).toContainEqual(['set', 'avo_session', 'session-1'])
    expect(calls).toContainEqual(['set', 'entry_path', '/vacantes/x'])
    expect(calls).toContainEqual(['set', 'user_kind', 'user'])
    expect(JSON.stringify(calls)).not.toContain('@')
  })

  it('does not identify an anonymous visit but still tags the session so its recording can be found', async () => {
    const clarity = await load('abc123')
    clarity.linkClaritySession({ userId: null, sessionId: 'session-2', path: '/' })

    expect(calls.some((call) => call[0] === 'identify')).toBe(false)
    expect(calls).toContainEqual(['set', 'account', 'anonymous'])
    expect(calls).toContainEqual(['set', 'avo_session', 'session-2'])
  })

  it('turns on by itself in production with the AvoTalent project, a variable overrides it, and an EMPTY variable turns it off', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
    expect((await import('@/lib/clarity')).CLARITY_PROJECT_ID).toBe('z6emolc22r')
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', 'otro')
    expect((await import('@/lib/clarity')).CLARITY_PROJECT_ID).toBe('otro')
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', '')
    expect((await import('@/lib/clarity')).CLARITY_PROJECT_ID).toBe('')
  })

  it('is off in development and tests when nothing is configured', async () => {
    vi.resetModules()
    delete process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
    expect((await import('@/lib/clarity')).CLARITY_PROJECT_ID).toBe('')
  })

  it('does not break the page when Clarity has not loaded (ad blocker)', async () => {
    const clarity = await load('abc123')
    delete (window as any).clarity
    expect(() => clarity.linkClaritySession({ userId: 'u', sessionId: 's', path: '/' })).not.toThrow()
  })

  it('builds the official async bootstrap with the project id safely quoted', async () => {
    const clarity = await load('abc123')
    const code = clarity.clarityBootstrap('abc"123')
    expect(code).toContain('https://www.clarity.ms/tag/')
    expect(code).toContain('"abc\\"123"')
  })
})
