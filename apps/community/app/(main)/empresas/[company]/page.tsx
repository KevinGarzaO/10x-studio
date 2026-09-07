'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, BriefcaseBusiness, CalendarDays, Globe2, Share2, Users } from 'lucide-react'
import { CompanyAvatar, PostCard, type FeedPost } from '../../../../components/community-hub'
import { useShell } from '../../../../lib/shell-context'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface CompanyProfile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  photo_url: string | null
  website: string | null
  created_at: string
  community_posts?: (FeedPost & { votes_count: number; comments_count: number })[]
}

export default function CompanyProfilePage() {
  const { company } = useParams<{ company: string }>()
  const router = useRouter()
  const { requestAuth } = useShell()

  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    // Companies are real `users` rows now (username = the /empresas/:slug),
    // so this reuses the same profile endpoint as candidate profiles — their
    // job posts come back already linked via author_id.
    fetch(`${API_URL}/api/community/users/${company}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setProfile(d.user))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [company])

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
          <p style={{ color: '#8b949e', marginBottom: 12 }}>Empresa no encontrada</p>
          <button onClick={() => router.back()} style={{ color: '#00A86B', background: 'none', border: 0, cursor: 'pointer' }}>Volver al feed</button>
        </div>
      </div>
    )
  }

  const companyName = profile.display_name || profile.username
  const jobs = profile.community_posts || []
  const joined = new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="public-profile-wrap">
      <button onClick={() => router.back()} className="back-link"><ArrowLeft size={15} /> Volver al feed</button>
      <section className="public-profile-cover"><div className="cover-grid" /><div className="profile-cover-mark">&gt;_</div></section>
      <section className="public-profile-card public-profile-main">
        <div className="public-profile-head">
          <div className="public-profile-avatar-wrap">
            <CompanyAvatar company={companyName} logoUrl={profile.photo_url} size={104} />
          </div>
          <div className="public-profile-title">
            <p className="page-kicker">Perfil de empresa</p>
            <h1>{companyName}</h1>
            <p className="muted">@{profile.username}</p>
          </div>
          <div className="profile-actions">
            <button className="outline-btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 size={14} /> Compartir</button>
            <button className="primary-btn"><Users size={14} /> Seguir</button>
          </div>
        </div>
        {profile.bio && <p className="public-profile-bio">{profile.bio}</p>}
        <div className="profile-details">
          {profile.website && <span><Globe2 size={14} /> {profile.website}</span>}
          <span><CalendarDays size={14} /> En AvoTalent desde {joined}</span>
        </div>
        <div className="public-profile-stats">
          <div><strong>{jobs.length}</strong><span>vacantes</span></div>
          <div><strong>{jobs.reduce((sum, p) => sum + (p.votes_count || 0), 0)}</strong><span>votos recibidos</span></div>
          <div><strong>{jobs.reduce((sum, p) => sum + (p.comments_count || 0), 0)}</strong><span>comentarios</span></div>
        </div>
      </section>

      <section className="public-profile-card profile-activity">
        <div className="activity-heading">
          <div><p className="page-kicker">Vacantes</p><h2>Oportunidades en {companyName}</h2></div>
          <BriefcaseBusiness size={20} />
        </div>
        {jobs.length > 0 ? (
          <div className="post-list" style={{ marginTop: 16 }}>
            {jobs.map(job => <PostCard key={job.id} post={job} onAuthRequired={requestAuth} activeTab="Vacantes & Freelance" />)}
          </div>
        ) : (
          <p className="muted" style={{ padding: '20px 0' }}>No hay vacantes activas de esta empresa por ahora.</p>
        )}
      </section>
    </div>
  )
}
