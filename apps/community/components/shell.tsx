'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Menu, Plus, Search, X } from 'lucide-react'
import { fetchCurrentUser, getCachedUser } from '../lib/session'
import { ShellContext } from '../lib/shell-context'
import { LeftSidebar, RightSidebar, ProfileMenu, PublishModal, AuthModal } from './community-hub'
import { ProfileGate } from './profile-gate'

export function CommunityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    setUser(getCachedUser())
    fetchCurrentUser().then(u => {
      setUser(u)
    }).catch(() => {})
    // Quién debe completar su perfil lo decide <ProfileGate>, que también cubre
    // la foto y los skills fuera del catálogo, y se monta igual en las pantallas
    // de cuenta que viven fuera de este layout (FR-024, FR-025).
  }, [])

  // Detalle y perfiles se leen en una sola columna: el diseño quita los
  // sidebars para no competir con el contenido.
  const isFocusedRoute = ['/post/', '/vacantes/', '/users/', '/empresas/'].some(prefix => pathname.startsWith(prefix))
    || pathname === '/profile'

  // Un tema filtra el feed; desde cualquier otra pantalla primero se vuelve a él.
  const onTagClick = useCallback((tag: string) => {
    setActiveTag(prev => (prev === tag ? null : tag))
    if (pathname !== '/') router.push('/')
  }, [pathname, router])

  const requestAuth = useCallback(() => setAuthOpen(true), [])

  const contextValue = useMemo(() => ({ user, requestAuth, search, activeTag, setActiveTag }), [user, requestAuth, search, activeTag])

  return (
    <ShellContext.Provider value={contextValue}>
      <ProfileGate />
      <div className="app-shell">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button>
          <Link href="/" className="brand" aria-label="AvoTalent"><span className="brand-mark" aria-hidden="true">A</span><span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span></Link>
          <div className="search-wrap">
            <Search size={17} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar personas, temas, vacantes..." aria-label="Buscar" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <Link href="/notifications" className="icon-button notification" aria-label="Notificaciones"><Bell size={18} /></Link>
            <button className="publish-button top-publish" onClick={() => window.location.href = '/create'}><Plus size={16} /> Publicar</button>
            <ProfileMenu user={user} />
          </div>
        </header>

        <div className={`mobile-drawer ${mobileMenu ? 'open' : ''}`}>
          <div className="drawer-head"><strong>Menú</strong><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><X size={18} /></button></div>
          <LeftSidebar onPublish={() => setPublishOpen(true)} activeTag={activeTag} onTagClick={onTagClick} />
        </div>

        {isFocusedRoute ? (
          // El detalle de una publicación se lee en una sola columna: el diseño
          // quita los sidebars para no competir con el contenido.
          <div className="layout-focused">{children}</div>
        ) : (
          <div className="layout">
            <LeftSidebar onPublish={() => setPublishOpen(true)} activeTag={activeTag} onTagClick={onTagClick} />
            {children}
            <RightSidebar onUnlock={requestAuth} />
          </div>
        )}

        {publishOpen && <PublishModal onClose={() => setPublishOpen(false)} />}
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </div>
    </ShellContext.Provider>
  )
}
