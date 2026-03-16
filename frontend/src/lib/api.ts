const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
if (!BACKEND_URL) {
  console.error('[API] CRITICAL: NEXT_PUBLIC_BACKEND_URL is not defined! Calls will fail or target local domain.')
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`
  console.log(`[API] Fetching: ${url} (Backend URL: ${BACKEND_URL})`)
  const res = await fetch(url, { 
    headers: { 
      'Content-Type': 'application/json' 
    }, 
    ...options 
  })
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `API error ${res.status}`)
  }
  
  return res.json() as Promise<T>
}
