'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Building, ExternalLink, Trash2 } from 'lucide-react'
import { getToken } from '../lib/session'
import { formatCompanyName } from '../lib/company'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../lib/profile-options'
import { AccountLayout } from './account-pages'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/** Una vacante guardada, tal como la guarda user_vacancy_history. */
interface SavedItem {
  id: string
  source_type: 'community' | 'scraper'
  source_id: string
  title: string | null
  company: string | null
  company_logo: string | null
  role_category: string | null
  seniority_level: string | null
  skills: string[] | null
  url: string | null
  saved_at: string | null
}

function savedAgo(date: string | null): string {
  if (!date) return 'guardada'
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return 'guardada hoy'
  if (days === 1) return 'guardada ayer'
  return `guardada hace ${days} días`
}

/**
 * Las vacantes que la persona guardó con el marcador, de la más reciente a la más
 * antigua. Es lo mismo que guardan las tarjetas del feed, "Para ti" y el detalle de la
 * vacante (user_vacancy_history con is_saved).
 */
export function SavedVacancies() {
  const [items, setItems] = useState<SavedItem[] | null>(null)
  const [signedIn, setSignedIn] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setSignedIn(false)
      return
    }

    fetch(`${API_URL}/api/community/history?saved=true`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) throw new Error('No se pudieron cargar')
        const data = await res.json()
        const saved = ((data.items || []) as SavedItem[]).filter(item => item.title)
        saved.sort((a, b) => Date.parse(b.saved_at ?? '') - Date.parse(a.saved_at ?? ''))
        setItems(saved)
      })
      .catch(() => setError(true))
  }, [])

  async function remove(item: SavedItem) {
    const res = await fetch(`${API_URL}/api/community/history/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => null)
    if (res?.ok) setItems(current => (current || []).filter(other => other.id !== item.id))
  }

  return (
    <AccountLayout active="saved">
      <section className="account-card saved-section">
        <div className="account-section-head">
          <div>
            <div className="eyebrow">TU COLECCIÓN</div>
            <h1>Guardados</h1>
            <p className="muted">Las vacantes que guardaste para consultarlas después.</p>
          </div>
          {items && items.length > 0 && <span className="count-pill">{items.length} {items.length === 1 ? 'vacante' : 'vacantes'}</span>}
        </div>

        {!signedIn && (
          <div className="saved-tip">
            <Bookmark size={17} />
            <div>
              <strong>Inicia sesión para ver tus guardados</strong>
              <span><Link href="/login">Entrar</Link> o <Link href="/signup">crear una cuenta gratis</Link>.</span>
            </div>
          </div>
        )}

        {error && <p className="muted">No pudimos cargar tus guardados. Intenta de nuevo en un momento.</p>}

        {signedIn && !error && items === null && <p className="muted">Cargando tus guardados...</p>}

        {items && items.length === 0 && (
          <div className="saved-tip">
            <Bookmark size={17} />
            <div>
              <strong>Aún no guardas ninguna vacante</strong>
              <span>Usa el botón Guardar en cualquier vacante y la encontrarás aquí. <Link href="/">Ver vacantes</Link></span>
            </div>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="saved-list">
            {items.map(item => {
              const company = formatCompanyName(item.company)
              const role = ROLE_CATEGORY_LABELS[item.role_category ?? '']
              const level = SENIORITY_LABELS[item.seniority_level ?? '']
              const skills = (item.skills || []).slice(0, 5)
              // Las de la comunidad abren su detalle; las del área de paso del scraper, su enlace original.
              const internal = item.source_type === 'community'
              const href = internal ? item.url || `/vacantes/${item.source_id}` : item.url || '#'

              const body = (
                <>
                  <div className="saved-copy">
                    <div className="saved-meta">
                      {company && <span><Building size={12} /> {company}</span>}
                      {role && <span className="tag-chip tag-job">{role}</span>}
                      {level && <span>{level}</span>}
                      <span>{savedAgo(item.saved_at)}</span>
                    </div>
                    <h2>{item.title}</h2>
                    {skills.length > 0 && (
                      <div className="saved-footer">{skills.map(skill => <span key={skill}>{skill}</span>)}</div>
                    )}
                  </div>
                  {!internal && <ExternalLink size={16} className="saved-more" />}
                </>
              )

              return (
                <div key={item.id} className="saved-row">
                  {internal
                    ? <Link href={href} className="saved-item">{body}</Link>
                    : <a href={href} className="saved-item" target="_blank" rel="noopener noreferrer">{body}</a>}
                  <button type="button" className="saved-remove" onClick={() => remove(item)} aria-label={`Quitar ${item.title} de guardados`}>
                    <Trash2 size={15} /> Quitar
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {items && items.length > 0 && (
          <div className="saved-tip">
            <Bookmark size={17} />
            <div><strong>Guarda lo que te interese</strong><span>Usa el botón Guardar en cualquier vacante para encontrarla aquí.</span></div>
          </div>
        )}
      </section>
    </AccountLayout>
  )
}
