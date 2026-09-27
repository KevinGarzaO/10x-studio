'use client'

import { useState } from 'react'

export interface DetailComment {
  id: string
  content: string
  author: { username?: string; display_name?: string }
  created_at: string
}

export interface DetailConversationProps {
  comments: DetailComment[]
  /** Iniciales de quien comenta; sin sesión, el composer no se muestra. */
  currentUserInitials?: string | null
  onSubmit: (text: string) => void
  /** Cómo se formatea el tiempo de cada respuesta (lo tiene cada página). */
  formatTime: (dateStr: string) => string
  /** Aviso tras enviar, mientras el comentario no vuelve del backend. */
  sent?: boolean
}

function initialsOf(name: string): string {
  return name.split(' ').map(part => part[0]).join('').substring(0, 2).toUpperCase() || '?'
}

/** Conversación de una publicación: composer y respuestas. */
export function DetailConversation({
  comments,
  currentUserInitials,
  onSubmit,
  formatTime,
  sent,
}: DetailConversationProps) {
  const [text, setText] = useState('')

  function submit() {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
  }

  return (
    <section id="conversation" className="detail-conversation">
      <h2>{comments.length} comentarios</h2>

      {currentUserInitials && (
        <div className="detail-composer">
          <div className="detail-avatar is-small" aria-hidden="true">{currentUserInitials}</div>
          <div className="detail-composer-main">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Comparte tu opinión con la comunidad..."
              aria-label="Escribe un comentario"
            />
            <div className="detail-composer-actions">
              <button type="button" onClick={submit} disabled={!text.trim()}>
                Comentar
              </button>
            </div>
          </div>
        </div>
      )}

      {sent && <p className="detail-composer-sent">Comentario publicado</p>}

      {comments.length === 0 ? (
        <p className="detail-conversation-empty">Sé la primera persona en comentar</p>
      ) : (
        <div className="detail-replies">
          {comments.map(comment => {
            const name = comment.author?.display_name || comment.author?.username || 'Anónimo'
            return (
              <article key={comment.id} className="detail-reply">
                <div className="detail-avatar is-small" aria-hidden="true">{initialsOf(name)}</div>
                <div className="detail-reply-body">
                  <div className="detail-reply-top">
                    <strong>{name}</strong>
                    <span>{formatTime(comment.created_at)}</span>
                  </div>
                  <p>{comment.content}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
