'use client'

import { useEffect } from 'react'
import AvocadoAppSwitcher from './AppSwitcher'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Resumen general',
  '/settings': 'Contraseña',
  '/calendar': 'Calendario editorial',
  '/topics': 'Banco de temas',
  '/redactor': 'Redactor IA',
  '/linkedin': 'LinkedIn',
  '/substack': 'Substack',
  '/web': 'Web',
}

function getSectionLabel(pathname: string): string {
  const base = '/' + (pathname.split('/')[1] || '')
  return ROUTE_LABELS[base] || 'Sección'
}

interface Props {
  pathname: string;
  onMenuClick?: () => void;
}

export function Header({ pathname, onMenuClick }: Props) {
  useEffect(() => {
    document.title = `Avocado Estudio | ${getSectionLabel(pathname)}`
  }, [pathname])

  return (
    <header className="topbar">
      {/* Logo */}
      <div className="av-topbar-logo">
        <div className="logo-icon">
          <i className="fa-solid fa-avocado" style={{ fontSize: 14 }}></i>
        </div>
        <span className="logo-text">Avocado Estudio</span>
      </div>

      {/* Breadcrumb */}
      <div className="av-topbar-breadcrumb">
        <span style={{ color: 'var(--text-muted)' }}>Inicio</span>
        <span className="sep">/</span>
        <span className="current">{getSectionLabel(pathname)}</span>
      </div>

      {/* Search */}
      <div className="av-topbar-search">
        <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
        <input 
          type="text" 
          placeholder="Buscar contenido, canales, tendencias..." 
        />
      </div>

      {/* Right Section */}
      <div className="av-topbar-right">
        <button style={{ 
          background: 'var(--bg-muted)', 
          border: 'none', 
          color: 'var(--text-secondary)', 
          cursor: 'pointer', 
          fontSize: 15,
          padding: '8px 10px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.15s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <i className="fa-regular fa-bell"></i>
        </button>
        
        <AvocadoAppSwitcher />
        
        <div className="av-topbar-avatar">
          KG
        </div>
      </div>
    </header>
  )
}
