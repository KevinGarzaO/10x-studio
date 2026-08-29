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
        <span className="current" style={{ color: '#F0F6FC', fontWeight: 500 }}>{getSectionLabel(pathname)}</span>
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
