import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_COOKIE, forwardToBackend } from '@/lib/analytics-proxy'

export const dynamic = 'force-dynamic'

// La analítica puede vivir en su propio servicio (api-telemetry): ANALYTICS_API_URL (solo servidor). Sin ella, la misma API de siempre.
const BACKEND_URL = process.env.ANALYTICS_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/**
 * "Este navegador ahora es esta cuenta" (user stitching). Reenvía al backend con el token de sesión y el client_id de la
 * cookie; es el backend quien verifica la sesión y une las visitas anónimas con la cuenta.
 */
export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 })
  try {
    const clientId = request.cookies.get(CLIENT_COOKIE)?.value ?? null
    // Sin cookie no hay visitas anónimas que unir: no se hace nada.
    if (clientId && request.headers.get('authorization')) {
      await forwardToBackend({
        path: 'identify',
        body: '{}',
        headers: request.headers,
        existingClientId: clientId,
        backendUrl: BACKEND_URL,
        secret: process.env.ANALYTICS_PROXY_SECRET,
      })
    }
  } catch {
    // medir no debe romper nada
  }
  return response
}
