import { getToken } from './session'
import { trackEvent } from './web-analytics'

/**
 * Avisos push (cliente). La persona los activa en este navegador: se registra el service worker (`/sw.js`), se pide el permiso del
 * navegador, se crea la suscripción con la llave pública del servidor y se guarda en el backend. Nada de aquí rompe la pantalla si falla.
 *
 * El permiso se pide en un momento útil (después de contestar «¿Ya te postulaste?» o desde Ajustes), nunca al entrar: un «Bloquear» no se
 * puede deshacer desde la página. En iPhone solo existe si la app está agregada a la pantalla de inicio (iOS 16.4+): sin eso `Notification`
 * no existe y simplemente no se ofrece.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const DISMISSED_KEY = 'avo_push_dismissed_at'
const DISMISS_DAYS = 14

export type PushSurface = 'application_answer' | 'settings'
export type PushStatus = 'unsupported' | 'denied' | 'granted' | 'default'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
}

export function pushPermission(): PushStatus {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushStatus
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = getToken()
  try {
    return await fetch(`${API_URL}/api/community/push${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    })
  } catch {
    return null
  }
}

/** El último motivo por el que activar no funcionó (para mostrarlo en Ajustes y poder diagnosticar sin abrir la consola). */
export let lastPushProblem = ''
const problem = (text: string) => { lastPushProblem = text }

/** La llave pública del servidor, o null si los push no están encendidos (503 not_ready). */
async function fetchPublicKey(): Promise<string | null> {
  const res = await call('/public-key')
  if (!res?.ok) { problem(`llave pública: ${res ? res.status : 'sin conexión'}`); return null }
  const data = await res.json().catch(() => null)
  return typeof data?.key === 'string' ? data.key : null
}

function keyToBytes(key: string): Uint8Array {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

/**
 * El service worker registrado y YA ACTIVO. Registrarlo no basta: si se pide la suscripción mientras todavía se instala, el navegador
 * contesta «no active Service Worker». `serviceWorker.ready` espera a que esté activo (con un tope de 10 s para no quedarse colgado).
 */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const found = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register(`/sw.js?api=${encodeURIComponent(API_URL)}`, { scope: '/' }))
    if (found.active) return found
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000)),
    ])
    return ready ?? null
  } catch {
    return null
  }
}

/** ¿Este dispositivo ya está activo? (la suscripción del navegador existe y el servidor la tiene activa). */
export async function isPushActive(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return false
    const res = await call(`/status?endpoint=${encodeURIComponent(sub.endpoint)}`)
    const data = res?.ok ? await res.json().catch(() => null) : null
    return !!data?.active
  } catch {
    return false
  }
}

/** ¿Vale la pena ofrecerlo ahora? Soportado, sin decidir todavía, sin haber dicho «ahora no» en los últimos días. */
export function shouldOfferPush(now: number = Date.now()): boolean {
  if (pushPermission() !== 'default') return false
  try {
    const dismissed = Number(localStorage.getItem(DISMISSED_KEY) ?? '0')
    return !(dismissed > 0 && now - dismissed < DISMISS_DAYS * 86_400_000)
  } catch {
    return true
  }
}

export function rememberPushDismissed(): void {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch { /* sin almacenamiento: se vuelve a ofrecer */ }
}

/** Lo que pasa alrededor de la invitación (se mostró, no quiso, el navegador negó): para medirla. */
export async function recordPushEvent(kind: 'prompt_shown' | 'prompt_dismissed' | 'permission_denied', surface: PushSurface): Promise<void> {
  void trackEvent(`push_${kind}`, { surface })
  await call('/event', { method: 'POST', body: JSON.stringify({ kind, surface }) })
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'unavailable'

/** Pide el permiso y deja este dispositivo suscrito. 'unavailable' = el servidor aún no tiene los push encendidos o falló algo. */
export async function enablePush(surface: PushSurface): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  const key = await fetchPublicKey()
  if (!key) return 'unavailable'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    void recordPushEvent('permission_denied', surface)
    return 'denied'
  }
  const reg = await registration()
  if (!reg) { problem('no se pudo registrar el service worker'); return 'unavailable' }
  try {
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) as unknown as BufferSource }))
    const res = await call('/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), surface }) })
    if (!res?.ok) { problem(`guardar el dispositivo: ${res ? res.status : 'sin conexión'}`); return 'unavailable' }
    void trackEvent('push_enabled', { surface })
    return 'enabled'
  } catch (error) {
    problem(`suscripción del navegador: ${error instanceof Error ? error.message.slice(0, 120) : 'error'}`)
    return 'unavailable'
  }
}

/** Apaga los avisos de este dispositivo. */
export async function disablePush(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return true
    await call('/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) })
    await sub.unsubscribe()
    void trackEvent('push_disabled', {})
    return true
  } catch {
    return false
  }
}
