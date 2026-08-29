'use client'

import Link from 'next/link'

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Resumen general', icon: 'fa-solid fa-house', href: '/dashboard' },
  { id: 'calendar-month', label: 'Calendario editorial', icon: 'fa-solid fa-calendar-days', href: '/calendar' },
  { id: 'topics-all', label: 'Banco de temas', icon: 'fa-solid fa-lightbulb', href: '/topics', badge: 5 },
  { id: 'redactor-new', label: 'Redactor IA', icon: 'fa-solid fa-pen-nib', href: '/redactor' },
  { id: 'li-dash', label: 'LinkedIn', icon: 'fa-brands fa-linkedin', href: '/linkedin', badge: 1 },
  { id: 'substack-dash', label: 'Substack', icon: 'fa-solid fa-envelope', href: '/substack', badge: 2 },
  { id: 'web-dash', label: 'Web', icon: 'fa-solid fa-globe', href: '/web' },
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
            <i className={`nav-icon ${item.icon}`}></i>
            <span className="label">{item.label}</span>
            {item.badge && (
              <span className="nav-badge">{item.badge}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
