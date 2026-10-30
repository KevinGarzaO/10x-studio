import Link from 'next/link'
import type { ReactNode } from 'react'

/** Lugar reservado mientras llega una pantalla: evita saltos y deja claro que algo viene en camino. */
export function CardSkeleton() {
  return (
    <div className="feed-skeleton" aria-hidden="true">
      <i className="sk-line sk-short" /><i className="sk-line sk-title" /><i className="sk-line" />
    </div>
  )
}

export function ListSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div className="feed-skeletons" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  )
}

/** Para el detalle de una publicación, una vacante o un perfil. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="feed-skeletons" role="status" aria-busy="true" aria-label={label}>
      <div className="feed-skeleton" aria-hidden="true">
        <i className="sk-line sk-short" /><i className="sk-line sk-title" /><i className="sk-line" /><i className="sk-line" /><i className="sk-line sk-short" />
      </div>
      <CardSkeleton />
    </div>
  )
}

/** Cuando no hay nada que mostrar: dice por qué y qué hacer, con una sola acción. */
export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <Link href={action.href} className="empty-state-action">{action.label}</Link>}
    </div>
  )
}
