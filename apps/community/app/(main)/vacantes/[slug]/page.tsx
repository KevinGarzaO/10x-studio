'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowBigUp, Bookmark, MessageCircle, Share2, Send, CheckCircle2, LockKeyhole, MapPin, Home as HomeIcon } from 'lucide-react'
import { marked } from 'marked'
import { useShell } from '../../../../lib/shell-context'
import { companySlug, formatCompanyName } from '../../../../lib/company'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Only these ATS providers are known to allow being embedded in an iframe.
// Everything else (e.g. Platzi) sends X-Frame-Options/CSP headers that block
// embedding silently — the iframe just spins forever with no error, so for
// those we open the apply link in a new tab instead.
const IFRAME_EMBEDDABLE_PLATFORMS = new Set(['greenhouse', 'lever', 'workable'])

function DetailAvatar({ company, logoUrl }: { company: string; logoUrl?: string | null }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const initials = company.slice(0, 2).toUpperCase()
  const showLogo = logoUrl && !logoFailed
  return (
    <div style={{ width: 56, height: 56, minWidth: 56, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #30363d', flexShrink: 0, position: 'relative' }}>
      {showLogo && <img src={logoUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={() => setLogoFailed(true)} />}
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
  source_url?: string | null
  source_name?: string | null
  contacts?: Record<string, any> | null
  comments?: Array<{ id: string; content: string; author: { username: string; display_name: string }; created_at: string }>
  company?: string | null
  company_logo?: string | null
  is_scraper_post?: boolean
}

function buildApplyUrl(platform: string | null, sourceUrl: string | null): string | null {
  if (!platform || !sourceUrl) return null
  if (platform === 'lever') {
    return sourceUrl.endsWith('/apply') ? sourceUrl : `${sourceUrl}/apply`
  }
  if (platform === 'workable') {
    // Workable's widget router needs a trailing slash on /apply/ — without
    // it, the SPA silently falls back to the Overview tab instead of 404ing.
    const base = sourceUrl.replace(/\/(apply\/?)?$/, '')
    return `${base}/apply/`
  }
  if (platform === 'greenhouse') {
    return `${sourceUrl}#app`
  }
  return sourceUrl
}

export default function VacancyPage() {
  const { slug } = useParams<{ slug: string }>()
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
  const [reply, setReply] = useState('')
  const [sent, setSent] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [applySuccess, setApplySuccess] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Opening a vacancy shouldn't inherit whatever scroll depth the feed was
  // at — it should always start at the top. router.back() to return to the
  // feed still uses the browser's own scroll restoration, so that side is
  // untouched.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  // Detect postMessage from ATS iframes (application submitted)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      const data = e.data
      if (typeof data === 'string' && /submit|applied|success|application.?sent/i.test(data)) {
        setApplySuccess(true)
        return
      }
      if (typeof data === 'object' && data && /submit|applied|success/i.test(String(data.type || data.event || data.action))) {
        setApplySuccess(true)
      }
    }
    if (applyOpen) {
      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }
  }, [applyOpen])

  // Reset success state when modal closes
  useEffect(() => {
    if (!applyOpen) setApplySuccess(false)
  }, [applyOpen])

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

        // Fetch full content from ATS API if source_url is available
        if (data.source_url) {
          fetchAtsContent(data.source_url)
        }
      })
      .catch(() => { setError('Publicación no encontrada'); setLoading(false) })
  }, [slug])

  function submitReply() { if (!reply.trim()) return; setSent(true); setReply('') }

  async function fetchAtsContent(url: string) {
    try {
      // Greenhouse: https://job-boards.greenhouse.io/twilio/jobs/12345
      const ghMatch = url.match(/greenhouse\.io\/([^/]+)\/jobs\/(\d+)/)
      if (ghMatch) {
        const [, board, job_id] = ghMatch
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${job_id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.content) {
            const decoded = unescapeHtml(data.content)
            setFullContent(decoded)
          }
        }
        return
      }

      // Lever: https://jobs.lever.co/{company}/{id}
      const lvMatch = url.match(/lever\.co\/([^/]+)\/([a-f0-9]+)/)
      if (lvMatch) {
        const [, company] = lvMatch
        const postingsRes = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`)
        if (postingsRes.ok) {
          const postings = await postingsRes.json()
          const posting = postings.find((p: any) => url.includes(p.id) || url.includes(p.hostedUrl?.split('/').pop()))
          if (posting?.description) {
            setFullContent(posting.description)
          }
        }
        return
      }

      // Workable: different structure, skip for now
    } catch {
      // Silently fail - we'll show the enriched content
    }
  }

  if (loading) {
    return (
      <div className="post-detail-wrap">
        <button onClick={goBack} className="back-link"><ArrowLeft size={16} /> Volver</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p style={{ color: '#8b949e' }}>Cargando vacante...</p>
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="post-detail-wrap">
        <button onClick={goBack} className="back-link"><ArrowLeft size={16} /> Volver</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p style={{ color: '#8b949e' }}>Vacante no encontrada</p>
        </div>
      </div>
    )
  }

  const rawContent = fullContent || post.content || post.original_text || ''
  const cleanContent = fullContent ? unescapeHtml(fullContent) : stripMetadata(rawContent, post.title)
  const renderedHtml = renderContent(cleanContent)
  const meta = parseJobMetadata(rawContent)
  const time = formatTime(post.created_at)
  const isScraped = post.is_scraper_post
  const companyName = formatCompanyName(post.company || meta.company) || 'Comunidad'
  const applyUrl = buildApplyUrl(post.platform ?? null, post.source_url ?? null)
  const canEmbedApply = !!post.platform && IFRAME_EMBEDDABLE_PLATFORMS.has(post.platform)

  function handleApplyClick() {
    if (!applyUrl) return
    if (canEmbedApply) {
      setApplyOpen(true)
    } else {
      window.open(applyUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
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
              <Link href={`/empresas/${companySlug(companyName)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
                <DetailAvatar company={companyName} logoUrl={post.company_logo} />
                <div className="author-info">
                  <div className="author-line">
                    <strong>{companyName}</strong>
                    {!isScraped && <span className="verified-pill"><CheckCircle2 size={12} /> Verificada</span>}
                  </div>
                  <div className="detail-meta">
                    <span>{time}</span>
                  </div>
                </div>
              </Link>
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

            {applyUrl && user && (
              <button
                onClick={handleApplyClick}
                style={{ marginTop: 20, padding: '12px 24px', background: '#10b981', color: '#0d1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                Postularse ahora
              </button>
            )}

            {applyUrl && !user && (
              <div style={{ marginTop: 24, padding: '20px 24px', background: '#1c2430', border: '1px solid #30363d', borderRadius: 10, textAlign: 'center' }}>
                <LockKeyhole size={24} style={{ color: '#10b981', marginBottom: 10 }} />
                <h3 style={{ color: '#c9d1d9', margin: '0 0 8px', fontSize: 16 }}>¿Interesado en esta vacante?</h3>
                <p style={{ color: '#8b949e', margin: '0 0 16px', fontSize: 14 }}>Regístrate gratis para acceder al email, teléfono, WhatsApp y enlace de aplicación.</p>
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

      {applyOpen && applyUrl && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: window.innerWidth < 640 ? 8 : 20 }}
          onMouseDown={e => e.target === e.currentTarget && setApplyOpen(false)}
        >
          {applySuccess ? (
            <div style={{ width: '100%', maxWidth: 400, background: '#161b22', borderRadius: 12, border: '1px solid #30363d', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h3 style={{ color: '#c9d1d9', fontSize: 18, marginBottom: 8 }}>¡Aplicación enviada!</h3>
              <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 20 }}>Tu postulación a <strong style={{ color: '#c9d1d9' }}>{companyName}</strong> fue enviada exitosamente.</p>
              <button onClick={() => setApplyOpen(false)} style={{ background: '#10b981', color: '#0d1117', border: 'none', padding: '10px 24px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cerrar</button>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 750, height: window.innerWidth < 640 ? '95vh' : '90vh', background: '#161b22', borderRadius: window.innerWidth < 640 ? 8 : 12, border: '1px solid #30363d', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #30363d', background: '#0d1117' }}>
                <span style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 600 }}>Postularse — {companyName}</span>
                <button
                  onClick={() => setApplyOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20, padding: 4 }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              {post.platform === 'greenhouse' && (
                <div style={{ padding: '6px 14px', background: '#1c2430', borderBottom: '1px solid #30363d', fontSize: 11, color: '#8b949e' }}>
                  Haz clic en <strong style={{ color: '#10b981' }}>Apply</strong> dentro del formulario para completar tu postulación
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={applyUrl}
                style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
                title="Formulario de aplicación"
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
