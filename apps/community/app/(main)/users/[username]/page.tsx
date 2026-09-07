'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { PublicProfileView, type PublicProfile } from '../../../../components/public-profile-view'
import { useShell } from '../../../../lib/shell-context'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()
  const { requestAuth, user: sessionUser } = useShell()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`${API_URL}/api/community/users/${username}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setProfile(d.user))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [username])

  if (loading) {
    return (
      <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <p style={{ color: '#8b949e' }}>Cargando perfil...</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#8b949e', marginBottom: 12 }}>Usuario no encontrado</p>
          <button onClick={() => router.back()} style={{ color: '#00A86B', background: 'none', border: 0, cursor: 'pointer' }}>Volver al feed</button>
        </div>
      </div>
    )
  }

  return <PublicProfileView profile={profile} isOwnProfile={sessionUser?.username === profile.username} onAuthRequired={requestAuth} />
}
