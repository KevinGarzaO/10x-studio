'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowBigUp, Bookmark, MessageCircle, Share2, Send, CheckCircle2, LockKeyhole, MapPin, Home as HomeIcon } from 'lucide-react'
import { marked } from 'marked'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function DetailAvatar({ company }: { company: string }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const initials = company.slice(0, 2).toUpperCase()
  const domain = company.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
  const logoUrl = `${API_URL}/api/community/favicon?domain=${domain}.com`
  const showLogo = !logoFailed
  return (
    <div style={{ width: 56, height: 56, minWidth: 56, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #30363d', flexShrink: 0, position: 'relative' }}>
      {showLogo && <img src={logoUrl} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain', position: 'absolute' }} onError={() => setLogoFailed(true)} />}
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117', fontWeight: 800, fontSize: 18, zIndex: showLogo ? -1 : 0 }}>{initials}</div>
    </div>
  )
}

marked.setOptions({ breaks: true, gfm: true })

function unescapeHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content) && !content.trim().startsWith('##')
}

function stripMetadata(content: string, title: string): string {
  // Step 1: Remove contact section (everything from ### Contacto onwards, including inline)
  let result = content.replace(/\*{0,3}Contacto[\s\S]*/gi, '')
  // Step 2: Remove metadata lines (Empresa, Departamento, etc.)
  const lines = result.split('\n')
  const filtered = lines.filter(l => {
    const t = l.trim()
    if (!t) return true
    if (t === title || t === `## ${title}`) return false
    if (/^\*\*Empresa/i.test(t)) return false
    if (/^\*\*Rol/i.test(t)) return false
    if (/^\*\*Ubicaci/i.test(t)) return false
    if (/^\*\*Modalidad/i.test(t)) return false
    if (/^\*\*Presupuesto/i.test(t)) return false
    if (/^\*\*Departamento/i.test(t)) return false
    if (/^🔗/i.test(t)) return false
    return true
  })
  return filtered.join('\n').trim()
}

function parseJobMetadata(content: string) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  const company = lines.find(l => /\*\*Empresa:?\*\*/i.test(l))?.replace(/\*\*Empresa:?\*\*\s*/i, '') || null
  const role = lines.find(l => /\*\*Rol:?\*\*/i.test(l))?.replace(/\*\*Rol:?\*\*\s*/i, '') || null
  const location = lines.find(l => /\*\*Ubicaci[oó]n:?\*\*/i.test(l))?.replace(/\*\*Ubicaci[oó]n:?\*\*\s*/i, '') || null
  const salary = lines.find(l => /\*\*Presupuesto:?\*\*/i.test(l))?.replace(/\*\*Presupuesto:?\*\*\s*/i, '') || null
  const modality = lines.find(l => /\*\*Modalidad:?\*\*/i.test(l))?.replace(/\*\*Modalidad:?\*\*\s*/i, '') || null
  const department = lines.find(l => /\*\*Departamento:?\*\*/i.test(l))?.replace(/\*\*Departamento:?\*\*\s*/i, '') || null
  return { company, role, location, salary, modality, department }
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
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function renderContent(content: string): string {
  // Always unescape HTML entities first (ATS APIs return &lt;div&gt; etc.)
  let decoded = unescapeHtml(content)
  // Now check if it's actual HTML
  if (isHtmlContent(decoded)) {
    return decoded
  }
  return marked.parse(decoded) as string
}

interface PostData {
  id: string
  type: string
  title: string
  slug?: string
  content?: string
  original_text?: string
  author: { id: string | null; username: string; display_name: string; photo_url: string | null }
  tags: string[]
  votesCount: number
  commentsCount: number
  created_at: string
  platform?: string | null
  source_name?: string | null
  contacts?: Record<string, any> | null
  comments?: Array<{ id: string; content: string; author: { username: string; display_name: string }; created_at: string }>
  company?: string | null
  company_logo?: string | null
  is_scraper_post?: boolean
}

export default function VacancyPage() {
  const { slug } = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const backTab = searchParams.get('from') || ''
  const backHref = backTab ? `/?tab=${encodeURIComponent(backTab)}` : '/'
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [votes, setVotes] = useState(0)
  const [saved, setSaved] = useState(false)
  const [reply, setReply] = useState('')
  const [sent, setSent] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${API_URL}/api/community/posts/${slug}`)
      .then(res => { if (!res.ok) throw new Error('Post no encontrado'); return res.json() })
      .then(data => {
        if (data.slug && data.slug !== slug && !redirecting) {
          setRedirecting(true)
          window.history.replaceState({}, '', `/vacantes/${data.slug}`)
        }
        setPost(data)
        setVotes(data.votesCount || 0)
        setLoading(false)
      })
      .catch(() => { setError('Publicación no encontrada'); setLoading(false) })
  }, [slug])

  useEffect(() => {
    const token = localStorage.getItem('avocado_token')
    fetch(`${API_URL}/api/community/auth/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user || null))
      .catch(() => {})
  }, [])

  function submitReply() { if (!reply.trim()) return; setSent(true); setReply('') }

  if (loading) {
    return (
      <main className="post-detail-page">
        <div className="post-detail-layout">
          <aside className="detail-rail">
            <Link href={backHref} className="back-link"><ArrowLeft size={16} /> Volver</Link>
          </aside>
          <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <p style={{ color: '#8b949e' }}>Cargando vacante...</p>
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
            <Link href={backHref} className="back-link"><ArrowLeft size={16} /> Volver</Link>
          </aside>
          <div className="post-detail-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#8b949e', marginBottom: 12 }}>Vacante no encontrada</p>
              <Link href={backHref} style={{ color: '#3b82f6' }}>Volver al feed</Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const rawContent = post.content || post.original_text || ''
  const cleanContent = stripMetadata(rawContent, post.title)
  const renderedHtml = renderContent(cleanContent)
  const meta = parseJobMetadata(rawContent)
  const time = formatTime(post.created_at)
  const isScraped = post.is_scraper_post
  const companyName = post.company || meta.company || 'Comunidad'

  return (
    <main className="post-detail-page">
      <div className="post-detail-layout">
        <aside className="detail-rail">
          <Link href={backHref} className="back-link"><ArrowLeft size={16} /> Volver</Link>
          <button className="detail-rail-action" onClick={() => setVotes(votes + 1)} aria-label="Votar"><ArrowBigUp size={20} /><span>{votes}</span></button>
          <a href="#conversation" className="detail-rail-action" aria-label="Ir a conversación"><MessageCircle size={20} /><span>{post.commentsCount || 0}</span></a>
          <button className={`detail-rail-action ${saved ? 'is-active' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={20} /></button>
          <button className="detail-rail-action" onClick={() => navigator.clipboard?.writeText(window.location.href)} aria-label="Compartir"><Share2 size={16} /></button>
        </aside>

        <div className="post-detail-wrap">
          <article className="post-detail-card detail-job">
            <div className="detail-context">
              <span className="detail-kicker">VACANTE</span>
              {!isScraped && <>
                <span className="context-divider">/</span>
                <span>Oportunidad verificada</span>
              </>}
              <span className="context-spacer" />
            </div>

            <header className="detail-author">
              <DetailAvatar company={companyName} />
              <div className="author-info">
                <div className="author-line">
                  <strong>{companyName}</strong>
                  {!isScraped && <span className="verified-pill"><CheckCircle2 size={12} /> Verificada</span>}
                </div>
                <div className="detail-meta">
                  <span>{time}</span>
                </div>
              </div>
            </header>

            <h1>{post.title}</h1>

            {(() => {
              const chips: React.ReactNode[] = []
              const seen = new Set<string>()
              const addChip = (key: string, icon: React.ReactNode, text: string) => {
                const normalized = text.toLowerCase().trim()
                if (!text || seen.has(normalized)) return
                seen.add(normalized)
                chips.push(<span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#1c2430', borderRadius: 5, fontSize: 12, color: '#c9d1d9' }}>{icon} {text}</span>)
              }
              if (meta.location) addChip('loc', <MapPin size={12} />, meta.location)
              if (meta.modality) addChip('mod', <HomeIcon size={12} />, meta.modality)
              if (meta.department) addChip('dep', null, meta.department)
              if (meta.salary) chips.push(<span key="sal" style={{ padding: '4px 10px', background: '#0d3320', color: '#10b981', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{meta.salary}</span>)
              return chips.length > 0 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', margin: '12px 0 16px' }}>{chips}</div> : null
            })()}

            {renderedHtml && (
              <div
                className="job-content"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                style={{ marginTop: 16, lineHeight: 1.7, color: '#c9d1d9' }}
              />
            )}

            {!user && (
              <div style={{ marginTop: 24, padding: '20px 24px', background: '#1c2430', border: '1px solid #30363d', borderRadius: 10, textAlign: 'center' }}>
                <LockKeyhole size={24} style={{ color: '#10b981', marginBottom: 10 }} />
                <h3 style={{ color: '#c9d1d9', margin: '0 0 8px', fontSize: 16 }}>¿Interesado en esta vacante?</h3>
                <p style={{ color: '#8b949e', margin: '0 0 16px', fontSize: 14 }}>Regístrate gratis para acceder al email, teléfono, WhatsApp y enlace de aplicación.</p>
                <button
                  onClick={() => setAuthOpen(true)}
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
      </div>

      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && setAuthOpen(false)}>
          <section className="auth-modal" role="dialog" aria-modal="true">
            <div style={{ padding: 32, textAlign: 'center' }}>
              <LockKeyhole size={24} style={{ color: '#10b981', marginBottom: 12 }} />
              <h2 style={{ color: '#c9d1d9', fontSize: 20, marginBottom: 8 }}>Desbloquea esta oportunidad</h2>
              <p style={{ color: '#8b949e', marginBottom: 20 }}>Regístrate para acceder a los datos de contacto.</p>
              <Link href="/signup" style={{ display: 'inline-block', padding: '10px 20px', background: '#10b981', color: '#0d1117', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none', marginRight: 10 }}>Crear cuenta</Link>
              <Link href="/login" style={{ display: 'inline-block', padding: '10px 20px', background: 'transparent', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 8, fontSize: 14, textDecoration: 'none' }}>Iniciar sesión</Link>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
