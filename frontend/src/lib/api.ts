const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BACKEND_URL) {
    const errorMsg = '[API] FATAL: NEXT_PUBLIC_BACKEND_URL is not set. Cannot reach Railway backend.'
    console.error(`%c${errorMsg}`, 'color: white; background: red; font-size: 16px; padding: 10px;')
    throw new Error(errorMsg)
  }

  // Normalize path to prevent double /api if BACKEND_URL already has it
  const cleanPath = path.startsWith('/api') && BACKEND_URL.endsWith('/api') 
    ? path.slice(4) 
    : path

  const url = path.startsWith('http') ? path : `${BACKEND_URL}${cleanPath}`
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
