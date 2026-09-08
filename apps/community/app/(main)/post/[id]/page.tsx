'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowBigUp, Bookmark, MessageCircle, Share2, Send, Clock3, ShieldCheck, LockKeyhole } from 'lucide-react'
import { marked } from 'marked'
import { useShell } from '../../../../lib/shell-context'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

marked.setOptions({ breaks: true, gfm: true })

interface PostData {
  id: string
  type: string
  title: string
  content?: string
  excerpt?: string
  author: { id: string | null; username: string; display_name: string; photo_url: string | null }
  tags: string[]
  votesCount: number
  commentsCount: number
  image_url?: string | null
  slug?: string
  word_count?: number
  created_at: string
  comments?: Array<{ id: string; content: string; author: { username: string; display_name: string }; created_at: string }>
}

function formatTime(dateStr: string) {
  if (!dateStr) return 'reciente'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days}d`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function maskContact(content: string): string {
  const lines = content.split('\n')
  const contactStart = lines.findIndex(l => /###\s*Contacto/i.test(l))
  if (contactStart < 0) return content

  const before = lines.slice(0, contactStart).join('\n')
  const masked = [
    '',
    '### Contacto',
    '',
    '<div style="padding:16px;background:#1c2430;border-radius:8px;text-align:center;border:1px dashed #30363d">',
    '<p style="color:#8b949e;margin:0 0 8px">🔒 Regístrate para ver los datos de contacto</p>',
    '<p style="color:#8b949e;margin:0;font-size:13px">Email, teléfono, WhatsApp y enlace de aplicación</p>',
    '</div>',
  ].join('\n')

  return [before, masked].join('\n')
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, requestAuth } = useShell()
  // router.back() returns to whatever page the user actually came from
  // (feed, another post, a search) instead of a fixed guess at the tab.
  const goBack = () => router.back()
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [votes, setVotes] = useState(0)
  const [saved, setSaved] = useState(false)
  const [following, setFollowing] = useState(false)
  const [reply, setReply] = useState('')
  const [sent, setSent] = useState(false)

  // Opening a post shouldn't inherit whatever scroll depth the feed was at —
  // it should always start at the top. router.back() to return to the feed
  // still uses the browser's own scroll restoration, so that side is
  // untouched.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`${API_URL}/api/community/posts/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Post no encontrado')
        return res.json()
      })
      .then(data => {
        setPost(data)
        setVotes(data.votesCount || 0)
        setLoading(false)
      })
      .catch(() => {
        setError('Publicación no encontrada')
        setLoading(false)
      })
  }, [id])

  function submitReply() { if (!reply.trim()) return; setSent(true); setReply('') }

  if (loading) {
    return (
      <div className="post-detail-wrap">
        <button onClick={goBack} className="back-link"><ArrowLeft size={16} /> Volver</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p style={{ color: '#8b949e' }}>Cargando publicación...</p>
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="post-detail-wrap">
        <button onClick={goBack} className="back-link"><ArrowLeft size={16} /> Volver</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p style={{ color: '#8b949e' }}>Publicación no encontrada</p>
        </div>
      </div>
    )
  }

  const isEditorial = post.type === 'editorial'
  const isJob = post.type === 'job'
  const isShowcase = post.type === 'showcase'
  // A post only has no real author when it fell back to the CMS "content"
  // table (backend marks that with author.id === null) — genuine AvoTalent
  // editorial content. A community post of type "editorial" with a real
  // author.id still shows the actual person who posted it.
  const hasRealAuthor = !!post.author?.id
  const authorName = hasRealAuthor ? (post.author?.display_name || post.author?.username || 'Anónimo') : 'AvoTalent'
  const initials = hasRealAuthor ? authorName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'AT'
  const time = formatTime(post.created_at)
  const readingTime = post.word_count ? `${Math.max(1, Math.round(post.word_count / 200))} min de lectura` : '5 min de lectura'

  const displayContent = (isJob && !user && post.content) ? maskContact(post.content) : post.content

  return (
    <div className="post-detail-wrap">
      <div className="detail-toolbar">
        <button onClick={goBack} className="back-link"><ArrowLeft size={16} /> Volver</button>
        <div className="detail-toolbar-actions">
          <button className="detail-rail-action" onClick={() => setVotes(votes + 1)} aria-label="Votar"><ArrowBigUp size={18} /><span>{votes}</span></button>
          <a href="#conversation" className="detail-rail-action" aria-label="Ir a conversación"><MessageCircle size={18} /><span>{post.commentsCount || 0}</span></a>
          <button className={`detail-rail-action ${saved ? 'is-active' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={18} /></button>
          <button className="detail-rail-action" onClick={() => navigator.clipboard?.writeText(window.location.href)} aria-label="Compartir"><Share2 size={18} /></button>
        </div>
      </div>
      <article className={`post-detail-card detail-${post.type}`}>
        <div className="detail-context">
          <span className="detail-kicker">{isEditorial ? 'ARTÍCULO' : isJob ? 'VACANTE / PROYECTO' : isShowcase ? 'MOSTRAR PROYECTO' : 'POST NORMAL'}</span>
          <span className="context-divider">/</span>
          <span>{isJob ? 'Oportunidad verificada' : isShowcase ? 'Proyecto de la comunidad' : !hasRealAuthor ? 'Artículo de AvoTalent' : isEditorial ? 'Artículo' : 'Discusión técnica'}</span>
          <span className="context-spacer" />
          <span className="context-read"><Clock3 size={14} /> {readingTime}</span>
        </div>

        <header className="detail-author">
          <Link
            href={hasRealAuthor && post.author?.username ? `/users/${post.author.username}` : '#'}
            className="author-link"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
            onClick={e => (!hasRealAuthor || !post.author?.username) && e.preventDefault()}
          >
            <div className={`avatar ${isEditorial ? 'avatar-cyan' : isShowcase ? 'avatar-violet' : isJob ? 'avatar-emerald' : 'avatar-cyan'}`}>
              {hasRealAuthor && post.author?.photo_url ? (
                <img src={post.author.photo_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : !hasRealAuthor ? (
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#00A86B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0d1117' }}>A</div>
              ) : initials}
            </div>
            <div className="author-info">
              <div className="author-line">
                <strong>{authorName}</strong>
                {!hasRealAuthor && <ShieldCheck size={14} className="verified" />}
                {hasRealAuthor && <span className="member-pill">Miembro</span>}
              </div>
              <div className="detail-meta">
                <span>{time}</span>
                <span>·</span>
                <span>Publicado en AvoTalent</span>
              </div>
            </div>
          </Link>
          {!isEditorial && (
            <button className={`follow-button ${following ? 'following' : ''}`} onClick={() => setFollowing(!following)}>
              {following ? 'Siguiendo' : 'Seguir autor'}
            </button>
          )}
        </header>

        <h1>{post.title}</h1>

        {isEditorial && post.image_url && (
          <div style={{ margin: '16px 0', borderRadius: 12, overflow: 'hidden' }}>
            <img src={post.image_url} alt={post.title} style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        {post.excerpt && <p className="detail-lead">{post.excerpt}</p>}

        {isEditorial && displayContent && (
          <div
            className="editorial-content"
            dangerouslySetInnerHTML={{ __html: marked.parse(displayContent) as string }}
            style={{ marginTop: 16, lineHeight: 1.7, color: '#c9d1d9' }}
          />
        )}

        {!isEditorial && displayContent && (
          <div
            className="job-content"
            dangerouslySetInnerHTML={{ __html: marked.parse(displayContent) as string }}
            style={{ marginTop: 16, lineHeight: 1.7, color: '#c9d1d9' }}
          />
        )}

        {isJob && !user && (
          <div style={{ marginTop: 20, padding: '16px 20px', background: '#1c2430', border: '1px solid #30363d', borderRadius: 10, textAlign: 'center' }}>
            <LockKeyhole size={24} style={{ color: '#8b949e', marginBottom: 8 }} />
            <h3 style={{ color: '#c9d1d9', margin: '0 0 8px', fontSize: 16 }}>¿Interesado en esta vacante?</h3>
            <p style={{ color: '#8b949e', margin: '0 0 16px', fontSize: 14 }}>Regístrate para acceder al email, teléfono, WhatsApp y enlace de aplicación.</p>
            <button
              onClick={requestAuth}
              style={{ padding: '10px 24px', background: '#10b981', color: '#0d1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Crear cuenta gratis
            </button>
          </div>
        )}

        {post.tags && post.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {post.tags.map(tag => (
              <span key={tag} style={{ padding: '4px 10px', background: '#21262d', borderRadius: 6, fontSize: 12, color: '#8b949e' }}>#{tag}</span>
            ))}
          </div>
        )}
      </article>

      <section id="conversation" className="comment-section" style={{ marginTop: 24 }}>
        <h3 style={{ color: '#c9d1d9', fontSize: 16, marginBottom: 16 }}>Conversación</h3>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#21262d', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Escribe un comentario..."
              style={{ width: '100%', minHeight: 80, padding: '10px 14px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#c9d1d9', fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={submitReply}
                disabled={!reply.trim()}
                style={{ padding: '8px 16px', background: reply.trim() ? '#00A86B' : '#21262d', color: reply.trim() ? '#fff' : '#8b949e', border: 'none', borderRadius: 6, cursor: reply.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={14} /> Comentar
              </button>
            </div>
          </div>
        </div>

        {sent && (
          <div style={{ padding: '12px 16px', background: '#0d2818', border: '1px solid #166534', borderRadius: 8, color: '#4ade80', fontSize: 13, marginBottom: 16 }}>
            Comentario publicado
          </div>
        )}

        {post.comments && post.comments.length > 0 ? (
          post.comments.map((comment: any) => (
            <div key={comment.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #21262d' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {comment.author?.display_name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2) || '?'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ color: '#c9d1d9', fontSize: 13 }}>{comment.author?.display_name || 'Anónimo'}</strong>
                  <span style={{ color: '#8b949e', fontSize: 12 }}>{formatTime(comment.created_at)}</span>
                </div>
                <p style={{ color: '#c9d1d9', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{comment.content}</p>
              </div>
            </div>
          ))
        ) : (
          <p style={{ color: '#8b949e', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Sé el primero en comentar</p>
        )}
      </section>
    </div>
  )
}
