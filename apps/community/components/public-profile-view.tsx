'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, CalendarDays, GitBranch, Globe2, Home, MapPin, Pencil, ShieldCheck, Share2 } from 'lucide-react'
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
  /** Niveles validados por examen (feature 002). Solo skills validados. */
  skillLevels?: { skillName: string; level: string; achievedAt: string }[] | null
  community_posts?: (FeedPost & { votes_count: number; comments_count: number })[]
}

const SKILL_LEVEL_LABEL: Record<string, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

// Shared by /users/[username] (viewing someone else) and /profile (viewing
// yourself) so the two never show different information for the same
// underlying `users` row.
export function PublicProfileView({ profile, isOwnProfile, onAuthRequired }: { profile: PublicProfile; isOwnProfile: boolean; onAuthRequired?: () => void }) {
  const router = useRouter()
  const [photoFailed, setPhotoFailed] = useState(false)

  const name = profile.display_name || profile.username
  const initials = name.slice(0, 2).toUpperCase()
  const joined = new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const posts = profile.community_posts || []
  const isStaff = profile.username === 'avocado-studio' || profile.username === 'avotalent'
  const seniorityLabel = profile.seniority ? SENIORITY_LABELS[profile.seniority] || profile.seniority : null

  // El bucle parte de profile.skills (los declarados) y cruza contra
  // skillLevels, no al revés: un nivel de un skill que el candidato ya retiró
  // de su perfil no debe pintarse.
  const declaredSkills = profile.skills || []
  const validated = declaredSkills
    .map(skill => ({ skill, level: profile.skillLevels?.find(l => l.skillName === skill)?.level }))
    .filter((entry): entry is { skill: string; level: string } => !!entry.level)
  const plainSkills = declaredSkills.filter(skill => !validated.some(v => v.skill === skill))

  return (
    <div className="profile-page">
      <button onClick={() => router.back()} className="detail-back"><ArrowLeft size={15} /> Volver al feed</button>

      <div className="profile-cover" />

      <div className="profile-head">
        {profile.photo_url && !photoFailed
          ? <img className="profile-avatar" src={profile.photo_url} alt={`Foto de perfil de ${name}`} onError={() => setPhotoFailed(true)} />
          : <div className="profile-avatar is-initials">{initials}</div>}

        <div className="profile-title">
          <h1>{name} {isStaff && <ShieldCheck size={18} className="verified" />}</h1>
          <p>@{profile.username}{profile.title ? ` · ${profile.title}` : ''}</p>
        </div>

        <div className="profile-head-actions">
          {isOwnProfile ? (
            <Link className="profile-action is-primary" href="/settings"><Pencil size={14} /> Editar perfil</Link>
          ) : (
            <>
              <button
                type="button"
                className="profile-action"
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
              >
                <Share2 size={14} /> Compartir
              </button>
              {/* Seguir y mensajería todavía no existen en el backend: se
                  muestran como en el diseño, pero apagadas y diciendo por qué,
                  en vez de fingir que hacen algo. */}
              <button type="button" className="profile-action" disabled title="La mensajería todavía no está disponible">
                Mensaje
              </button>
              <button type="button" className="profile-action is-primary" disabled title="Seguir a alguien todavía no está disponible">
                Seguir
              </button>
            </>
          )}
        </div>
      </div>

      {profile.bio && <p className="profile-bio">{profile.bio}</p>}

      {validated.length > 0 && (
        <section className="profile-validated">
          <h2>
            <BadgeCheck size={15} /> Skills validados por examen
          </h2>
          <div className="profile-validated-list">
            {validated.map(({ skill, level }) => (
              <span key={skill} className={`skill-badge is-${level}`}>
                <BadgeCheck size={13} />
                <strong>{skill}</strong>
                <em>{SKILL_LEVEL_LABEL[level] ?? level}</em>
              </span>
            ))}
          </div>
        </section>
      )}

      {plainSkills.length > 0 && (
        <div className="profile-skills">
          {validated.length > 0 && <p className="profile-skills-label">Otros skills declarados</p>}
          <div className="profile-skills-list">
            {plainSkills.map(skill => <span key={skill} className="skill-chip-plain">{skill}</span>)}
          </div>
        </div>
      )}

      <div className="profile-details">
        {seniorityLabel && <span><BriefcaseBusiness size={14} /> {seniorityLabel}</span>}
        {profile.location && <span><MapPin size={14} /> {profile.location}</span>}
        {profile.work_modality && <span><Home size={14} /> {profile.work_modality}</span>}
        {profile.website && <span><Globe2 size={14} /> {profile.website}</span>}
        {profile.github_url && <span><GitBranch size={14} /> {profile.github_url}</span>}
        <span><CalendarDays size={14} /> En AvoTalent desde {joined}</span>
      </div>

      <div className="profile-stats">
        <div><strong>{posts.length}</strong><span>publicaciones</span></div>
        <div><strong>{posts.reduce((sum, p) => sum + (p.votes_count || 0), 0)}</strong><span>votos recibidos</span></div>
        <div><strong>{posts.reduce((sum, p) => sum + (p.comments_count || 0), 0)}</strong><span>comentarios</span></div>
      </div>

      <section className="profile-activity">
        <h2>Publicaciones de {name}</h2>
        {posts.length > 0 ? (
          <div className="post-list">
            {posts.map(post => <PostCard key={post.id} post={post} onAuthRequired={onAuthRequired} />)}
          </div>
        ) : (
          <p className="profile-activity-empty">
            {isOwnProfile ? 'Todavía no has publicado nada.' : 'Este miembro todavía no ha publicado nada.'}
          </p>
        )}
      </section>
    </div>
  )
}
