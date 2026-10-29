'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../lib/profile-options'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Card {
  kind: 'user' | 'company'
  name: string
  photo_url: string | null
  bio: string | null
  location: string | null
  role_category?: string | null
  seniority?: string | null
  joined_at?: string | null
  open_vacancies?: number
}

// Lo ya pedido se guarda para que pasar el cursor por la misma persona muchas veces no repita la consulta.
const cache = new Map<string, Promise<Card | null>>()

function loadCard(kind: 'user' | 'company', id: string, name?: string): Promise<Card | null> {
  const key = `${kind}:${id}`
  if (!cache.has(key)) {
    const query = kind === 'company' && name ? `?name=${encodeURIComponent(name)}` : ''
    cache.set(key, fetch(`${API_URL}/api/community/cards/${kind}/${encodeURIComponent(id)}${query}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => (data?.card && typeof data.card.name === 'string' ? (data.card as Card) : null))
      .catch(() => { cache.delete(key); return null }))
  }
  return cache.get(key)!
}

export const resetProfileCardCache = () => cache.clear()

const SHOW_DELAY = 280
const HIDE_DELAY = 160
const WIDTH = 300
/** Alto aproximado de la tarjeta, para decidir si cabe debajo o va arriba. */
const CARD_HEIGHT = 380

const initialsOf = (name: string) => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()

/**
 * Envuelve el nombre o la foto de una persona o una empresa: al pasar el cursor (o enfocarlo con el teclado) sale una
 * tarjeta con su foto, a qué se dedica y dónde está, y un botón a su perfil. Los datos se piden en ese momento y solo
 * los públicos. En pantallas táctiles no hay "pasar el cursor": el toque sigue llevando al perfil, como siempre.
 *
 * La tarjeta es `position: fixed` para que no la recorte una tarjeta con `overflow: hidden`.
 */
export function ProfileHoverCard({ kind, id, name, photoUrl, href, children }: { kind: 'user' | 'company'; id: string | null | undefined; name: string; photoUrl?: string | null; href: string | null; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState<Card | null>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  const clear = () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current) }

  const show = useCallback(() => {
    if (!id) return
    clear()
    showTimer.current = setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - WIDTH - 12))
      // Debajo de la foto; si abajo no cabe, arriba.
      setPos(rect.bottom + CARD_HEIGHT > window.innerHeight && rect.top > CARD_HEIGHT ? { bottom: window.innerHeight - rect.top + 8, left } : { top: rect.bottom + 8, left })
      setOpen(true)
      loadCard(kind, id, name).then(setCard)
    }, SHOW_DELAY)
  }, [id, kind, name])

  const hide = useCallback(() => {
    clear()
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY)
  }, [])

  // Al hacer scroll la tarjeta se cierra: quedaría flotando lejos de lo que describe.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [open])

  useEffect(() => clear, [])

  if (!id) return <>{children}</>

  const role = [card?.role_category ? ROLE_CATEGORY_LABELS[card.role_category] : '', card?.seniority ? SENIORITY_LABELS[card.seniority] : ''].filter(Boolean).join(' · ')
  const joined = card?.joined_at ? new Date(card.joined_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const photo = card?.photo_url ?? photoUrl
  const shownName = card?.name ?? name
  const facts: [string, string | null | undefined][] = kind === 'company'
    ? [['Ubicación', card?.location], ['Vacantes abiertas', card?.open_vacancies ? String(card.open_vacancies) : null]]
    : [['Puesto', role], ['Ubicación', card?.location], ['Se unió', joined]]

  return (
    <span ref={anchor} className="hover-anchor" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && (
        <span className="hover-card" role="tooltip" style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: WIDTH }} onMouseEnter={() => { clearTimeout(hideTimer.current) }} onMouseLeave={hide} onClick={event => event.stopPropagation()}>
          <span className="hover-card-bar" />
          <span className="hover-card-body">
            <span className="hover-card-head">
              {photo ? <img className="hover-card-avatar" src={photo} alt="" /> : <span className="hover-card-avatar" aria-hidden="true">{initialsOf(shownName)}</span>}
              <strong>{shownName}</strong>
            </span>
            {href && <Link href={href} className="hover-card-action">{kind === 'company' ? 'Ver empresa' : 'Ver perfil'}</Link>}
            {card?.bio && <span className="hover-card-bio">{card.bio}</span>}
            {facts.filter(([, value]) => !!value).map(([label, value]) => (
              <span key={label} className="hover-card-fact"><small>{label}</small>{value}</span>
            ))}
            {!card && <span className="hover-card-bio">Cargando…</span>}
          </span>
        </span>
      )}
    </span>
  )
}
