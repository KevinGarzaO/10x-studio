const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

if (typeof window !== 'undefined') {
  if (!BACKEND_URL) {
    console.warn('%c[API] WARNING: NEXT_PUBLIC_BACKEND_URL is empty. All calls will go to Vercel (and likely fail with 404).', 'color: white; background: red; padding: 4px; border-radius: 4px;')
  } else {
    console.log(`%c[API] Backend URL detected: ${BACKEND_URL}`, 'color: white; background: green; padding: 4px; border-radius: 4px;')
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`
  console.log(`[API] Fetching: ${url}`)
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
