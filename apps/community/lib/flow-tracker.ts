import { beaconTelemetry, currentSessionId, sendTelemetry } from './web-analytics'
import { startRageClickDetector } from './rage-clicks'
import { normalizeError } from './error-reporter'

/**
 * Medición de los flujos críticos: cuánto tarda cada paso, cuánto responde la app, dónde se abandona y dónde hay frustración
 * (carga lenta o rage clicks). Un "flujo" es un intento (tiene su propio id); cada paso se manda a `/api/a/flow`.
 *
 * El intento vive en sessionStorage porque algunos flujos cruzan páginas (iniciar sesión con OAuth, o postularse que lleva a
 * registrarse y regresa). Si la persona nunca lo cierra, el servidor lo cuenta como abandonado a los 30 minutos: no depende de
 * que el navegador alcance a avisar.
 *
 * Los tiempos los mide el navegador (performance.now); la frustración la decide el servidor (carga > 2500 ms, o rage clicks).
 */

export type FlowName = 'auth_login' | 'auth_register' | 'job_search_filter' | 'job_application'

const FLOW_URL = '/api/a/flow'
const STORAGE_KEY = 'avo_flows'
/** Un intento sin actividad por más de esto ya no se retoma: se abandonó. */
export const FLOW_IDLE_MS = 30 * 60 * 1000

interface Run {
  id: string
  /** Cuándo pasó el último paso (ms), para medir cuánto tardó el siguiente. */
  lastAt: number
  lastOrder: number
  rage: number
  finished: boolean
}

type Store = Partial<Record<FlowName, Run>>

function load(): Store {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

function save(store: Store): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // sin almacenamiento el intento solo vive mientras la página no se recargue
  }
}

const memory: Store = {}
const read = (): Store => ({ ...memory, ...load() })
const write = (store: Store): void => { Object.assign(memory, store); save(store) }

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

/** Cuánto tardó en cargar la página (Navigation Timing). Solo tiene sentido si la página se acaba de abrir; si no, 0. */
export function pageLoadMs(): number {
  try {
    if (performance.now() > 15_000) return 0
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const done = nav?.loadEventEnd || nav?.domContentLoadedEventEnd || nav?.responseEnd
    return done && done > 0 ? Math.round(done) : 0
  } catch {
    return 0
  }
}

/** Mide cuánto tarda algo (por ejemplo una llamada al servidor) con performance.now(). */
export async function measure<T>(run: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const started = performance.now()
  const result = await run()
  return { result, ms: Math.round(performance.now() - started) }
}

export interface FlowApi {
  /** Empieza un intento. Si ya había uno abierto: con `reuse` se sigue con él; si no, el anterior se cierra como abandonado y empieza otro. */
  startFlow(options?: { reuse?: boolean; loadTimeMs?: number }): void
  /** Un paso intermedio. `apiLoadTimeMs` es lo que tardó la app en responder en este paso. */
  trackStep(stepName: string, stepOrder: number, apiLoadTimeMs?: number): void
  /** El intento terminó con un error. */
  failFlow(stepName: string, error: unknown): void
  /** El intento terminó bien. */
  completeFlow(stepName: string, apiLoadTimeMs?: number): void
  /** ¿Hay un intento abierto? */
  isActive(): boolean
}

let stopRage: (() => void) | null = null

function activeRuns(): [FlowName, Run][] {
  const now = Date.now()
  return (Object.entries(read()) as [FlowName, Run][]).filter(([, run]) => run && !run.finished && now - run.lastAt <= FLOW_IDLE_MS)
}

/** El detector de rage clicks solo corre mientras haya algún intento abierto. */
function syncRageDetector(): void {
  const any = activeRuns().length > 0
  if (any && !stopRage) {
    stopRage = startRageClickDetector(() => {
      const store = read()
      for (const [name] of activeRuns()) {
        const run = store[name]
        if (run) store[name] = { ...run, rage: run.rage + 1 }
      }
      write(store)
    })
    window.addEventListener('pagehide', onPageHide)
  } else if (!any && stopRage) {
    stopRage()
    stopRage = null
    window.removeEventListener('pagehide', onPageHide)
  }
}

/** Al irse de la página, lo que quedó abierto se avisa como abandonado (si no alcanza, el servidor lo cuenta a los 30 minutos). */
function onPageHide(): void {
  for (const [name, run] of activeRuns()) send(name, run, { stepName: 'abandoned', order: run.lastOrder + 1, status: 'dropped_off' }, true)
}

function send(name: FlowName, run: Run, step: { stepName: string; order: number; status?: 'completed' | 'dropped_off' | 'error'; loadMs?: number; final?: boolean; error?: string }, useBeacon = false): void {
  const now = Date.now()
  const body = {
    flow_id: run.id,
    session_id: currentSessionId(),
    flow_name: name,
    step_name: step.stepName,
    step_order: step.order,
    path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    duration_ms: Math.max(0, now - run.lastAt),
    load_time_ms: step.loadMs ?? 0,
    status: step.status ?? 'completed',
    is_final: step.final ?? false,
    rage_clicks: run.rage,
    error_message: step.error,
  }
  if (useBeacon) beaconTelemetry(FLOW_URL, body)
  else void sendTelemetry(FLOW_URL, body)
}

const apis = new Map<FlowName, FlowApi>()

/** El rastreador de un flujo. Es el mismo objeto cada vez, así que se puede llamar desde cualquier parte (eventos, efectos, hooks). */
export function flowFor(name: FlowName): FlowApi {
  const existing = apis.get(name)
  if (existing) return existing

  const current = (): Run | null => {
    const run = read()[name]
    return run && !run.finished && Date.now() - run.lastAt <= FLOW_IDLE_MS ? run : null
  }
  const advance = (run: Run, order: number, finished = false): void => {
    write({ ...read(), [name]: { ...run, lastAt: Date.now(), lastOrder: order, rage: 0, finished } })
    syncRageDetector()
  }

  const api: FlowApi = {
    startFlow(options = {}) {
      try {
        if (typeof window === 'undefined') return
        const open = current()
        if (open && options.reuse) return
        if (open) send(name, open, { stepName: 'abandoned', order: open.lastOrder + 1, status: 'dropped_off' })
        const run: Run = { id: newId(), lastAt: Date.now(), lastOrder: 0, rage: 0, finished: false }
        send(name, run, { stepName: 'start', order: 0, loadMs: options.loadTimeMs })
        advance(run, 0)
      } catch {
        // medir no debe romper nada
      }
    },
    trackStep(stepName, stepOrder, apiLoadTimeMs) {
      try {
        const run = current()
        if (!run) return
        send(name, run, { stepName, order: stepOrder, loadMs: apiLoadTimeMs })
        advance(run, stepOrder)
      } catch {
        // medir no debe romper nada
      }
    },
    failFlow(stepName, error) {
      try {
        const run = current()
        if (!run) return
        send(name, run, { stepName, order: run.lastOrder + 1, status: 'error', error: normalizeError(error).message })
        advance(run, run.lastOrder + 1, true)
      } catch {
        // medir no debe romper nada
      }
    },
    completeFlow(stepName, apiLoadTimeMs) {
      try {
        const run = current()
        if (!run) return
        send(name, run, { stepName, order: run.lastOrder + 1, loadMs: apiLoadTimeMs, final: true })
        advance(run, run.lastOrder + 1, true)
      } catch {
        // medir no debe romper nada
      }
    },
    isActive: () => current() !== null,
  }
  apis.set(name, api)
  return api
}

/** Solo para pruebas. */
export function resetFlowTrackerForTests(): void {
  for (const key of Object.keys(memory)) delete memory[key as FlowName]
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // nada
  }
  stopRage?.()
  stopRage = null
}
