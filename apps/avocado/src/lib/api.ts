import { getToken, refreshSession, clearSession } from './admin-auth'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BACKEND_URL) {
    const errorMsg = '[API] FATAL: NEXT_PUBLIC_BACKEND_URL is not set. Cannot reach Railway backend.'
    console.error(`%c${errorMsg}`, 'color: white; background: red; font-size: 16px; padding: 10px;')
    throw new Error(errorMsg)
  }

  // Normalize BACKEND_URL and path to prevent duplication or double slashes
  const cleanBase = BACKEND_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  
  // If we are calling an internal api route, make sure we use /api unless it's a full URL
  const finalPath = (cleanPath.startsWith('/api') || path.startsWith('http')) 
    ? cleanPath 
    : `/api${cleanPath}`

  const url = path.startsWith('http') ? path : `${cleanBase}${finalPath}`
  console.log(`%c[API] Request: ${url}`, 'color: #0b57d0; font-weight: bold;')
  
  // Todas las rutas del Studio y del panel piden sesión de superadmin.
  const send = () => fetch(url, {
    ...options,
    // Los encabezados de quien llama se suman a la sesión, no la reemplazan.
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...((options?.headers as Record<string, string> | undefined) ?? {}),
    },
  })

  let res = await send()

  // Sesión vencida: se renueva una vez y se reintenta; si no se puede, a iniciar sesión.
  if (res.status === 401 && (await refreshSession())) res = await send()
  if (res.status === 401) {
    clearSession()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.href = '/login'
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `API error ${res.status} at ${url}`)
  }

  return res.json() as Promise<T>
}
