const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`
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
