/**
 * El acceso al panel: inicio de sesión con la misma cuenta de AvoTalent (la de la comunidad).
 * Solo entra quien además es superadmin; el backend lo verifica en cada petición, esto solo
 * guarda la sesión en el navegador y la renueva.
 */

const TOKEN_KEY = 'avo_admin_token'
const REFRESH_KEY = 'avo_admin_refresh'

const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/api\/?$/, '').replace(/\/+$/, '')

export function backendBase(): string {
  return BACKEND
}

export function getToken(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  } catch {
    return null
  }
}

export function saveSession(accessToken: string, refreshToken: string | null): void {
  try {
    localStorage.setItem(TOKEN_KEY, accessToken)
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  } catch {
    // sin almacenamiento no se puede mantener la sesión
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // nada que borrar
  }
}

/** Pide un token nuevo con el de renovación. Devuelve si lo logró. */
export async function refreshSession(): Promise<boolean> {
  let refreshToken: string | null = null
  try {
    refreshToken = localStorage.getItem(REFRESH_KEY)
  } catch {
    return false
  }
  if (!refreshToken || !BACKEND) return false

  try {
    const res = await fetch(`${BACKEND}/api/community/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (!data.session?.access_token) return false
    saveSession(data.session.access_token, data.session.refresh_token ?? refreshToken)
    return true
  } catch {
    return false
  }
}

export type LoginResult = { ok: true } | { ok: false; error: string }

/** Inicia sesión y comprueba que la cuenta tenga permiso para el panel. */
export async function login(email: string, password: string): Promise<LoginResult> {
  if (!BACKEND) return { ok: false, error: 'Falta configurar la dirección del servidor (NEXT_PUBLIC_BACKEND_URL).' }

  let res: Response
  try {
    res = await fetch(`${BACKEND}/api/community/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor. Intenta de nuevo.' }
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.session?.access_token) {
    return { ok: false, error: data.error || 'Correo o contraseña incorrectos.' }
  }

  saveSession(data.session.access_token, data.session.refresh_token ?? null)

  // Tener cuenta no basta: hay que ser superadmin.
  const check = await fetch(`${BACKEND}/api/admin/analytics/me`, { headers: { Authorization: `Bearer ${data.session.access_token}` } }).catch(() => null)
  if (!check || !check.ok) {
    clearSession()
    return { ok: false, error: check?.status === 403 ? 'Esta cuenta no tiene permiso para entrar al panel.' : 'No se pudo verificar tu permiso. Intenta de nuevo.' }
  }

  return { ok: true }
}
