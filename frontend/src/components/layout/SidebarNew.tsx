'use client'

import { useState } from 'react'
import type { NavSection } from '@/app/page'

interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  pro?: boolean;
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Resumen general', icon: '🏠' },
  { id: 'security-password', label: 'Contraseña', icon: '🔒' },
  { id: 'calendar-month', label: 'Calendario editorial', icon: '🗓️' },
  { id: 'topics-all', label: 'Banco de temas', icon: '💡', badge: 5 },
  { id: 'redactor-new', label: 'Redactor IA', icon: '✏️' },
  { id: 'templates-mine', label: 'Plantillas & formatos', icon: '📝' },
  { id: 'history-all', label: 'Historial', icon: '📜' },
  { id: 'li-dash', label: 'LinkedIn', icon: '💼', badge: 1 },
  { id: 'substack-dash', label: 'Substack', icon: '📧', badge: 2 },
]

interface SidebarProps {
  currentSection: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ currentSection, onNavigate }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="av-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            onClick={() => onNavigate(item.id as NavSection)}
            className={`av-sidebar-nav-item ${currentSection === item.id ? 'active' : ''}`}
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
          </div>
        ))}
      </div>
    </div>
  )
}