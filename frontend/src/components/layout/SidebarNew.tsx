'use client'

import { useState } from 'react'
import type { NavSection } from '@/app/page'

const CORE_ITEMS = [
  { id: 'dashboard', label: 'Resumen general', icon: '🏠' },
  { id: 'recent-activity', label: 'Actividad reciente', icon: '📋' },
  { id: 'notifications', label: 'Notificaciones', icon: '🔔', badge: 3 },
  { id: 'profile-data', label: 'Datos personales', icon: '👤' },
  { id: 'photo-brand', label: 'Foto & marca', icon: '📷' },
  { id: 'preferences', label: 'Preferencias', icon: '⚙️' },
  { id: 'billing-plan', label: 'Plan actual', icon: '💳' },
  { id: 'payment-history', label: 'Historial de pagos', icon: '📊' },
  { id: 'change-plan', label: 'Cambiar plan', icon: '🔄' },
  { id: 'security-password', label: 'Contraseña', icon: '🔒' },
  { id: 'active-sessions', label: 'Sesiones activas', icon: '💻' },
  { id: 'api-keys', label: 'API Keys', icon: '🔑' },
  { id: 'help-docs', label: 'Documentación', icon: '📚' },
  { id: 'tutorials', label: 'Tutoriales', icon: '🎓' },
  { id: 'support', label: 'Soporte', icon: '❓' },
  { id: 'feedback', label: 'Dar feedback', icon: '💬' },
]

const CMS_ITEMS = [
  { id: 'cms-dashboard', label: 'Dashboard CMS', icon: '📊' },
  { id: 'calendar-month', label: 'Calendario editorial', icon: '🗓️' },
  { id: 'content-report', label: 'Auditoría & análisis', icon: '📈' },
  { id: 'ai-chat', label: 'Co-pilot de Negocio', icon: '🤖', pro: true },
  { id: 'topics-all', label: 'Banco de temas', icon: '💡', badge: 5 },
  { id: 'redactor-new', label: 'Redactor IA', icon: '✏️' },
  { id: 'templates-mine', label: 'Plantillas & formatos', icon: '📝' },
  { id: 'history-all', label: 'Historial', icon: '📜' },
  { id: 'auto-gen-style', label: 'Generador automático', icon: '⚡', pro: true },
  { id: 'li-dash', label: 'LinkedIn', icon: '💼', badge: 1 },
  { id: 'substack-dash', label: 'Substack', icon: '📧', badge: 2 },
  { id: 'wp-dash', label: 'WordPress', icon: '🌐', soon: true },
  { id: 'x-dash', label: 'X / Twitter', icon: '🐦', soon: true },
  { id: 'multichannel-create', label: 'Multicanal', icon: '📡', pro: true },
  { id: 'webhooks-mine', label: 'Webhooks', icon: '🔗' },
  { id: 'zapier-connections', label: 'Zapier / Make', icon: '⚙️' },
  { id: 'integrations-wp', label: 'Integraciones', icon: '🔌' },
  { id: 'flows-mine', label: 'Flujos automáticos', icon: '🔀', pro: true },
]

const CORE_CATEGORIES = [
  { title: 'DASHBOARD', items: CORE_ITEMS.slice(0, 3) },
  { title: 'MI PERFIL', items: CORE_ITEMS.slice(3, 6) },
  { title: 'FACTURACIÓN', items: CORE_ITEMS.slice(6, 9) },
  { title: 'SEGURIDAD', items: CORE_ITEMS.slice(9, 12) },
  { title: 'AYUDA', items: CORE_ITEMS.slice(12, 16) },
]

const CMS_CATEGORIES = [
  { title: 'ESTRATEGIA', items: CMS_ITEMS.slice(0, 4) },
  { title: 'CONTENT OPS', items: CMS_ITEMS.slice(4, 9) },
  { title: 'CANALES', items: CMS_ITEMS.slice(9, 14) },
  { title: 'AUTOMATIZACIÓN', items: CMS_ITEMS.slice(14, 18) },
]

interface SidebarProps {
  currentSection: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ currentSection, onNavigate }: SidebarProps) {
  const [module, setModule] = useState<'core' | 'cms'>('core')

  const categories = module === 'core' ? CORE_CATEGORIES : CMS_CATEGORIES

  return (
    <div className="sidebar">
      {/* Module Selector */}
      <div className="av-module-selector">
        <button
          onClick={() => setModule('core')}
          className="av-module-tab"
          style={{
            background: module === 'core' ? 'rgba(78, 204, 163, 0.1)' : 'transparent',
            color: module === 'core' ? '#4ECCA3' : '#7D8FA9',
          }}
        >
          ⚙️ CORE
        </button>
        <button
          onClick={() => setModule('cms')}
          className="av-module-tab"
          style={{
            background: module === 'cms' ? 'rgba(78, 204, 163, 0.1)' : 'transparent',
            color: module === 'cms' ? '#4ECCA3' : '#7D8FA9',
          }}
        >
          🧭 CMS
        </button>
      </div>

      {/* Navigation */}
      {categories.map((category) => (
        <div key={category.title} className="av-sidebar-section">
          <div className="av-sidebar-section-label">{category.title}</div>
          <div className="av-sidebar-nav">
            {category.items.map((item) => (
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
      ))}
    </div>
  )
}