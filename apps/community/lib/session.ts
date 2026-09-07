const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface Session {
  access_token: string
  refresh_token: string
}

export function saveSession(session: Session, user: unknown) {
  localStorage.setItem('avocado_token', session.access_token)
  localStorage.setItem('avocado_refresh_token', session.refresh_token)
  localStorage.setItem('avocado_user', JSON.stringify(user))
}

// Supabase's own confirmation link redirects the browser to
// `emailRedirectTo` (here, `/onboarding`) with the fresh session appended as
// a URL hash fragment (`#access_token=...&refresh_token=...&type=signup`) —
// that's server-side redirect logic we don't control, so the page it lands
// on has to pick the tokens up itself. Returns true if a session was found
// and saved, and strips the fragment from the address bar either way.
export function captureSessionFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!hash) return false

  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')

  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  if (!access_token || !refresh_token) return false
  saveSession({ access_token, refresh_token }, null)
  return true
}

export function clearSession() {
  localStorage.removeItem('avocado_token')
  localStorage.removeItem('avocado_refresh_token')
  localStorage.removeItem('avocado_user')
}

export function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('avocado_token') : null
}

// Last known user, read synchronously so pages can render as "logged in"
// immediately instead of flashing a logged-out state while fetchCurrentUser
// confirms the session over the network (worse now that an expired token
// costs an extra round-trip to refresh). fetchCurrentUser() below is still
// the source of truth and will correct this if the session turned out to be
// invalid.
export function getCachedUser(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('avocado_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function refreshSession(): Promise<string | null> {
  const refresh_token = localStorage.getItem('avocado_refresh_token')
  if (!refresh_token) return null

  try {
    const res = await fetch(`${API_URL}/api/community/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.session?.access_token) return null
    saveSession(data.session, data.user)
    return data.session.access_token
  } catch {
    return null
  }
}

// The access token from Supabase expires after ~1h. Without this, any page
// open longer than that shows the "locked" state even though the user is
// still logged in, because /auth/me starts returning 401.
export async function fetchCurrentUser(): Promise<any | null> {
  let token = getToken()
  if (!token) return null

  let res = await fetch(`${API_URL}/api/community/auth/me`, { headers: { Authorization: `Bearer ${token}` } })

  if (res.status === 401) {
    token = await refreshSession()
    if (!token) {
      clearSession()
      return null
    }
    res = await fetch(`${API_URL}/api/community/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  }

  if (!res.ok) return null
  const data = await res.json()
  return data.user || null
}
