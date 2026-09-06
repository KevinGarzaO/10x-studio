'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell, Bookmark, BriefcaseBusiness, ChevronDown, Compass, Flame,
  Hash, Home, Menu, MessageCircle, MoreHorizontal, PenLine, Plus, Search,
  Send, Share2, ShieldCheck, Sparkles, Tag, TrendingUp, Trophy, Users, X,
  Zap, ArrowBigUp, LockKeyhole, CheckCircle2, Building, MapPin, Home as HomeIcon, Mail, Clock
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const navItems = [
  { label: 'Inicio', icon: Home }, { label: 'Explorar', icon: Compass },
  { label: 'Empleos', icon: BriefcaseBusiness, count: '12' }, { label: 'Showcase', icon: Trophy },
]
const tags = ['javascript', 'react', 'nextjs', 'python', 'ia', 'empleos']
const tabs = [{ label: 'Tendencias', icon: Flame }, { label: 'Últimos Envíos', icon: Zap }, { label: 'Vacantes & Freelance', icon: BriefcaseBusiness }, { label: 'Showcase Projects', icon: Sparkles }]

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
}

type FeedPost = EditorialPost

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

function LeftSidebar({ onPublish, activeTab, setActiveTab }: { onPublish: () => void; activeTab: string; setActiveTab: (v: string) => void }) {
  return <aside className="left-sidebar">
    <div className="sidebar-section">
      <p className="eyebrow">Comunidad</p>
      <nav className="nav-list" aria-label="Navegación principal">
        {navItems.map(({ label, icon: Icon, count }) => { const target = label === 'Inicio' ? 'Tendencias' : label === 'Explorar' ? 'Últimos Envíos' : label === 'Empleos' ? 'Vacantes & Freelance' : 'Showcase Projects'; return <button key={label} className={`nav-item ${activeTab === target ? 'active' : ''}`} onClick={() => setActiveTab(target)}><Icon size={17} /><span>{label}</span>{count && <span className="nav-count">{count}</span>}</button> })}
      </nav>
    </div>
    <div className="sidebar-section tags-section"><div className="section-heading"><p className="eyebrow">Tus temas</p><button className="icon-button" aria-label="Editar temas"><MoreHorizontal size={16} /></button></div>{tags.map(tag => <button key={tag} className={`tag-link tag-${tag}`} onClick={() => setActiveTab(tag === 'empleos' ? 'Vacantes & Freelance' : tag === 'react' || tag === 'nextjs' ? 'Últimos Envíos' : 'Tendencias')}><Hash size={14} />{tag}</button>)}<button className="see-all">Ver todos los temas <ChevronDown size={14} /></button></div>
    <div className="sidebar-cta"><div className="cta-icon"><PenLine size={16} /></div><strong>Comparte lo que sabes</strong><p>Tu experiencia puede desbloquear la de alguien más.</p><button className="text-button" onClick={() => window.location.href = '/create'}>Crear publicación <Send size={14} /></button></div>
    <div className="sidebar-footer">© 2026 Avocado <span>·</span> Reglas <span>·</span> Privacidad</div>
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

function PostCard({ post, onAuthRequired, activeTab }: { post: FeedPost; onAuthRequired?: () => void; activeTab?: string }) {
  const router = useRouter(); const [voted, setVoted] = useState(false); const [saved, setSaved] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/community/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user || null))
      .catch(() => {})
  }, [])

  const isJob = post.type === 'job'
  const time = formatTime(post.created_at)
  const image = post.image_url
  const job = isJob ? parseJobContent(post.content || post.original_text || '') : null
  const company = post.company || job?.company || null
  const isScraped = post.is_scraper_post

  const openPost = (e?: React.MouseEvent<HTMLElement>) => { if (e?.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return; const isJob = post.type === 'job'; const slug = post.slug || post.id; const basePath = isJob ? (slug.startsWith('/vacantes/') ? slug : `/vacantes/${slug}`) : `/post/${post.id}`; const tabParam = activeTab && activeTab !== 'Tendencias' ? `${basePath.includes('?') ? '&' : '?'}from=${encodeURIComponent(activeTab)}` : ''; router.push(`${basePath}${tabParam}`) }

  if (isJob) {
    const initials = (company || 'AV').slice(0, 2).toUpperCase()
    const logoUrl = company ? `https://www.google.com/s2/favicons?domain=${company.toLowerCase().replace(/\s+/g, '')}.com&sz=64` : null
    return <article className={`post-card job-card`} onClick={openPost}>
      <div className="job-line" />
      <div className="post-top"><div className="author-row">
        <div className="avatar avatar-emerald" style={{ width: 32, height: 32, minWidth: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117', fontWeight: 800, fontSize: 12, overflow: 'hidden', border: '2px solid #10b981' }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} /> : initials}
        </div>
        <div><div className="author-name">{company || 'AvoTalent'}</div><div className="post-meta">{time}</div></div>
      </div></div>
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
          {job?.applyUrl && <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#0d1117', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none', margin: '8px 0' }} onClick={e => e.stopPropagation()}>Postularse ahora →</a>}
          {!job?.applyUrl && job?.emails && job.emails.length > 0 && <div style={{ fontSize: 12, color: '#8b949e', margin: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {job.emails[0]}</div>}
        </>
      ) : (
        <button className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1c2430', border: '1px solid #30363d', color: '#c9d1d9', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer', margin: '8px 0' }} onClick={e => { e.stopPropagation(); onAuthRequired?.() }}>
          <LockKeyhole size={14} /> Desbloquear contacto
        </button>
      )}
      <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount}</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
    </article>
  }

  return <article className="post-card" onClick={openPost}>
    <div className="post-top"><div className="author-row"><div className="avatar avatar-cyan" style={{ width: 32, height: 32, borderRadius: '50%', background: '#00A86B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117', fontWeight: 800, fontSize: 12 }}>A</div><div><div className="author-name">Avocado Studio <ShieldCheck size={13} className="verified" /></div><div className="post-meta">Staff Avocado <span>·</span> {time}</div></div></div></div>
    <div className="post-type-label">ARTÍCULO</div><h2>{post.title}</h2>
    {image && <div style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden' }}><img src={image} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} /></div>}
    <p className="post-excerpt">{(post.content || '').substring(0, 200)}{(post.content || '').length > 200 ? '...' : ''}</p>
    {post.word_count && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {Math.max(1, Math.round(post.word_count / 200))} min de lectura</div>}
    <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount} comentarios</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
  </article>
}

function RightSidebar({ onUnlock }: { onUnlock: () => void }) {
  const [trending, setTrending] = useState<FeedPost[]>([])
  const [featured, setFeatured] = useState<FeedPost[]>([])

  useEffect(() => {
    fetch(`${API_URL}/api/community/posts/editorial?page=1&limit=3`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTrending(d?.posts || []))
      .catch(() => {})

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
        <p style={{ color: '#8b949e', fontSize: 13, padding: '8px 0' }}>Sé el primero en iniciar una conversación</p>
      )}
    </section>

    <section className="widget opportunities">
      <div className="widget-title"><span>Oportunidades destacadas</span><BriefcaseBusiness size={16} /></div>
      {featured.length > 0 ? featured.map(post => {
        const job = parseMiniJob(post.content || post.original_text || '')
        const company = post.company || job?.company || null
        return (
          <Link href={post.slug?.startsWith('/vacantes/') ? post.slug : `/vacantes/${post.slug || post.id}`} className="mini-job" key={post.id}>
            {!post.is_scraper_post && <div className="mini-job-top"><span className="verified-pill"><CheckCircle2 size={12} /> Verificada</span></div>}
            <strong>{post.title}</strong>
            <p>{company || post.source_name || 'Comunidad'}</p>
            <div className="mini-job-bottom">
              {job.salary && <span>{job.salary}</span>}
              <span>{job.modality || 'Remoto'}</span>
            </div>
          </Link>
        )
      }) : (
        <p style={{ color: '#8b949e', fontSize: 13, padding: '8px 0' }}>Próximamente verás aquí las mejores oportunidades</p>
      )}
    </section>

    <section className="widget community-widget">
      <div className="widget-title"><span>La comunidad</span><Users size={16} /></div>
      <div className="community-stats">
        <div><strong>18.4k</strong><small>miembros</small></div>
        <div><strong>2.1k</strong><small>publicaciones</small></div>
        <div><strong>94%</strong><small>responden</small></div>
      </div>
      <div className="online-line"><span className="online-dot" /> 342 developers online</div>
    </section>
  </aside>
}

function PublishModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('Post Normal'); const [preview, setPreview] = useState(false)
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"><div className="modal-header"><div><p className="eyebrow">Nueva publicación</p><h2 id="publish-title">¿Qué quieres compartir?</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div><div className="publish-tabs">{['Post Normal', 'Publicar Vacante / Proyecto', 'Mostrar Proyecto'].map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div><div className="editor-toolbar"><span className="mono-label">MARKDOWN</span><button className={preview ? 'tool-active' : ''} onClick={() => setPreview(!preview)}>{preview ? 'Editar' : 'Vista previa'}</button></div>{preview ? <div className="preview-pane"><p className="eyebrow">Vista previa</p><h3>Comparte algo que valga la pena leer</h3><p>Tu publicación aparecerá aquí con formato Markdown.</p></div> : <textarea className="editor" placeholder={mode === 'Publicar Vacante / Proyecto' ? 'Describe el proyecto, stack, presupuesto y modalidad...' : 'Escribe algo que la comunidad quiera conversar...'} aria-label="Contenido de la publicación" /> }<div className="modal-bottom"><div className="stack-picker"><Tag size={15} /><span>Añadir tags</span><span className="stack-badge">React</span><span className="stack-badge">+</span></div><button className="publish-button" onClick={onClose}>Publicar <Send size={15} /></button></div></section></div>
}

function AuthModal({ onClose }: { onClose: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><div className="lock-orb"><LockKeyhole size={20} /></div><p className="eyebrow">Contacto directo</p><h2 id="auth-title">Desbloquea esta oportunidad</h2><p>Regístrate en 1 clic con GitHub o Google para acceder a los datos de contacto y unirte a la conversación.</p><button className="oauth-button github-button"><img className="brand-auth-icon github-brand-icon" src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/light.svg" alt="" aria-hidden="true" /> Continuar con GitHub</button><button className="oauth-button google-button"><img className="brand-auth-icon" src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg" alt="" aria-hidden="true" /> Continuar con Google</button><small>Al continuar aceptas nuestras reglas de comunidad.</small></section></div> }

export function CommunityHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const validTabs = ['Tendencias', 'Últimos Envíos', 'Vacantes & Freelance', 'Showcase Projects']
  const initialTab = validTabs.includes(tabFromUrl || '') ? tabFromUrl! : 'Tendencias'

  const [activeTab, setActiveTabState] = useState(initialTab)
  const [search, setSearch] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab)
    const params = new URLSearchParams(window.location.search)
    if (tab === 'Tendencias') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const newUrl = params.toString() ? `?${params.toString()}` : '/'
    window.history.pushState({}, '', newUrl)
  }, [])

  const fetchPosts = async (pageNum: number, tab: string) => {
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
      if (pageNum === 1) {
        setPosts(newPosts)
      } else {
        setPosts(prev => [...prev, ...newPosts])
      }
      setHasMore(newPosts.length === 10)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchPosts(1, activeTab)
  }, [activeTab])

  useEffect(() => {
    const handleScroll = () => {
      if (loading || !hasMore) return
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800) {
        const nextPage = page + 1
        setPage(nextPage)
        fetchPosts(nextPage, activeTab)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [page, loading, hasMore, activeTab])

  const filteredPosts = useMemo(() => posts.filter(p => {
    const searchStr = `${(p as any).title || ''} ${(p as any).content || ''}`.toLowerCase()
    return searchStr.includes(search.toLowerCase())
  }), [search, posts])

  return <div className="app-shell"><header className="topbar"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button><div className="brand"><span className="brand-mark">&gt;_</span><span>a<span className="brand-accent">vocado</span></span></div><div className="search-wrap"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar discusiones, tags, personas..." aria-label="Buscar" /><kbd>⌘ K</kbd></div><div className="top-actions"><button className="icon-button notification" aria-label="Notificaciones"><Bell size={18} /><span /></button><button className="publish-button top-publish" onClick={() => window.location.href = '/create'}><Plus size={16} /> Publicar</button><Link href="/profile" className="topbar-profile-link" aria-label="Abrir mi perfil"><Avatar initials="JD" tone="blue" avatar="/avatars/javier-developer.png" /></Link></div></header><div className={`mobile-drawer ${mobileMenu ? 'open' : ''}`}><div className="drawer-head"><strong>Menú</strong><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><X size={18} /></button></div><LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} /></div><div className="layout"><LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} /><main className="feed"><div className="feed-heading"><div><p className="eyebrow">Viernes, 31 de agosto</p><h1>Tu feed <span className="live-dot" /></h1></div><button className="filter-button">Para ti <ChevronDown size={15} /></button></div><div className="feed-tabs" role="tablist">{tabs.map(({ label, icon: Icon }) => <button key={label} role="tab" aria-selected={activeTab === label} className={activeTab === label ? 'active' : ''} onClick={() => setActiveTab(label)}><Icon size={15} />{label}</button>)}</div><div className="post-list">{filteredPosts.map(post => <PostCard key={post.id} post={post} onAuthRequired={() => setAuthOpen(true)} activeTab={activeTab} />)}</div>{loading && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}><Sparkles size={16} className="spin" /> Cargando más posts...</div>}{!loading && filteredPosts.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}><PenLine size={32} style={{ marginBottom: 12, opacity: 0.5 }} /><p>{activeTab === 'Vacantes & Freelance' ? 'No hay vacantes todavía' : activeTab === 'Showcase Projects' ? 'No hay proyectos todavía' : 'No hay posts disponibles'}</p></div>}{!hasMore && filteredPosts.length > 0 && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}>No hay más posts</div>}</main><RightSidebar onUnlock={() => setAuthOpen(true)} /></div>{publishOpen && <PublishModal onClose={() => setPublishOpen(false)} />}{authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}</div>
}
