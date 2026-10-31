import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_COOKIE, CLIENT_COOKIE_MAX_AGE, forwardToBackend } from '@/lib/analytics-proxy'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/**
 * El enlace a la grabación de Clarity de una sesión. Reenvía al backend y pone la cookie `_avo_cid`.
 * Acepta JSON o `text/plain` (lo que manda `navigator.sendBeacon` sin necesitar "preflight").
 */
export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 })
  try {
    const body = await request.text()
    if (body && body.length <= 8000) {
      const result = await forwardToBackend({
        path: 'clarity',
        body,
        headers: request.headers,
        existingClientId: request.cookies.get(CLIENT_COOKIE)?.value ?? null,
        backendUrl: BACKEND_URL,
        secret: process.env.ANALYTICS_PROXY_SECRET,
      })
      if (result.setClientId) {
        response.cookies.set(CLIENT_COOKIE, result.setClientId, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: CLIENT_COOKIE_MAX_AGE,
        })
      }
    }
  } catch {
    // medir no debe romper nada
  }
  return response
}
