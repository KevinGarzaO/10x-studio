'use client'

import { DetailSkeleton } from '@/components/skeletons'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, BadgeCheck, Check, LockKeyhole, MapPin, Minus, X } from 'lucide-react'
import { marked } from 'marked'
import { useShell } from '../../../../lib/shell-context'
import { getToken } from '../../../../lib/session'
import { trackVacancyEvent } from '../../../../lib/attribution'
import { VacancyStats, type VacancyStatsData } from '../../../../components/vacancy-stats'
import { companySlug, formatCompanyName } from '../../../../lib/company'
import { parseJobContent } from '../../../../components/community-hub'
import { DetailHeader } from '../../../../components/post-detail/DetailHeader'
import { DetailRail } from '../../../../components/post-detail/DetailRail'
import { SideCard } from '../../../../components/post-detail/SideCard'
import { RelatedCard } from '../../../../components/post-detail/RelatedCard'
import { DetailConversation, type DetailComment } from '../../../../components/post-detail/DetailConversation'
import { commentsOf, createComment } from '../../../../lib/post-comments'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../../../../lib/profile-options'

/** Días que una vacante se considera abierta (el mismo plazo que el backend y el JSON-LD). */
const VACANCY_OPEN_DAYS = 45

interface SimilarVacancy {
  id: string
  slug: string
  title: string
  company: string | null
  location: string | null
}

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
  stats?: VacancyStatsData
  role_category?: string | null
  skills?: string[] | null
  modalidad?: string | null
  /** Qué tan bien encaja con quien la mira; solo con sesión y perfil completo. */
  match?: VacancyMatch | null
  /** Si quien mira ya la guardó, y el id de ese registro para poder quitarla. */
  isSaved?: boolean
  historyId?: string | null
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
  const { user, userLoaded, requestAuth } = useShell()
  // router.back() returns to whatever page the user actually came from
  // (feed, another post, a search) instead of a fixed guess at the tab.
  const goBack = () => router.back()
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [savingBusy, setSavingBusy] = useState(false)
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
        setSaved(!!data.isSaved)
        setHistoryId(data.historyId ?? null)
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

  // Quien llega sin cuenta (por ejemplo, desde LinkedIn) ve el aviso para registrarse sobre la vacante, que
  // queda detrás con un desenfoque ligero. El aviso no se cierra: sin cuenta no se lee la vacante. Al terminar
  // su perfil vuelve justo a esta vacante (ver AuthModal y lib/return-to.ts). No aparece mientras se confirma
  // la sesión, para no avisar a quien ya tiene cuenta.
  useEffect(() => {
    if (!post || !userLoaded || user) return
    requestAuth({ variant: 'vacancy', subject: [post.title, formatCompanyName(post.company)].filter(Boolean).join(' — ') })
  }, [post, userLoaded, user, slug, requestAuth])

  // Una vacante abierta más de VACANCY_OPEN_DAYS ya no acepta solicitudes. La página NO desaparece
  // (un 404 perdería los enlaces que ya apuntan a ella, por ejemplo los de LinkedIn): avisa y
  // ofrece vacantes parecidas que sí están abiertas.
  const expired = !!post && Date.parse(post.created_at) < Date.now() - VACANCY_OPEN_DAYS * 86400000
  const [similar, setSimilar] = useState<SimilarVacancy[]>([])

  useEffect(() => {
    if (!post || !expired) return
    const skill = Array.isArray(post.skills) && post.skills.length > 0 ? `&skill=${encodeURIComponent(post.skills[0])}` : ''
    fetch(`${API_URL}/api/community/seo/vacancies?exclude=${encodeURIComponent(post.slug || slug)}&limit=4${skill}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setSimilar((data?.vacancies as SimilarVacancy[] | undefined) ?? []))
      .catch(() => setSimilar([]))
  }, [post, expired, slug])

  // Anota que se abrió la vacante (una vez por sesión): es lo que dice si la gente que llega encuentra algo.
  useEffect(() => {
    if (post) trackVacancyEvent(post.slug || slug, 'view')
  }, [post, slug])

  if (loading || error || !post) {
    return (
      <div className="detail-page">
        <button onClick={goBack} className="detail-back">Volver al feed</button>
        {loading ? <DetailSkeleton label="Cargando la vacante" /> : <p style={{ color: 'var(--text-muted)' }}>Vacante no encontrada</p>}
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

  /**
   * Guarda o quita la vacante de /saved. Sin cuenta, pide registrarse (y vuelve a esta
   * vacante al terminar). El guardado vive en el backend (user_vacancy_history), el mismo
   * que usan las tarjetas del feed, así que aparece en /saved y se ve guardada en el feed.
   */
  const current = post
  async function toggleSave() {
    if (!user) {
      requestAuth({ variant: 'vacancy', subject: `${current.title} — ${companyName}` })
      return
    }
    if (savingBusy) return
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
    setSavingBusy(true)
    try {
      if (saved) {
        if (!historyId) return
        const res = await fetch(`${API_URL}/api/community/history/${historyId}`, { method: 'DELETE', headers })
        if (res.ok) { setSaved(false); setHistoryId(null) }
        return
      }
      const res = await fetch(`${API_URL}/api/community/history/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceType: 'community',
          sourceId: current.id,
          title: current.title,
          company: current.company ?? meta.company,
          companyLogo: current.company_logo,
          roleCategory: current.role_category,
          seniorityLevel: current.seniority_level,
          skills: Array.isArray(current.skills) ? current.skills : [],
          url: `/vacantes/${current.slug || current.id}`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSaved(true)
        setHistoryId(data.item?.id ?? null)
      }
    } catch {
      // sin conexión: el botón queda como estaba
    } finally {
      setSavingBusy(false)
    }
  }

  function handleApplyClick() {
    trackVacancyEvent(current.slug || slug, 'apply')
    if (!applyUrl) return
    if (canEmbedApply) {
      setApplyOpen(true)
    } else {
      window.open(applyUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const commentsTotal = comments.length || post.commentsCount || 0
  const applyAction = expired || !applyUrl
    ? null
    : user
      ? handleApplyClick
      // Sin cuenta, "Postularse" lleva a registrarse y de vuelta a esta vacante.
      : () => { trackVacancyEvent(post.slug || slug, 'apply'); requestAuth({ variant: 'vacancy', subject: `${post.title} — ${companyName}` }) }

  return (
    <>
      <div className="detail-shell">
        <button onClick={goBack} className="detail-back"><ArrowLeft size={16} /> Volver al feed</button>

        <div className="detail-grid">
          <DetailRail
            commentsCount={commentsTotal}
            conversationHref="#conversation"
            save={{ saved, busy: savingBusy, onToggle: toggleSave, saveLabel: 'Guardar vacante', savedLabel: 'Quitar de guardados' }}
          />

          <main className="detail-col">
            <article className="detail-card">
              <div className="detail-card-body">
                <DetailHeader
                  onBack={goBack}
                  hideBack
                  authorName={companyName}
                  initials={companyName.slice(0, 2).toUpperCase()}
                  photoUrl={post.company_logo}
                  profileHref={`/empresas/${companySlug(companyName)}`}
                  typeLabel={isScraped ? 'VACANTE' : 'VACANTE VERIFICADA'}
                  time={time}
                  verified={!isScraped}
                  hover={{ kind: 'company', id: companySlug(companyName) }}
                />

                <h1>{post.title}</h1>

                {expired && (
                  <section className="detail-expired" role="status">
                    <strong>Esta vacante ya no acepta solicitudes</strong>
                    <p>Lleva más de {VACANCY_OPEN_DAYS} días publicada y es probable que ya esté cubierta. Mira estas vacantes abiertas:</p>
                    {similar.length > 0 && (
                      <ul>
                        {similar.map(item => (
                          <li key={item.id}>
                            <Link href={`/vacantes/${item.slug}`}>{item.title}</Link>
                            <span>{[formatCompanyName(item.company), item.location?.split(/[•;|]/)[0].trim()].filter(Boolean).join(' · ')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link href="/empleos" className="detail-expired-more">Ver todas las vacantes abiertas</Link>
                  </section>
                )}

                <div className="detail-chips">
                  {meta.location && <span className="detail-chip"><MapPin size={14} /> {meta.location}</span>}
                  {roleLabel && <span className="detail-chip is-role">{roleLabel}</span>}
                  {levelLabel && <span className="detail-chip">{levelLabel}</span>}
                  {modalityLabel && <span className="detail-chip">{modalityLabel}</span>}
                  {meta.salary && <span className="detail-chip is-salary">{meta.salary}</span>}
                </div>

                <VacancyStats stats={post.stats ? { ...post.stats, saves: Math.max(0, post.stats.saves + (saved ? 1 : 0) - (post.isSaved ? 1 : 0)) } : post.stats} comments={comments.length || post.commentsCount || 0} detailed />

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

              </div>
            </article>

            <section className="detail-card">
              <div className="detail-card-body">
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
            </section>
          </main>

          <aside className="detail-aside">
            {match && (() => {
              const totalSkills = match.vacancySkills || skills.length
              const skillsShare = totalSkills > 0 ? match.sharedSkills.length / totalSkills : 0
              const fits: { key: string; label: string; text: string; tone: 'good' | 'ok' | 'neutral' | 'bad' }[] = [
                {
                  key: 'role', label: 'Puesto',
                  text: `${ROLE_FIT_TEXT[match.role]}${match.role === 'adjacent' && roleLabel ? ` (${roleLabel})` : ''}`,
                  tone: match.role === 'exact' ? 'good' : match.role === 'adjacent' ? 'ok' : match.role === 'unknown' ? 'neutral' : 'bad',
                },
                {
                  key: 'skills', label: 'Skills',
                  text: `${match.sharedSkills.length} de ${totalSkills} skills que pide los tienes tú${validated.size > 0 ? `, ${validated.size} validados con examen` : ''}`,
                  tone: skillsShare >= 0.6 ? 'good' : match.sharedSkills.length > 0 ? 'ok' : 'bad',
                },
                {
                  key: 'level', label: 'Nivel', text: SENIORITY_FIT_TEXT[match.seniority],
                  tone: match.seniority === 'exact' ? 'good' : match.seniority === 'near' ? 'ok' : match.seniority === 'unknown' ? 'neutral' : 'bad',
                },
                {
                  key: 'modality', label: 'Modalidad', text: MODALITY_FIT_TEXT[match.modality],
                  tone: match.modality === 'match' ? 'good' : match.modality === 'compatible' ? 'ok' : match.modality === 'unknown' ? 'neutral' : 'bad',
                },
              ]
              return (
                <section className="detail-match" aria-label="Por qué es para ti">
                  <div className="detail-match-top">
                    <div className="detail-match-score">
                      <strong>{match.score}%</strong>
                      <span>match contigo</span>
                    </div>
                    <span className="post-type-badge is-for-you">PARA TI</span>
                  </div>
                  <div className="detail-match-bar" role="img" aria-label={`${match.score}% de coincidencia`}><i style={{ width: `${Math.min(100, Math.max(0, match.score))}%` }} /></div>
                  <ul className="detail-match-list">
                    {fits.map(fit => (
                      <li key={fit.key} className={`is-${fit.tone}`}>
                        <span className="detail-match-icon" aria-hidden="true">
                          {fit.tone === 'good' ? <Check size={14} strokeWidth={3} /> : fit.tone === 'bad' ? <X size={14} strokeWidth={3} /> : <Minus size={14} strokeWidth={3} />}
                        </span>
                        <span className="detail-match-text"><small>{fit.label}</small>{fit.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })()}

            <SideCard
              name={companyName}
              initials={companyName.slice(0, 2).toUpperCase()}
              photoUrl={post.company_logo}
              href={`/empresas/${companySlug(companyName)}`}
              hrefLabel="Ver empresa"
              facts={[
                { label: 'Ubicación', value: meta.location },
                { label: 'Puesto', value: roleLabel },
                { label: 'Nivel', value: levelLabel },
                { label: 'Modalidad', value: modalityLabel },
                { label: 'Salario', value: meta.salary },
              ]}
            >
              {applyAction && <button type="button" className="detail-action" onClick={applyAction}>Postularse</button>}
            </SideCard>

            <RelatedCard postKey={post.slug || slug} />
          </aside>
        </div>
      </div>

      {applyOpen && applyUrl && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: window.innerWidth < 640 ? 8 : 20 }}
          onMouseDown={e => e.target === e.currentTarget && setApplyOpen(false)}
        >
          {applySuccess ? (
            <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h3 style={{ color: 'var(--text-2)', fontSize: 18, marginBottom: 8 }}>¡Aplicación enviada!</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>Tu postulación a <strong style={{ color: 'var(--text-2)' }}>{companyName}</strong> fue enviada exitosamente.</p>
              <button onClick={() => setApplyOpen(false)} style={{ background: 'var(--brand)', color: 'var(--bg)', border: 'none', padding: '10px 24px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cerrar</button>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 750, height: window.innerWidth < 640 ? '95vh' : '90vh', background: 'var(--surface)', borderRadius: window.innerWidth < 640 ? 8 : 12, border: '1px solid var(--line)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
                <span style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>Postularse — {companyName}</span>
                <button
                  onClick={() => setApplyOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, padding: 4 }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              {post.platform === 'greenhouse' && (
                <div style={{ padding: '6px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', fontSize: 11, color: 'var(--text-muted)' }}>
                  Haz clic en <strong style={{ color: 'var(--brand)' }}>Apply</strong> dentro del formulario para completar tu postulación
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
