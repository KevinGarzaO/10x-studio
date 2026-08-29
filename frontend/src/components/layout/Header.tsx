'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Resumen General',
  '/settings': 'Ajustes',
  '/calendar': 'Calendario Editorial',
  '/topics': 'Banco de Temas',
  '/redactor': 'Redactor IA',
  '/linkedin': 'LinkedIn',
  '/substack': 'Substack',
  '/web': 'Web',
}

function getSectionLabel(pathname: string): string {
  const base = '/' + (pathname.split('/')[1] || '')
  return ROUTE_LABELS[base] || 'Sección'
}

export function Header() {
  const pathname = usePathname()

  useEffect(() => {
    document.title = `Avocado Estudio | ${getSectionLabel(pathname)}`
  }, [pathname])

  return (
    <header className="topbar">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: '#94a3b8' }}>
        <span style={{ color: '#64748b' }}>Inicio</span>
        <span>/</span>
        <span style={{ color: '#0d1117', fontWeight: 600 }}>{getSectionLabel(pathname)}</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-md mx-auto">
        <div
          className="flex items-center gap-2 px-3 rounded-lg"
          style={{ height: 34, background: '#f8f9fb', border: '1px solid var(--border)' }}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" style={{ color: '#94a3b8', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            placeholder="Buscar contenido, canales, tendencias..."
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12.5, color: '#64748b', width: '100%' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 ml-auto">
        <button
          className="flex items-center gap-2 rounded-lg px-4 text-white transition-all"
          style={{
            height: 34,
            fontSize: 13,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
            fontFamily: 'var(--font-heading)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,185,129,0.45)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(16,185,129,0.3)')}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Nuevo artículo
        </button>
        <button
          className="relative flex items-center justify-center rounded-lg transition-all"
          style={{ width: 34, height: 34, background: '#f8f9fb', border: '1px solid var(--border)', color: '#64748b', cursor: 'pointer' }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span
            className="absolute rounded-full"
            style={{ width: 6, height: 6, background: '#10b981', border: '1.5px solid #fff', top: 7, right: 7 }}
          />
        </button>
      </div>
    </header>
  )
}
