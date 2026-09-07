'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BriefcaseBusiness, CalendarDays, GitBranch, Globe2, Home, MapPin, Pencil, ShieldCheck, Share2, Sparkles, Users } from 'lucide-react'
import { PostCard, type FeedPost } from './community-hub'
import { SENIORITY_LABELS } from '../lib/profile-options'

export interface PublicProfile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  photo_url: string | null
  website: string | null
  github_url: string | null
  created_at: string
  title?: string | null
  seniority?: string | null
  skills?: string[] | null
  location?: string | null
  work_modality?: string | null
  community_posts?: (FeedPost & { votes_count: number; comments_count: number })[]
}

// Shared by /users/[username] (viewing someone else) and /profile (viewing
// yourself) so the two never show different information for the same
// underlying `users` row.
export function PublicProfileView({ profile, isOwnProfile, onAuthRequired }: { profile: PublicProfile; isOwnProfile: boolean; onAuthRequired?: () => void }) {
  const router = useRouter()

  const name = profile.display_name || profile.username
  const initials = name.slice(0, 2).toUpperCase()
  const joined = new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const posts = profile.community_posts || []
  const isStaff = profile.username === 'avocado-studio' || profile.username === 'avotalent'
  const seniorityLabel = profile.seniority ? SENIORITY_LABELS[profile.seniority] || profile.seniority : null

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
            <p className="muted">@{profile.username}{profile.title ? ` · ${profile.title}` : ''}</p>
          </div>
          <div className="profile-actions">
            {isOwnProfile ? (
              <Link className="primary-btn" href="/settings"><Pencil size={14} /> Editar perfil</Link>
            ) : (
              <>
                <button className="outline-btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 size={14} /> Compartir</button>
                <button className="primary-btn" onClick={onAuthRequired}><Users size={14} /> Seguir</button>
              </>
            )}
          </div>
        </div>
        {profile.bio && <p className="public-profile-bio">{profile.bio}</p>}

        {(seniorityLabel || (profile.skills && profile.skills.length > 0)) && (
          <div className="profile-facts">
            {seniorityLabel && <span className="profile-fact"><BriefcaseBusiness size={12} /> {seniorityLabel}</span>}
            {profile.skills?.map(skill => <span className="profile-fact" key={skill}>{skill}</span>)}
          </div>
        )}

        <div className="profile-details">
          {profile.location && <span><MapPin size={14} /> {profile.location}</span>}
          {profile.work_modality && <span><Home size={14} /> {profile.work_modality}</span>}
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
        {posts.length > 0 ? (
          <div className="post-list" style={{ marginTop: 16 }}>
            {posts.map(post => <PostCard key={post.id} post={post} onAuthRequired={onAuthRequired} />)}
          </div>
        ) : (
          <p className="muted" style={{ padding: '20px 0' }}>{isOwnProfile ? 'Todavía no has publicado nada.' : 'Este miembro todavía no ha publicado nada.'}</p>
        )}
      </section>
    </div>
  )
}
