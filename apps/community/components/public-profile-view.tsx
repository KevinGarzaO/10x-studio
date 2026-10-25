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
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

      <section className="pf-card">
        <div className="pf-cover" aria-hidden="true" />

        <div className="pf-body">
          <div className="pf-top">
            {profile.photo_url && !photoFailed
              ? <img className="profile-avatar" src={profile.photo_url} alt={`Foto de perfil de ${name}`} onError={() => setPhotoFailed(true)} />
              : <div className="profile-avatar is-initials">{initials}</div>}

            <div className="pf-actions">
              {isOwnProfile ? (
                <Link className="profile-action is-primary" href="/settings"><Pencil size={14} /> Editar perfil</Link>
              ) : (
                <button type="button" className="profile-action" onClick={copyLink}>
                  <Share2 size={14} /> {copied ? 'Enlace copiado' : 'Compartir'}
                </button>
              )}
            </div>
          </div>

          <h1 className="pf-name">{name} {isStaff && <ShieldCheck size={18} className="verified" />}</h1>
          <p className="pf-sub">@{profile.username}{profile.title ? ` · ${profile.title}` : ''}</p>

          <ul className="pf-facts">
            {seniorityLabel && <li><BriefcaseBusiness size={15} /> {seniorityLabel}</li>}
            {profile.location && <li><MapPin size={15} /> {profile.location}</li>}
            {profile.work_modality && <li><Home size={15} /> {profile.work_modality}</li>}
            {profile.website && <li><Globe2 size={15} /> {profile.website}</li>}
            {profile.github_url && <li><GitBranch size={15} /> {profile.github_url}</li>}
            <li><CalendarDays size={15} /> En AvoTalent desde {joined}</li>
          </ul>

          {profile.bio && <p className="pf-bio">{profile.bio}</p>}
        </div>
      </section>

      {declaredSkills.length > 0 && (
        <section className="pf-section">
          <div className="pf-section-head">
            <h2>Skills</h2>
            <span>
              {declaredSkills.length} {declaredSkills.length === 1 ? 'skill' : 'skills'}
              {validated.length > 0 ? ` · ${validated.length} ${validated.length === 1 ? 'validado' : 'validados'}` : ''}
            </span>
          </div>

          {validated.length > 0 && (
            <div className="profile-validated">
              <h3>
                <BadgeCheck size={15} /> Skills validados por examen
              </h3>
              <div className="profile-validated-list">
                {validated.map(({ skill, level }) => (
                  <span key={skill} className={`skill-badge is-${level}`}>
                    <BadgeCheck size={13} />
                    <strong>{skill}</strong>
                    <em>{SKILL_LEVEL_LABEL[level] ?? level}</em>
                  </span>
                ))}
              </div>
            </div>
          )}

          {plainSkills.length > 0 && (
            <div className="profile-skills">
              {validated.length > 0 && <p className="profile-skills-label">Otros skills declarados</p>}
              <div className="profile-skills-list">
                {plainSkills.map(skill => <span key={skill} className="skill-chip-plain">{skill}</span>)}
              </div>
            </div>
          )}
        </section>
      )}

      {posts.length > 0 && (
        <section className="pf-section profile-activity">
          <div className="pf-section-head">
            <h2>Publicaciones</h2>
            <span>{posts.length}</span>
          </div>
          <div className="post-list">
            {posts.map(post => <PostCard key={post.id} post={post} onAuthRequired={onAuthRequired} />)}
          </div>
        </section>
      )}
    </div>
  )
}
