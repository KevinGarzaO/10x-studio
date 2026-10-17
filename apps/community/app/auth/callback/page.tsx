'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { captureSessionFromUrl, getToken } from '@/lib/session'
import { getAttribution } from '@/lib/attribution'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Destino después de OAuth. Los tokens llegan en el hash de la URL (flujo
// implícito de Supabase), se guardan y luego se crea la fila en `users` (que
// solo el registro por email crea). Quien ya tiene perfil completo va al feed;
// el resto continúa al onboarding.
export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    async function finish() {
      const captured = captureSessionFromUrl()
      const token = getToken()

      if (!captured || !token) {
        setError('No pudimos completar el inicio de sesión. Intenta de nuevo.')
        return
      }

      try {
        const attr = getAttribution()
        const res = await fetch(`${API_URL}/api/community/auth/sync-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            signupSource: attr.source || null,
            signupMedium: attr.medium || null,
            signupCampaign: attr.campaign || null,
            signupContent: attr.content || null,
            signupReferrer: attr.referrer || null,
            signupLandingPath: attr.landingPath || null,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || 'No pudimos crear tu cuenta. Intenta de nuevo.')
          return
        }

        const data = await res.json()
        localStorage.setItem('avocado_user', JSON.stringify(data.user))
        router.replace(data.user?.profile_completed ? '/' : '/onboarding')
        router.refresh()
      } catch {
        setError('Error de conexión. Intenta de nuevo.')
      }
    }

    finish()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#18161a', display: 'grid', placeItems: 'center', color: '#f3efe9' }}>
      <div style={{ textAlign: 'center' }}>
        {error ? (
          <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#00A86B' }} />
            <p style={{ marginTop: 12, color: '#b3aba1', fontSize: 13 }}>Completando tu registro...</p>
          </>
        )}
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}
