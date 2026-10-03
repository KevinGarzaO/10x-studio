'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, Building, Target } from 'lucide-react'
import { getToken, fetchCurrentUser } from '../../../lib/session'
import { formatCompanyName, companySlug } from '../../../lib/company'
import { CompanyAvatar, FeedTabs, FOR_YOU_TAB } from '../../../components/community-hub'
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
  const router = useRouter()
  const [items, setItems] = useState<MatchedItem[] | null>(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState<string | null>(null)

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

  // Solo lo que de verdad coincide con tus skills; el backend ya lo filtra, esto
  // cubre una respuesta más vieja.
  const matches = items?.filter(item => item.matchingSkills > 0) ?? null

  // Abre el detalle de la vacante dentro de AvoTalent, igual que "Postularse" en
  // Vacantes. Las del scraper no tienen página hasta que se promueven, así que el
  // backend lo hace en ese momento; si no hay detalle, se abre el enlace original.
  async function openItem(item: MatchedItem) {
    if (item.sourceType === 'community') { router.push(item.url); return }

    const key = `${item.sourceType}:${item.id}`
    setOpening(key)
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
      setOpening(null)
    }
    if (!window.open(item.url, '_blank', 'noopener,noreferrer')) window.location.assign(item.url)
  }

  // Las pestañas navegan igual que en el feed: Feed y Vacantes vuelven a "/", y
  // esta pantalla es la pestaña "Para ti".
  const selectTab = (tab: string) => {
    if (tab === FOR_YOU_TAB) return
    router.push(tab === 'Vacantes & Freelance' ? '/?tab=jobs' : '/', { scroll: false })
  }

  return (
    <main className="feed">
      <div className="feed-heading">
        <div>
          <p className="eyebrow">Tu feed personalizado</p>
          <h1>Para ti <span className="live-dot" /></h1>
        </div>
      </div>

      <FeedTabs activeTab={FOR_YOU_TAB} signedIn onSelect={selectTab} />

      {error && <p className="muted" style={{ padding: '20px 0' }}>{error}</p>}

      {!error && items === null && <p className="muted" style={{ padding: '20px 0' }}>Buscando vacantes que hagan match contigo...</p>}

      {!error && matches && matches.length === 0 && (
        <div className="empty-state">
          <Target size={28} />
          <h2>Todavía no hay vacantes que coincidan con tus skills</h2>
          <p>Vuelve pronto, o agrega más skills a tu perfil para ver más opciones.</p>
        </div>
      )}

      {!error && matches && matches.length > 0 && (
        <div className="post-list">
          {matches.map(item => {
            const company = formatCompanyName(item.company) || null
            const key = `${item.sourceType}:${item.id}`
            const level = SENIORITY_LABELS[item.seniorityLevel ?? ''] || item.seniorityLevel
            const role = ROLE_CATEGORY_LABELS[item.roleCategory ?? '']
            // Misma tarjeta que en Vacantes; la única diferencia es lo que aporta
            // "Para ti": cuántos de tus skills pide la vacante.
            return (
              <article
                className="post-card job-card"
                key={key}
                onClick={e => { if (e.target instanceof HTMLElement && e.target.closest('button, a')) return; openItem(item) }}
              >
                <div className="post-top">
                  <Link href={company ? `/empresas/${companySlug(company)}` : '#'} className="author-row author-link" onClick={e => !company && e.preventDefault()}>
                    <CompanyAvatar company={company} logoUrl={item.companyLogo} size={44} />
                    <div><div className="author-name">{company || 'AvoTalent'}</div><div className="post-meta">{formatTime(item.postDate)}</div></div>
                  </Link>
                  <span className="post-type-badge">VACANTE</span>
                </div>
                <h2>{item.title}</h2>
                <div className="job-chips">
                  {company && <span className="job-chip"><Building size={12} /> {company}</span>}
                  {role && <span className="job-chip">{role}</span>}
                  {level && <span className="job-chip">{level}</span>}
                  {item.matchingSkills > 0 && (
                    <span className="verified-pill"><Target size={11} /> {item.matchingSkills} {item.matchingSkills === 1 ? 'skill' : 'skills'} en común</span>
                  )}
                </div>
                {item.skills.length > 0 && (
                  <div className="stack-row">
                    {item.skills.slice(0, 6).map(skill => <span key={skill} className="stack-badge">{skill}</span>)}
                  </div>
                )}
                <button className="job-apply-button" onClick={() => openItem(item)} disabled={opening === key}>
                  {opening === key ? 'Abriendo...' : 'Ver vacante →'}
                </button>
                <div className="post-footer">
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
