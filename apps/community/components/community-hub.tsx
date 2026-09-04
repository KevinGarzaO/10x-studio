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


function parseJobContent(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const company = lines.find(l => /empresa|company/i.test(l))?.replace(/^.*?(empresa|company)\s*:?\s*/i, '') || null
  const location = lines.find(l => /ubicaci[oó]n|location|remoto|remote/i.test(l))?.replace(/^.*?(ubicaci[oó]n|location)\s*:?\s*/i, '') || null
  const features = lines.find(l => /caracter[ií]sticas|features|stack/i.test(l))?.replace(/^.*?(caracter[ií]sticas|features|stack)\s*:?\s*/i, '') || null
  const applyLine = lines.find(l => /postularse|apply|link/i.test(l)) || null
  const applyUrl = applyLine?.match(/https?:\/\/[^\s]+/)?.[0] || null
  const salary = text.match(/[$€]\s?\d[\d,.]*(?:\s?[-–]\s?[$€]?\s?\d[\d,.]*)?/)?.[0] || null
  return { company, location, features, applyUrl, salary }
}

function PostCard({ post }: { post: FeedPost }) {
  const router = useRouter(); const [voted, setVoted] = useState(false); const [saved, setSaved] = useState(false)

  const isJob = post.type === 'job'
  const isEditorial = post.type === 'editorial' || !isJob
  const time = formatTime(post.created_at)
  const excerpt = post.content || ''
  const image = post.image_url
  const job = isJob ? parseJobContent(post.content || post.original_text || '') : null

  const openPost = (e?: React.MouseEvent<HTMLElement>) => { if (e?.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return; router.push(`/post/${post.id}`) }

  if (isJob) {
    const initials = (post.author?.display_name || 'AJ').slice(0, 2).toUpperCase()
    return <article className={`post-card job-card`} onClick={openPost}>
      <div className="job-line" />
      <div className="post-top"><div className="author-row">
        <div className="avatar avatar-emerald" style={{ width: 32, height: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117', fontWeight: 800, fontSize: 12 }}>{initials}</div>
        <div><div className="author-name">{post.author?.display_name || 'Avocado Jobs Bot'} <span className="verified-pill" style={{ marginLeft: 6 }}><CheckCircle2 size={12} /> Verificada</span></div><div className="post-meta">{time} · {post.source_name || post.platform || 'Comunidad'}</div></div>
      </div></div>
      <div className="post-type-label" style={{ color: '#10b981' }}>VACANTE</div>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>{post.title}</h2>
      {job && <div className="job-details" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', margin: '8px 0 12px', fontSize: 13, color: '#8b949e' }}>
        {job.company && <span>🏢 {job.company}</span>}
        {job.location && <span>📍 {job.location}</span>}
        {job.salary && <span style={{ color: '#10b981', fontWeight: 600 }}>{job.salary}</span>}
        {job.features && <span>✨ {job.features}</span>}
      </div>}
      {job?.applyUrl && <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="unlock-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#0d1117', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none', marginBottom: 12 }} onClick={e => e.stopPropagation()}>Postularse ahora →</a>}
      <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount}</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
    </article>
  }

  return <article className="post-card" onClick={openPost}>
    <div className="post-top"><div className="author-row"><div className="avatar avatar-cyan" style={{ width: 32, height: 32, borderRadius: '50%', background: '#00A86B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117', fontWeight: 800, fontSize: 12 }}>A</div><div><div className="author-name">Avocado Studio <ShieldCheck size={13} className="verified" /></div><div className="post-meta">Staff Avocado <span>·</span> {time}</div></div></div></div>
    <div className="post-type-label">ARTÍCULO</div><h2>{post.title}</h2>
    {image && <div style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden' }}><img src={image} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} /></div>}
    <p className="post-excerpt">{excerpt.substring(0, 200)}{excerpt.length > 200 ? '...' : ''}</p>
    {post.word_count && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>📖 {Math.max(1, Math.round(post.word_count / 200))} min de lectura</div>}
    <div className="post-footer"><button className={`vote-button ${voted ? 'voted' : ''}`} onClick={() => setVoted(!voted)}><ArrowBigUp size={17} fill={voted ? 'currentColor' : 'none'} />{post.votesCount + (voted ? 1 : 0)}</button><button className="engagement"><MessageCircle size={16} />{post.commentsCount} comentarios</button><span className="footer-spacer" /><button className={`icon-button ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Guardar"><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label="Compartir"><Share2 size={16} /></button></div>
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
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

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

  return <div className="app-shell"><header className="topbar"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button><div className="brand"><span className="brand-mark">&gt;_</span><span>a<span className="brand-accent">vocado</span></span></div><div className="search-wrap"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar discusiones, tags, personas..." aria-label="Buscar" /><kbd>⌘ K</kbd></div><div className="top-actions"><button className="icon-button notification" aria-label="Notificaciones"><Bell size={18} /><span /></button><button className="publish-button top-publish" onClick={() => window.location.href = '/create'}><Plus size={16} /> Publicar</button><Link href="/profile" className="topbar-profile-link" aria-label="Abrir mi perfil"><Avatar initials="JD" tone="blue" avatar="/avatars/javier-developer.png" /></Link></div></header><div className={`mobile-drawer ${mobileMenu ? 'open' : ''}`}><div className="drawer-head"><strong>Menú</strong><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><X size={18} /></button></div><LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} /></div><div className="layout"><LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} /><main className="feed"><div className="feed-heading"><div><p className="eyebrow">Viernes, 31 de agosto</p><h1>Tu feed <span className="live-dot" /></h1></div><button className="filter-button">Para ti <ChevronDown size={15} /></button></div><div className="feed-tabs" role="tablist">{tabs.map(({ label, icon: Icon }) => <button key={label} role="tab" aria-selected={activeTab === label} className={activeTab === label ? 'active' : ''} onClick={() => setActiveTab(label)}><Icon size={15} />{label}</button>)}</div><div className="post-list">{filteredPosts.map(post => <PostCard key={post.id} post={post} />)}</div>{loading && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}><Sparkles size={16} className="spin" /> Cargando más posts...</div>}{!loading && filteredPosts.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}><PenLine size={32} style={{ marginBottom: 12, opacity: 0.5 }} /><p>{activeTab === 'Vacantes & Freelance' ? 'No hay vacantes todavía' : activeTab === 'Showcase Projects' ? 'No hay proyectos todavía' : 'No hay posts disponibles'}</p></div>}{!hasMore && filteredPosts.length > 0 && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}>No hay más posts</div>}</main><RightSidebar onUnlock={() => setAuthOpen(true)} /></div>{publishOpen && <PublishModal onClose={() => setPublishOpen(false)} />}{authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}</div>
}
