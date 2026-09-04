'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, ArrowBigUp, Bookmark, MessageCircle, Share2, Send, BriefcaseBusiness, CheckCircle2, Clock3, Users, Flame, ShieldCheck, MoreHorizontal } from 'lucide-react'
import { marked } from 'marked'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

marked.setOptions({ breaks: true, gfm: true })

interface PostData {
  id: string
  type: string
  title: string
  content?: string
  excerpt?: string
  author: { id: string | null; username: string; display_name: string; avatar_url: string | null }
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

function DetailSidebar() {
  return (
    <aside className="detail-sidebar">
      <section className="widget">
        <div className="widget-title"><span>Conversaciones en fuego</span><Flame size={16} /></div>
        {[['¿El fin de los microservicios?', '128 respuestas'], ['IA generativa en producción', '57 respuestas'], ['Construir para la comunidad', '41 respuestas']].map(([title, replies], i) => (
          <div className="trend-item" key={title}><span className="trend-number">0{i + 1}</span><span><strong>{title}</strong><small>{replies}</small></span></div>
        ))}
        <Link href="/" className="see-all">Ver todas las tendencias <ArrowBigUp size={14} /></Link>
      </section>
      <section className="widget opportunities">
        <div className="widget-title"><span>Oportunidades destacadas</span><BriefcaseBusiness size={16} /></div>
        {[['Frontend Engineer · React', 'Producto B2B · Remoto en Latam', '$40–55 / hr'], ['DevOps / Cloud Engineer', 'Startup seed · España / Remoto', 'Proyecto fijo']].map(([title, company, budget]) => (
          <div className="mini-job" key={title}>
            <div className="mini-job-top"><span className="verified-pill"><CheckCircle2 size={12} /> Verificada</span><span className="mini-time">3d restantes</span></div>
            <strong>{title}</strong><p>{company}</p>
            <div className="mini-job-bottom"><span>{budget}</span><Link href="/">Ver detalles <ArrowLeft size={13} style={{ transform: 'rotate(180deg)' }} /></Link></div>
          </div>
        ))}
      </section>
      <section className="widget community-widget">
        <div className="widget-title"><span>La comunidad</span><Users size={16} /></div>
        <div className="community-stats"><div><strong>18.4k</strong><small>miembros</small></div><div><strong>2.1k</strong><small>publicaciones</small></div><div><strong>94%</strong><small>responden</small></div></div>
        <div className="online-line"><span className="online-dot" /> 342 developers online</div>
      </section>
    </aside>
  )
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>()
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [votes, setVotes] = useState(0)
  const [saved, setSaved] = useState(false)
  const [following, setFollowing] = useState(false)
  const [reply, setReply] = useState('')
  const [sent, setSent] = useState(false)

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
      <main className="post-detail-page">
        <div className="post-detail-layout">
          <aside className="detail-rail">
            <Link href="/" className="back-link"><ArrowLeft size={16} /> Feed</Link>
          </aside>
          <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <p style={{ color: '#8b949e' }}>Cargando publicación...</p>
          </div>
        </div>
      </main>
    )
  }

  if (error || !post) {
    return (
      <main className="post-detail-page">
        <div className="post-detail-layout">
          <aside className="detail-rail">
            <Link href="/" className="back-link"><ArrowLeft size={16} /> Feed</Link>
          </aside>
          <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#8b949e', marginBottom: 12 }}>Publicación no encontrada</p>
              <Link href="/" style={{ color: '#3b82f6' }}>Volver al feed</Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const isEditorial = post.type === 'editorial'
  const isJob = post.type === 'job'
  const isShowcase = post.type === 'showcase'
  const authorName = isEditorial ? 'Avocado Studio' : post.author?.display_name || 'Anónimo'
  const initials = isEditorial ? 'AS' : post.author?.display_name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'
  const time = formatTime(post.created_at)
  const readingTime = post.word_count ? `${Math.max(1, Math.round(post.word_count / 200))} min de lectura` : '5 min de lectura'

  return (
    <main className="post-detail-page">
      <div className="post-detail-layout">
        <aside className="detail-rail">
          <Link href="/" className="back-link"><ArrowLeft size={16} /> Feed</Link>
          <button className="detail-rail-action" onClick={() => setVotes(votes + 1)} aria-label="Votar"><ArrowBigUp size={20} /><span>{votes}</span></button>
          <a href="#conversation" className="detail-rail-action" aria-label="Ir a conversación"><MessageCircle size={20} /><span>{post.commentsCount || 0}</span></a>
          <button className={`detail-rail-action ${saved ? 'is-active' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={20} /></button>
          <button className="detail-rail-action" onClick={() => navigator.clipboard?.writeText(window.location.href)} aria-label="Compartir"><Share2 size={20} /></button>
        </aside>

        <div className="post-detail-wrap">
          <article className={`post-detail-card detail-${post.type}`}>
            <div className="detail-context">
              <span className="detail-kicker">{isEditorial ? 'ARTÍCULO' : isJob ? 'VACANTE / PROYECTO' : isShowcase ? 'MOSTRAR PROYECTO' : 'POST NORMAL'}</span>
              <span className="context-divider">/</span>
              <span>{isJob ? 'Oportunidad verificada' : isShowcase ? 'Proyecto de la comunidad' : isEditorial ? 'Artículo de Avocado' : 'Discusión técnica'}</span>
              <span className="context-spacer" />
              <span className="context-read"><Clock3 size={14} /> {readingTime}</span>
            </div>

            <header className="detail-author">
              <div className={`avatar ${isEditorial ? 'avatar-cyan' : isShowcase ? 'avatar-violet' : isJob ? 'avatar-emerald' : 'avatar-cyan'}`}>
                {isEditorial ? (
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#00A86B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0d1117' }}>A</div>
                ) : initials}
              </div>
              <div className="author-info">
                <div className="author-line">
                  <strong>{authorName}</strong>
                  {isEditorial && <ShieldCheck size={14} className="verified" />}
                  {!isEditorial && <span className="member-pill">Miembro</span>}
                </div>
                <div className="detail-meta">
                  <span>{time}</span>
                  <span>·</span>
                  <span>Publicado en Avocado</span>
                </div>
              </div>
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

            {isEditorial && post.content && (
              <div
                className="editorial-content"
                dangerouslySetInnerHTML={{ __html: marked.parse(post.content) as string }}
                style={{ marginTop: 16, lineHeight: 1.7, color: '#c9d1d9' }}
              />
            )}

            {!isEditorial && post.content && (
              <p style={{ marginTop: 16, lineHeight: 1.7, color: '#c9d1d9' }}>{post.content}</p>
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

        <DetailSidebar />
      </div>
    </main>
  )
}
