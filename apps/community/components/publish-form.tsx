'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bold, Code, Heading2, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, Quote, SquareCode, X } from 'lucide-react'
import { getToken } from '../lib/session'
import { renderUserMarkdown } from '../lib/user-markdown'
import { applyFormat, insertAtCursor, type FormatAction } from '../lib/markdown-toolbar'
import { clearFeedCache } from './community-hub'
import { TagPicker } from './tag-picker'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Los mismos límites que el servidor (backend/services/community/post-rules.ts): si cambian allá, cambian aquí.
export const TITLE_MIN = 8
export const TITLE_MAX = 140
export const CONTENT_MIN = 20
export const CONTENT_MAX = 10000
export const TAGS_MAX = 5
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Por ahora solo hay discusiones; los proyectos están en pausa (ver backend/services/community/post-rules.ts).
const TYPE = 'discussion' as const

export const DRAFT_KEY = 'avo_post_draft'

const TOOLS: { action: FormatAction; label: string; icon: React.ReactNode }[] = [
  { action: 'bold', label: 'Negritas', icon: <Bold size={18} /> },
  { action: 'italic', label: 'Cursiva', icon: <Italic size={18} /> },
  { action: 'link', label: 'Enlace', icon: <LinkIcon size={18} /> },
  { action: 'ol', label: 'Lista numerada', icon: <ListOrdered size={18} /> },
  { action: 'ul', label: 'Lista con viñetas', icon: <List size={18} /> },
  { action: 'heading', label: 'Subtítulo', icon: <Heading2 size={18} /> },
  { action: 'quote', label: 'Cita', icon: <Quote size={18} /> },
  { action: 'code', label: 'Código en línea', icon: <Code size={18} /> },
  { action: 'codeblock', label: 'Bloque de código', icon: <SquareCode size={18} /> },
]

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
}

interface Draft { title: string; content: string; tags: string[]; cover: string | null }

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { title: String(parsed.title ?? ''), content: String(parsed.content ?? ''), tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [], cover: typeof parsed.cover === 'string' ? parsed.cover : null }
  } catch {
    return null
  }
}

/**
 * El editor de publicaciones: pantalla completa, portada, título grande, etiquetas, barra de formato y el texto en
 * Markdown, con vista previa. Se escribe sin miedo a perderlo: el borrador se guarda solo en este navegador.
 * Solo para miembros con el perfil completo (lo exige el servidor).
 */
export function PublishForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [cover, setCover] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [restored, setRestored] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  // Dónde queda la selección (y cuánto llevaba de scroll) después de aplicar un formato; se restaura antes de pintar.
  const pendingSelection = useRef<{ start: number; end: number; top: number; pageY: number } | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const bodyInput = useRef<HTMLInputElement>(null)
  const loaded = useRef(false)

  // Se recupera el borrador una sola vez, al entrar.
  useEffect(() => {
    const draft = loadDraft()
    if (draft && (draft.title || draft.content || draft.tags.length || draft.cover)) {
      setTitle(draft.title)
      setContent(draft.content)
      setTags(draft.tags)
      setCover(draft.cover)
      setRestored(true)
    }
    loaded.current = true
  }, [])

  // El borrador se guarda solo, un instante después de dejar de escribir.
  useEffect(() => {
    if (!loaded.current) return
    const timer = setTimeout(() => {
      try {
        if (!title && !content && tags.length === 0 && !cover) localStorage.removeItem(DRAFT_KEY)
        else localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, tags, cover } satisfies Draft))
      } catch {
        // sin almacenamiento no hay borrador, pero se puede publicar igual
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [title, content, tags, cover])

  const titleLength = title.trim().length
  const contentLength = content.trim().length
  const ready = titleLength >= TITLE_MIN && titleLength <= TITLE_MAX && contentLength >= CONTENT_MIN && contentLength <= CONTENT_MAX
  const html = useMemo(() => (preview ? renderUserMarkdown(content) : ''), [preview, content])

  function flash(text: string) {
    setNote(text)
    setTimeout(() => setNote(''), 2500)
  }

  /** Sube una imagen al servidor y devuelve su dirección, o muestra por qué no se pudo. */
  async function upload(file: File): Promise<string | null> {
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { setError('La imagen debe ser PNG, JPG, WEBP o GIF.'); return null }
    if (file.size > MAX_IMAGE_BYTES) { setError('La imagen pesa más de 5 MB.'); return null }
    setError('')
    setUploading(true)
    try {
      const dataUrl = await readAsDataUrl(file)
      const res = await fetch(`${API_URL}/api/community/posts/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ dataUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.message || 'No se pudo subir la imagen.'); return null }
      return data.url as string
    } catch {
      setError('No se pudo subir la imagen. Intenta de nuevo.')
      return null
    } finally {
      setUploading(false)
    }
  }

  async function onCoverPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const url = await upload(file)
    if (url) setCover(url)
  }

  async function onBodyImagePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const url = await upload(file)
    if (!url) return
    const element = textarea.current
    const edit = insertAtCursor(content, element?.selectionStart ?? content.length, element?.selectionEnd ?? content.length, `![${file.name.replace(/\.[^.]+$/, '')}](${url})`)
    setContent(edit.value)
  }

  function format(action: FormatAction) {
    const element = textarea.current
    if (!element) return
    const edit = applyFormat(content, element.selectionStart, element.selectionEnd, action)
    // Al cambiar el valor de un textarea el navegador manda el cursor y el scroll hasta el final: se guardan los de
    // antes y se restauran en useLayoutEffect, para que dar clic en una letra de la barra no lleve el texto hasta abajo.
    pendingSelection.current = { start: edit.start, end: edit.end, top: element.scrollTop, pageY: window.scrollY }
    setContent(edit.value)
  }

  useLayoutEffect(() => {
    const pending = pendingSelection.current
    const element = textarea.current
    if (!pending || !element) return
    pendingSelection.current = null
    element.focus({ preventScroll: true })
    element.setSelectionRange(pending.start, pending.end)
    element.scrollTop = pending.top
    window.scrollTo(0, pending.pageY)
  }, [content])

  async function submit() {
    if (!ready || busy || uploading) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/community/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          type: TYPE,
          title: title.trim(),
          content: content.trim(),
          tags,
          ...(cover ? { imageUrl: cover } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'No se pudo publicar. Intenta de nuevo.')
        setBusy(false)
        return
      }
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* nada que borrar */ }
      clearFeedCache() // el feed vuelve a pedirse y la publicación aparece
      router.push(`/post/${data.post.id}`)
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.')
      setBusy(false)
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, tags, cover } satisfies Draft))
      flash('Borrador guardado en este navegador')
    } catch {
      flash('No se pudo guardar el borrador')
    }
  }

  return (
    <div className="editor-overlay">
      <header className="editor-top">
        <Link href="/" className="editor-brand" aria-label="AvoTalent">
          <img src="/avotalent-logo.png" alt="" width={34} height={34} />
          <span>Crear publicación</span>
        </Link>
        <div className="editor-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={!preview ? 'is-active' : ''} onClick={() => setPreview(false)}>Editar</button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? 'is-active' : ''} onClick={() => setPreview(true)}>Vista previa</button>
        </div>
        <button type="button" className="editor-close" aria-label="Cerrar el editor" onClick={() => router.back()}><X size={22} /></button>
      </header>

      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-card">
            {preview ? (
              <article className="editor-preview">
                {cover && <img className="editor-preview-cover" src={cover} alt="" />}
                <h1>{title.trim() || 'Sin título'}</h1>
                {tags.length > 0 && <p className="editor-preview-tags">{tags.map(tag => <span key={tag}>#{tag}</span>)}</p>}
                <div className="detail-body editorial-content" dangerouslySetInnerHTML={{ __html: html || '<p>Nada que mostrar todavía.</p>' }} />
              </article>
            ) : (
              <>
                <div className="editor-cover">
                  {cover ? (
                    <>
                      <img src={cover} alt="Portada de la publicación" />
                      <button type="button" className="editor-btn" onClick={() => coverInput.current?.click()} disabled={uploading}>Cambiar</button>
                      <button type="button" className="editor-btn is-danger" onClick={() => setCover(null)}>Quitar</button>
                    </>
                  ) : (
                    <button type="button" className="editor-btn" onClick={() => coverInput.current?.click()} disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir imagen de portada'}</button>
                  )}
                  <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onCoverPicked} aria-label="Elegir imagen de portada" />
                </div>

                <textarea
                  className="editor-title"
                  aria-label="Título"
                  value={title}
                  rows={1}
                  maxLength={TITLE_MAX + 20}
                  placeholder="Título de tu publicación…"
                  onChange={event => { setTitle(event.target.value.replace(/\n/g, ' ')); event.target.style.height = 'auto'; event.target.style.height = `${event.target.scrollHeight}px` }}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); textarea.current?.focus() } }}
                />

                <TagPicker value={tags} onChange={setTags} max={TAGS_MAX} />

                <div className="editor-toolbar" role="toolbar" aria-label="Formato">
                  {TOOLS.map(tool => (
                    <button key={tool.action} type="button" title={tool.label} aria-label={tool.label} onMouseDown={event => event.preventDefault()} onClick={() => format(tool.action)}>{tool.icon}</button>
                  ))}
                  <button type="button" title="Insertar imagen" aria-label="Insertar imagen" onClick={() => bodyInput.current?.click()} disabled={uploading}><ImagePlus size={18} /></button>
                  <input ref={bodyInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onBodyImagePicked} aria-label="Elegir imagen para el texto" />
                </div>

                <textarea
                  ref={textarea}
                  className="editor-body"
                  aria-label="Contenido"
                  value={content}
                  onChange={event => setContent(event.target.value)}
                  placeholder="Escribe aquí tu publicación…"
                  rows={14}
                />
              </>
            )}
          </div>

          <div className="editor-meta">
            <span className={titleLength > TITLE_MAX || (titleLength > 0 && titleLength < TITLE_MIN) ? 'is-bad' : ''}>Título {titleLength}/{TITLE_MAX}{titleLength > 0 && titleLength < TITLE_MIN ? ` · mínimo ${TITLE_MIN}` : ''}</span>
            <span className={contentLength > CONTENT_MAX || (contentLength > 0 && contentLength < CONTENT_MIN) ? 'is-bad' : ''}>Contenido {contentLength}/{CONTENT_MAX}{contentLength > 0 && contentLength < CONTENT_MIN ? ` · mínimo ${CONTENT_MIN}` : ''}</span>
            {restored && <span>Recuperamos tu borrador</span>}
          </div>

          {error && <div className="publish-error" role="alert">{error}</div>}

          <div className="editor-actions">
            <button type="button" className="editor-publish" disabled={!ready || busy || uploading} onClick={submit}>{busy ? 'Publicando…' : 'Publicar'}</button>
            <button type="button" className="editor-draft" onClick={saveDraft}>Guardar borrador</button>
            {note && <span className="editor-note" role="status">{note}</span>}
          </div>
        </div>

        <aside className="editor-tips">
          <h2>Consejos para publicar</h2>
          <ul>
            <li>Una portada hace que tu publicación destaque en el inicio y al compartirla.</li>
            <li>Un buen título dice de qué trata: una pregunta concreta se responde mejor.</li>
            <li>Agrega etiquetas (react, qa, carrera…) para que quien busca ese tema te encuentre.</li>
            <li>Escribe en Markdown: <code>**negritas**</code>, listas, enlaces y bloques de código. La vista previa te muestra cómo quedará.</li>
            <li>Sé claro y respetuoso. Quien comente aprende de lo que compartes.</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
