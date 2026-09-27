'use client'

import { useState } from 'react'
import { ArrowBigUp, Bookmark, Check, MessageCircle, Share2 } from 'lucide-react'

export interface DetailFooterProps {
  /** Votar. Sin esto no se renderiza el botón: una vacante no se vota. */
  votes?: { count: number; voted: boolean; onVote: () => void }
  commentsCount: number
  saved: boolean
  onSave: () => void
  /** Ancla de la conversación; sin ella, los comentarios son solo un número. */
  conversationHref?: string
}

/** Pie de acciones del detalle: votos, comentarios, guardar y compartir. */
export function DetailFooter({
  votes,
  commentsCount,
  saved,
  onSave,
  conversationHref,
}: DetailFooterProps) {
  const [copied, setCopied] = useState(false)

  function share() {
    if (typeof window === 'undefined') return
    navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const comments = (
    <>
      <MessageCircle size={17} /> {commentsCount} comentarios
    </>
  )

  return (
    <div className="detail-footer">
      {votes && (
        <button
          type="button"
          className={`detail-footer-action ${votes.voted ? 'is-active' : ''}`}
          onClick={votes.onVote}
        >
          <ArrowBigUp size={18} fill={votes.voted ? 'currentColor' : 'none'} />
          {votes.count}
        </button>
      )}

      {conversationHref ? (
        <a className="detail-footer-action" href={conversationHref}>{comments}</a>
      ) : (
        <span className="detail-footer-action is-static">{comments}</span>
      )}

      <span className="detail-footer-spacer" />

      <button
        type="button"
        className={`detail-footer-icon ${saved ? 'is-active' : ''}`}
        onClick={onSave}
        aria-label="Guardar"
      >
        <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
      </button>

      <button
        type="button"
        className="detail-footer-icon"
        onClick={share}
        aria-label="Compartir"
      >
        {copied ? <Check size={17} /> : <Share2 size={16} />}
      </button>
    </div>
  )
}
