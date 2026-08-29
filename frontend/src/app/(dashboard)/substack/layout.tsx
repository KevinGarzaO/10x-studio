'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const SUB_TABS = [
  { href: '/substack', label: 'Artículos', exact: true },
  { href: '/substack/subscribers', label: 'Suscriptores', exact: false },
  { href: '/substack/publish', label: 'Publicar', exact: false },
  { href: '/substack/notes', label: 'Notes', exact: false },
]

export default function SubstackLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="px-8 py-7" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#ef4444', color: '#fff' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M4 4h16M4 9h16M4 20l8-7 8 7V9H4v11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
              Substack
            </h1>
          </div>
          <p style={{ fontSize: 13.5, color: '#64748b' }}>Publicación y gestión de suscriptores</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: '#f1f5f9', display: 'inline-flex' }}>
        {SUB_TABS.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href) && pathname !== '/substack'
          const active = isActive || (tab.href === '/substack' && pathname === '/substack')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="px-4 py-2 rounded-lg transition-all"
              style={{
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                background: active ? '#fff' : 'transparent',
                color: active ? '#0d1117' : '#94a3b8',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
