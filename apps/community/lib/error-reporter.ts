import { currentSessionId, sendTelemetry } from './web-analytics'

/**
 * Telemetría de errores del navegador: excepciones, promesas sin atrapar, fallos al dibujar la pantalla (error boundaries) y
 * llamadas al servidor que fallan. Todo va a `/api/a/error` (el intermediario de la analítica) y de ahí al backend, que
 * limpia lo personal, calcula la huella del error y guarda la cuenta de la SESIÓN (no la que diga el navegador).
 *
 * Nada de aquí debe poder romper la página: todo está dentro de try/catch y los errores del propio reporte se ignoran.
 */

const ERROR_URL = '/api/a/error'

/** Tope por carga de página: un error dentro de un ciclo no debe saturar la red ni la base. */
export const MAX_REPORTS_PER_PAGE = 10
/** El mismo error otra vez dentro de este rato no se vuelve a mandar. */
export const DUPLICATE_WINDOW_MS = 10_000

/** Ruido que no es nuestro o que no se puede arreglar: extensiones del navegador, errores de otros dominios sin detalle... */
const IGNORED = [
  /^Script error\.?$/i,
  /ResizeObserver loop/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /^Non-Error promise rejection captured/i,
  /AbortError|The user aborted a request|signal is aborted/i,
  /Load failed$|Failed to fetch$|NetworkError when attempting to fetch resource/i,
]

export interface ErrorShape {
  name: string
  message: string
  stack: string | null
}

/** Convierte lo que se haya lanzado (un Error, un texto, un objeto...) en algo que se puede reportar. */
export function normalizeError(value: unknown): ErrorShape {
  if (value instanceof Error) return { name: value.name || 'Error', message: value.message || String(value), stack: value.stack ?? null }
  if (value && typeof value === 'object') {
    const item = value as { name?: unknown; message?: unknown; stack?: unknown }
    return {
      name: typeof item.name === 'string' && item.name ? item.name : 'Error',
      message: typeof item.message === 'string' && item.message ? item.message : safeJson(value),
      stack: typeof item.stack === 'string' ? item.stack : null,
    }
  }
  return { name: 'Error', message: typeof value === 'string' && value ? value : String(value), stack: null }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 300)
  } catch {
    return 'Error sin detalle'
  }
}

export function isIgnored(error: ErrorShape): boolean {
  const text = `${error.message}\n${error.stack ?? ''}`
  return IGNORED.some(pattern => pattern.test(error.message) || (pattern.source.includes('extension') && pattern.test(text)))
}

let reported = 0
const recent = new Map<string, number>()

function enabled(): boolean {
  if (process.env.NODE_ENV === 'test' && !(globalThis as { __avoAnalyticsTest?: boolean }).__avoAnalyticsTest) return false
  return typeof window !== 'undefined'
}

/**
 * Reporta un error. `context` son datos cortos y útiles (el paso del flujo, el id de la vacante...): el servidor descarta lo que
 * parezca un secreto. `source` es "frontend" (por defecto) o "api" (una llamada al servidor que falló).
 */
export function reportError(error: unknown, context: Record<string, string | number | boolean> = {}, source: 'frontend' | 'api' = 'frontend'): void {
  try {
    if (!enabled()) return
    const shape = normalizeError(error)
    if (isIgnored(shape)) return

    const now = Date.now()
    const key = `${shape.name}|${shape.message}|${(shape.stack ?? '').split('\n')[1] ?? ''}|${window.location.pathname}`
    if ((recent.get(key) ?? 0) > now - DUPLICATE_WINDOW_MS) return
    if (reported >= MAX_REPORTS_PER_PAGE) return
    recent.set(key, now)
    reported += 1

    void sendTelemetry(ERROR_URL, {
      name: shape.name,
      message: shape.message,
      stack: shape.stack,
      path: window.location.pathname,
      session_id: currentSessionId(),
      source,
      context,
    })
  } catch {
    // reportar un error no debe causar otro
  }
}

/** Una llamada al servidor que respondió con error (5xx) o no llegó: se reporta como error de tipo "api". */
export function reportApiError(input: { method?: string; url: string; status?: number; message?: string }): void {
  let path = input.url
  try {
    path = new URL(input.url, window.location.origin).pathname
  } catch {
    // se usa tal cual
  }
  const error = new Error(input.message ?? `HTTP ${input.status ?? 'sin respuesta'} ${input.method ?? 'GET'} ${path}`)
  error.name = 'ApiError'
  reportError(error, { endpoint: path, ...(input.status ? { status: input.status } : {}) }, 'api')
}

/** Escucha los errores que nadie atrapó: `error` (excepciones síncronas) y `unhandledrejection` (promesas). Devuelve cómo quitarlos. */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined') return () => {}

  const onError = (event: ErrorEvent) => {
    // Un recurso que no cargó (imagen, script) dispara "error" sin objeto de error: no es una excepción nuestra.
    if (!event.error && !event.message) return
    reportError(event.error ?? { name: 'Error', message: event.message }, event.filename ? { file: event.filename.split('?')[0].slice(-120), line: event.lineno, col: event.colno } : {})
  }
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, { unhandledRejection: true })

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
let fetchMonitorOn = false
let originalFetch: typeof fetch | null = null

/** ¿Es una llamada a NUESTRO servidor (no a la telemetría del propio sitio ni a un tercero)? */
function isOurApi(input: unknown): string | null {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url?: string } | null)?.url
  if (!url || url.startsWith('/api/a/')) return null
  return url.startsWith(`${API_BASE}/api/`) ? url : null
}

/**
 * Vigila TODAS las llamadas al servidor de AvoTalent y reporta las que fallan: respuestas 5xx y llamadas que no llegan (salvo que la
 * persona no tenga internet o la propia pantalla las cancele). Antes solo se veían los errores que alguien lanzaba a propósito; muchas
 * pantallas atrapan el fallo y siguen como si nada ("fetch(...).catch(() => {})"), y de ese fallo nadie se enteraba. No cambia lo que
 * recibe quien llamó: devuelve la misma respuesta y vuelve a lanzar el mismo error. Devuelve cómo quitarlo.
 */
export function installFetchMonitor(): () => void {
  if (typeof window === 'undefined' || fetchMonitorOn) return () => {}
  fetchMonitorOn = true
  const original = window.fetch
  originalFetch = original

  const monitored = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = isOurApi(input)
    try {
      const response = await original.call(window, input, init)
      if (url && response.status >= 500) reportApiError({ method: init?.method ?? (input as Request)?.method ?? 'GET', url, status: response.status })
      return response
    } catch (error) {
      const aborted = (error as { name?: string } | null)?.name === 'AbortError'
      if (url && !aborted && navigator.onLine !== false) reportApiError({ method: init?.method ?? 'GET', url, message: 'El servidor no respondió' })
      throw error
    }
  }
  window.fetch = monitored as typeof fetch

  return () => {
    if (window.fetch === (monitored as typeof fetch)) window.fetch = original
    fetchMonitorOn = false
    originalFetch = null
  }
}

/** Solo para pruebas. */
export function resetErrorReporterForTests(): void {
  reported = 0
  recent.clear()
  if (originalFetch && typeof window !== 'undefined') window.fetch = originalFetch
  fetchMonitorOn = false
  originalFetch = null
}
