'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Bookmark, Building, Target } from 'lucide-react'
import { getToken } from '../lib/session'
import { formatCompanyName, companySlug } from '../lib/company'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../lib/profile-options'
import type { MatchedItem } from '../lib/mixed-feed'
import { CompanyAvatar } from './community-hub'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function formatTime(dateStr: string | null) {
  if (!dateStr) return 'reciente'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days}d`
}

const ROLE_TEXT: Record<string, string> = { exact: 'es tu puesto', adjacent: 'puesto cercano al tuyo', unknown: 'no indica el puesto', none: 'otro puesto' }
const LEVEL_TEXT: Record<string, string> = { exact: 'tu nivel', near: 'un nivel de diferencia', unknown: 'no indica nivel', far: 'nivel muy distinto' }
const MODALITY_TEXT: Record<string, string> = { match: 'tu modalidad', compatible: 'modalidad compatible', unknown: 'no indica modalidad', mismatch: 'otra modalidad' }

const LEVEL_NAME = { basico: 'básico', intermedio: 'intermedio', avanzado: 'avanzado' }

/** El porcentaje se compone de puesto 35, skills 28, validación con examen 7, nivel 15 y modalidad 15. */
function matchExplanation(item: MatchedItem): string {
  return [
    `Puesto: ${ROLE_TEXT[item.roleFit ?? 'unknown']}`,
    `Skills: ${item.matchingSkills} en común${item.validatedSkills?.length ? `, ${item.validatedSkills.length} validados con examen` : ''}`,
    `Nivel: ${LEVEL_TEXT[item.seniorityFit ?? 'unknown']}`,
    `Modalidad: ${MODALITY_TEXT[item.modalityFit ?? 'unknown']}`,
  ].join(' · ')
}

/**
 * Una vacante que coincide con los skills de la persona. Se parece a la tarjeta de
 * vacante pero se distingue de un vistazo: insignia "PARA TI", acento de color y
 * cuántos de sus skills pide la vacante.
 */
export function ForYouCard({ item }: { item: MatchedItem }) {
  const router = useRouter()
  const [opening, setOpening] = useState(false)
  const [saved, setSaved] = useState(item.isSaved)
  const [historyId, setHistoryId] = useState(item.historyId)

  const validated = new Map((item.validatedSkills || []).map(entry => [entry.skill.toLowerCase(), entry.level]))
  const shared = new Set((item.sharedSkills || []).map(skill => skill.toLowerCase()))
  const company = formatCompanyName(item.company) || null
  const level = SENIORITY_LABELS[item.seniorityLevel ?? ''] || item.seniorityLevel
  const role = ROLE_CATEGORY_LABELS[item.roleCategory ?? '']

  // Abre el detalle dentro de AvoTalent, igual que "Postularse" en una vacante.
  // Las del scraper no tienen página hasta que se promueven, así que el backend lo
  // hace en ese momento; si no hay detalle, se abre el enlace original.
  async function open() {
    if (item.sourceType === 'community') { router.push(item.url); return }

    setOpening(true)
    try {
      const res = await fetch(`${API_URL}/api/community/feed/for-you/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ sourceId: item.id, url: item.url }),
      })
      const data = res.ok ? await res.json() : null
      if (data?.url) { router.push(data.url); return }
    } catch {
      // sin conexión o sin detalle: se abre el enlace original
    } finally {
      setOpening(false)
    }
    if (!window.open(item.url, '_blank', 'noopener,noreferrer')) window.location.assign(item.url)
  }

  async function toggleSave() {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }

    if (saved) {
      if (!historyId) return
      const res = await fetch(`${API_URL}/api/community/history/${historyId}`, { method: 'DELETE', headers })
      if (res.ok) setSaved(false)
      return
    }

    const res = await fetch(`${API_URL}/api/community/history/save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceType: item.sourceType, sourceId: item.id, title: item.title, company: item.company,
        companyLogo: item.companyLogo, roleCategory: item.roleCategory, seniorityLevel: item.seniorityLevel,
        skills: item.skills, url: item.url,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setSaved(true)
      setHistoryId(data.item?.id ?? historyId)
    }
  }

  return (
    <article
      className="post-card job-card is-for-you"
      onClick={e => { if (e.target instanceof HTMLElement && e.target.closest('button, a')) return; open() }}
    >
      <div className="post-top">
        <Link href={company ? `/empresas/${companySlug(company)}` : '#'} className="author-row author-link" onClick={e => !company && e.preventDefault()}>
          <CompanyAvatar company={company} logoUrl={item.companyLogo} size={44} />
          <div><div className="author-name">{company || 'AvoTalent'}</div><div className="post-meta">{formatTime(item.postDate)}</div></div>
        </Link>
        <span className="post-type-badge is-for-you"><Target size={11} /> PARA TI</span>
      </div>
      <h2>{item.title}</h2>
      <div className="job-chips">
        {company && <span className="job-chip"><Building size={12} /> {company}</span>}
        {role && <span className="job-chip">{role}</span>}
        {item.roleFit === 'adjacent' && <span className="job-chip is-adjacent" title="No es exactamente tu puesto, pero es cercano y pide skills que tienes">Rol cercano al tuyo</span>}
        {level && <span className="job-chip">{level}</span>}
        {item.modalidad && !/no especificado|unknown/i.test(item.modalidad) && <span className="job-chip">{item.modalidad}</span>}
        {typeof item.matchScore === 'number' && <span className="match-score" title={matchExplanation(item)}>{item.matchScore}% match</span>}
        <span className="match-pill"><Target size={11} /> {item.matchingSkills} {item.matchingSkills === 1 ? 'skill' : 'skills'} en común</span>
        {validated.size > 0 && <span className="match-pill is-validated" title="Skills que pide la vacante y aprobaste con examen"><BadgeCheck size={11} /> {validated.size} {validated.size === 1 ? 'validado' : 'validados'} con examen</span>}
      </div>
      {item.skills.length > 0 && (
        <div className="stack-row">
          {/* Los skills que tú tienes van primero y resaltados. */}
          {[...item.skills].sort((a, b) => Number(validated.has(b.toLowerCase())) - Number(validated.has(a.toLowerCase())) || Number(shared.has(b)) - Number(shared.has(a))).slice(0, 6).map(skill => {
            const level = validated.get(skill.toLowerCase())
            return level
              ? <span key={skill} className="stack-badge is-validated" title={`Validado con examen: ${LEVEL_NAME[level]}`}><BadgeCheck size={12} /> {skill} · {LEVEL_NAME[level]}</span>
              : <span key={skill} className={`stack-badge${shared.has(skill) ? ' is-shared' : ''}`}>{skill}</span>
          })}
        </div>
      )}
      <button className="job-apply-button" onClick={open} disabled={opening}>
        {opening ? 'Abriendo...' : 'Ver vacante →'}
      </button>
      <div className="post-footer">
        <span className="footer-spacer" />
        <button className={`icon-button ${saved ? 'saved' : ''}`} onClick={toggleSave} aria-label="Guardar">
          <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </article>
  )
}
