'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Bell, Bookmark, BriefcaseBusiness, Flame,
  Hash, Menu, MessageCircle, PenLine, Search,
  LogOut, Send, Settings, Share2, ShieldCheck, Sparkles, Tag, Target, TrendingUp, Users, X,
  ArrowBigUp, LockKeyhole, CheckCircle2, Building, MapPin, Home as HomeIcon, Mail, Clock, Check
} from 'lucide-react'
import { companySlug, formatCompanyName } from '../lib/company'
import { useShell, type AuthRequest } from '../lib/shell-context'
import { saveReturnTo } from '../lib/return-to'
import { DEFAULT_ROLES, DEFAULT_TAGS, assignHues, tagHref, type SidebarRole, type SidebarTag } from '../lib/tag-colors'
import { HeroBanner } from './hero-banner'
import { getToken, clearSession } from '../lib/session'
import { buildFeed, type MatchedItem } from '../lib/mixed-feed'
import { ForYouCard } from './for-you-card'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Module-level cache to preserve feed state across navigations
const feedCache = new Map<string, FeedSnapshot>()

interface EditorialPost {
  id: string
  title: string
  content: string
  type: 'editorial' | 'job' | 'showcase' | 'discussion'
  author: { id: string | null; username: string; display_name: string; photo_url: string | null }
  tags: string[]
  votesCount: number
  commentsCount: number
  image_url: string | null
  slug: string
  word_count: number
  created_at: string
  budget?: string | null
  modalidad?: string | null
  source_url?: string | null
  platform?: string | null
  source_name?: string | null
  original_text?: string | null
  contacts?: Record<string, unknown> | null
  is_scraper_post?: boolean
  company?: string | null
  company_logo?: string | null
  location?: string | null
  // Lo escribe el trigger de clasificación del scraper. Hoy viene null en las
  // vacantes existentes, así que el chip de nivel solo aparece cuando hay dato.
  seniority_level?: string | null
  isSaved?: boolean
  historyId?: string | null
}

export type FeedPost = EditorialPost

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'hace minutos'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  return `hace ${days}d`
}

function Avatar({ initials, tone = 'cyan', avatar }: { initials: string; tone?: string; avatar?: string }) {
  return avatar ? <img className="avatar avatar-photo" src={avatar} alt="" aria-hidden="true" /> : <div className={`avatar avatar-${tone}`} aria-hidden="true">{initials}</div>
}

export function ProfileMenu({ user }: { user: any }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  if (!user) {
    return <Link href="/login" className="topbar-profile-link" aria-label="Acceder"><Avatar initials="?" tone="blue" /></Link>
  }

  const initials = (user.display_name || user.username || 'U').slice(0, 2).toUpperCase()

  return (
    <div className="profile-menu" ref={menuRef}>
      <button className="topbar-profile-link" aria-label="Cuenta" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Avatar initials={initials} tone="emerald" avatar={user.photo_url} />
      </button>
      {open && (
        <div className="profile-menu-dropdown" role="menu">
          <div className="profile-menu-header">
            <strong>{user.display_name || user.username}</strong>
            <span>@{user.username}</span>
          </div>
          <Link href="/settings" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={15} /> Configuración
          </Link>
          <button
            type="button"
            className="profile-menu-item profile-menu-logout"
            role="menuitem"
            onClick={() => { clearSession(); window.location.href = '/login' }}
          >
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

export function LeftSidebar({ activeTag, onTagClick }: { activeTag: string | null; onTagClick: (tag: string) => void }) {
  const [tags, setTags] = useState<SidebarTag[]>(DEFAULT_TAGS)
  const [roles, setRoles] = useState<SidebarRole[]>(DEFAULT_ROLES)
  const pathname = usePathname()
  const hues = useMemo(() => assignHues(tags.map(tag => tag.name)), [tags])
  const roleHues = useMemo(() => assignHues(roles.map(role => role.slug)), [roles])

  useEffect(() => {
    fetch(`${API_URL}/api/community/stats/tags?limit=6`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const fetched: SidebarTag[] = (d?.tags || []).map((t: { name: string; label?: string; skill?: boolean }) => ({
          name: t.name,
          label: t.label || t.name,
          skill: t.skill === true,
        }))
        if (fetched.length > 0) setTags(fetched)
      })
      .catch(() => {})

    fetch(`${API_URL}/api/community/stats/roles?limit=6`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const fetched: SidebarRole[] = (d?.roles || []).map((r: { slug: string; label?: string }) => ({ slug: r.slug, label: r.label || r.slug }))
        if (fetched.length > 0) setRoles(fetched)
      })
      .catch(() => {})
  }, [])

  return <aside className="left-sidebar">
    <div className="sidebar-section tags-section">
      <div className="section-heading"><p className="eyebrow">Puestos en tendencia</p></div>
      {roles.map(role => {
        const href = `/puestos/${role.slug}`
        return (
          <Link
            key={role.slug}
            href={href}
            className={`tag-link tag-hue-${roleHues[role.slug]} ${pathname === href ? 'active' : ''}`}
            aria-current={pathname === href ? 'page' : undefined}
          >
            <Hash size={14} />{role.label}
          </Link>
        )
      })}
    </div>
    <div className="sidebar-section tags-section">
      <div className="section-heading"><p className="eyebrow">Temas en tendencia</p></div>
      {tags.map(tag => {
        const href = tagHref(tag)
        const hue = `tag-hue-${hues[tag.name]}`

        // Un skill lleva a su página de empleos (/empleos/python). Un tema que no es skill sigue
        // filtrando el feed, como antes.
        return href ? (
          <Link
            key={tag.name}
            href={href}
            className={`tag-link ${hue} ${pathname === href ? 'active' : ''}`}
            aria-current={pathname === href ? 'page' : undefined}
          >
            <Hash size={14} />{tag.label}
          </Link>
        ) : (
          <button
            key={tag.name}
            className={`tag-link ${hue} ${activeTag === tag.name ? 'active' : ''}`}
            aria-pressed={activeTag === tag.name}
            onClick={() => onTagClick(tag.name)}
          >
            <Hash size={14} />{tag.label}
          </button>
        )
      })}
    </div>
    <div className="sidebar-footer">© 2026 AvoTalent <span>·</span> Reglas <span>·</span> Privacidad</div>
  </aside>
}


function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Extrae los datos de una vacante del texto con el que la guarda el scraper.
 * La usan la tarjeta del feed y el detalle de vacante: es lo que permite
 * mostrar la vacante por secciones sin tocar el backend.
 */
export function parseJobContent(text: string) {
  const decoded = unescapeHtml(text)
  const lines = decoded.split('\n').map(l => l.trim()).filter(Boolean)
  const company = lines.find(l => /\*\*Empresa:?\*\*/i.test(l))?.replace(/\*\*Empresa:?\*\*\s*/i, '') || null
  const role = lines.find(l => /\*\*Rol:?\*\*/i.test(l))?.replace(/\*\*Rol:?\*\*\s*/i, '') || null
  const location = lines.find(l => /\*\*Ubicaci[oó]n:?\*\*/i.test(l))?.replace(/\*\*Ubicaci[oó]n:?\*\*\s*/i, '') || null
  const salary = lines.find(l => /\*\*Presupuesto:?\*\*/i.test(l))?.replace(/\*\*Presupuesto:?\*\*\s*/i, '') || null
  const modality = lines.find(l => /\*\*Modalidad:?\*\*/i.test(l))?.replace(/\*\*Modalidad:?\*\*\s*/i, '') || null

  const descStart = lines.findIndex(l => /###\s*Descripci/i.test(l))
  const reqStart = lines.findIndex(l => /###\s*Requisitos/i.test(l))
  const benStart = lines.findIndex(l => /###\s*Beneficios/i.test(l))
  const contactStart = lines.findIndex(l => /###\s*Contacto/i.test(l))

  let description = descStart >= 0 ? lines.slice(descStart + 1, reqStart > 0 ? reqStart : benStart > 0 ? benStart : contactStart > 0 ? contactStart : undefined).join(' ').replace(/\*\*/g, '') : null

  // Fallback: extract description from HTML content or first meaningful paragraph
  if (!description) {
    const htmlContent = lines.find(l => l.includes('<div') || l.includes('<p'))
    if (htmlContent) {
      description = stripHtml(htmlContent).substring(0, 250)
    } else {
      const contentLines = lines.filter(l => !l.startsWith('#') && !l.startsWith('**') && !l.startsWith('###') && !l.startsWith('🔗') && l.length > 30)
      if (contentLines.length > 0) {
        description = stripHtml(contentLines[0]).substring(0, 250)
      }
    }
  }

  const requirements = reqStart >= 0 ? lines.slice(reqStart + 1, benStart > 0 ? benStart : contactStart > 0 ? contactStart : undefined).filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '')) : []
  const benefits = benStart >= 0 ? lines.slice(benStart + 1, contactStart > 0 ? contactStart : undefined).filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '')) : []

  const contactSection = contactStart >= 0 ? lines.slice(contactStart + 1).join('\n') : ''
  const applyUrl = contactSection.match(/https?:\/\/[^\s)]+/)?.[0] || lines.find(l => /postularse|apply/i.test(l))?.match(/https?:\/\/[^\s)]+/)?.[0] || null
  const emails = contactSection.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
  const whatsapp = contactSection.match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)\/?\+?\d+/g) || []

  return { company, role, location, salary, modality, description, requirements, benefits, applyUrl, emails, whatsapp }
}

// Cache for Google Favicon lookups (company → url)
const faviconCache = new Map<string, string>()

export function CompanyAvatar({ company, logoUrl, size = 40 }: { company: string | null; logoUrl?: string | null; size?: number }) {
  const [resolvedLogo, setResolvedLogo] = useState(logoUrl || faviconCache.get(company || '') || null)
  const [logoFailed, setLogoFailed] = useState(false)
  const name = company || 'AV'
  const initials = name.slice(0, 2).toUpperCase()

  useEffect(() => {
    if (logoUrl || logoFailed || !company) return
    const cached = faviconCache.get(company)
    if (cached) { setResolvedLogo(cached); return }

    // Try Google Favicon API with company.com domain guess
    const domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    const img = new Image()
    img.onload = () => {
      faviconCache.set(company, url)
      setResolvedLogo(url)
    }
    img.onerror = () => setLogoFailed(true)
    img.src = url
  }, [company, logoUrl, logoFailed])

  const showLogo = resolvedLogo && !logoFailed
  return (
    <div style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #322f29', flexShrink: 0, position: 'relative' }}>
      {showLogo && <img src={resolvedLogo!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={() => setLogoFailed(true)} />}
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#00A86B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#18161a', fontWeight: 800, fontSize: size * 0.35, position: 'relative', zIndex: showLogo ? -1 : 0 }}>{initials}</div>
    </div>
  )
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

export function PostCard({ post, onAuthRequired }: { post: FeedPost; onAuthRequired?: () => void }) {
  const router = useRouter(); const [voted, setVoted] = useState(false); const [saved, setSaved] = useState(!!post.isSaved)
  const [historyId, setHistoryId] = useState<string | null>(post.historyId ?? null)
  // Session comes from the shared shell context — every card used to fetch
  // its own copy, which meant one request per card rendered on the page.
  const { user } = useShell()

  const handleSaveClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) { onAuthRequired?.(); return }
    if (post.type !== 'job') { setSaved(!saved); return }
    const token = getToken()

    if (saved) {
      if (!historyId) return
      const res = await fetch(`${API_URL}/api/community/history/${historyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { setSaved(false); setHistoryId(null) }
      return
    }

    const res = await fetch(`${API_URL}/api/community/history/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sourceType: 'community', sourceId: post.id, title: post.title, company: post.company,
        companyLogo: post.company_logo, url: `/vacantes/${post.slug || post.id}`,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setSaved(true)
      setHistoryId(data.item?.id ?? null)
    }
  }

  const isJob = post.type === 'job'
  const time = formatTime(post.created_at)
  const image = post.image_url
  const job = isJob ? parseJobContent(post.content || post.original_text || '') : null
  const company = formatCompanyName(post.company || job?.company) || null
  const isScraped = post.is_scraper_post
  // Fallback: use source_url if applyUrl not found in content
  const rawApplyUrl = job?.applyUrl || post.source_url || null
  const applyUrl = buildApplyUrl(post.platform ?? null, rawApplyUrl)

  const openPost = (e?: React.MouseEvent<HTMLElement>) => { if (e?.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return; const isJob = post.type === 'job'; const slug = post.slug || post.id; const basePath = isJob ? (slug.startsWith('/vacantes/') ? slug : `/vacantes/${slug}`) : `/post/${post.id}`; router.push(basePath) }

  if (isJob) {
    // Chips con icono en vez del bloque de texto denso: empresa, ubicación,
    // nivel · modalidad y salario destacado en verde.
    // "No especificado" es el relleno del scraper cuando no detectó modalidad:
    // como chip solo ocupa espacio sin decir nada.
    const modality = [job?.modality, post.modalidad].find(m => m && !/no especificado/i.test(m))
    const levelAndType = [post.seniority_level, modality].filter(Boolean).join(' · ')
    return <article className={`post-card job-card`} onClick={openPost}>
      <div className="post-top">
        <Link href={company ? `/empresas/${companySlug(company)}` : '#'} className="author-row author-link" onClick={e => !company && e.preventDefault()}>
          <CompanyAvatar company={company} logoUrl={post.company_logo} size={44} />
          <div><div className="author-name">{company || 'AvoTalent'}</div><div className="post-meta">{time}</div></div>
        </Link>
        <span className="post-type-badge">VACANTE</span>
      </div>
      <h2>{job?.role || post.title}</h2>
      <div className="job-chips">
        {company && <span className="job-chip"><Building size={12} /> {company}</span>}
        {(job?.location || post.location) && <span className="job-chip"><MapPin size={12} /> {job?.location || post.location}</span>}
        {levelAndType && <span className="job-chip">{levelAndType}</span>}
        {job?.salary && <span className="job-chip is-salary">{job.salary}</span>}
      </div>
      {job?.description && <p className="post-excerpt">{job.description}</p>}
      {job?.benefits && job.benefits.length > 0 && (
        <div className="job-perks">
          {job.benefits.slice(0, 4).map(perk => (
            <span key={perk} className="job-perk"><Check size={11} strokeWidth={2.5} /> {perk}</span>
          ))}
        </div>
      )}
      {user ? (
        <>
          {applyUrl && <button className="job-apply-button" onClick={e => { e.stopPropagation(); openPost() }}>Postularse ahora →</button>}
          {!applyUrl && job?.emails && job.emails.length > 0 && <div style={{ fontSize: 12, color: '#b3aba1', margin: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {job.emails[0]}</div>}
        </>
      ) : (
        <button className="job-unlock-button" onClick={e => { e.stopPropagation(); onAuthRequired?.() }}>
          <LockKeyhole size={14} /> Desbloquear contacto
        </button>
      )}
      <div className="post-footer">
        <button className="engagement"><MessageCircle size={16} />{post.commentsCount}</button>
        <span className="footer-spacer" />
        <button className={`icon-button ${saved ? 'saved' : ''}`} onClick={handleSaveClick} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button>
        <button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button>
      </div>
    </article>
  }

  // A post only has no real author when it fell back to the CMS "content"
  // table (the backend marks that with author.id === null) — that's genuine
  // AvoTalent editorial content. Anything with a real author.id (including
  // type "editorial" posts made through the community, not the CMS) shows
  // the actual person who posted it.
  const hasRealAuthor = !!post.author?.id
  const authorUsername = post.author?.username || null
  const authorName = hasRealAuthor ? (post.author?.display_name || authorUsername || 'Anónimo') : 'AvoTalent'
  const authorInitials = authorName.slice(0, 2).toUpperCase()
  const authorPhoto = hasRealAuthor ? post.author?.photo_url : null
  const typeLabel = post.type === 'showcase' ? 'SHOWCASE' : post.type === 'discussion' ? 'DISCUSIÓN' : 'ARTÍCULO'
  const badgeTone = post.type === 'showcase' ? 'is-showcase' : post.type === 'discussion' ? '' : 'is-article'
  // Solo artículos y showcase llevan imagen: una discusión es texto, y un
  // placeholder rayado ahí solo metería ruido.
  const showsMedia = post.type === 'showcase' || post.type === 'editorial'

  return <article className="post-card" onClick={openPost}>
    <div className="post-top">
      <Link href={authorUsername ? `/users/${authorUsername}` : '#'} className="author-row author-link" onClick={e => (!hasRealAuthor || !authorUsername) && e.preventDefault()}>
        <Avatar initials={authorInitials} tone="cyan" avatar={authorPhoto || undefined} />
        <div><div className="author-name">{authorName} {!hasRealAuthor && <ShieldCheck size={13} className="verified" />}</div><div className="post-meta">{!hasRealAuthor ? <>Staff AvoTalent <span>·</span> </> : null}{time}</div></div>
      </Link>
      <span className={`post-type-badge ${badgeTone}`}>{typeLabel}</span>
    </div>
    <h2>{post.title}</h2>
    {image
      ? <div className="post-media"><img src={image} alt="" /></div>
      : showsMedia && <div className="post-media is-placeholder"><span>{typeLabel}</span></div>}
    <p className="post-excerpt">{(post.content || '').substring(0, 200)}{(post.content || '').length > 200 ? '...' : ''}</p>
    {post.word_count ? <div className="post-readtime"><Clock size={12} /> {Math.max(1, Math.round(post.word_count / 200))} min de lectura</div> : null}
    <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount} comentarios</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
  </article>
}

export function RightSidebar({ onUnlock }: { onUnlock: () => void }) {
  const [trending, setTrending] = useState<FeedPost[]>([])
  const [featured, setFeatured] = useState<FeedPost[]>([])
  const [stats, setStats] = useState<{ members: number; companies: number; vacancies: number } | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/community/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API_URL}/api/community/posts/editorial?page=1&limit=3`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTrending(d?.posts || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API_URL}/api/community/posts?page=1&limit=3&type=job`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setFeatured(d?.posts || []))
      .catch(() => {})
  }, [])

  const parseMiniJob = (content: string) => {
    const decoded = unescapeHtml(content)
    const lines = decoded.split('\n').map(l => l.trim()).filter(Boolean)
    const company = lines.find(l => /\*\*Empresa:?\*\*/i.test(l))?.replace(/\*\*Empresa:?\*\*\s*/i, '') || null
    const salary = lines.find(l => /\*\*Presupuesto:?\*\*/i.test(l))?.replace(/\*\*Presupuesto:?\*\*\s*/i, '') || null
    const modality = lines.find(l => /\*\*Modalidad:?\*\*/i.test(l))?.replace(/\*\*Modalidad:?\*\*\s*/i, '') || null
    return { company, salary, modality }
  }

  return <aside className="right-sidebar">
    <section className="widget">
      <div className="widget-title"><span>Conversaciones en fuego</span><Flame size={16} /></div>
      {trending.length > 0 ? trending.map((post, i) => (
        <Link href={`/post/${post.id}`} className="trend-item" key={post.id}>
          <span className="trend-number">0{i + 1}</span>
          <span><strong>{post.title}</strong><small>{post.commentsCount} respuestas</small></span>
        </Link>
      )) : (
        <p style={{ color: '#b3aba1', fontSize: 13, padding: '8px 0' }}>Sé el primero en iniciar una conversación</p>
      )}
    </section>

    {featured.length > 0 && (
      <section className="widget opportunities">
        <div className="widget-title"><span>Oportunidades destacadas</span><BriefcaseBusiness size={16} /></div>
        {featured.length > 0 ? featured.map(post => {
          const job = parseMiniJob(post.content || post.original_text || '')
          const company = formatCompanyName(post.company || job?.company) || null
          return (
            <Link href={post.slug?.startsWith('/vacantes/') ? post.slug : `/vacantes/${post.slug || post.id}`} className="mini-job" key={post.id}>
              <div className="mini-job-row">
                <CompanyAvatar company={company} logoUrl={post.company_logo} size={34} />
                <div className="mini-job-info">
                  {!post.is_scraper_post && <span className="verified-pill"><CheckCircle2 size={11} /> Verificada</span>}
                  <strong>{post.title}</strong>
                  <div className="mini-job-meta">
                    <span className="mini-job-company">{company || post.source_name || 'Comunidad'}</span>
                    <span className="mini-job-dot">·</span>
                    <span>{job.modality || 'Remoto'}</span>
                    {job.salary && <span className="mini-job-salary">{job.salary}</span>}
                  </div>
                </div>
              </div>
            </Link>
          )
        }) : (
          <p style={{ color: '#b3aba1', fontSize: 13, padding: '8px 0' }}>Próximamente verás aquí las mejores oportunidades</p>
        )}
      </section>
    )}

    <section className="widget community-widget">
      <div className="widget-title"><span>La comunidad</span><Users size={16} /></div>
      <div className="community-stats">
        <div><strong>{stats?.members != null ? formatCount(stats.members) : '—'}</strong><small>miembros</small></div>
        <div><strong>{stats?.companies != null ? formatCount(stats.companies) : '—'}</strong><small>empresas</small></div>
        <div><strong>{stats?.vacancies != null ? formatCount(stats.vacancies) : '—'}</strong><small>vacantes</small></div>
      </div>
    </section>
  </aside>
}

export function AuthModal({ onClose, request }: { onClose: () => void; request?: AuthRequest | null }) {
  const router = useRouter()
  const vacancy = request?.variant === 'vacancy'

  // Se recuerda la página en la que estaba: al terminar el registro (y el onboarding) se
  // le regresa a ella en lugar de mandarla al inicio.
  function go(path: '/signup' | '/login') {
    saveReturnTo(window.location.pathname)
    onClose()
    router.push(path)
  }

  const eyebrow = vacancy ? 'Vacante' : 'Contacto directo'
  const title = vacancy ? '¿Te interesa esta vacante?' : 'Desbloquea esta oportunidad'
  const text = vacancy
    ? 'Regístrate gratis para postularte, guardarla y ver qué tan bien encajas con tus skills. Al terminar tu perfil volverás a esta vacante.'
    : 'Regístrate para acceder a los datos de contacto y unirte a la conversación.'

  function oauth(provider: 'linkedin' | 'github') {
    // La vacante se recuerda también en el OAuth: al terminar el onboarding se
    // vuelve a ella igual que con los botones de correo.
    saveReturnTo(window.location.pathname)
    window.location.href = `${API_URL}/api/community/auth/oauth/${provider}`
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><div className="lock-orb"><LockKeyhole size={20} /></div><p className="eyebrow">{eyebrow}</p><h2 id="auth-title">{title}</h2>{vacancy && request?.subject && <p className="auth-subject"><strong>{request.subject}</strong></p>}<p>{text}</p><div className="oauth-stack"><button type="button" className="oauth-btn" onClick={() => oauth('linkedin')}><svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>Continuar con LinkedIn</button><button type="button" className="oauth-btn" onClick={() => oauth('github')}><svg width="16" height="16" viewBox="0 0 24 24" fill="#f3efe9" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2 0 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.6 18 4.9 18 4.9c.7 1.7.3 2.9.2 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/></svg>Continuar con GitHub</button><div className="oauth-divider"><span>o continúa con tu correo</span></div></div><button className="oauth-button" style={{ width: '100%', marginBottom: 10, background: '#00A86B', color: '#18161a', border: 'none', padding: '12px 16px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }} onClick={() => go('/signup')}>Crear cuenta gratis</button><button className="oauth-button" style={{ width: '100%', background: 'transparent', color: '#e8e2d8', border: '1px solid #322f29', padding: '12px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }} onClick={() => go('/login')}>Iniciar sesión</button><small style={{ display: 'block', textAlign: 'center', marginTop: 12, color: '#b3aba1', fontSize: 11 }}>Al continuar aceptas nuestras reglas de comunidad.</small></section></div>
}

// The feed's content column — rendered as {children} inside the shared
// CommunityShell (topbar + sidebars) so navigating to/from a post, vacancy,
// or profile only swaps this column instead of remounting the whole page.
//
// Un solo feed con tres tipos de tarjeta: artículos, vacantes y "Para ti"
// (vacantes que coinciden con tus skills, solo con sesión), de lo más nuevo a lo
// más antiguo. buildFeed() decide el orden; aquí solo se traen las fuentes y se
// pagina.
const ARTICLES_PER_PAGE = 10
// Entran unas 20 vacantes nuevas al día: una página de 20 cubre más o menos un día.
const JOBS_PER_PAGE = 20

interface FeedSnapshot {
  articles: FeedPost[]
  jobs: FeedPost[]
  forYou: MatchedItem[]
  page: number
  moreArticles: boolean
  moreJobs: boolean
}

async function fetchJson(url: string, token?: string | null): Promise<any | null> {
  try {
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export function Feed() {
  const { search, activeTag, setActiveTag, requestAuth, user } = useShell()

  const todayLabel = useMemo(() => {
    const label = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [])

  // Quién ve el feed se decide por tener sesión, no por el usuario ya cargado:
  // así "Para ti" entra desde la primera carga y las tarjetas no se reacomodan.
  const [snapshot, setSnapshot] = useState<FeedSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const snapshotRef = useRef<FeedSnapshot | null>(null)
  const loadingRef = useRef(false)
  const cacheKeyRef = useRef('guest')

  const commit = (next: FeedSnapshot) => {
    snapshotRef.current = next
    feedCache.set(cacheKeyRef.current, next)
    setSnapshot(next)
  }

  const fetchBatch = async (pageNum: number) => {
    const [articles, jobs] = await Promise.all([
      fetchJson(`${API_URL}/api/community/posts/editorial?page=${pageNum}&limit=${ARTICLES_PER_PAGE}`),
      fetchJson(`${API_URL}/api/community/posts?page=${pageNum}&limit=${JOBS_PER_PAGE}&type=job&sort=recent`),
    ])
    return {
      articles: (articles?.posts || []) as FeedPost[],
      jobs: (jobs?.posts || []) as FeedPost[],
    }
  }

  // Primera carga: desde caché si ya se había visto, o las tres fuentes a la vez.
  useEffect(() => {
    const token = getToken()
    cacheKeyRef.current = token ? 'member' : 'guest'

    const cached = feedCache.get(cacheKeyRef.current)
    if (cached) {
      snapshotRef.current = cached
      setSnapshot(cached)
      setLoading(false)
      return
    }

    let cancelled = false
    loadingRef.current = true
    const run = async () => {
      const [batch, forYouData] = await Promise.all([
        fetchBatch(1),
        token ? fetchJson(`${API_URL}/api/community/feed/for-you`, token) : Promise.resolve(null),
      ])
      if (cancelled) return
      const forYou = ((forYouData?.items || []) as MatchedItem[]).filter(item => item.matchingSkills > 0)
      commit({
        articles: batch.articles,
        jobs: batch.jobs,
        forYou,
        page: 1,
        moreArticles: batch.articles.length === ARTICLES_PER_PAGE,
        moreJobs: batch.jobs.length === JOBS_PER_PAGE,
      })
      loadingRef.current = false
      setLoading(false)
    }
    run()

    return () => { cancelled = true; loadingRef.current = false }
  }, [])

  const loadMore = async () => {
    const current = snapshotRef.current
    if (!current || loadingRef.current || (!current.moreArticles && !current.moreJobs)) return
    loadingRef.current = true
    setLoading(true)
    const nextPage = current.page + 1
    const batch = await fetchBatch(nextPage)
    const fresh = snapshotRef.current ?? current
    const knownArticles = new Set(fresh.articles.map(p => p.id))
    const knownJobs = new Set(fresh.jobs.map(p => p.id))
    commit({
      ...fresh,
      articles: [...fresh.articles, ...batch.articles.filter(p => !knownArticles.has(p.id))],
      jobs: [...fresh.jobs, ...batch.jobs.filter(p => !knownJobs.has(p.id))],
      page: nextPage,
      moreArticles: batch.articles.length === ARTICLES_PER_PAGE,
      moreJobs: batch.jobs.length === JOBS_PER_PAGE,
    })
    loadingRef.current = false
    setLoading(false)
  }

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800) loadMore()
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const entries = useMemo(() => {
    if (!snapshot) return []
    const matches = (text: string) => {
      const haystack = text.toLowerCase()
      if (!haystack.includes(search.toLowerCase())) return false
      if (activeTag && !haystack.includes(activeTag.toLowerCase())) return false
      return true
    }
    const postText = (p: FeedPost) => `${(p as any).title || ''} ${(p as any).content || ''} ${(p.tags || []).join(' ')}`
    return buildFeed<FeedPost>({
      articles: snapshot.articles.filter(p => matches(postText(p))),
      jobs: snapshot.jobs.filter(p => matches(postText(p))),
      forYou: snapshot.forYou.filter(item => matches(`${item.title} ${item.company || ''} ${item.skills.join(' ')}`)),
      moreArticles: snapshot.moreArticles,
      moreJobs: snapshot.moreJobs,
    })
  }, [snapshot, search, activeTag])

  // Si lo mostrado no llena la pantalla no hay scroll que dispare la siguiente
  // página: se pide sola mientras falte contenido.
  useEffect(() => {
    if (loading || !snapshot) return
    if (document.body.offsetHeight <= window.innerHeight + 800) loadMore()
  }, [entries, loading, snapshot])

  const hasMore = !!snapshot && (snapshot.moreArticles || snapshot.moreJobs)

  return <main className="feed">
    {!user && <HeroBanner onViewJobs={() => document.querySelector('.post-card.job-card')?.scrollIntoView({ behavior: 'smooth' })} />}
    <div className="feed-heading">
      <div>
        <p className="eyebrow">{todayLabel}</p>
        <h1>Tu feed <span className="live-dot" /></h1>
        {activeTag && <span className="active-filter-chip"><Hash size={12} />{activeTag}<button onClick={() => setActiveTag(null)} aria-label="Quitar filtro de tema"><X size={12} /></button></span>}
      </div>
    </div>
    <div className="post-list">
      {entries.map(entry => entry.kind === 'forYou'
        ? <ForYouCard key={entry.key} item={entry.item} />
        : <PostCard key={entry.key} post={entry.post} onAuthRequired={requestAuth} />)}
    </div>
    {loading && <div style={{ textAlign: 'center', padding: 20, color: '#b3aba1' }}><Sparkles size={16} className="spin" /> Cargando más posts...</div>}
    {!loading && entries.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#b3aba1' }}><PenLine size={32} style={{ marginBottom: 12, opacity: 0.5 }} /><p>No hay posts disponibles</p></div>}
    {!loading && !hasMore && entries.length > 0 && <div style={{ textAlign: 'center', padding: 20, color: '#b3aba1' }}>No hay más posts</div>}
  </main>
}
