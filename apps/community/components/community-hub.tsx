'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell, Bookmark, BriefcaseBusiness, Flame,
  Hash, Menu, MessageCircle, PenLine, Plus, Search,
  Send, Settings, Share2, ShieldCheck, Sparkles, Tag, Target, TrendingUp, Users, X,
  Zap, ArrowBigUp, LockKeyhole, CheckCircle2, Building, MapPin, Home as HomeIcon, Mail, Clock
} from 'lucide-react'
import { companySlug, formatCompanyName } from '../lib/company'
import { useShell } from '../lib/shell-context'
import { HeroBanner } from './hero-banner'
import { getToken } from '../lib/session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Module-level cache to preserve feed state across navigations
const feedCache = new Map<string, { posts: FeedPost[]; page: number; hasMore: boolean }>()

// Single source of truth for the 4 feed destinations — used by both the
// left sidebar nav and the feed tabs, so they always share the same label
// and icon instead of drifting apart (Inicio/Home vs Tendencias/Flame etc).
export const tabs = [
  { label: 'Tendencias', icon: Flame },
  { label: 'Últimos Envíos', icon: Zap },
  { label: 'Vacantes & Freelance', icon: BriefcaseBusiness },
  { label: 'Showcase Projects', icon: Sparkles },
]

// Short, URL-safe keys for the ?tab=/&from= query params — avoids spaces and
// "&" in the address bar that come from using the display labels directly.
export const TAB_KEYS: Record<string, string> = { 'Tendencias': 'trending', 'Últimos Envíos': 'latest', 'Vacantes & Freelance': 'jobs', 'Showcase Projects': 'showcase' }
export const KEY_TABS: Record<string, string> = Object.fromEntries(Object.entries(TAB_KEYS).map(([label, key]) => [key, label]))

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
        </div>
      )}
    </div>
  )
}

export function LeftSidebar({ onPublish, activeTab, setActiveTab, activeTag, onTagClick }: { onPublish: () => void; activeTab: string; setActiveTab: (v: string) => void; activeTag: string | null; onTagClick: (tag: string) => void }) {
  const [tags, setTags] = useState<string[]>([])
  const { user } = useShell()

  useEffect(() => {
    fetch(`${API_URL}/api/community/stats/tags?limit=6`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTags((d?.tags || []).map((t: { name: string }) => t.name)))
      .catch(() => {})
  }, [])

  return <aside className="left-sidebar">
    <div className="sidebar-section">
      <p className="eyebrow">Comunidad</p>
      <nav className="nav-list" aria-label="Navegación principal">
        {user && (
          <Link href="/para-ti" className="nav-item nav-item-highlight"><Target size={17} /><span>Para ti</span></Link>
        )}
        {tabs.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeTab === label && !activeTag ? 'active' : ''}`} onClick={() => setActiveTab(label)}><Icon size={17} /><span>{label}</span></button>)}
      </nav>
    </div>
    {tags.length > 0 && (
      <div className="sidebar-section tags-section"><div className="section-heading"><p className="eyebrow">Temas en tendencia</p></div>{tags.map(tag => <button key={tag} className={`tag-link ${activeTag === tag ? 'active' : ''}`} aria-pressed={activeTag === tag} onClick={() => onTagClick(tag)}><Hash size={14} />{tag}</button>)}</div>
    )}
    <div className="sidebar-cta"><div className="cta-icon"><PenLine size={16} /></div><strong>Comparte lo que sabes</strong><p>Tu experiencia puede desbloquear la de alguien más.</p><button className="text-button" onClick={() => window.location.href = '/create'}>Crear publicación <Send size={14} /></button></div>
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

function parseJobContent(text: string) {
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
    <div style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #30363d', flexShrink: 0, position: 'relative' }}>
      {showLogo && <img src={resolvedLogo!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={() => setLogoFailed(true)} />}
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117', fontWeight: 800, fontSize: size * 0.35, position: 'relative', zIndex: showLogo ? -1 : 0 }}>{initials}</div>
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

export function PostCard({ post, onAuthRequired, activeTab }: { post: FeedPost; onAuthRequired?: () => void; activeTab?: string }) {
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

  const openPost = (e?: React.MouseEvent<HTMLElement>) => { if (e?.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return; const isJob = post.type === 'job'; const slug = post.slug || post.id; const basePath = isJob ? (slug.startsWith('/vacantes/') ? slug : `/vacantes/${slug}`) : `/post/${post.id}`; const tabParam = activeTab && activeTab !== 'Tendencias' ? `${basePath.includes('?') ? '&' : '?'}from=${TAB_KEYS[activeTab] || 'trending'}` : ''; router.push(`${basePath}${tabParam}`) }

  if (isJob) {
    return <article className={`post-card job-card`} onClick={openPost}>
      <div className="job-line" />
      <div className="post-top"><Link href={company ? `/empresas/${companySlug(company)}` : '#'} className="author-row author-link" onClick={e => !company && e.preventDefault()}>
        <CompanyAvatar company={company} logoUrl={post.company_logo} size={40} />
        <div><div className="author-name">{company || 'AvoTalent'}</div><div className="post-meta">{time}</div></div>
      </Link></div>
      <div className="post-type-label" style={{ color: '#10b981' }}>VACANTE</div>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>{job?.role || post.title}</h2>
      <div className="job-details" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', margin: '6px 0 10px', fontSize: 13, color: '#8b949e' }}>
        {company && <span style={{ background: '#1c2430', padding: '3px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Building size={12} /> {company}</span>}
        {(job?.location || post.location) && <span style={{ background: '#1c2430', padding: '3px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {job?.location || post.location}</span>}
        {job?.salary && <span style={{ background: '#0d3320', color: '#10b981', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{job.salary}</span>}
        {job?.modality && <span style={{ background: '#1c2430', padding: '3px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><HomeIcon size={12} /> {job.modality}</span>}
      </div>
      {job?.description && <p className="post-excerpt" style={{ fontSize: 13, lineHeight: 1.5, color: '#8b949e', margin: '4px 0 10px' }}>{job.description}</p>}
      {job?.requirements && job.requirements.length > 0 && <div style={{ margin: '6px 0', fontSize: 12, color: '#8b949e' }}><strong style={{ color: '#c9d1d9' }}>Requisitos:</strong> {job.requirements.slice(0, 3).join(' · ')}{job.requirements.length > 3 ? ` +${job.requirements.length - 3} más` : ''}</div>}
      {user ? (
        <>
          {applyUrl && <button className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#0d1117', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', margin: '8px 0' }} onClick={e => { e.stopPropagation(); openPost() }}>Postularse ahora →</button>}
          {!applyUrl && job?.emails && job.emails.length > 0 && <div style={{ fontSize: 12, color: '#8b949e', margin: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {job.emails[0]}</div>}
        </>
      ) : (
        <button className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1c2430', border: '1px solid #30363d', color: '#c9d1d9', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer', margin: '8px 0' }} onClick={e => { e.stopPropagation(); onAuthRequired?.() }}>
          <LockKeyhole size={14} /> Desbloquear contacto
        </button>
      )}
      <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount}</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={handleSaveClick} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
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
  const typeLabel = post.type === 'showcase' ? 'MOSTRAR PROYECTO' : post.type === 'discussion' ? 'POST NORMAL' : 'ARTÍCULO'

  return <article className="post-card" onClick={openPost}>
    <div className="post-top">
      <Link href={authorUsername ? `/users/${authorUsername}` : '#'} className="author-row author-link" onClick={e => (!hasRealAuthor || !authorUsername) && e.preventDefault()}>
        <Avatar initials={authorInitials} tone="cyan" avatar={authorPhoto || undefined} />
        <div><div className="author-name">{authorName} {!hasRealAuthor && <ShieldCheck size={13} className="verified" />}</div><div className="post-meta">{!hasRealAuthor ? <>Staff AvoTalent <span>·</span> </> : null}{time}</div></div>
      </Link>
    </div>
    <div className="post-type-label">{typeLabel}</div><h2>{post.title}</h2>
    {image && <div style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden' }}><img src={image} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} /></div>}
    <p className="post-excerpt">{(post.content || '').substring(0, 200)}{(post.content || '').length > 200 ? '...' : ''}</p>
    {post.word_count && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {Math.max(1, Math.round(post.word_count / 200))} min de lectura</div>}
    <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount} comentarios</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
  </article>
}

export function RightSidebar({ onUnlock, activeTab }: { onUnlock: () => void; activeTab: string }) {
  const [trending, setTrending] = useState<FeedPost[]>([])
  const [featured, setFeatured] = useState<FeedPost[]>([])
  const [stats, setStats] = useState<{ members: number; posts: number } | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/community/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {})
  }, [])

  // The sidebar widgets stay constant across tabs — the only tab-driven
  // change is hiding "Oportunidades destacadas" while already on the Jobs
  // tab, to avoid showing the same jobs twice.
  const showFeatured = activeTab !== 'Vacantes & Freelance'

  useEffect(() => {
    fetch(`${API_URL}/api/community/posts/editorial?page=1&limit=3`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTrending(d?.posts || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!showFeatured) return
    fetch(`${API_URL}/api/community/posts?page=1&limit=3&type=job`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setFeatured(d?.posts || []))
      .catch(() => {})
  }, [showFeatured])

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
        <p style={{ color: '#8b949e', fontSize: 13, padding: '8px 0' }}>Sé el primero en iniciar una conversación</p>
      )}
    </section>

    {showFeatured && (
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
          <p style={{ color: '#8b949e', fontSize: 13, padding: '8px 0' }}>Próximamente verás aquí las mejores oportunidades</p>
        )}
      </section>
    )}

    <section className="widget community-widget">
      <div className="widget-title"><span>La comunidad</span><Users size={16} /></div>
      <div className="community-stats">
        <div><strong>{stats ? formatCount(stats.members) : '—'}</strong><small>miembros</small></div>
        <div><strong>{stats ? formatCount(stats.posts) : '—'}</strong><small>publicaciones</small></div>
      </div>
    </section>
  </aside>
}

export function PublishModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('Post Normal'); const [preview, setPreview] = useState(false)
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"><div className="modal-header"><div><p className="eyebrow">Nueva publicación</p><h2 id="publish-title">¿Qué quieres compartir?</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div><div className="publish-tabs">{['Post Normal', 'Publicar Vacante / Proyecto', 'Mostrar Proyecto'].map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div><div className="editor-toolbar"><span className="mono-label">MARKDOWN</span><button className={preview ? 'tool-active' : ''} onClick={() => setPreview(!preview)}>{preview ? 'Editar' : 'Vista previa'}</button></div>{preview ? <div className="preview-pane"><p className="eyebrow">Vista previa</p><h3>Comparte algo que valga la pena leer</h3><p>Tu publicación aparecerá aquí con formato Markdown.</p></div> : <textarea className="editor" placeholder={mode === 'Publicar Vacante / Proyecto' ? 'Describe el proyecto, stack, presupuesto y modalidad...' : 'Escribe algo que la comunidad quiera conversar...'} aria-label="Contenido de la publicación" /> }<div className="modal-bottom"><div className="stack-picker"><Tag size={15} /><span>Añadir tags</span><span className="stack-badge">React</span><span className="stack-badge">+</span></div><button className="publish-button" onClick={onClose}>Publicar <Send size={15} /></button></div></section></div>
}

export function AuthModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><div className="lock-orb"><LockKeyhole size={20} /></div><p className="eyebrow">Contacto directo</p><h2 id="auth-title">Desbloquea esta oportunidad</h2><p>Regístrate para acceder a los datos de contacto y unirte a la conversación.</p><button className="oauth-button" style={{ width: '100%', marginBottom: 10, background: '#10b981', color: '#0d1117', border: 'none', padding: '12px 16px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }} onClick={() => { onClose(); router.push('/signup') }}>Crear cuenta gratis</button><button className="oauth-button" style={{ width: '100%', background: 'transparent', color: '#c9d1d9', border: '1px solid #30363d', padding: '12px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }} onClick={() => { onClose(); router.push('/login') }}>Iniciar sesión</button><small style={{ display: 'block', textAlign: 'center', marginTop: 12, color: '#8b949e', fontSize: 11 }}>Al continuar aceptas nuestras reglas de comunidad.</small></section></div>
}

// The feed's content column — rendered as {children} inside the shared
// CommunityShell (topbar + sidebars) so navigating to/from a post, vacancy,
// or profile only swaps this column instead of remounting the whole page.
export function Feed() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabKeyFromUrl = searchParams.get('tab')
  const initialTab = (tabKeyFromUrl && KEY_TABS[tabKeyFromUrl]) || 'Tendencias'
  const { search, activeTag, setActiveTag, requestAuth, user } = useShell()

  const [activeTab, setActiveTabState] = useState(initialTab)
  const todayLabel = useMemo(() => {
    const label = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [])
  const cached = feedCache.get(initialTab)
  const [posts, setPosts] = useState<FeedPost[]>(cached?.posts || [])
  const [page, setPage] = useState(cached?.page || 1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true)

  // Keep activeTab in sync with the URL through Next's router (not raw
  // history.pushState) so the browser's back/forward buttons work and the
  // encoding matches the rest of the app (encodeURIComponent, not
  // URLSearchParams' "+"-for-space form-encoding).
  useEffect(() => {
    const next = (tabKeyFromUrl && KEY_TABS[tabKeyFromUrl]) || 'Tendencias'
    setActiveTabState(prev => (prev === next ? prev : next))
  }, [tabKeyFromUrl])

  const setActiveTab = useCallback((tab: string) => {
    const key = TAB_KEYS[tab]
    const query = !key || tab === 'Tendencias' ? '' : `?tab=${key}`
    router.push(`/${query}`, { scroll: false })
  }, [router])

  const fetchPosts = async (pageNum: number, tab: string, append = false) => {
    setLoading(true)
    try {
      let url: string
      if (tab === 'Vacantes & Freelance') {
        url = `${API_URL}/api/community/posts?page=${pageNum}&limit=10&type=job`
      } else if (tab === 'Showcase Projects') {
        url = `${API_URL}/api/community/posts?page=${pageNum}&limit=10&type=showcase`
      } else {
        url = `${API_URL}/api/community/posts/editorial?page=${pageNum}&limit=10`
        if (tab === 'Últimos Envíos') url += '&days=7'
      }
      const res = await fetch(url)
      const data = await res.json()
      const newPosts: FeedPost[] = data.posts || []
      if (append) {
        setPosts(prev => {
          const merged = [...prev, ...newPosts]
          feedCache.set(tab, { posts: merged, page: pageNum, hasMore: newPosts.length === 10 })
          return merged
        })
      } else {
        setPosts(newPosts)
        feedCache.set(tab, { posts: newPosts, page: pageNum, hasMore: newPosts.length === 10 })
      }
      setHasMore(newPosts.length === 10)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Switching tabs must always update what's on screen — either from
    // cache, or by fetching. Previously this bailed out on a cache hit
    // without ever calling setPosts, so the feed kept showing whatever the
    // last-rendered tab had.
    const tabCache = feedCache.get(activeTab)
    if (tabCache) {
      setPosts(tabCache.posts)
      setPage(tabCache.page)
      setHasMore(tabCache.hasMore)
      return
    }
    setPosts([])
    setPage(1)
    fetchPosts(1, activeTab)
  }, [activeTab])

  useEffect(() => {
    const handleScroll = () => {
      if (loading || !hasMore) return
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800) {
        const nextPage = page + 1
        setPage(nextPage)
        fetchPosts(nextPage, activeTab, true)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [page, loading, hasMore, activeTab])

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const haystack = `${(p as any).title || ''} ${(p as any).content || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
      if (!haystack.includes(search.toLowerCase())) return false
      if (activeTag && !haystack.includes(activeTag.toLowerCase())) return false
      return true
    })
  }, [search, posts, activeTag])

  return <main className="feed">
    {!user && <HeroBanner onViewJobs={() => setActiveTab('Vacantes & Freelance')} />}
    <div className="feed-heading">
      <div>
        <p className="eyebrow">{todayLabel}</p>
        <h1>Tu feed <span className="live-dot" /></h1>
        {activeTag && <span className="active-filter-chip"><Hash size={12} />{activeTag}<button onClick={() => setActiveTag(null)} aria-label="Quitar filtro de tema"><X size={12} /></button></span>}
      </div>
    </div>
    <div className="feed-tabs" role="tablist">{tabs.map(({ label, icon: Icon }) => <button key={label} role="tab" aria-selected={activeTab === label} className={activeTab === label ? 'active' : ''} onClick={() => setActiveTab(label)}><Icon size={15} />{label}</button>)}</div>
    <div className="post-list">{filteredPosts.map(post => <PostCard key={post.id} post={post} onAuthRequired={requestAuth} activeTab={activeTab} />)}</div>
    {loading && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}><Sparkles size={16} className="spin" /> Cargando más posts...</div>}
    {!loading && filteredPosts.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}><PenLine size={32} style={{ marginBottom: 12, opacity: 0.5 }} /><p>{activeTab === 'Vacantes & Freelance' ? 'No hay vacantes todavía' : activeTab === 'Showcase Projects' ? 'No hay proyectos todavía' : 'No hay posts disponibles'}</p></div>}
    {!hasMore && filteredPosts.length > 0 && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}>No hay más posts</div>}
  </main>
}
