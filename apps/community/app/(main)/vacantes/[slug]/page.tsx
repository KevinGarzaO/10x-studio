'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { BadgeCheck, Building, Check, LockKeyhole, MapPin } from 'lucide-react'
import { marked } from 'marked'
import { useShell } from '../../../../lib/shell-context'
import { getToken } from '../../../../lib/session'
import { companySlug, formatCompanyName } from '../../../../lib/company'
import { parseJobContent } from '../../../../components/community-hub'
import { DetailHeader } from '../../../../components/post-detail/DetailHeader'
import { DetailFooter } from '../../../../components/post-detail/DetailFooter'
import { DetailConversation, type DetailComment } from '../../../../components/post-detail/DetailConversation'
import { commentsOf, createComment } from '../../../../lib/post-comments'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../../../../lib/profile-options'

interface VacancyMatch {
  score: number
  role: 'exact' | 'adjacent' | 'unknown' | 'none'
  seniority: 'exact' | 'near' | 'unknown' | 'far'
  modality: 'match' | 'compatible' | 'unknown' | 'mismatch'
  sharedSkills: string[]
  validatedSkills?: { skill: string; level: 'basico' | 'intermedio' | 'avanzado' }[]
  vacancySkills: number
  qualifies: boolean
}

const ROLE_FIT_TEXT = { exact: 'Es tu mismo puesto', adjacent: 'Puesto cercano al tuyo', unknown: 'No indica el puesto', none: 'Otro puesto' }
const SENIORITY_FIT_TEXT = { exact: 'Tu nivel', near: 'Un nivel de diferencia', unknown: 'No indica nivel', far: 'Nivel muy distinto' }
const MODALITY_FIT_TEXT = { match: 'Tu modalidad', compatible: 'Modalidad compatible', unknown: 'No indica modalidad', mismatch: 'Otra modalidad' }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Only these ATS providers are known to allow being embedded in an iframe.
// Everything else (e.g. Platzi) sends X-Frame-Options/CSP headers that block
// embedding silently — the iframe just spins forever with no error, so for
// those we open the apply link in a new tab instead.
const IFRAME_EMBEDDABLE_PLATFORMS = new Set(['greenhouse', 'lever', 'workable'])

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
  return filtered
    .join('\n')
    .replace(/#{1,6}\s*$/, '')
    .replace(/\*{1,3}\s*$/, '')
    .trim()
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
  comments?: DetailComment[]
  community_comments?: DetailComment[]
  company?: string | null
  company_logo?: string | null
  is_scraper_post?: boolean
  /** Lo escribe el clasificador del scraper; puede venir vacío. */
  seniority_level?: string | null
  role_category?: string | null
  skills?: string[] | null
  modalidad?: string | null
  /** Qué tan bien encaja con quien la mira; solo con sesión y perfil completo. */
  match?: VacancyMatch | null
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
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<DetailComment[]>([])
  const [sent, setSent] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
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
    // Con sesión, el backend agrega qué tan bien encaja la vacante contigo.
    const token = getToken()
    fetch(`${API_URL}/api/community/posts/${slug}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then(res => { if (!res.ok) throw new Error('Post no encontrado'); return res.json() })
      .then(data => {
        if (data.slug && data.slug !== slug && !redirecting) {
          setRedirecting(true)
          window.history.replaceState({}, '', `/vacantes/${data.slug}`)
        }
        setPost(data)
        setComments(commentsOf(data))
        setLoading(false)

        // Fetch full content from ATS API if source_url is available
        if (data.source_url) {
          fetchAtsContent(data.source_url)
        }
      })
      .catch(() => { setError('Publicación no encontrada'); setLoading(false) })
  }, [slug])

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

  if (loading || error || !post) {
    return (
      <div className="detail-page">
        <button onClick={goBack} className="detail-back">Volver al feed</button>
        <p style={{ color: '#b3aba1' }}>{loading ? 'Cargando vacante...' : 'Vacante no encontrada'}</p>
      </div>
    )
  }

  const rawContent = fullContent || post.content || post.original_text || ''
  const cleanContent = fullContent ? unescapeHtml(fullContent) : stripMetadata(rawContent, post.title)
  const renderedHtml = renderContent(cleanContent)
  const meta = parseJobMetadata(rawContent)
  // Mismo parseo que usa la tarjeta del feed: de aquí salen descripción,
  // requisitos y beneficios como datos, en vez de volcar el markdown entero.
  const job = parseJobContent(rawContent)
  const time = formatTime(post.created_at)
  const isScraped = post.is_scraper_post
  const companyName = formatCompanyName(post.company || meta.company) || 'Comunidad'
  const applyUrl = buildApplyUrl(post.platform ?? null, post.source_url ?? null)
  const canEmbedApply = !!post.platform && IFRAME_EMBEDDABLE_PLATFORMS.has(post.platform)

  // Con contenido traído del ATS se prefiere ese cuerpo, que es más completo.
  // Y si el parseo no encontró nada, se cae al markdown: el peor caso es lo
  // que se veía antes, no una vacante en blanco.
  const hasStructured = !fullContent && (job.requirements.length > 0 || job.benefits.length > 0)
  const roleLabel = ROLE_CATEGORY_LABELS[post.role_category ?? ''] || null
  const levelLabel = post.seniority_level ? (SENIORITY_LABELS[post.seniority_level] || post.seniority_level) : null
  const modalityLabel = [post.modalidad, meta.modality].find(value => value && !/no especificado|unknown/i.test(value)) || null
  const skills = Array.isArray(post.skills) ? post.skills : []
  const match = post.match?.qualifies ? post.match : null
  const shared = new Set((match?.sharedSkills ?? []).map(skill => skill.toLowerCase()))
  const validated = new Map((post.match?.validatedSkills ?? []).map(entry => [entry.skill.toLowerCase(), entry.level]))

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
      <div className="detail-page">
        <DetailHeader
          onBack={goBack}
          authorName={companyName}
          initials={companyName.slice(0, 2).toUpperCase()}
          photoUrl={post.company_logo}
          profileHref={`/empresas/${companySlug(companyName)}`}
          typeLabel={isScraped ? 'VACANTE' : 'VACANTE VERIFICADA'}
          time={time}
          verified={!isScraped}
          action={
            applyUrl && user
              ? { label: 'Postularse', onClick: handleApplyClick }
              : undefined
          }
        />

        <h1>{post.title}</h1>

        <div className="detail-chips">
          <span className="detail-chip"><Building size={14} /> {companyName}</span>
          {meta.location && <span className="detail-chip"><MapPin size={14} /> {meta.location}</span>}
          {roleLabel && <span className="detail-chip is-role">{roleLabel}</span>}
          {levelLabel && <span className="detail-chip">{levelLabel}</span>}
          {modalityLabel && <span className="detail-chip">{modalityLabel}</span>}
          {meta.salary && <span className="detail-chip is-salary">{meta.salary}</span>}
        </div>

        {match && (
          <section className="detail-match" aria-label="Por qué es para ti">
            <div className="detail-match-head">
              <span className="post-type-badge is-for-you">PARA TI</span>
              <strong>{match.score}% match contigo</strong>
            </div>
            <ul>
              <li>{ROLE_FIT_TEXT[match.role]}{match.role === 'adjacent' && roleLabel ? ` (${roleLabel})` : ''}</li>
              <li>{match.sharedSkills.length} de {match.vacancySkills || skills.length} skills que pide los tienes tú{validated.size > 0 ? `, ${validated.size} validados con examen` : ''}</li>
              <li>{SENIORITY_FIT_TEXT[match.seniority]}</li>
              <li>{MODALITY_FIT_TEXT[match.modality]}</li>
            </ul>
          </section>
        )}

        {skills.length > 0 && (
          <>
            <h2 className="detail-section-title">Skills que pide</h2>
            <div className="stack-row">
              {[...skills].sort((a, b) => Number(validated.has(b.toLowerCase())) - Number(validated.has(a.toLowerCase())) || Number(shared.has(b.toLowerCase())) - Number(shared.has(a.toLowerCase()))).map(skill => {
                const level = validated.get(skill.toLowerCase())
                return level
                  ? <span key={skill} className="stack-badge is-validated" title="Lo validaste con examen"><BadgeCheck size={12} /> {skill} · {level === 'basico' ? 'básico' : level}</span>
                  : <span key={skill} className={`stack-badge${shared.has(skill.toLowerCase()) ? ' is-shared' : ''}`}>{skill}</span>
              })}
            </div>
          </>
        )}

        {hasStructured ? (
          <>
            {job.description && <p className="detail-lead">{job.description}</p>}

            {job.requirements.length > 0 && (
              <>
                <h2 className="detail-section-title">Requisitos</h2>
                <ul className="detail-requirements">
                  {job.requirements.map(req => <li key={req}>{req}</li>)}
                </ul>
              </>
            )}

            {job.benefits.length > 0 && (
              <>
                <h2 className="detail-section-title">Beneficios</h2>
                <div className="detail-perks">
                  {job.benefits.map(perk => (
                    <span key={perk} className="detail-perk"><Check size={12} strokeWidth={2.5} /> {perk}</span>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          renderedHtml && (
            <div
              className="detail-body editorial-content"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )
        )}

        {applyUrl && !user && (
          <div className="detail-guest-cta">
            <LockKeyhole size={24} />
            <h3>¿Interesado en esta vacante?</h3>
            <p>Regístrate gratis para acceder al email, teléfono, WhatsApp y enlace de aplicación.</p>
            <button type="button" className="detail-action" onClick={requestAuth}>Crear cuenta gratis</button>
          </div>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="detail-tags">
            {post.tags.map(tag => <span key={tag}>#{tag}</span>)}
          </div>
        )}

        {/* Una vacante no se vota, pero tiene la misma conversación que un post. */}
        <DetailFooter
          commentsCount={comments.length || post.commentsCount || 0}
          saved={saved}
          onSave={() => (user ? setSaved(!saved) : requestAuth())}
          conversationHref="#conversation"
        />

        <DetailConversation
          comments={comments}
          currentUserInitials={user ? (user.display_name || user.username || 'U').slice(0, 2).toUpperCase() : null}
          onSubmit={async text => {
            setSent(false)
            setCommentError(null)
            const result = await createComment(post.id, text)
            if ('error' in result) { setCommentError(result.error); return }
            setComments(prev => [result.comment, ...prev])
            setSent(true)
          }}
          formatTime={formatTime}
          sent={sent}
          error={commentError}
        />
      </div>

      {applyOpen && applyUrl && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: window.innerWidth < 640 ? 8 : 20 }}
          onMouseDown={e => e.target === e.currentTarget && setApplyOpen(false)}
        >
          {applySuccess ? (
            <div style={{ width: '100%', maxWidth: 400, background: '#221f1b', borderRadius: 12, border: '1px solid #322f29', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h3 style={{ color: '#e8e2d8', fontSize: 18, marginBottom: 8 }}>¡Aplicación enviada!</h3>
              <p style={{ color: '#b3aba1', fontSize: 14, marginBottom: 20 }}>Tu postulación a <strong style={{ color: '#e8e2d8' }}>{companyName}</strong> fue enviada exitosamente.</p>
              <button onClick={() => setApplyOpen(false)} style={{ background: '#00A86B', color: '#18161a', border: 'none', padding: '10px 24px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cerrar</button>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 750, height: window.innerWidth < 640 ? '95vh' : '90vh', background: '#221f1b', borderRadius: window.innerWidth < 640 ? 8 : 12, border: '1px solid #322f29', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #322f29', background: '#18161a' }}>
                <span style={{ color: '#e8e2d8', fontSize: 13, fontWeight: 600 }}>Postularse — {companyName}</span>
                <button
                  onClick={() => setApplyOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#b3aba1', cursor: 'pointer', fontSize: 20, padding: 4 }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              {post.platform === 'greenhouse' && (
                <div style={{ padding: '6px 14px', background: '#2a2723', borderBottom: '1px solid #322f29', fontSize: 11, color: '#b3aba1' }}>
                  Haz clic en <strong style={{ color: '#00A86B' }}>Apply</strong> dentro del formulario para completar tu postulación
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
