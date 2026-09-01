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
  
  const res = await fetch(url, { 
    headers: { 
      'Content-Type': 'application/json' 
    }, 
    ...options 
  })
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `API error ${res.status} at ${url}`)
  }
  
  return res.json() as Promise<T>
}
