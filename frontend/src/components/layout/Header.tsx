'use client'

import { useEffect } from 'react'
import { useApp } from './AppProvider'
import type { NavSection } from '@/app/page'
import AvocadoAppSwitcher from './AppSwitcher'

function getSectionLabel(active: string): string {
  const ERP_MENU = [
    {
      title: 'CORE',
      categories: [
        {
          title: '🏠 Dashboard',
          items: [
            { id: 'dashboard', label: 'Resumen general' },
            { id: 'recent-activity', label: 'Actividad reciente' },
            { id: 'notifications', label: 'Notificaciones' },
          ]
        },
        {
          title: '👤 Mi Perfil',
          items: [
            { id: 'profile-data', label: 'Datos personales' },
            { id: 'photo-brand', label: 'Foto & marca' },
            { id: 'preferences', label: 'Preferencias' },
          ]
        },
        {
          title: '💳 Facturación',
          items: [
            { id: 'billing-plan', label: 'Plan actual' },
            { id: 'payment-history', label: 'Historial de pagos' },
            { id: 'change-plan', label: 'Cambiar plan' },
          ]
        },
        {
          title: '🔒 Seguridad',
          items: [
            { id: 'security-password', label: 'Contraseña' },
            { id: 'active-sessions', label: 'Sesiones activas' },
            { id: 'api-keys', label: 'API Keys' },
          ]
        },
        {
          title: '❓ Ayuda',
          items: [
            { id: 'help-docs', label: 'Documentación' },
            { id: 'tutorials', label: 'Tutoriales' },
            { id: 'support', label: 'Soporte' },
            { id: 'feedback', label: 'Dar feedback' },
          ]
        },
      ]
    },
    {
      title: 'CMS',
      categories: [
        {
          title: '📊 Estrategia',
          items: [
            { id: 'cms-dashboard', label: 'Dashboard CMS' },
            { id: 'calendar-month', label: 'Calendario editorial' },
            { id: 'content-report', label: 'Auditoría & análisis' },
            { id: 'ai-chat', label: 'Co-pilot de Negocio', pro: true },
          ]
        },
        {
          title: '✏️ Content Ops',
          items: [
            { id: 'topics-all', label: 'Banco de temas' },
            { id: 'redactor-new', label: 'Redactor IA' },
            { id: 'templates-mine', label: 'Plantillas & formatos' },
            { id: 'history-all', label: 'Historial' },
            { id: 'auto-gen-style', label: 'Generador automático', pro: true },
          ]
        },
        {
          title: '📡 Canales',
          items: [
            { id: 'li-dash', label: 'LinkedIn' },
            { id: 'substack-dash', label: 'Substack' },
            { id: 'wp-dash', label: 'WordPress', soon: true },
            { id: 'x-dash', label: 'X / Twitter', soon: true },
            { id: 'multichannel-create', label: 'Multicanal', pro: true },
          ]
        },
        {
          title: '⚡ Automatización',
          items: [
            { id: 'webhooks-mine', label: 'Webhooks' },
            { id: 'zapier-connections', label: 'Zapier / Make' },
            { id: 'integrations-wp', label: 'Integraciones' },
            { id: 'flows-mine', label: 'Flujos automáticos', pro: true },
          ]
        },
      ]
    },
  ];

  for (const group of ERP_MENU) {
    for (const cat of group.categories) {
      for (const item of cat.items) {
        if (item.id === active) return item.label;
      }
    }
  }
  return 'Sección';
}

interface Props { 
  activeSection: NavSection;
  onMenuClick?: () => void;
}

export function Header({ activeSection, onMenuClick }: Props) {
  useEffect(() => {
    document.title = `Avocado Estudio | ${getSectionLabel(activeSection)}`
  }, [activeSection])

  return (
    <header className="topbar">
      {/* Mobile Menu Button */}
      <button 
        onClick={onMenuClick}
        className="md:hidden p-2 hover:text-white transition-colors"
        style={{ color: '#7D8FA9', display: 'none' }}
      >
        <i className="pi pi-bars text-lg"></i>
      </button>

      {/* Logo & Breadcrumb */}
      <div className="av-topbar-logo">
        <div className="logo-icon" style={{ width: 28, height: 28, borderRadius: 6, background: '#4ECCA3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
          🥑
        </div>
        <span className="logo-text" style={{ fontWeight: 700, fontSize: 15, color: '#F0F6FC', letterSpacing: '0.05em' }}>AVOCADO ESTUDIO</span>
      </div>

      <div className="av-topbar-breadcrumb">
        <span style={{ color: '#7D8FA9', fontWeight: 600 }}>Avocado Estudio</span>
        <span className="sep" style={{ color: '#3D4F63' }}>/</span>
        <span className="current" style={{ color: '#F0F6FC', fontWeight: 500 }}>{getSectionLabel(activeSection)}</span>
      </div>

      <div className="av-topbar-search" style={{ position: 'relative', flex: 1, maxWidth: 480, margin: '0 auto' }}>
        <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#3D4F63', fontSize: 12 }}></i>
        <input 
          type="text" 
          placeholder="Buscar contenido, canales, tendencias..." 
          style={{ 
            width: '100%', 
            background: '#0A0E1A', 
            border: '1px solid #1E2D3D', 
            borderRadius: 6, 
            padding: '6px 12px 6px 32px', 
            color: '#F0F6FC', 
            fontSize: 13, 
            outline: 'none',
          }} 
        />
      </div>

      {/* Right Section */}
      <div className="av-topbar-right">
        <div className="av-ai-status" style={{ padding: '4px 10px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 4 }}>
          <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ECCA3', boxShadow: '0 0 6px #4ECCA3' }}></span>
          <span>Claude Haiku 4.5</span>
        </div>
        
        <div style={{ color: '#7D8FA9', cursor: 'pointer', fontSize: 14 }}>
          <i className="fa-regular fa-bell"></i>
        </div>
        
        <AvocadoAppSwitcher />
        
        <div className="av-topbar-avatar" style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4ECCA3, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
          KG
        </div>
      </div>
    </header>
  )
}