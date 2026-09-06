'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, CalendarDays, GitBranch, Globe2, MessageCircle, ShieldCheck, Share2, Sparkles, Users, BriefcaseBusiness, ArrowBigUp } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface CommunityPost {
  id: string
  title: string
  type: 'editorial' | 'job' | 'showcase' | 'discussion'
  slug?: string | null
  created_at: string
  votes_count: number
  comments_count: number
}

interface UserProfile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  photo_url: string | null
  website: string | null
  github_url: string | null
  created_at: string
  community_posts?: CommunityPost[]
}

function formatTime(dateStr: string) {
  if (!dateStr) return 'reciente'
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'hace minutos'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function postHref(post: CommunityPost) {
  return post.type === 'job' ? `/vacantes/${post.slug || post.id}` : `/post/${post.id}`
}

const typeLabel: Record<string, string> = { editorial: 'ARTÍCULO', job: 'VACANTE', showcase: 'PROYECTO', discussion: 'POST' }

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
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
          <button onClick={() => router.back()} style={{ color: "#3b82f6", background: "none", border: 0, cursor: "pointer" }}>Volver al feed</button>
        </div>
      </div>
    )
  }

  const name = profile.display_name || profile.username
  const initials = name.slice(0, 2).toUpperCase()
  const joined = new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const posts = profile.community_posts || []
  const isStaff = profile.username === 'avocado-studio' || profile.username === 'avotalent'

  return (
    <div className="public-profile-wrap">
      <button onClick={() => router.back()} className="back-link"><ArrowLeft size={15} /> Volver al feed</button>
      <section className="public-profile-cover"><div className="cover-grid" /><div className="profile-cover-mark">&gt;_</div></section>
      <section className="public-profile-card public-profile-main">
        <div className="public-profile-head">
          <div className="public-profile-avatar-wrap">
            {profile.photo_url ? <img className="public-profile-avatar" src={profile.photo_url} alt={`Foto de perfil de ${name}`} /> : <div className="public-profile-avatar avatar-emerald">{initials}</div>}
          </div>
          <div className="public-profile-title">
            <p className="page-kicker">Perfil público</p>
            <h1>{name} {isStaff && <ShieldCheck size={18} className="verified" />}</h1>
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
          {profile.github_url && <span><GitBranch size={14} /> {profile.github_url}</span>}
          <span><CalendarDays size={14} /> En AvoTalent desde {joined}</span>
        </div>
        <div className="public-profile-stats">
          <div><strong>{posts.length}</strong><span>publicaciones</span></div>
          <div><strong>{posts.reduce((sum, p) => sum + (p.votes_count || 0), 0)}</strong><span>votos recibidos</span></div>
          <div><strong>{posts.reduce((sum, p) => sum + (p.comments_count || 0), 0)}</strong><span>comentarios</span></div>
        </div>
      </section>

      <section className="public-profile-card profile-activity">
        <div className="activity-heading">
          <div><p className="page-kicker">Actividad</p><h2>Publicaciones de {name}</h2></div>
          <Sparkles size={20} />
        </div>
        {posts.length > 0 ? posts.map(post => (
          <Link href={postHref(post)} className="profile-post" key={post.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="profile-post-icon">{post.type === 'job' ? <BriefcaseBusiness size={16} /> : <Sparkles size={16} />}</div>
            <div>
              <span className="post-meta">{typeLabel[post.type] || 'POST'} · {formatTime(post.created_at)}</span>
              <h3>{post.title}</h3>
              <div className="profile-post-footer">
                <span><ArrowBigUp size={13} /> {post.votes_count || 0}</span>
                <span><MessageCircle size={13} /> {post.comments_count || 0} comentarios</span>
              </div>
            </div>
          </Link>
        )) : (
          <p className="muted" style={{ padding: '20px 0' }}>Este miembro todavía no ha publicado nada.</p>
        )}
      </section>
    </div>
  )
}
