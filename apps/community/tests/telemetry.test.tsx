import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/session', () => ({
  getToken: vi.fn(() => null as string | null),
  getCachedUser: vi.fn(() => null as { id?: string } | null),
}))

import { normalizeError, isIgnored, reportError, reportApiError, installGlobalErrorHandlers, resetErrorReporterForTests, MAX_REPORTS_PER_PAGE } from '@/lib/error-reporter'
import { rageCount, startRageClickDetector } from '@/lib/rage-clicks'
import { flowFor, resetFlowTrackerForTests, measure, FLOW_IDLE_MS } from '@/lib/flow-tracker'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'
import { NO_TRACK_KEY } from '@/lib/attribution'
import { GlobalErrorBoundary } from '@/components/global-error-boundary'

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
type Sent = { url: string; body: any }
let sent: Sent[] = []
const errors = () => sent.filter(item => item.url === '/api/a/error').map(item => item.body)
const steps = () => sent.filter(item => item.url === '/api/a/flow').map(item => item.body)
/** Los envíos van en fila (promesas): hay que dejar que corran antes de mirar lo enviado. */
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests()
  resetErrorReporterForTests()
  resetFlowTrackerForTests()
  sent = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return { ok: true, status: 204 }
  }) as unknown as typeof fetch
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined })
  window.history.replaceState(null, '', '/vacantes/react')
})

afterEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = false
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('error reporter', () => {
  it('normalizes whatever was thrown', async () => {
    expect(normalizeError(new TypeError('x'))).toMatchObject({ name: 'TypeError', message: 'x' })
    expect(normalizeError('texto')).toEqual({ name: 'Error', message: 'texto', stack: null })
    expect(normalizeError({ message: 'obj' })).toMatchObject({ name: 'Error', message: 'obj' })
    expect(normalizeError({ a: 1 }).message).toBe('{"a":1}')
    expect(normalizeError(undefined).message).toBe('undefined')
  })

  it('ignores noise that is not ours (cross-origin "Script error.", extensions, aborted requests, ResizeObserver)', async () => {
    expect(isIgnored({ name: 'Error', message: 'Script error.', stack: null })).toBe(true)
    expect(isIgnored({ name: 'Error', message: 'ResizeObserver loop completed with undelivered notifications.', stack: null })).toBe(true)
    expect(isIgnored({ name: 'AbortError', message: 'The user aborted a request.', stack: null })).toBe(true)
    expect(isIgnored({ name: 'Error', message: 'x', stack: 'at f (chrome-extension://abc/content.js:1:1)' })).toBe(true)
    expect(isIgnored({ name: 'TypeError', message: "Cannot read properties of undefined (reading 'title')", stack: 'at f (https://avotalent.app/app.js:1:1)' })).toBe(false)
  })

  it('sends name, message, stack, path and the analytics session id', async () => {
    const error = new TypeError('boom')
    reportError(error, { step: 'submit' })
    await flush()
    expect(errors()).toEqual([{ name: 'TypeError', message: 'boom', stack: error.stack, path: '/vacantes/react', session_id: SESSION, source: 'frontend', context: { step: 'submit' } }])
  })

  it('does not send the same error twice in a row, and caps the reports per page load', async () => {
    const same = new Error('igual')
    reportError(same)
    reportError(same)
    await flush()
    expect(errors()).toHaveLength(1)
    for (let i = 0; i < 30; i++) reportError(new Error(`distinto ${i}`))
    await flush()
    expect(errors()).toHaveLength(MAX_REPORTS_PER_PAGE)
  })

  it('is off in a browser with ?notrack=1', async () => {
    localStorage.setItem(NO_TRACK_KEY, '1')
    reportError(new Error('x'))
    await flush()
    expect(errors()).toHaveLength(0)
  })

  it('reports a failing API call as an "api" error with only the path', async () => {
    reportApiError({ method: 'POST', url: 'https://api.avotalent.app/api/community/posts?token=abc', status: 502 })
    await flush()
    const [body] = errors()
    expect(body).toMatchObject({ name: 'ApiError', source: 'api', message: 'HTTP 502 POST /api/community/posts', context: { endpoint: '/api/community/posts', status: 502 } })
  })

  it('catches window errors and unhandled promise rejections, and stops listening when removed', async () => {
    const stop = installGlobalErrorHandlers()
    window.dispatchEvent(new ErrorEvent('error', { error: new RangeError('desde window'), message: 'desde window', filename: 'https://avotalent.app/a.js?v=1', lineno: 3, colno: 9 }))
    const rejection = new Event('unhandledrejection') as any
    rejection.reason = new Error('promesa sin atrapar')
    window.dispatchEvent(rejection)
    window.dispatchEvent(new ErrorEvent('error', { message: '' })) // un recurso que no cargó: sin error ni mensaje
    await flush()
    expect(errors().map(body => body.message)).toEqual(['desde window', 'promesa sin atrapar'])
    await flush()
    expect(errors()[0].context).toEqual({ file: 'https://avotalent.app/a.js', line: 3, col: 9 })
    await flush()
    expect(errors()[1].context).toEqual({ unhandledRejection: true })
    stop()
    const swallow = (event: Event) => event.preventDefault() // para que el navegador de pruebas no lo cuente como error suelto
    window.addEventListener('error', swallow)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('ya no'), message: 'ya no', cancelable: true }))
    window.removeEventListener('error', swallow)
    await flush()
    expect(errors()).toHaveLength(2)
  })
})

describe('GlobalErrorBoundary', () => {
  it('reports the render error with where it happened, shows a notice instead of a blank page, and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let explode = true
    function Bomb() {
      if (explode) throw new Error('falló al dibujar')
      return <p>todo bien</p>
    }
    render(<GlobalErrorBoundary area="prueba"><Bomb /></GlobalErrorBoundary>)

    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal')
    await flush()
    const [body] = errors()
    expect(body.message).toBe('falló al dibujar')
    expect(body.context.boundary).toBe('prueba')
    expect(body.context.components).toContain('Bomb')

    explode = false
    fireEvent.click(screen.getByText('Reintentar'))
    expect(screen.getByText('todo bien')).toBeTruthy()
  })
})

describe('rage clicks', () => {
  it('3 clicks within a second and 30px are a rage click; slow or far apart are not', async () => {
    const at = (t: number, x = 100, y = 100) => ({ at: t, x, y })
    expect(rageCount([at(0), at(200)], at(400))).toBe(3)
    expect(rageCount([at(0), at(200)], at(1500))).toBe(0)
    expect(rageCount([at(0), at(200)], at(400, 300, 300))).toBe(0)
    expect(rageCount([at(0)], at(100))).toBe(0)
  })

  it('the detector fires once per burst', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
    const onRage = vi.fn()
    const stop = startRageClickDetector(onRage)
    const click = () => fireEvent.click(document.body, { clientX: 50, clientY: 50 })
    click(); vi.advanceTimersByTime(100)
    click(); vi.advanceTimersByTime(100)
    click(); vi.advanceTimersByTime(100)
    click()
    expect(onRage).toHaveBeenCalledTimes(1)
    stop()
    vi.advanceTimersByTime(2000)
    click(); click(); click()
    expect(onRage).toHaveBeenCalledTimes(1)
  })
})

describe('flow tracker', () => {
  it('walks a flow: start, steps with the time between them and the API load time, and a final step', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
    const flow = flowFor('auth_login')
    flow.startFlow({ loadTimeMs: 420 })
    vi.advanceTimersByTime(3000)
    flow.trackStep('submit', 1, 800)
    vi.advanceTimersByTime(500)
    flow.completeFlow('success')

    await flush()
    const sentSteps = steps()
    expect(sentSteps.map(step => [step.step_name, step.step_order, step.duration_ms, step.load_time_ms, step.status, step.is_final])).toEqual([
      ['start', 0, 0, 420, 'completed', false],
      ['submit', 1, 3000, 800, 'completed', false],
      ['success', 2, 500, 0, 'completed', true],
    ])
    expect(new Set(sentSteps.map(step => step.flow_id)).size).toBe(1)
    expect(sentSteps.every(step => step.flow_name === 'auth_login' && step.session_id === SESSION)).toBe(true)
    expect(flow.isActive()).toBe(false)
  })

  it('a failed flow is closed with an error step and its message', async () => {
    const flow = flowFor('auth_register')
    flow.startFlow()
    flow.failFlow('submit', new Error('HTTP 500'))
    await flush()
    expect(steps().map(step => [step.step_name, step.status, step.error_message])).toEqual([['start', 'completed', undefined], ['submit', 'error', 'HTTP 500']])
    flow.trackStep('after', 5)
    await flush()
    expect(steps()).toHaveLength(2) // ya cerrado: nada más se manda
  })

  it('starting again closes the previous attempt as abandoned and opens a new one; reuse keeps the open one', async () => {
    const flow = flowFor('job_application')
    flow.startFlow()
    flow.startFlow({ reuse: true })
    await flush()
    expect(steps()).toHaveLength(1)
    flow.startFlow()
    await flush()
    expect(steps().map(step => [step.step_name, step.status])).toEqual([['start', 'completed'], ['abandoned', 'dropped_off'], ['start', 'completed']])
    await flush()
    const ids = steps().map(step => step.flow_id)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
  })

  it('an attempt idle for more than 30 minutes is not resumed (the server counts it as abandoned)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
    const flow = flowFor('auth_login')
    flow.startFlow()
    vi.advanceTimersByTime(FLOW_IDLE_MS + 1000)
    expect(flow.isActive()).toBe(false)
    flow.trackStep('submit', 1)
    await flush()
    expect(steps()).toHaveLength(1)
  })

  it('counts rage clicks that happen during the flow and sends them with the next step', async () => {
    const flow = flowFor('job_search_filter')
    flow.startFlow()
    for (let i = 0; i < 3; i++) fireEvent.click(document.body, { clientX: 10, clientY: 10 })
    flow.trackStep('results', 1, 90)
    await flush()
    expect(steps().map(step => step.rage_clicks)).toEqual([0, 1])
    flow.completeFlow('open_result')
    await flush()
    expect(steps()[2].rage_clicks).toBe(0)
  })

  it('leaving the page marks an open attempt as dropped off (sendBeacon)', async () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
    const flow = flowFor('auth_login')
    flow.startFlow()
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).toHaveBeenCalledTimes(1)
    const [url, data] = beacon.mock.calls[0] as unknown as [string, string]
    expect(url).toBe('/api/a/flow')
    expect(JSON.parse(data)).toMatchObject({ flow_name: 'auth_login', step_name: 'abandoned', status: 'dropped_off' })
  })

  it('survives a page change: the attempt is kept in sessionStorage', async () => {
    flowFor('auth_login').startFlow()
    const stored = JSON.parse(sessionStorage.getItem('avo_flows') ?? '{}')
    expect(stored.auth_login).toMatchObject({ finished: false })
  })

  it('measure() times an async call with performance.now()', async () => {
    const { result, ms } = await measure(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return 'ok' })
    expect(result).toBe('ok')
    expect(ms).toBeGreaterThanOrEqual(15)
  })

  it('does nothing in a browser with ?notrack=1', async () => {
    localStorage.setItem(NO_TRACK_KEY, '1')
    flowFor('auth_login').startFlow()
    await flush()
    expect(steps()).toHaveLength(0)
  })
})
