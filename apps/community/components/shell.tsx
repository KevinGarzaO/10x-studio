'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Menu, X } from 'lucide-react'
import { fetchCurrentUser, getCachedUser } from '../lib/session'
import { ShellContext, type AuthRequest } from '../lib/shell-context'
import { LeftSidebar, RightSidebar, ProfileMenu, AuthModal } from './community-hub'
import { ProfileGate } from './profile-gate'
import { ThemeToggle } from './theme-toggle'
import { SearchBox } from './search-box'
import { HeroBanner } from './hero-banner'

export function CommunityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null)
  const [userLoaded, setUserLoaded] = useState(false)

  useEffect(() => {
    setUser(getCachedUser())
    fetchCurrentUser().then(u => {
      setUser(u)
    }).catch(() => {}).finally(() => setUserLoaded(true))
    // Quién debe completar su perfil lo decide <ProfileGate>, que también cubre
    // la foto y los skills fuera del catálogo, y se monta igual en las pantallas
    // de cuenta que viven fuera de este layout (FR-024, FR-025).
  }, [])

  // Detalle y perfiles se leen en una sola columna: el diseño quita los
  // sidebars para no competir con el contenido.
  const isFocusedRoute = ['/post/', '/vacantes/', '/users/', '/empresas/', '/empleos', '/puestos'].some(prefix => pathname.startsWith(prefix))
    || pathname === '/profile'

  // Sin cuenta solo se ve el feed, los directorios de empleos y la ficha de cada vacante (esta última detrás
  // de un aviso para registrarse que no se puede cerrar). Todo lo demás exige cuenta.
  const isPublicRoute = pathname === '/' || ['/empleos', '/puestos', '/vacantes/'].some(prefix => pathname.startsWith(prefix))
  const gated = !user && !isPublicRoute
  // Dentro de una vacante el aviso no se cierra: la información queda detrás, desenfocada.
  const lockedNotice = !user && pathname.startsWith('/vacantes/')

  // Un tema filtra el feed; desde cualquier otra pantalla primero se vuelve a él.
  const onTagClick = useCallback((tag: string) => {
    setActiveTag(prev => (prev === tag ? null : tag))
    if (pathname !== '/') router.push('/')
  }, [pathname, router])

  const requestAuth = useCallback((request?: unknown) => {
    // Como onClick directo llega un evento, no unas opciones: solo se acepta lo que trae `variant`.
    setAuthRequest(request && typeof request === 'object' && (request as AuthRequest).variant === 'vacancy' ? (request as AuthRequest) : null)
    setAuthOpen(true)
  }, [])

  const contextValue = useMemo(() => ({ user, userLoaded, requestAuth, search, activeTag, setActiveTag }), [user, userLoaded, requestAuth, search, activeTag])

  return (
    <ShellContext.Provider value={contextValue}>
      <ProfileGate />
      <div className="app-shell">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button>
          <Link href="/" className="brand" aria-label="AvoTalent"><img className="brand-mark" src="/avotalent-logo.png" alt="" aria-hidden="true" /><span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span></Link>
          <SearchBox />
          <div className="top-actions">
            <ThemeToggle />
            {user && <Link href="/notifications" className="icon-button notification" aria-label="Notificaciones"><Bell size={18} /></Link>}
            <ProfileMenu user={user} />
          </div>
        </header>

        <div className={`mobile-drawer ${mobileMenu ? 'open' : ''}`}>
          <div className="drawer-head"><strong>Menú</strong><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><X size={18} /></button></div>
          <LeftSidebar activeTag={activeTag} onTagClick={onTagClick} />
        </div>

        {gated ? (
          <div className="layout-focused">{userLoaded && <HeroBanner />}</div>
        ) : isFocusedRoute ? (
          // El detalle de una publicación se lee en una sola columna: el diseño
          // quita los sidebars para no competir con el contenido.
          <div className="layout-focused">{children}</div>
        ) : (
          <div className="layout">
            <LeftSidebar activeTag={activeTag} onTagClick={onTagClick} />
            {children}
            {user && <RightSidebar onUnlock={requestAuth} />}
          </div>
        )}

        {gated && userLoaded && <AuthModal gate locked onClose={() => {}} request={null} />}
        {!gated && authOpen && <AuthModal onClose={() => setAuthOpen(false)} request={authRequest} locked={lockedNotice} />}
      </div>
    </ShellContext.Provider>
  )
}
