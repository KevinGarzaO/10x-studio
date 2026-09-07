'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Building, ExternalLink, Target } from 'lucide-react'
import { getToken, fetchCurrentUser } from '../../../lib/session'
import { formatCompanyName, companySlug } from '../../../lib/company'
import { CompanyAvatar } from '../../../components/community-hub'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../../../lib/profile-options'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface MatchedItem {
  sourceType: 'scraper' | 'community'
  id: string
  title: string
  company: string | null
  companyLogo: string | null
  roleCategory: string | null
  seniorityLevel: string | null
  skills: string[]
  url: string
  postDate: string | null
  matchingSkills: number
  historyId: string
  isSaved: boolean
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return 'reciente'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days}d`
}

export default function ParaTiPage() {
  const [items, setItems] = useState<MatchedItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCurrentUser().then(user => {
      if (!user) { setError('Inicia sesión para ver tu feed personalizado'); return }
      const token = getToken()
      fetch(`${API_URL}/api/community/feed/for-you`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async r => {
          const data = await r.json()
          if (!r.ok) throw new Error(data.error || 'Error al cargar tu feed')
          setItems(data.items || [])
        })
        .catch(err => setError(err.message))
    })
  }, [])

  async function handleToggleSave(item: MatchedItem) {
    const token = getToken()

    if (item.isSaved) {
      if (!item.historyId) return
      const res = await fetch(`${API_URL}/api/community/history/${item.historyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setItems(prev => prev?.map(i => (i.sourceType === item.sourceType && i.id === item.id) ? { ...i, isSaved: false } : i) ?? prev)
      }
      return
    }

    const res = await fetch(`${API_URL}/api/community/history/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sourceType: item.sourceType, sourceId: item.id, title: item.title, company: item.company,
        companyLogo: item.companyLogo, roleCategory: item.roleCategory, seniorityLevel: item.seniorityLevel,
        skills: item.skills, url: item.url,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setItems(prev => prev?.map(i => (i.sourceType === item.sourceType && i.id === item.id) ? { ...i, isSaved: true, historyId: data.item?.id ?? i.historyId } : i) ?? prev)
    }
  }

  return (
    <main className="feed">
      <div className="feed-heading">
        <div>
          <p className="eyebrow">Tu feed personalizado</p>
          <h1><Target size={22} style={{ verticalAlign: -3, marginRight: 8, color: '#00A86B' }} />Para ti</h1>
        </div>
      </div>

      {error && <p className="muted" style={{ padding: '20px 0' }}>{error}</p>}

      {!error && items === null && <p className="muted" style={{ padding: '20px 0' }}>Buscando vacantes que hagan match contigo...</p>}

      {!error && items && items.length === 0 && (
        <div className="empty-state">
          <Target size={28} />
          <h2>Todavía no hay vacantes para tu perfil</h2>
          <p>Vuelve pronto — revisamos nuevas vacantes constantemente.</p>
        </div>
      )}

      {!error && items && items.length > 0 && (
        <div className="post-list">
          {items.map(item => {
            const company = formatCompanyName(item.company) || null
            const key = `${item.sourceType}:${item.id}`
            const isExternal = item.sourceType === 'scraper'
            return (
              <article className="post-card job-card" key={key}>
                <div className="job-line" />
                <div className="post-top">
                  {company ? (
                    <Link href={`/empresas/${companySlug(company)}`} className="author-row author-link">
                      <CompanyAvatar company={company} logoUrl={item.companyLogo} size={40} />
                      <div><div className="author-name">{company}</div><div className="post-meta">{formatTime(item.postDate)}</div></div>
                    </Link>
                  ) : (
                    <div className="author-row"><Building size={18} /><div className="post-meta">{formatTime(item.postDate)}</div></div>
                  )}
                  {item.matchingSkills > 0 && <span className="verified-pill"><Target size={11} /> {item.matchingSkills} skills en común</span>}
                </div>
                <div className="post-type-label" style={{ color: '#10b981' }}>
                  {ROLE_CATEGORY_LABELS[item.roleCategory ?? ''] || 'Vacante'} · {SENIORITY_LABELS[item.seniorityLevel ?? ''] || ''}
                </div>
                <h2 style={{ fontSize: 17, marginBottom: 8 }}>{item.title}</h2>
                {item.skills.length > 0 && (
                  <div className="stack-row">
                    {item.skills.slice(0, 6).map(s => <span key={s} className="stack-badge">{s}</span>)}
                  </div>
                )}
                <div className="post-footer">
                  {isExternal ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#0d1117', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                      Ver vacante <ExternalLink size={14} />
                    </a>
                  ) : (
                    <Link href={item.url} className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#0d1117', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                      Ver vacante
                    </Link>
                  )}
                  <span className="footer-spacer" />
                  <button className={`icon-button ${item.isSaved ? 'saved' : ''}`} onClick={() => handleToggleSave(item)} aria-label="Guardar">
                    <Bookmark size={17} fill={item.isSaved ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
