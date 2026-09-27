'use client'

import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export interface DetailHeaderProps {
  /** Volver al feed. */
  onBack: () => void
  /** Nombre visible del autor o de la empresa. */
  authorName: string
  /** Iniciales para el avatar cuando no hay foto. */
  initials: string
  photoUrl?: string | null
  /** Perfil del autor o de la empresa; sin él, el nombre no es enlace. */
  profileHref?: string | null
  /** "VACANTE", "ARTÍCULO", "DISCUSIÓN"… */
  typeLabel: string
  time: string
  /** Marca de cuenta oficial de AvoTalent. */
  verified?: boolean
  /** Acción principal a la derecha. Sin ella, no se renderiza nada. */
  action?: {
    label: string
    onClick?: () => void
    href?: string
    /** Botón sólido (postularse) o de contorno (seguir). */
    variant?: 'primary' | 'outline'
    /** Razón visible de por qué no se puede usar todavía. */
    disabledReason?: string
  }
}

/**
 * Encabezado común del detalle: regreso, identidad y acción principal.
 *
 * Lo comparten el detalle de vacante y el de publicación, que antes tenían cada
 * uno su propia versión de esto.
 */
export function DetailHeader({
  onBack,
  authorName,
  initials,
  photoUrl,
  profileHref,
  typeLabel,
  time,
  verified,
  action,
}: DetailHeaderProps) {
  const identity = (
    <>
      {photoUrl ? (
        <img className="detail-avatar" src={photoUrl} alt="" />
      ) : (
        <div className="detail-avatar" aria-hidden="true">{initials}</div>
      )}
      <div className="detail-identity">
        <div className="detail-author-name">
          {authorName}
          {verified && <ShieldCheck size={14} className="verified" />}
        </div>
        <div className="detail-author-meta">{typeLabel} · {time}</div>
      </div>
    </>
  )

  return (
    <header className="detail-header">
      <button onClick={onBack} className="detail-back">
        <ArrowLeft size={16} /> Volver al feed
      </button>

      <div className="detail-identity-row">
        {profileHref ? (
          <Link href={profileHref} className="detail-identity-link">{identity}</Link>
        ) : (
          <div className="detail-identity-link is-static">{identity}</div>
        )}

        {action && (
          action.href && !action.disabledReason ? (
            <a
              className={`detail-action ${action.variant === 'outline' ? 'is-outline' : ''}`}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {action.label}
            </a>
          ) : (
            <button
              type="button"
              className={`detail-action ${action.variant === 'outline' ? 'is-outline' : ''}`}
              onClick={action.disabledReason ? undefined : action.onClick}
              disabled={!!action.disabledReason}
              title={action.disabledReason}
            >
              {action.label}
            </button>
          )
        )}
      </div>
    </header>
  )
}
