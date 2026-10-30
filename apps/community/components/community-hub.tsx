'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Bell, Bookmark, BriefcaseBusiness, Flame,
  Hash, Menu, MessageCircle, PenLine, Search,
  LogOut, Send, Settings, Share2, ShieldCheck, Sparkles, Tag, Target, TrendingUp, Users, X,
  ArrowBigUp, LockKeyhole, CheckCircle2, Building, MapPin, Home as HomeIcon, Mail, Clock, Check, BadgeCheck, Eye
} from 'lucide-react'
import { companySlug, formatCompanyName } from '../lib/company'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../lib/profile-options'
import { useShell, type AuthRequest } from '../lib/shell-context'
import { saveReturnTo } from '../lib/return-to'
import { DEFAULT_ROLES, DEFAULT_TAGS, assignHues, tagHref, type SidebarRole, type SidebarTag } from '../lib/tag-colors'
import { getToken, clearSession } from '../lib/session'
import { buildFeed, type MatchedItem } from '../lib/mixed-feed'
import { ForYouCard } from './for-you-card'
import { VacancyStats, type VacancyStatsData } from './vacancy-stats'
import { PostStats } from './post-stats'
import { compactStats } from '../lib/feed-stats'
import { fetchJsonWithSession } from '../lib/session'
import { DEFAULT_FILTERS, applyFeedFilters, feedSummary, profileProgress, type FeedFilters, type FeedView } from '../lib/feed-filters'
import { ProfileHoverCard } from './profile-hover-card'
import { excerptOf } from '../lib/user-markdown'
import { HeroBanner } from './hero-banner'
import { RECOMMENDED_SKILLS, shouldNudgeSkills } from '../lib/skills-recommendation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Module-level cache to preserve feed state across navigations
// El feed guardado dura poco: pasado este tiempo se vuelve a pedir, para que las cifras (vistas, guardados) y el
// orden por popularidad se pongan al día cuando alguien regresa al inicio.
const FEED_CACHE_MS = 60 * 1000
const feedCache = new Map<string, { at: number; snapshot: FeedSnapshot }>()

// Al abrir una tarjeta se recuerda dónde iba la persona en el feed: al volver (con "Volver al feed" o con la flecha
// del navegador) el feed reaparece en ese mismo lugar, no arriba ni al final de la página de la vacante.
const FEED_RETURN_MS = 30 * 60 * 1000
let feedReturn: { y: number; at: number } | null = null

export function rememberFeedPosition() {
  if (typeof window !== 'undefined') feedReturn = { y: window.scrollY, at: Date.now() }
}

/** Olvida el feed guardado (lo usan las pruebas, y sirve para forzar una recarga). */
export function clearFeedCache() {
  feedCache.clear()
  feedReturn = null
}

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
  /** Si quien mira ya votó esta publicación (discusiones y proyectos). */
  hasVoted?: boolean
  /** Cuánta gente abrió, guardó y se postuló a la vacante (solo en vacantes). */
  stats?: VacancyStatsData
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

// Si la foto no carga (un enlace de LinkedIn que venció, por ejemplo) se muestran las iniciales: una foto rota
// no deja un hueco en blanco.
function Avatar({ initials, tone = 'cyan', avatar }: { initials: string; tone?: string; avatar?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [avatar])
  return avatar && !failed
    ? <img className="avatar avatar-photo" src={avatar} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <div className={`avatar avatar-${tone}`} aria-hidden="true">{initials}</div>
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
    return (
      <div className="topbar-auth">
        <Link href="/signup" className="topbar-signup">Crear cuenta</Link>
      </div>
    )
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
        const fetched: SidebarRole[] = (d?.roles || []).map((r: { slug: string; label?: string; count?: number }) => ({ slug: r.slug, label: r.label || r.slug, count: typeof r.count === 'number' ? r.count : undefined }))
        if (fetched.length > 0) setRoles(fetched)
      })
      .catch(() => {})
  }, [])

  return <aside className="left-sidebar">
    <nav className="side-nav" aria-label="Navegación principal">
      {[
        { href: '/', label: 'Inicio', icon: <HomeIcon size={18} /> },
        { href: '/publicar', label: 'Publicar', icon: <PenLine size={18} /> },
        { href: '/empleos', label: 'Empleos por skill', icon: <BriefcaseBusiness size={18} /> },
        { href: '/puestos', label: 'Empleos por puesto', icon: <Target size={18} /> },
        { href: '/saved', label: 'Guardadas', icon: <Bookmark size={18} /> },
      ].map(item => (
        <Link key={item.href} href={item.href} className={`side-nav-link ${pathname === item.href ? 'active' : ''}`} aria-current={pathname === item.href ? 'page' : undefined}>
          {item.icon}{item.label}
        </Link>
      ))}
    </nav>
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
            <span className="tag-label">{role.label}</span>{typeof role.count === 'number' && <span className="tag-count">{role.count}</span>}
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
    <div style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid var(--line)', flexShrink: 0, position: 'relative' }}>
      {showLogo && <img src={resolvedLogo!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={() => setLogoFailed(true)} />}
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)', fontWeight: 800, fontSize: size * 0.35, position: 'relative', zIndex: showLogo ? -1 : 0 }}>{initials}</div>
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
  const router = useRouter(); const [voted, setVoted] = useState(!!post.hasVoted); const [saved, setSaved] = useState(!!post.isSaved)
  const [historyId, setHistoryId] = useState<string | null>(post.historyId ?? null)
  // Session comes from the shared shell context — every card used to fetch
  // its own copy, which meant one request per card rendered on the page.
  const { user } = useShell()

  // Discusiones y proyectos se votan de verdad (se guarda en el servidor). Los artículos del equipo todavía no tienen
  // dónde guardar el voto, así que ahí solo cambia en pantalla.
  const isMemberPost = post.type === 'discussion' || post.type === 'showcase'
  const handleVote = async () => {
    if (!isMemberPost) { setVoted(value => !value); return }
    if (!user) { onAuthRequired?.(); return }
    const next = !voted
    setVoted(next)
    try {
      const res = await fetch(`${API_URL}/api/community/posts/${post.id}/vote`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) setVoted(!next)
    } catch {
      setVoted(!next)
    }
  }
  // El número cuenta el voto propio una sola vez, venga ya guardado o recién dado.
  const shownVotes = Math.max(0, post.votesCount + (voted ? 1 : 0) - (post.hasVoted ? 1 : 0))

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
  // Guardar o quitar el guardado se refleja al instante en la cifra, sin esperar a que el servidor la recalcule.
  const liveStats = post.stats
    ? { ...post.stats, saves: Math.max(0, post.stats.saves + (saved ? 1 : 0) - (post.isSaved ? 1 : 0)) }
    : post.stats
  const time = formatTime(post.created_at)
  const image = post.image_url
  const job = isJob ? parseJobContent(post.content || post.original_text || '') : null
  const company = formatCompanyName(post.company || job?.company) || null
  const isScraped = post.is_scraper_post
  // Fallback: use source_url if applyUrl not found in content
  const rawApplyUrl = job?.applyUrl || post.source_url || null
  const applyUrl = buildApplyUrl(post.platform ?? null, rawApplyUrl)

  const openPost = (e?: React.MouseEvent<HTMLElement>) => { if (e?.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return; rememberFeedPosition(); const isJob = post.type === 'job'; const slug = post.slug || post.id; const basePath = isJob ? (slug.startsWith('/vacantes/') ? slug : `/vacantes/${slug}`) : `/post/${post.id}`; router.push(basePath) }

  if (isJob) {
    // "No especificado" es el relleno del scraper cuando no detectó modalidad: no dice nada.
    const modality = [job?.modality, post.modalidad].find(m => m && !/no especificado/i.test(m))
    const where = (job?.location || post.location || '').split(/[•;|]/)[0].trim()
    const facts = [where, modality, SENIORITY_LABELS[post.seniority_level ?? ''] || post.seniority_level]
      .filter((fact, i, all): fact is string => !!fact && all.findIndex(other => other?.toLowerCase() === fact.toLowerCase()) === i)
    const tags = (post.tags || []).filter(Boolean).slice(0, 5)
    return <article className="post-card job-card" onClick={openPost}>
      <div className="jc-head">
        <ProfileHoverCard kind="company" id={company ? companySlug(company) : null} name={company || 'AvoTalent'} photoUrl={post.company_logo} href={company ? `/empresas/${companySlug(company)}` : null}>
          <Link href={company ? `/empresas/${companySlug(company)}` : '#'} className="jc-company" onClick={e => !company && e.preventDefault()}>
            <CompanyAvatar company={company} logoUrl={post.company_logo} size={32} />
            <span className="jc-company-name">{company || 'AvoTalent'}</span>
          </Link>
        </ProfileHoverCard>
        <span className="jc-time">{time}</span>
        <span className="post-type-badge">VACANTE</span>
        <span className="footer-spacer" />
        <button className={`icon-button ${saved ? 'saved' : ''}`} onClick={handleSaveClick} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
      <h2 className="jc-title">{job?.role || post.title}</h2>
      {(facts.length > 0 || job?.salary) && (
        <p className="jc-facts">
          {facts.join(' · ')}
          {job?.salary && <strong className="jc-salary">{facts.length > 0 ? ' · ' : ''}{job.salary}</strong>}
        </p>
      )}
      {tags.length > 0 && <div className="jc-tags">{tags.map(tag => <span key={tag} className="jc-tag"><i>#</i>{tag}</span>)}</div>}
      <div className="jc-meta">
        {compactStats(liveStats, post.commentsCount) && <span className="jc-stats-line">{compactStats(liveStats, post.commentsCount)}</span>}
        <span className="footer-spacer" />
        <span className="jc-more">Ver vacante →</span>
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
  const typeLabel = post.type === 'showcase' ? 'PROYECTO' : post.type === 'discussion' ? 'DISCUSIÓN' : 'ARTÍCULO'
  const badgeTone = post.type === 'showcase' ? 'is-showcase' : post.type === 'discussion' ? '' : 'is-article'
  // Solo artículos y showcase llevan imagen: una discusión es texto, y un
  // placeholder rayado ahí solo metería ruido.
  const showsMedia = post.type === 'showcase' || post.type === 'editorial'

  return <article className="post-card" onClick={openPost}>
    <div className="jc-head">
      <ProfileHoverCard kind="user" id={hasRealAuthor ? authorUsername : null} name={authorName} photoUrl={authorPhoto} href={authorUsername ? `/users/${authorUsername}` : null}>
        <Link href={authorUsername ? `/users/${authorUsername}` : '#'} className="jc-company" onClick={e => (!hasRealAuthor || !authorUsername) && e.preventDefault()}>
          <Avatar initials={authorInitials} tone="cyan" avatar={authorPhoto || undefined} />
          <span className="jc-company-name">{authorName} {!hasRealAuthor && <ShieldCheck size={13} className="verified" />}</span>
        </Link>
      </ProfileHoverCard>
      <span className="jc-time">{time}</span>
      <span className={`post-type-badge ${badgeTone}`}>{typeLabel}</span>
      <span className="footer-spacer" />
      <button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button>
    </div>
    <h2 className="jc-title">{post.title}</h2>
    {image
      ? <div className="post-media"><img src={image} alt="" /></div>
      : showsMedia && <div className="post-media is-placeholder"><span>{typeLabel}</span></div>}
    <p className="post-excerpt">{excerptOf(post.content, 200)}</p>
    {post.tags && post.tags.length > 0 && (
      <div className="jc-tags">{post.tags.slice(0, 5).map(tag => <span key={tag} className="jc-tag"><i>#</i>{tag}</span>)}</div>
    )}
    <div className="jc-meta">
      <PostStats
        votes={shownVotes}
        voted={voted}
        onVote={handleVote}
        comments={post.commentsCount}
        readMinutes={post.word_count ? Math.max(1, Math.round(post.word_count / 200)) : null}
      />
      <span className="footer-spacer" />
      <span className="jc-more">Leer →</span>
    </div>
  </article>
}

interface FeaturedUser {
  username: string
  displayName: string
  photoUrl: string | null
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  validatedSkills: number
}

export function RightSidebar({ onUnlock }: { onUnlock: () => void }) {
  const [people, setPeople] = useState<FeaturedUser[]>([])
  const [featured, setFeatured] = useState<FeedPost[]>([])
  const [stats, setStats] = useState<{ members: number; companies: number; vacancies: number } | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/community/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {})
  }, [])

  // Quiénes destacan en la comunidad: personas reales con el perfil completo, las que más validan sus skills primero.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch(`${API_URL}/api/community/discover/featured-users?limit=5`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setPeople(d?.users || []))
      .catch(() => {})
  }, [])

  // Las vacantes que más interesan (vistas, guardados y postulaciones), no las más nuevas.
  useEffect(() => {
    fetch(`${API_URL}/api/community/posts?page=1&limit=5&type=job&sort=popular`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setFeatured(d?.posts || []))
      .catch(() => {})
  }, [])

  return <aside className="right-sidebar">
    {people.length > 0 && (
      <section className="widget featured-people">
        <div className="widget-title"><span>Usuarios destacados</span></div>
        {people.map(person => {
          const role = ROLE_CATEGORY_LABELS[person.roleCategory ?? ''] || null
          const level = person.seniority ? SENIORITY_LABELS[person.seniority] || person.seniority : null
          return (
            <Link href={`/users/${person.username}`} className="person-item" key={person.username}>
              <Avatar initials={person.displayName.slice(0, 2).toUpperCase()} tone="emerald" avatar={person.photoUrl || undefined} />
              <span className="person-info">
                <strong>{person.displayName}</strong>
                <small>{[role, level].filter(Boolean).join(' · ') || `@${person.username}`}</small>
                {person.validatedSkills > 0 && (
                  <span className="person-validated"><BadgeCheck size={12} /> {person.validatedSkills} {person.validatedSkills === 1 ? 'skill validado' : 'skills validados'}</span>
                )}
              </span>
            </Link>
          )
        })}
      </section>
    )}

    {featured.length > 0 && (
      <section className="widget opportunities">
        <div className="widget-title"><span>Oportunidades destacadas</span></div>
        {featured.map(post => {
          const company = formatCompanyName(post.company) || null
          const level = post.seniority_level ? SENIORITY_LABELS[post.seniority_level] || post.seniority_level : null
          const modality = [post.modalidad].find(value => value && !/no especificado|unknown/i.test(value)) || null
          const views = post.stats?.views ?? 0
          return (
            <Link href={`/vacantes/${post.slug || post.id}`} className="mini-job" key={post.id}>
              <div className="mini-job-row">
                <CompanyAvatar company={company} logoUrl={post.company_logo} size={34} />
                <div className="mini-job-info">
                  <strong>{post.title}</strong>
                  <div className="mini-job-meta">
                    <span className="mini-job-company">{company || 'Comunidad'}</span>
                    {[modality, level].filter(Boolean).map(fact => <span key={fact as string}><span className="mini-job-dot">·</span> {fact}</span>)}
                  </div>
                  {views > 0 && <small className="mini-job-views"><Eye size={12} /> {views} {views === 1 ? 'vista' : 'vistas'}</small>}
                </div>
              </div>
            </Link>
          )
        })}
      </section>
    )}

    <section className="widget community-widget">
      <div className="widget-title"><span>La comunidad</span></div>
      <div className="community-stats">
        <div><strong>{stats?.members != null ? formatCount(stats.members) : '—'}</strong><small>miembros</small></div>
        <div><strong>{stats?.companies != null ? formatCount(stats.companies) : '—'}</strong><small>empresas</small></div>
        <div><strong>{stats?.vacancies != null ? formatCount(stats.vacancies) : '—'}</strong><small>vacantes</small></div>
      </div>
    </section>
  </aside>
}

export function AuthModal({ onClose, request, locked = false, gate = false }: { onClose: () => void; request?: AuthRequest | null; locked?: boolean; gate?: boolean }) {
  const router = useRouter()
  const vacancy = request?.variant === 'vacancy'

  // Con el aviso abierto la página de atrás no se desplaza: solo el aviso, si no cabe en la pantalla.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  // Se recuerda la página en la que estaba: al terminar el registro (y el onboarding) se
  // le regresa a ella en lugar de mandarla al inicio.
  function go(path: '/signup' | '/login') {
    saveReturnTo(window.location.pathname)
    onClose()
    router.push(path)
  }

  const eyebrow = gate ? 'Solo para miembros' : vacancy ? 'Vacante' : 'Contacto directo'
  const title = gate ? 'Crea tu cuenta para entrar' : vacancy ? '¿Te interesa esta vacante?' : 'Desbloquea esta oportunidad'
  const text = gate
    ? 'Las vacantes y la comunidad de AvoTalent son para miembros. Crea tu cuenta gratis o inicia sesión para verlas.'
    : vacancy
    ? 'Regístrate gratis para postularte, guardarla y ver qué tan bien encajas con tus skills. Al terminar tu perfil volverás a esta vacante.'
    : 'Regístrate para acceder a los datos de contacto y unirte a la conversación.'

  function oauth(provider: 'linkedin' | 'github') {
    // La vacante se recuerda también en el OAuth: al terminar el onboarding se
    // vuelve a ella igual que con los botones de correo.
    saveReturnTo(window.location.pathname)
    window.location.href = `${API_URL}/api/community/auth/oauth/${provider}`
  }

  return <div className={`modal-backdrop${locked ? ' is-locked' : ''}`} role="presentation" onMouseDown={e => !locked && e.target === e.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">{!locked && <button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>}<div className="lock-orb"><LockKeyhole size={20} /></div><p className="eyebrow">{eyebrow}</p><h2 id="auth-title">{title}</h2>{vacancy && request?.subject && <p className="auth-subject"><strong>{request.subject}</strong></p>}<p>{text}</p><div className="oauth-stack"><button type="button" className="oauth-btn" onClick={() => oauth('linkedin')}><svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>Continuar con LinkedIn</button><button type="button" className="oauth-btn" onClick={() => oauth('github')}><svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text)" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2 0 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.6 18 4.9 18 4.9c.7 1.7.3 2.9.2 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/></svg>Continuar con GitHub</button><div className="oauth-divider"><span>o continúa con tu correo</span></div></div><button className="oauth-button" style={{ width: '100%', marginBottom: 10, background: 'var(--brand)', color: 'var(--bg)', border: 'none', padding: '12px 16px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }} onClick={() => go('/signup')}>Crear cuenta gratis</button><button className="oauth-button" style={{ width: '100%', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--line)', padding: '12px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }} onClick={() => go('/login')}>Iniciar sesión</button><small style={{ display: 'block', textAlign: 'center', marginTop: 12, color: 'var(--text-muted)', fontSize: 11 }}>Al continuar aceptas nuestras reglas de comunidad.</small></section></div>
}

// The feed's content column — rendered as {children} inside the shared
// CommunityShell (topbar + sidebars) so navigating to/from a post, vacancy,
// or profile only swaps this column instead of remounting the whole page.
//
// Un solo feed con tres tipos de tarjeta: artículos, vacantes y "Para ti"
// (vacantes que coinciden con tus skills, solo con sesión), de lo más nuevo a lo
// más antiguo. buildFeed() decide el orden; aquí solo se traen las fuentes y se
// pagina.
// Páginas chicas: la primera pantalla llega rápido y el resto entra al bajar.
const ARTICLES_PER_PAGE = 4
const JOBS_PER_PAGE = 10
// Cuánto se espera a "Para ti" antes de pintar el feed sin ellas.
const FOR_YOU_WAIT_MS = 3000

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

  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS)
  const [headline, setHeadline] = useState<{ openVacancies?: number; newVacanciesToday?: number } | null>(null)

  // Las cifras de la cabecera: vacantes abiertas y nuevas de hoy.
  useEffect(() => {
    let active = true
    fetchJson(`${API_URL}/api/community/stats`).then(data => { if (active && data) setHeadline(data) })
    return () => { active = false }
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
    feedCache.set(cacheKeyRef.current, { at: Date.now(), snapshot: next })
    setSnapshot(next)
  }

  const fetchBatch = async (pageNum: number) => {
    // Las vacantes se piden CON la sesión: sin ella el servidor no sabe cuáles guardaste y al recargar el
    // marcador aparecía vacío aunque la vacante sí estuviera guardada.
    const token = getToken()
    const [editorial, social, jobs] = await Promise.all([
      fetchJson(`${API_URL}/api/community/posts/editorial?page=${pageNum}&limit=${ARTICLES_PER_PAGE}`),
      // Lo que publican los miembros (discusiones y proyectos), junto a los artículos del equipo.
      fetchJson(`${API_URL}/api/community/posts?page=${pageNum}&limit=${ARTICLES_PER_PAGE}&type=social`, token),
      fetchJson(`${API_URL}/api/community/posts?page=${pageNum}&limit=${JOBS_PER_PAGE}&type=job&sort=popular`, token),
    ])
    const editorialPosts = (editorial?.posts || []) as FeedPost[]
    const socialPosts = (social?.posts || []) as FeedPost[]
    return {
      articles: [...editorialPosts, ...socialPosts],
      jobs: (jobs?.posts || []) as FeedPost[],
      // Hay más páginas si cualquiera de las dos fuentes llenó la suya.
      moreArticles: editorialPosts.length === ARTICLES_PER_PAGE || socialPosts.length === ARTICLES_PER_PAGE,
    }
  }

  // Primera carga: desde caché si ya se había visto, o las tres fuentes a la vez.
  useEffect(() => {
    const token = getToken()
    cacheKeyRef.current = token ? 'member' : 'guest'

    const cached = feedCache.get(cacheKeyRef.current)
    const returning = !!feedReturn && Date.now() - feedReturn.at < FEED_RETURN_MS
    const fresh = !!cached && Date.now() - cached.at < FEED_CACHE_MS

    // Volviendo de una vacante se muestra el feed tal como estaba (aunque tenga más de un minuto) y se baja a donde
    // iba; las cifras se ponen al día en silencio, sin mover ni reordenar ninguna tarjeta.
    if (cached && (fresh || returning)) {
      snapshotRef.current = cached.snapshot
      setSnapshot(cached.snapshot)
      setLoading(false)

      if (returning && feedReturn) {
        const y = feedReturn.y
        feedReturn = null
        const restore = () => window.scrollTo(0, y)
        requestAnimationFrame(restore)
        setTimeout(restore, 120)
        setTimeout(restore, 400)
      }

      if (!fresh) {
        const base = cached.snapshot
        let cancelledRefresh = false
        ;(async () => {
          const pages = await Promise.all(Array.from({ length: base.page }, (_, index) =>
            fetchJson(`${API_URL}/api/community/posts?page=${index + 1}&limit=${JOBS_PER_PAGE}&type=job&sort=popular`, token),
          ))
          if (cancelledRefresh) return
          const latest = new Map<string, FeedPost>()
          for (const page of pages) for (const post of (page?.posts || []) as FeedPost[]) latest.set(post.id, post)
          const current = snapshotRef.current ?? base
          commit({
            ...current,
            jobs: current.jobs.map(job => {
              const next = latest.get(job.id)
              return next ? { ...job, stats: next.stats, isSaved: next.isSaved, historyId: next.historyId } : job
            }),
          })
        })()
        return () => { cancelledRefresh = true }
      }
      return
    }

    let cancelled = false
    loadingRef.current = true
    const run = async () => {
      // Las publicaciones y "Para ti" se piden a la vez y el feed se pinta UNA sola vez, con las dos cosas: antes
      // salían las vacantes y después se colaban las tarjetas "Para ti", y todo se movía. "Para ti" es la consulta
      // más pesada, así que solo se le espera un rato (FOR_YOU_WAIT_MS): si tarda más, el feed sale sin ellas y se
      // agregan al llegar, antes que dejar a la persona viendo esqueletos.
      const loadForYou = async (): Promise<MatchedItem[] | null> => {
        if (!token) return []
        // Un fallo (token vencido ya se renueva dentro; red lenta o servidor frío) se reintenta antes de rendirse.
        let data = await fetchJsonWithSession(`${API_URL}/api/community/feed/for-you`)
        if (!data && !cancelled) {
          await new Promise(resolve => setTimeout(resolve, 2500))
          if (!cancelled) data = await fetchJsonWithSession(`${API_URL}/api/community/feed/for-you`)
        }
        return data ? ((data.items || []) as MatchedItem[]).filter(item => item.matchingSkills > 0) : null
      }
      const forYouPromise = loadForYou()

      const batch = await fetchBatch(1)
      if (cancelled) return
      const early = await Promise.race([forYouPromise, new Promise<'late'>(resolve => setTimeout(() => resolve('late'), FOR_YOU_WAIT_MS))])
      if (cancelled) return
      commit({
        articles: batch.articles,
        jobs: batch.jobs,
        forYou: Array.isArray(early) ? early : [],
        page: 1,
        moreArticles: batch.moreArticles,
        moreJobs: batch.jobs.length === JOBS_PER_PAGE,
      })
      loadingRef.current = false
      setLoading(false)

      if (early !== 'late') return
      const late = await forYouPromise
      const current = snapshotRef.current
      if (!cancelled && late && current) commit({ ...current, forYou: late })
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
      moreArticles: batch.moreArticles,
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
    const visible = applyFeedFilters({
      articles: snapshot.articles.filter(p => matches(postText(p))),
      jobs: snapshot.jobs.filter(p => matches(postText(p))),
      forYou: snapshot.forYou.filter(item => matches(`${item.title} ${item.company || ''} ${item.skills.join(' ')}`)),
    }, filters, user?.seniority)
    return buildFeed<FeedPost>({
      ...visible,
      moreArticles: snapshot.moreArticles,
      moreJobs: snapshot.moreJobs,
    })
  }, [snapshot, search, activeTag, filters, user?.seniority])

  // Si lo mostrado no llena la pantalla no hay scroll que dispare la siguiente
  // página: se pide sola mientras falte contenido.
  useEffect(() => {
    if (loading || !snapshot) return
    if (document.body.offsetHeight <= window.innerHeight + 800) loadMore()
  }, [entries, loading, snapshot])

  const hasMore = !!snapshot && (snapshot.moreArticles || snapshot.moreJobs)

  const firstName = user ? String(user.display_name || user.username || '').trim().split(/\s+/)[0] : ''
  const summary = feedSummary({ open: headline?.openVacancies, newToday: headline?.newVacanciesToday, fit: user ? snapshot?.forYou.length : null })
  const progress = profileProgress(user)
  const views: [FeedView, string][] = user
    ? [['all', 'Todo'], ['forYou', 'Para ti'], ['jobs', 'Vacantes'], ['posts', 'Discusiones']]
    : [['all', 'Todo'], ['jobs', 'Vacantes'], ['posts', 'Discusiones']]
  const filtersActive = filters.view !== 'all' || filters.remote || filters.myLevel

  return <main className="feed">
    {!user && <HeroBanner />}
    <header className="feed-heading">
      <h1>{firstName ? `Hola, ${firstName}` : 'Tu feed'}</h1>
      {summary && <p className="feed-summary">{summary}</p>}
      {activeTag && <span className="active-filter-chip"><Hash size={12} />{activeTag}<button onClick={() => setActiveTag(null)} aria-label="Quitar filtro de tema"><X size={12} /></button></span>}
    </header>
    <div className="feed-chips" role="group" aria-label="Filtros del feed">
      {views.map(([key, label]) => (
        <button key={key} type="button" className={`feed-chip${filters.view === key ? ' is-active' : ''}`} aria-pressed={filters.view === key} onClick={() => setFilters(current => ({ ...current, view: key }))}>{label}</button>
      ))}
      <span className="feed-chips-sep" aria-hidden="true" />
      <button type="button" className={`feed-chip${filters.remote ? ' is-active' : ''}`} aria-pressed={filters.remote} onClick={() => setFilters(current => ({ ...current, remote: !current.remote }))}>Remoto</button>
      {user?.seniority && (
        <button type="button" className={`feed-chip${filters.myLevel ? ' is-active' : ''}`} aria-pressed={filters.myLevel} onClick={() => setFilters(current => ({ ...current, myLevel: !current.myLevel }))}>Mi nivel</button>
      )}
    </div>
    {shouldNudgeSkills(user) && (
      <div className="skills-nudge" role="note" title={progress.missing.length ? `Te falta: ${progress.missing.join(', ')}` : undefined}>
        <span className="skills-nudge-label">Perfil al {progress.percent} %</span>
        <span className="skills-nudge-bar" role="progressbar" aria-label="Avance de tu perfil" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><i style={{ width: `${progress.percent}%` }} /></span>
        <Link href="/settings">Agregar skills</Link>
      </div>
    )}
    {user && (
      <Link href="/publicar" className="feed-compose">
        <PenLine size={18} />
        <span>Haz una pregunta o abre un tema con la comunidad…</span>
        <strong>Publicar</strong>
      </Link>
    )}
    <div className="post-list">
      {entries.map(entry => entry.kind === 'forYou'
        ? <ForYouCard key={entry.key} item={entry.item} />
        : <PostCard key={entry.key} post={entry.post} onAuthRequired={requestAuth} />)}
    </div>
    {loading && !snapshot && (
      <div className="feed-skeletons" aria-busy="true" aria-label="Cargando el feed">
        {[0, 1, 2, 3].map(i => <div key={i} className="feed-skeleton"><i className="sk-line sk-short" /><i className="sk-line sk-title" /><i className="sk-line" /></div>)}
      </div>
    )}
    {loading && snapshot && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}><Sparkles size={16} className="spin" /> Cargando más posts...</div>}
    {!loading && snapshot && entries.length === 0 && (filtersActive
      ? <div className="feed-empty"><p>Nada con estos filtros.</p><button type="button" className="feed-chip" onClick={() => setFilters(DEFAULT_FILTERS)}>Quitar filtros</button></div>
      : <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><PenLine size={32} style={{ marginBottom: 12, opacity: 0.5 }} /><p>No hay posts disponibles</p></div>)}
    {!loading && !hasMore && entries.length > 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No hay más posts</div>}
  </main>
}
