'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { Bell, Menu, Plus, Search, X } from 'lucide-react'
import { fetchCurrentUser, getCachedUser } from '../lib/session'
import { ShellContext } from '../lib/shell-context'
import { LeftSidebar, RightSidebar, ProfileMenu, PublishModal, AuthModal, TAB_KEYS, KEY_TABS } from './community-hub'

// The left/right sidebars need to know which of the 4 feed tabs is
// "active" even on pages that aren't the feed itself (a post, a vacancy, a
// profile) — derived straight from the URL so it doesn't depend on any
// page-specific state.
function deriveActiveTab(pathname: string, searchParams: URLSearchParams): string {
  if (pathname === '/') {
    const key = searchParams.get('tab')
    return (key && KEY_TABS[key]) || 'Tendencias'
  }
  if (pathname.startsWith('/vacantes/')) return 'Vacantes & Freelance'
  const from = searchParams.get('from')
  if (from && KEY_TABS[from]) return KEY_TABS[from]
  return 'Tendencias'
}

export function CommunityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
      // Real candidate signups without the essential profile fields get sent
      // to complete them before using the rest of the app. Company/scraped
      // `users` rows never hold an authenticated session, so this can't fire
      // for them.
      if (u && (!u.title || !u.role_category || !u.seniority || !u.skills?.length || !u.location || !u.work_modality)) {
        router.replace('/onboarding')
      }
    }).catch(() => {})
  }, [router])

  const activeTab = deriveActiveTab(pathname, searchParams)

  const setActiveTab = useCallback((tab: string) => {
    const key = TAB_KEYS[tab]
    const query = !key || tab === 'Tendencias' ? '' : `?tab=${key}`
    router.push(`/${query}`, { scroll: false })
  }, [router])

  const onTagClick = useCallback((tag: string) => {
    setActiveTag(prev => (prev === tag ? null : tag))
    if (tag === 'empleos') setActiveTab('Vacantes & Freelance')
    else if (pathname !== '/') router.push('/')
  }, [setActiveTab, pathname, router])

  const requestAuth = useCallback(() => setAuthOpen(true), [])

  const contextValue = useMemo(() => ({ user, requestAuth, search, activeTag, setActiveTag }), [user, requestAuth, search, activeTag])

  return (
    <ShellContext.Provider value={contextValue}>
      <div className="app-shell">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button>
          <Link href="/" className="brand"><span className="brand-mark">&gt;_</span><span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span></Link>
          <div className="search-wrap">
            <Search size={17} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar discusiones, tags, personas..." aria-label="Buscar" />
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
          <LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} activeTag={activeTag} onTagClick={onTagClick} />
        </div>

        <div className="layout">
          <LeftSidebar onPublish={() => setPublishOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} activeTag={activeTag} onTagClick={onTagClick} />
          {children}
          <RightSidebar onUnlock={requestAuth} activeTab={activeTab} />
        </div>

        {publishOpen && <PublishModal onClose={() => setPublishOpen(false)} />}
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </div>
    </ShellContext.Provider>
  )
}
