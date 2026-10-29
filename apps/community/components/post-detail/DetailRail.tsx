'use client'

import { useState } from 'react'
import { ArrowBigUp, Bookmark, Check, MessageCircle, Share2 } from 'lucide-react'

export interface DetailRailProps {
  /** Votar. Sin esto no hay botón de voto: una vacante no se vota. */
  votes?: { count: number; voted: boolean; onVote: () => void }
  commentsCount: number
  /** Ancla de la conversación; sin ella, los comentarios son solo un número. */
  conversationHref?: string
  /** Guardar. Solo donde guardar de verdad funciona (las vacantes); las publicaciones todavía no se guardan. */
  save?: { saved: boolean; busy?: boolean; onToggle: () => void; saveLabel: string; savedLabel: string }
}

const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/**
 * La columna de acciones junto al detalle (como en dev.to): votar, comentar, guardar y compartir. En escritorio queda
 * fija a la izquierda mientras lees; en pantallas chicas pasa a ser una barra al pie.
 */
export function DetailRail({ votes, commentsCount, conversationHref, save }: DetailRailProps) {
  const [copied, setCopied] = useState(false)

  function share() {
    if (typeof window === 'undefined') return
    navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const comments = (
    <>
      <span className="rail-icon"><MessageCircle size={22} /></span>
      <b>{formatCount(commentsCount)}</b>
    </>
  )

  return (
    <aside className="action-rail" aria-label="Acciones">
      {votes && (
        <button type="button" className={`rail-btn${votes.voted ? ' is-active' : ''}`} onClick={votes.onVote} aria-label={votes.voted ? 'Quitar voto' : 'Votar'} aria-pressed={votes.voted}>
          <span className="rail-icon"><ArrowBigUp size={24} fill={votes.voted ? 'currentColor' : 'none'} /></span>
          <b>{formatCount(votes.count)}</b>
        </button>
      )}

      {conversationHref ? (
        <a className="rail-btn" href={conversationHref} aria-label={`${commentsCount} comentarios`}>{comments}</a>
      ) : (
        <span className="rail-btn is-static" title={`${commentsCount} comentarios`}>{comments}</span>
      )}

      {save && (
        <button type="button" className={`rail-btn${save.saved ? ' is-active' : ''}`} onClick={save.onToggle} disabled={save.busy} aria-pressed={save.saved} aria-label={save.saved ? save.savedLabel : save.saveLabel}>
          <span className="rail-icon"><Bookmark size={22} fill={save.saved ? 'currentColor' : 'none'} /></span>
        </button>
      )}

      <button type="button" className="rail-btn" onClick={share} aria-label="Compartir">
        <span className="rail-icon">{copied ? <Check size={21} /> : <Share2 size={20} />}</span>
        {copied && <b className="rail-hint">Copiado</b>}
      </button>
    </aside>
  )
}
