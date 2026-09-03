'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell, Bookmark, BriefcaseBusiness, ChevronDown, Compass, Flame,
  Hash, Home, Menu, MessageCircle, MoreHorizontal, PenLine, Plus, Search,
  Send, Share2, ShieldCheck, Sparkles, Tag, TrendingUp, Trophy, Users, X,
  Zap, ArrowBigUp, LockKeyhole, CheckCircle2
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const mockPosts = [
  { id: 'mock-1', type: 'job', author: 'Bot Vacantes', initials: 'BV', avatar: '/avatars/bot-vacantes.png', badge: 'Bot Vacantes', time: 'hace 3h', tag: 'empleos', title: 'Buscamos Senior React + Node.js para producto fintech', excerpt: 'Equipo remoto en Latam. Necesitamos a alguien que disfrute construyendo productos con impacto real.', stack: ['React', 'Node.js', 'Remote'], votes: 96, comments: 14, budget: '$35–50 / hr', color: 'emerald' },
  { id: 'mock-3', type: 'discussion', author: 'Sofía Herrera', initials: 'SH', avatar: '/avatars/sofia-herrera.png', badge: 'Dev', time: 'hace 4h', tag: 'debate', title: '¿Seguimos necesitando una capa de estado global en 2026?', excerpt: 'Entre Server Components, URL state y signals, mi store cada vez tiene menos responsabilidades. ¿Cómo lo están resolviendo?', stack: ['React', 'Arquitectura'], votes: 184, comments: 62, color: 'blue' },
  { id: 'mock-4', type: 'showcase', author: 'Mateo Lima', initials: 'ML', avatar: '/avatars/mateo-lima.png', badge: 'Dev', time: 'ayer', tag: 'showcase', title: 'Lancé una herramienta para visualizar tus queries de PostgreSQL', excerpt: 'Una pequeña utilidad open source para entender planes de ejecución sin salir del editor.', stack: ['PostgreSQL', 'TypeScript', 'Open Source'], votes: 132, comments: 21, color: 'violet' },
]

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
  type: 'editorial'
  author: { id: string | null; username: string; display_name: string; avatar_url: string | null }
  tags: string[]
  votesCount: number
  commentsCount: number
  image_url: string | null
  slug: string
  word_count: number
  created_at: string
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

type FeedPost = EditorialPost | typeof mockPosts[number]

function PostCard({ post, onUnlock }: { post: FeedPost; onUnlock: () => void }) {
  const router = useRouter(); const [voted, setVoted] = useState(false); const [saved, setSaved] = useState(false)

  const isEditorial = (post as EditorialPost).type === 'editorial'
  const isScraperJob = (post as any).is_scraper_post === true
  const author = isEditorial ? ((post as EditorialPost).author?.display_name || 'Avocado Studio') : isScraperJob ? 'Avocado Jobs Bot' : ((post as any).author || 'Anónimo')
  const initials = isEditorial ? 'AS' : isScraperJob ? '🤖' : (post as any).initials || '?'
  const avatar = isEditorial ? '' : (post as any).avatar
  const badge = isEditorial ? 'Staff Avocado' : isScraperJob ? 'Auto-encontrado' : (post as any).badge || ''
  const time = isEditorial ? formatTime((post as EditorialPost).created_at) : (post as any).time || ''
  const stack = isEditorial ? (post as EditorialPost).tags || [] : (post as any).stack || []
  const votes = isEditorial ? (post as EditorialPost).votesCount : (post as any).votes || 0
  const comments = isEditorial ? (post as EditorialPost).commentsCount : (post as any).comments || 0
  const excerpt = isEditorial ? (post as EditorialPost).content : (post as any).excerpt || ''
  const postType = (post as any).type || 'normal'
  const color = isEditorial ? 'cyan' : (post as any).color || 'gray'

  // Scraper-specific fields
  const platform = (post as any).platform as string | undefined
  const sourceName = (post as any).source_name as string | undefined
  const sourceUrl = (post as any).source_url as string | undefined
  const contacts = (post as any).contacts as { emails?: string[]; whatsapp?: string[]; telegramLinks?: string[] } | undefined
  const location = (post as any).location as string | undefined
  const workModality = (post as any).work_modality as string | undefined
  const budget = (post as any).budget as string | undefined
  const modalidad = (post as any).modalidad as string | undefined

  const openPost = (e?: React.MouseEvent<HTMLElement>) => { if (e?.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return; router.push(`/post/${post.id}`) }

  const platformIcons: Record<string, string> = { telegram: '✈️', forobeta: '💬', reddit: '🔴' }
  const platformNames: Record<string, string> = { telegram: 'Telegram', forobeta: 'Forobeta', reddit: 'Reddit' }
  const modalityLabels: Record<string, string> = { remote: '🌍 Remoto', onsite: '🏢 Presencial', hybrid: '🔄 Híbrido', unknown: '📍 No especificado' }

  return <article className={`post-card ${postType === 'job' ? 'job-card' : ''}`} onClick={openPost}>
    {postType === 'job' && <div className="job-line" />}
    <div className="post-top"><Link className="author-row author-link" href={`/users/${author.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} onClick={e => e.stopPropagation()}><Avatar initials={initials} tone={color} avatar={avatar} /><div><div className="author-name">{author} {badge === 'Staff Avocado' && <ShieldCheck size={13} className="verified" />}</div><div className="post-meta">{badge} <span>·</span> {time}</div></div></Link><button className="icon-button" aria-label="Más opciones"><MoreHorizontal size={18} /></button></div>
    <div className="post-type-label">{postType === 'job' ? 'VACANTE / PROYECTO' : postType === 'showcase' ? 'MOSTRAR PROYECTO' : postType === 'editorial' ? 'ARTÍCULO' : 'POST NORMAL'}</div><h2>{post.title}</h2><p className="post-excerpt">{excerpt}</p>
    {isEditorial && (post as EditorialPost).image_url && <div style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden' }}><img src={(post as EditorialPost).image_url!} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} /></div>}
    {stack.length > 0 && <div className="stack-row">{stack.map((item: string) => <span className={`stack-badge stack-${item.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} key={item}>{item}</span>)}</div>}
    {postType === 'job' && <div className="job-details">
      {/* Info row: Budget + Modalidad + Location */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {budget && <div style={{ padding: '4px 10px', background: '#f0fdf4', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#166534' }}>💰 {budget}</div>}
        {(modalidad || (workModality && workModality !== 'unknown')) && <div style={{ padding: '4px 10px', background: '#eff6ff', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#1e40af' }}>{modalityLabels[workModality || 'unknown'] || modalidad}</div>}
        {location && <div style={{ padding: '4px 10px', background: '#fefce8', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#854d0e' }}>📍 {location}</div>}
      </div>
      {/* Platform source */}
      {isScraperJob && platform && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        <span>{platformIcons[platform] || '🔗'}</span>
        <span>{platformNames[platform] || platform}</span>
        {sourceName && <span>· {sourceName}</span>}
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#3b82f6', textDecoration: 'none' }}> (ver original)</a>}
      </div>}
      {/* Contact info */}
      {contacts && (contacts.emails?.length || contacts.whatsapp?.length || contacts.telegramLinks?.length) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 8 }}>
          {contacts.emails?.map((email: string) => <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>📧 <a href={`mailto:${email}`} onClick={e => e.stopPropagation()} style={{ color: '#3b82f6' }}>{email}</a></div>)}
          {contacts.whatsapp?.map((wa: string) => <div key={wa} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>📱 <a href={wa} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#25d366' }}>WhatsApp</a></div>)}
          {contacts.telegramLinks?.map((tg: string) => <div key={tg} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>✈️ <a href={tg} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#0088cc' }}>{tg}</a></div>)}
        </div>
      ) : (
        <button className="unlock-button" onClick={onUnlock}><LockKeyhole size={14} /> Ver contacto directo</button>
      )}
    </div>}
    <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{votes + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{comments} comentarios</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
  </article>
}

function RightSidebar({ onUnlock }: { onUnlock: () => void }) {
  return <aside className="right-sidebar"><section className="widget"><div className="widget-title"><span>Conversaciones en fuego</span><Flame size={16} /></div>{[['¿El fin de los microservicios?', '128 respuestas'], ['Bun vs Node: batalla final', '84 respuestas'], ['IA generativa en producción', '57 respuestas']].map(([title, replies], i) => <button className="trend-item" key={title} onClick={() => onUnlock()}><span className="trend-number">0{i + 1}</span><span><strong>{title}</strong><small>{replies}</small></span></button>)}<button className="see-all">Ver todas las tendencias <ArrowBigUp size={14} /></button></section><section className="widget opportunities"><div className="widget-title"><span>Oportunidades destacadas</span><BriefcaseBusiness size={16} /></div><div className="mini-job"><div className="mini-job-top"><span className="verified-pill"><CheckCircle2 size={12} /> Verificada</span><span className="mini-time">3d restantes</span></div><strong>Frontend Engineer · React</strong><p>Producto B2B · Remoto en Latam</p><div className="mini-job-bottom"><span>$40–55 / hr</span><button onClick={onUnlock}>Ver detalles <ArrowBigUp size={13} /></button></div></div><div className="mini-job"><div className="mini-job-top"><span className="verified-pill"><CheckCircle2 size={12} /> Verificada</span><span className="mini-time">5d restantes</span></div><strong>DevOps / Cloud Engineer</strong><p>Startup seed · España / Remoto</p><div className="mini-job-bottom"><span>Proyecto fijo</span><button onClick={onUnlock}>Ver detalles <ArrowBigUp size={13} /></button></div></div></section><section className="widget community-widget"><div className="widget-title"><span>La comunidad</span><Users size={16} /></div><div className="community-stats"><div><strong>18.4k</strong><small>miembros</small></div><div><strong>2.1k</strong><small>publicaciones</small></div><div><strong>94%</strong><small>responden</small></div></div><div className="online-line"><span className="online-dot" /> 342 en línea</div></section></aside>
}

function PublishModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('Post Normal'); const [preview, setPreview] = useState(false)
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"><div className="modal-header"><div><p className="eyebrow">Nueva publicación</p><h2 id="publish-title">¿Qué quieres compartir?</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div><div className="publish-tabs">{['Post Normal', 'Publicar Vacante / Proyecto', 'Mostrar Proyecto'].map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div><div className="editor-toolbar"><span className="mono-label">MARKDOWN</span><button className={preview ? 'tool-active' : ''} onClick={() => setPreview(!preview)}>{preview ? 'Editar' : 'Vista previa'}</button></div>{preview ? <div className="preview-pane"><p className="eyebrow">Vista previa</p><h3>Comparte algo que valga la pena leer</h3><p>Tu publicación aparecerá aquí con formato Markdown.</p></div> : <textarea className="editor" placeholder={mode === 'Publicar Vacante / Proyecto' ? 'Describe el proyecto, stack, presupuesto y modalidad...' : 'Escribe algo que la comunidad quiera conversar...'} aria-label="Contenido de la publicación" /> }<div className="modal-bottom"><div className="stack-picker"><Tag size={15} /><span>Añadir tags</span><span className="stack-badge">React</span><span className="stack-badge">+</span></div><button className="publish-button" onClick={onClose}>Publicar <Send size={15} /></button></div></section></div>
}

function AuthModal({ onClose }: { onClose: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><div className="lock-orb"><LockKeyhole size={20} /></div><p className="eyebrow">Contacto directo</p><h2 id="auth-title">Desbloquea esta oportunidad</h2><p>Regístrate en 1 clic con GitHub o Google para acceder a los datos de contacto y unirte a la conversación.</p><button className="oauth-button github-button"><img className="brand-auth-icon github-brand-icon" src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/light.svg" alt="" aria-hidden="true" /> Continuar con GitHub</button><button className="oauth-button google-button"><img className="brand-auth-icon" src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg" alt="" aria-hidden="true" /> Continuar con Google</button><small>Al continuar aceptas nuestras reglas de comunidad.</small></section></div> }

export function CommunityHub() {
  const [activeTab, setActiveTab] = useState('Tendencias')
  const [search, setSearch] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [editorialPosts, setEditorialPosts] = useState<EditorialPost[]>([])

  useEffect(() => {
    fetch(`${API_URL}/api/community/posts/editorial?limit=10`)
      .then(res => res.json())
      .then(data => { if (data.posts) setEditorialPosts(data.posts) })
      .catch(() => {})
  }, [])

  const allPosts: FeedPost[] = useMemo(() => {
    const editorialMapped = editorialPosts.map(p => ({
      ...p,
      author: p.author.display_name,
      initials: 'AS',
      avatar: '',
      badge: 'Staff Avocado' as const,
      time: formatTime(p.created_at),
      tag: p.tags[0] || 'avocado',
      excerpt: p.content,
      stack: p.tags,
      votes: p.votesCount,
      comments: p.commentsCount,
      color: 'cyan',
    }))
    return [...editorialMapped, ...mockPosts] as FeedPost[]
  }, [editorialPosts])

  const filteredPosts = useMemo(() => allPosts.filter(p => {
    const type = (p as any).type
    const matchesTab = activeTab === 'Tendencias' || (activeTab === 'Últimos Envíos') || (activeTab === 'Vacantes & Freelance' && type === 'job') || (activeTab === 'Showcase Projects' && type === 'showcase')
    const searchStr = `${(p as any).title || ''} ${(p as any).excerpt || ''} ${((p as any).stack || []).join(' ')}`.toLowerCase()
    return matchesTab && searchStr.includes(search.toLowerCase())
  }), [activeTab, search, allPosts])

  return <div className="app-shell"><header className="topbar"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button><div className="brand"><span className="brand-mark">&gt;_</span><span>a<span className="brand-accent">vocado</span></span></div><div className="search-wrap"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar discusiones, tags, personas..." aria-label="Buscar" /><kbd>⌘ K</kbd></div><div className="top-actions"><button className="icon-button notification" aria-label="Notificaciones"><Bell size={18} /><span /></button><button className="publish-button top-publish" onClick={() => window.location.href = '/create'}><Plus size={16} /> Publicar</button><Link href="/profile" className="topbar-profile-link" aria-label="Abrir mi perfil"><Avatar initials="JD" tone="blue" avatar="/avatars/javier-developer.png" /></Link></div></header><div className={`mobile-drawer ${mobileMenu ? 'open' : ''}`}><div className="drawer-head"><strong>Menú</strong><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><X size={18} /></button></div><LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} /></div><div className="layout"><LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} /><main className="feed"><div className="feed-heading"><div><p className="eyebrow">Viernes, 31 de agosto</p><h1>Tu feed <span className="live-dot" /></h1></div><button className="filter-button">Para ti <ChevronDown size={15} /></button></div><div className="feed-tabs" role="tablist">{tabs.map(({ label, icon: Icon }) => <button key={label} role="tab" aria-selected={activeTab === label} className={activeTab === label ? 'active' : ''} onClick={() => setActiveTab(label)}><Icon size={15} />{label}</button>)}</div><div className="post-list">{filteredPosts.map(post => <PostCard key={post.id} post={post} onUnlock={() => setAuthOpen(true)} />)}</div></main><RightSidebar onUnlock={() => setAuthOpen(true)} /></div>{publishOpen && <PublishModal onClose={() => setPublishOpen(false)} />}{authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}</div>
}
