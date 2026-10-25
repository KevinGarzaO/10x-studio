'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { getToken } from '../lib/session'
import { renderUserMarkdown } from '../lib/user-markdown'
import { clearFeedCache } from './community-hub'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Los mismos límites que el servidor (backend/services/community/post-rules.ts): si cambian allá, cambian aquí.
export const TITLE_MIN = 8
export const TITLE_MAX = 140
export const CONTENT_MIN = 20
export const CONTENT_MAX = 10000
export const TAGS_MAX = 5

// Por ahora solo hay discusiones; los proyectos están en pausa (ver backend/services/community/post-rules.ts).
const TYPE = 'discussion' as const
const PLACEHOLDER = '¿Cómo estructuran las pruebas de un equipo nuevo?'

const cleanTag = (raw: string): string =>
  raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^#+/, '').replace(/[^a-z0-9+#.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)

/** Escribir y publicar una discusión o un proyecto. Solo para miembros con el perfil completo (lo exige el servidor). */
export function PublishForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const titleLength = title.trim().length
  const contentLength = content.trim().length
  const ready = titleLength >= TITLE_MIN && titleLength <= TITLE_MAX && contentLength >= CONTENT_MIN && contentLength <= CONTENT_MAX
  const html = useMemo(() => (preview ? renderUserMarkdown(content) : ''), [preview, content])

  function addTag(raw: string) {
    const tag = cleanTag(raw)
    if (!tag || tags.includes(tag) || tags.length >= TAGS_MAX) return
    setTags(previous => [...previous, tag])
  }

  function onTagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag(tagInput)
      setTagInput('')
    } else if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(previous => previous.slice(0, -1))
    }
  }

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/community/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ type: TYPE, title: title.trim(), content: content.trim(), tags: tagInput ? [...tags, cleanTag(tagInput)].filter(Boolean) : tags }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'No se pudo publicar. Intenta de nuevo.')
        setBusy(false)
        return
      }
      clearFeedCache() // el feed vuelve a pedirse y la publicación aparece
      router.push(`/post/${data.post.id}`)
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className="publish-page">
      <button onClick={() => router.back()} className="detail-back"><ArrowLeft size={15} /> Volver</button>

      <h1 className="publish-title">Nueva discusión</h1>
      <p className="publish-lead">Haz una pregunta o abre un tema con la comunidad. Sé claro y respetuoso: lo que publiques lo verán los demás miembros.</p>

      <div className="publish-field">
        <label htmlFor="publish-title">Título</label>
        <input id="publish-title" value={title} onChange={event => setTitle(event.target.value)} placeholder={PLACEHOLDER} maxLength={TITLE_MAX + 20} />
        <small className={titleLength > TITLE_MAX ? 'is-bad' : ''}>{titleLength} / {TITLE_MAX}{titleLength > 0 && titleLength < TITLE_MIN ? ` · mínimo ${TITLE_MIN}` : ''}</small>
      </div>

      <div className="publish-field">
        <div className="publish-field-head">
          <label htmlFor="publish-content">Contenido</label>
          <div className="publish-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!preview} className={!preview ? 'is-active' : ''} onClick={() => setPreview(false)}>Escribir</button>
            <button type="button" role="tab" aria-selected={preview} className={preview ? 'is-active' : ''} onClick={() => setPreview(true)}>Vista previa</button>
          </div>
        </div>
        {preview ? (
          <div className="publish-preview detail-body editorial-content" dangerouslySetInnerHTML={{ __html: html || '<p>Nada que mostrar todavía.</p>' }} />
        ) : (
          <textarea id="publish-content" value={content} onChange={event => setContent(event.target.value)} rows={12} placeholder="Cuéntanos con detalle. Puedes usar **negritas**, listas y [enlaces](https://...) con Markdown." />
        )}
        <small className={contentLength > CONTENT_MAX ? 'is-bad' : ''}>{contentLength} / {CONTENT_MAX}{contentLength > 0 && contentLength < CONTENT_MIN ? ` · mínimo ${CONTENT_MIN}` : ''}</small>
      </div>

      <div className="publish-field">
        <label htmlFor="publish-tags">Etiquetas <span className="publish-optional">(hasta {TAGS_MAX}, opcional)</span></label>
        <div className="publish-tags">
          {tags.map(tag => (
            <span key={tag} className="publish-tag">#{tag}<button type="button" aria-label={`Quitar ${tag}`} onClick={() => setTags(previous => previous.filter(item => item !== tag))}><X size={12} /></button></span>
          ))}
          {tags.length < TAGS_MAX && (
            <input id="publish-tags" value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={onTagKey} onBlur={() => { addTag(tagInput); setTagInput('') }} placeholder={tags.length === 0 ? 'react, testing, carrera… (Enter para agregar)' : ''} />
          )}
        </div>
      </div>

      {error && <div className="publish-error" role="alert">{error}</div>}

      <div className="publish-actions">
        <button type="button" className="publish-submit" disabled={!ready || busy} onClick={submit}>{busy ? 'Publicando…' : 'Publicar'}</button>
      </div>
    </div>
  )
}
