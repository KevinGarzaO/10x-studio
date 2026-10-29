'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

export interface SideCardProps {
  name: string
  /** Iniciales para el avatar cuando no hay foto. */
  initials: string
  photoUrl?: string | null
  /** Texto corto bajo el nombre (la biografía o a qué se dedica la empresa). */
  about?: string | null
  /** Datos con título: Ubicación, Puesto, Se unió… Los vacíos no se muestran. */
  facts: { label: string; value: string | null | undefined }[]
  /** Perfil o página de la empresa. Sin él, el nombre no es enlace y no hay botón. */
  href?: string | null
  hrefLabel?: string
  /** La acción principal de la tarjeta (por ejemplo, Postularse). */
  children?: ReactNode
}

/** La tarjeta de la derecha del detalle (como la del autor en dev.to): franja de color, avatar, datos y acción. */
export function SideCard({ name, initials, photoUrl, about, facts, href, hrefLabel = 'Ver perfil', children }: SideCardProps) {
  const avatar = photoUrl ? <img className="aside-avatar" src={photoUrl} alt="" /> : <div className="aside-avatar" aria-hidden="true">{initials}</div>
  const shown = facts.filter(fact => !!fact.value)

  return (
    <section className="aside-card">
      <div className="aside-card-accent" />
      <div className="aside-card-body">
        <div className="aside-person">
          {avatar}
          <h2 className="aside-name">{href ? <Link href={href}>{name}</Link> : name}</h2>
        </div>

        {children}
        {href && <Link href={href} className="detail-action is-outline aside-action">{hrefLabel}</Link>}

        {about && <p className="aside-about">{about}</p>}

        {shown.length > 0 && (
          <dl className="aside-facts">
            {shown.map(fact => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
