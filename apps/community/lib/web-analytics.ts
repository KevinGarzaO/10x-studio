/**
 * Analítica web propia de AvoTalent (reglas de GA4). Esto es el lado del navegador; el servidor está en
 * backend/services/web-analytics y las tablas en backend/sql/web-analytics-migration.sql.
 *
 * Qué mide:
 *   - una SESIÓN por visita (nueva tras 30 minutos sin actividad), con de dónde llegó (UTM y sitio de referencia);
 *   - el TIEMPO ACTIVO: solo corre con la pestaña visible (`visibilityState`), se pausa si la persona cambia de pestaña,
 *     minimiza o bloquea el teléfono, y se acumula entre páginas y recargas;
 *   - cada PÁGINA que ve (también al navegar dentro de la app, que no recarga);
 *   - los EVENTOS que le pidamos (`trackEvent`).
 *
 * Todo viaja al intermediario de esta misma página (`/api/a/*`), que pone la cookie `_avo_cid` y agrega la ciudad. El
 * navegador nunca ve ni manda el client_id. Nada de esto debe romper la página: cada llamada traga sus errores.
 *
 * `?notrack=1` (ver attribution.ts) apaga todo en ese navegador, para que el equipo no cuente como visitantes.
 */

import { getToken, getCachedUser } from './session'
import { isTrackingOff } from './attribution'

const COLLECT_URL = '/api/a/collect'
const IDENTIFY_URL = '/api/a/identify'

export const SESSION_KEY = 'avo_ws'
/** Una sesión termina tras este rato sin actividad (igual que GA4). */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000
/** Cada cuánto se avisa cuánto tiempo activo lleva la persona. */
export const HEARTBEAT_MS = 10 * 1000

interface StoredSession {
  id: string
  /** Última actividad (ms). */
  last: number
  /** Segundos con la pestaña visible que lleva esta sesión. */
  seconds: number
  /** A quién se unió ya esta sesión (user stitching), para no repetirlo. */
  identified: string | null
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    return parsed && typeof parsed.id === 'string' && typeof parsed.last === 'number' ? { ...parsed, seconds: typeof parsed.seconds === 'number' ? parsed.seconds : 0, identified: parsed.identified ?? null } : null
  } catch {
    return null
  }
}

function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // sin almacenamiento (ventana privada, bloqueado): la sesión vive solo en memoria
  }
}

/**
 * La sesión vigente, o una nueva si no hay o pasó más de media hora desde la última actividad.
 * `started` dice si la sesión es nueva (hay que avisar `session_start`).
 */
export function resolveSession(now: number, stored: StoredSession | null): { session: StoredSession; started: boolean } {
  if (stored && now - stored.last <= SESSION_TIMEOUT_MS) return { session: { ...stored, last: now }, started: false }
  return { session: { id: newId(), last: now, seconds: 0, identified: null }, started: true }
}

/**
 * Tiempo activo: suma solo mientras la pestaña está visible. Con reloj inyectable para poder probarlo.
 */
export class ActiveTimer {
  private accumulatedMs: number
  private since: number | null = null

  constructor(initialSeconds = 0, private readonly clock: () => number = Date.now) {
    this.accumulatedMs = Math.max(0, initialSeconds) * 1000
  }

  start(): void {
    if (this.since === null) this.since = this.clock()
  }

  pause(): void {
    if (this.since !== null) {
      this.accumulatedMs += this.clock() - this.since
      this.since = null
    }
  }

  get running(): boolean {
    return this.since !== null
  }

  seconds(): number {
    const live = this.since !== null ? this.clock() - this.since : 0
    return Math.floor((this.accumulatedMs + live) / 1000)
  }
}

/** Sitio que nos mandó, sin contar el nuestro (navegar entre páginas no es un origen). */
export function referrerHostOf(referrer: string, ownHost: string): string | null {
  try {
    const host = referrer ? new URL(referrer).hostname.toLowerCase() : ''
    return host && host !== ownHost.toLowerCase() ? host : null
  } catch {
    return null
  }
}

export function queryParamsOf(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  new URLSearchParams(search).forEach((value, key) => { out[key] = value })
  return out
}

export function utmOf(search: string) {
  const params = new URLSearchParams(search)
  const pick = (name: string) => params.get(name)?.trim() || undefined
  return { source: pick('utm_source'), medium: pick('utm_medium'), campaign: pick('utm_campaign'), term: pick('utm_term'), content: pick('utm_content') }
}

// ------------------------------------------------------------------------------------------------
// Envío. Todo va en fila: el PRIMER envío de un navegador nuevo es el que recibe la cookie, y los demás tienen que
// esperar a que vuelva; si no, saldrían con otro client_id y el servidor los descartaría.
// ------------------------------------------------------------------------------------------------
let queue: Promise<unknown> = Promise.resolve()

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const run = () =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), keepalive: true, credentials: 'same-origin' })
      .then(() => undefined)
      .catch(() => undefined)
  queue = queue.then(run, run)
  return queue as Promise<void>
}

/** Al cerrar o esconder la página no se puede esperar a nadie: sendBeacon sale aunque la página ya se esté yendo. */
function beacon(body: unknown): void {
  try {
    const data = JSON.stringify(body)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // Un texto se manda como text/plain: no necesita "preflight" y el intermediario lo lee igual.
      if (navigator.sendBeacon(COLLECT_URL, data)) return
    }
    void fetch(COLLECT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true })
  } catch {
    // medir no debe romper nada
  }
}

// ------------------------------------------------------------------------------------------------
// Estado de esta pestaña
// ------------------------------------------------------------------------------------------------
let current: StoredSession | null = null
let timer: ActiveTimer | null = null
let started = false
let lastSentSeconds = -1
/** La última página avisada: dos avisos casi juntos de la misma página son uno solo (React en desarrollo monta dos veces). */
let lastPage: { path: string; at: number } | null = null
const DUPLICATE_PAGE_MS = 1500

function enabled(): boolean {
  // En las pruebas de otras pantallas no se mide (no deben ver envíos de más); las de este módulo lo encienden.
  if (process.env.NODE_ENV === 'test' && !(globalThis as { __avoAnalyticsTest?: boolean }).__avoAnalyticsTest) return false
  return typeof window !== 'undefined' && !isTrackingOff()
}

/** Garantiza una sesión vigente y, si es nueva, avisa su inicio. `isNew` dice si esta llamada la abrió. */
async function ensureSession(path: string): Promise<{ session: StoredSession; isNew: boolean } | null> {
  if (!enabled()) return null
  const resolved = resolveSession(Date.now(), current ?? readSession())
  current = resolved.session
  writeSession(current)

  if (resolved.started || !started) {
    started = true
    lastSentSeconds = -1
    timer = new ActiveTimer(current.seconds)
    if (document.visibilityState === 'visible') timer.start()

    let brave = false
    try {
      brave = !!(await (navigator as unknown as { brave?: { isBrave: () => Promise<boolean> } }).brave?.isBrave())
    } catch {
      brave = false
    }
    const search = window.location.search
    // Si la persona sigue en la misma sesión (recarga o pestaña nueva) no se avisa otro inicio: ya existe en el servidor.
    if (resolved.started) {
      await post(COLLECT_URL, {
        type: 'session_start',
        session_id: current.id,
        entry_path: path,
        query_params: queryParamsOf(search),
        utm: utmOf(search),
        referrer_host: referrerHostOf(document.referrer, window.location.hostname),
        language: navigator.language,
        screen: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        brave,
      })
      void identifyUser()
    }
  }
  return { session: current, isNew: resolved.started }
}

function persist(): void {
  if (!current || !timer) return
  current = { ...current, last: Date.now(), seconds: timer.seconds() }
  writeSession(current)
}

/** Avisa el tiempo activo si cambió desde la última vez. */
function sendHeartbeat(viaBeacon = false): void {
  if (!enabled() || !current || !timer) return
  persist()
  const seconds = timer.seconds()
  if (seconds === lastSentSeconds) return
  lastSentSeconds = seconds
  const body = { type: 'heartbeat', session_id: current.id, seconds }
  if (viaBeacon) beacon(body)
  else void post(COLLECT_URL, body)
}

/**
 * Una página vista. La primera de la sesión ya va dentro de `session_start`; las siguientes se avisan aparte. Se llama
 * también al navegar dentro de la app (sin recargar).
 */
export async function trackPageView(path: string, search = typeof window !== 'undefined' ? window.location.search : ''): Promise<void> {
  if (!enabled()) return
  const now = Date.now()
  if (lastPage && lastPage.path === path && now - lastPage.at < DUPLICATE_PAGE_MS) return
  lastPage = { path, at: now }
  const result = await ensureSession(path)
  if (!result) return
  // Sesión recién abierta: su primera vista ya viajó en session_start. En una sesión que sigue (otra página, o una
  // recarga) cada vista se avisa aparte.
  if (result.isNew) return
  await post(COLLECT_URL, { type: 'page_view', session_id: result.session.id, path, query_params: queryParamsOf(search) })
}

/**
 * Un evento (por ejemplo `click_view_job_detail`). `isConversion` se acepta por compatibilidad con GA4, pero lo que
 * cuenta como evento clave lo decide el servidor con su propia lista: el navegador no puede inflar las conversiones.
 */
export async function trackEvent(eventName: string, params: Record<string, unknown> = {}, isConversion = false): Promise<void> {
  void isConversion
  try {
    if (!enabled()) return
    const result = await ensureSession(window.location.pathname)
    if (!result) return
    await post(COLLECT_URL, { type: 'event', session_id: result.session.id, name: eventName, params })
  } catch {
    // medir no debe romper nada
  }
}

/**
 * Le dice al servidor "este navegador ahora es esta cuenta" para unir sus visitas anónimas (user stitching). El servidor
 * toma la cuenta del token, no de lo que mandemos. Se llama al registrarse, iniciar sesión y al abrir la app con sesión.
 */
export async function identifyUser(): Promise<void> {
  try {
    const token = getToken()
    if (!enabled() || !token) return
    const userId = getCachedUser()?.id ?? token.slice(-12)
    if (current?.identified === userId) {
      await queue
      return
    }
    if (current) {
      current = { ...current, identified: userId }
      writeSession(current)
    }
    await post(IDENTIFY_URL, {}, { Authorization: `Bearer ${token}` })
  } catch {
    // medir no debe romper nada
  }
}

/**
 * Arranca la medición en esta pestaña: tiempo activo, latidos y envío final. Devuelve la función que lo apaga.
 * La primera página se avisa con `trackPageView` desde el componente que escucha las rutas.
 */
export function startWebAnalytics(): () => void {
  if (!enabled()) return () => {}

  const onVisibility = () => {
    if (!timer) return
    if (document.visibilityState === 'hidden') {
      timer.pause()
      sendHeartbeat(true)
    } else {
      // Al volver puede haber pasado más de media hora: entonces es otra sesión. (No es una página nueva: no se cuenta otra vista.)
      void ensureSession(window.location.pathname).then(() => timer?.start())
    }
  }
  const onPageHide = () => {
    timer?.pause()
    sendHeartbeat(true)
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && timer?.running) sendHeartbeat()
  }, HEARTBEAT_MS)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.clearInterval(interval)
  }
}

/** Solo para pruebas: olvida el estado de esta pestaña. */
export function resetWebAnalyticsForTests(): void {
  current = null
  timer = null
  started = false
  lastSentSeconds = -1
  lastPage = null
  queue = Promise.resolve()
}
