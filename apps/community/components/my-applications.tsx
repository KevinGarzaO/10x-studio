'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building, ExternalLink, Send, Trash2 } from 'lucide-react'
import { EmptyState, ListSkeleton } from './skeletons'
import { AccountLayout } from './account-pages'
import { getToken } from '../lib/session'
import { formatCompanyName } from '../lib/company'
import { listApplications, removeApplication, setApplicationStatus, STATUS_OPTIONS, type Application, type ApplicationStatus } from '../lib/applications'

const AGO = (date: string | null): string => {
  if (!date) return ''
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

/** Cómo se ve cada estado en la lista. «clicked» es el del sistema: salió al sitio de la empresa y no ha contestado. */
const LABEL: Record<ApplicationStatus, string> = {
  clicked: 'Saliste a postularte: ¿ya lo hiciste?',
  not_yet: 'Por postularme',
  applied: 'Postulada',
  interview: 'En proceso o entrevista',
  offer: 'Con oferta',
  rejected: 'No avanzó',
}

/**
 * Mis postulaciones: las vacantes a las que la persona salió a postularse y cómo le va con cada una. Lo que dice cada estado lo pone
 * ella (el formulario es del sitio de la empresa, no vemos si se postuló): por eso se puede cambiar en cualquier momento.
 */
export function MyApplications() {
  const [items, setItems] = useState<Application[] | null>(null)
  const [signedIn, setSignedIn] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!getToken()) { setSignedIn(false); return }
    listApplications().then(list => { if (list) setItems(list); else setError(true) })
  }, [])

  async function change(item: Application, status: ApplicationStatus) {
    const updated = await setApplicationStatus(item.id, status)
    if (updated) setItems(current => (current || []).map(other => (other.id === item.id ? { ...other, ...updated, closed: other.closed, slug: other.slug } : other)))
  }

  async function remove(item: Application) {
    if (await removeApplication(item.id)) setItems(current => (current || []).filter(other => other.id !== item.id))
  }

  const applied = (items || []).filter(item => ['applied', 'interview', 'offer', 'rejected'].includes(item.status)).length

  return (
    <AccountLayout active="applications">
      <section className="account-card saved-section">
        <div className="account-section-head">
          <div>
            <div className="eyebrow">TU BÚSQUEDA</div>
            <h1>Mis postulaciones</h1>
            <p className="muted">Las vacantes a las que saliste a postularte y cómo va cada una. Tú pones el estado: el formulario es del sitio de la empresa y nosotros no vemos si te postulaste.</p>
          </div>
          {items && items.length > 0 && <span className="count-pill">{applied} {applied === 1 ? 'postulada' : 'postuladas'} de {items.length}</span>}
        </div>

        {!signedIn && (
          <div className="saved-tip">
            <Send size={17} />
            <div><strong>Inicia sesión para ver tus postulaciones</strong><span><Link href="/login">Entrar</Link> o <Link href="/signup">crear una cuenta gratis</Link>.</span></div>
          </div>
        )}

        {error && <p className="muted">No pudimos cargar tus postulaciones. Intenta de nuevo en un momento.</p>}
        {signedIn && !error && items === null && <ListSkeleton rows={3} label="Cargando tus postulaciones" />}

        {items && items.length === 0 && (
          <EmptyState icon={<Send size={20} />} title="Todavía no has salido a postularte a ninguna vacante" text="Cuando uses «Postularse» en una vacante, aparecerá aquí para que le des seguimiento." action={{ href: '/', label: 'Ver vacantes' }} />
        )}

        {items && items.length > 0 && (
          <div className="saved-list">
            {items.map(item => {
              const company = formatCompanyName(item.company)
              const href = item.slug ? `/vacantes/${item.slug}` : null
              return (
                <div key={item.id} className="saved-row application-row">
                  <div className="saved-item">
                    <div className="saved-copy">
                      <div className="saved-meta">
                        {company && <span><Building size={12} /> {company}</span>}
                        <span>{item.status === 'clicked' || item.status === 'not_yet' ? `saliste ${AGO(item.clickedAt)}` : `postulada ${AGO(item.appliedAt || item.clickedAt)}`}</span>
                        {item.closed && <span>ya no acepta solicitudes</span>}
                      </div>
                      <h2>{href ? <Link href={href}>{item.title}</Link> : item.title}</h2>
                      <div className="application-status">
                        <label>
                          <span className="application-status-label">Estado</span>
                          <select value={item.status === 'clicked' ? '' : item.status} onChange={event => change(item, event.target.value as ApplicationStatus)} aria-label={`Estado de ${item.title}`}>
                            {item.status === 'clicked' && <option value="" disabled>{LABEL.clicked}</option>}
                            {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        {item.host && <span className="application-host"><ExternalLink size={12} /> {item.host}</span>}
                      </div>
                    </div>
                  </div>
                  <button type="button" className="saved-remove" onClick={() => remove(item)} aria-label={`Quitar ${item.title} de mis postulaciones`}>
                    <Trash2 size={15} /> Quitar
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </AccountLayout>
  )
}
