import { getToken } from './session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface AppNotification {
  id: string
  type: 'comment' | 'match' | 'skill' | string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export interface EmailPrefs {
  digest: boolean
  alerts: boolean
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = getToken()
  if (!token) return null
  try {
    return await fetch(`${API_URL}/api/community/notifications${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
  } catch {
    return null
  }
}

export async function fetchNotifications(): Promise<{ notifications: AppNotification[]; unread: number } | null> {
  const res = await call('')
  return res?.ok ? res.json() : null
}

/** Cuántos avisos sin leer tiene. Si algo falla, 0: la campana simplemente no muestra el puntito. */
export async function fetchUnreadCount(): Promise<number> {
  const res = await call('/unread-count')
  if (!res?.ok) return 0
  const data = await res.json()
  return typeof data.unread === 'number' ? data.unread : 0
}

export async function markNotificationRead(id: string): Promise<void> {
  await call(`/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const res = await call('/read-all', { method: 'POST' })
  return !!res?.ok
}

export async function fetchEmailPrefs(): Promise<EmailPrefs | null> {
  const res = await call('/preferences')
  return res?.ok ? (await res.json()).preferences : null
}

export async function saveEmailPrefs(patch: Partial<EmailPrefs>): Promise<EmailPrefs | null> {
  const res = await call('/preferences', { method: 'PUT', body: JSON.stringify(patch) })
  return res?.ok ? (await res.json()).preferences : null
}

/** "hace 5 min", "hace 3 h", "hace 2 días". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}
