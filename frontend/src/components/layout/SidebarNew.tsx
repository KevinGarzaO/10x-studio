'use client'

import Link from 'next/link'
import { useState } from 'react'

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Resumen General',
    href: '/dashboard',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
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
    badge: 5,
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
    badge: 1,
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
    badge: 2,
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className="sidebar"
      style={{ width: collapsed ? 64 : 228, transition: 'width 0.3s', flexShrink: 0 }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{
          padding: '20px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          justifyContent: collapsed ? 'center' : undefined,
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
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto flex-shrink-0"
          style={{ color: '#475569', transition: 'color 0.15s', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <path d={collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

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
                  <>
                    <span className="label">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="nav-badge">{item.badge}</span>
                    )}
                  </>
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
        }}
      >
        <div
          className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all"
          style={{ justifyContent: collapsed ? 'center' : undefined }}
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
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Kevin Garza
              </div>
              <div style={{ fontSize: 11, color: '#475569' }}>Pro</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
