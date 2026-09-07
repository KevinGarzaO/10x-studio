'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { PublicProfileView, type PublicProfile } from '../../../components/public-profile-view'
import { useShell } from '../../../lib/shell-context'
import { fetchCurrentUser } from '../../../lib/session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function OwnProfilePage() {
  const router = useRouter()
  const { requestAuth } = useShell()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetchCurrentUser()
      .then(sessionUser => {
        if (!sessionUser) { router.replace('/login'); return }
        return fetch(`${API_URL}/api/community/users/${sessionUser.username}`)
          .then(r => { if (!r.ok) throw new Error(); return r.json() })
          .then(d => setProfile(d.user))
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <p style={{ color: '#8b949e' }}>Cargando perfil...</p>
      </div>
    )
  }

  if (error || !profile) return null

  return <PublicProfileView profile={profile} isOwnProfile onAuthRequired={requestAuth} />
}
