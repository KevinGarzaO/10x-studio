'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface RelatedItem {
  id: string
  slug: string | null
  title: string
  type: string
  company: string | null
  tags: string[]
}

interface Related {
  kind: 'author' | 'company' | 'role' | 'none'
  company?: string | null
  items: RelatedItem[]
}

/**
 * La tarjeta "Más de…" de la columna lateral: otras publicaciones de la misma persona o, en una vacante, otras vacantes
 * de la empresa (o del mismo puesto si la empresa no tiene más). Si no hay nada que mostrar, no se pinta.
 */
export function RelatedCard({ postKey, authorName }: { postKey: string; authorName?: string }) {
  const [related, setRelated] = useState<Related | null>(null)

  useEffect(() => {
    let active = true
    fetch(`${API_URL}/api/community/posts/${encodeURIComponent(postKey)}/related`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (active) setRelated(Array.isArray(data?.items) ? data : null) })
      .catch(() => { if (active) setRelated(null) })
    return () => { active = false }
  }, [postKey])

  if (!related || related.items.length === 0 || related.kind === 'none') return null

  const heading = related.kind === 'author'
    ? <>Más de <strong>{authorName || 'esta persona'}</strong></>
    : related.kind === 'company'
      ? <>Más vacantes de <strong>{related.company}</strong></>
      : <>Vacantes parecidas</>

  return (
    <section className="aside-card related-card">
      <h2 className="related-heading">{heading}</h2>
      <ul className="related-list">
        {related.items.map(item => (
          <li key={item.id}>
            <Link href={item.type === 'job' ? `/vacantes/${item.slug || item.id}` : `/post/${item.id}`}>{item.title}</Link>
            {item.type === 'job'
              ? (related.kind !== 'company' && item.company ? <span className="related-meta">{item.company}</span> : null)
              : item.tags.length > 0 && <span className="related-meta">{item.tags.slice(0, 3).map(tag => `#${tag}`).join(' ')}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
