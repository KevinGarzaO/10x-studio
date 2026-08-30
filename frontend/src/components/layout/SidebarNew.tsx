'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'calendar',
    label: 'Calendario Editorial',
    href: '/calendar',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'topics',
    label: 'Banco de Temas',
    href: '/topics',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'redactor',
    label: 'Redactor IA',
    href: '/redactor',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
        <path d="M12 3L4 9v12h16V9l-8-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M9.5 15.5l1.5-4 1.5 4M10.25 14h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M17 3l1 3-3-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    href: '/linkedin',
    icon: (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
        <circle cx="4" cy="4" r="2"/>
      </svg>
    ),
  },
  {
    id: 'substack',
    label: 'Substack',
    href: '/substack',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
        <path d="M4 4h16M4 9h16M4 20l8-7 8 7V9H4v11z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'web',
    label: 'Web',
    href: '/web',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 3c-2.5 3-4 5.7-4 9s1.5 6 4 9M12 3c2.5 3 4 5.7 4 9s-1.5 6-4 9M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
]

interface SidebarProps {
  pathname: string;
}

function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
  return pathname.startsWith(href)
}

export default function SidebarNew({ pathname }: SidebarProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  return (
    <aside
      className="sidebar"
      style={{ width: collapsed ? 64 : 228, transition: 'width 0.3s', flexShrink: 0, position: 'relative' }}
    >
      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute', top: 22, right: 4, zIndex: 10,
          width: 22, height: 22, borderRadius: '50%',
          background: '#0f172a', border: '1.5px solid #334155',
          color: '#94a3b8', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#e2e8f0' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#0f172a'; e.currentTarget.style.color = '#94a3b8' }}
      >
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24">
          <path d={collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Logo — links to /dashboard */}
      <Link
        href="/dashboard"
        className="flex items-center gap-3 flex-shrink-0"
        style={{
          padding: '20px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          justifyContent: collapsed ? 'center' : undefined,
          textDecoration: 'none',
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: '0 0 16px rgba(16,185,129,0.35)',
            fontSize: 18,
          }}
        >
          🥑
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
              Avocado
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Estudio
            </div>
          </div>
        )}
      </Link>

      {/* Nav */}
      <div className="av-sidebar-nav">
        {!collapsed && (
          <div className="av-sidebar-nav-section">Principal</div>
        )}
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, pathname)
            return (
              <Link
                key={item.id}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className="av-sidebar-nav-item"
                style={{
                  padding: collapsed ? '9px 0' : '9px 10px',
                  justifyContent: collapsed ? 'center' : undefined,
                  color: active ? 'var(--sidebar-fg-active)' : 'var(--sidebar-fg)',
                  background: active ? 'var(--sidebar-item-active)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active && <span className="active-indicator" />}
                <span className="nav-icon" style={{ color: active ? 'var(--sidebar-accent)' : 'inherit' }}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="label">{item.label}</span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* User */}
      <div
        className="flex-shrink-0"
        style={{
          padding: '12px 8px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          position: 'relative',
        }}
        ref={menuRef}
      >
        {/* Settings dropdown */}
        {userMenuOpen && (
          <>
            {/* Invisible backdrop to catch clicks */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setUserMenuOpen(false)} />
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 4px)', left: 8, right: 8, zIndex: 50,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 10, border: '1px solid rgba(226,232,240,0.8)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.03)',
              overflow: 'hidden', animation: 'fadeSlideUp 0.18s cubic-bezier(0.16,1,0.3,1)'
            }}>
              <button
                onClick={() => { router.push('/settings'); setUserMenuOpen(false) }}
                style={{
                  width: '100%', padding: '11px 14px', border: 'none', background: 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: '#334155', textAlign: 'left',
                  transition: 'all 0.1s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; e.currentTarget.style.color = '#0d1117' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#334155' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Configuración
              </button>
            </div>
          </>
        )}

        <div
          className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all"
          style={{ justifyContent: collapsed ? 'center' : undefined }}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-item-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div
            className="flex items-center justify-center flex-shrink-0 rounded-full text-white font-bold"
            style={{ width: 30, height: 30, fontSize: 12, background: 'linear-gradient(135deg,#10b981,#059669)', fontFamily: 'var(--font-heading)' }}
          >
            KG
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Kevin Garza
                </div>
                <div style={{ fontSize: 11, color: '#475569' }}>Pro</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
