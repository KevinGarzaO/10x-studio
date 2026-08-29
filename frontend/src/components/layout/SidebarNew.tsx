'use client'

import Link from 'next/link'

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
  pro?: boolean;
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Resumen general', icon: '🏠', href: '/dashboard' },
  { id: 'security-password', label: 'Contraseña', icon: '🔒', href: '/settings' },
  { id: 'calendar-month', label: 'Calendario editorial', icon: '🗓️', href: '/calendar' },
  { id: 'topics-all', label: 'Banco de temas', icon: '💡', href: '/topics', badge: 5 },
  { id: 'redactor-new', label: 'Redactor IA', icon: '✏️', href: '/redactor' },
  { id: 'li-dash', label: 'LinkedIn', icon: '💼', href: '/linkedin', badge: 1 },
  { id: 'substack-dash', label: 'Substack', icon: '📧', href: '/substack', badge: 2 },
  { id: 'web-dash', label: 'Web', icon: '🌍', href: '/web' },
]

interface SidebarProps {
  pathname: string;
}

function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
  return pathname.startsWith(href)
}

export default function Sidebar({ pathname }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="av-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`av-sidebar-nav-item ${isActive(item.href, pathname) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="label">{item.label}</span>
            {item.badge && (
              <span className="nav-badge">{item.badge}</span>
            )}
            {item.pro && (
              <span className="av-badge-pro">PRO</span>
            )}
            {item.soon && (
              <span className="av-badge-soon">SOON</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
