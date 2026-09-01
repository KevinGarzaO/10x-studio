'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import { api } from '@/lib/api'

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

function daysUntil(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

interface ExpiryNotification {
  platform: string
  label: string
  daysLeft: number
  href: string
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { settings } = useApp()
  const [search, setSearch] = useState('')
  const [showNotifs, setShowNotifs] = useState(false)
  const [substackExpiresAt, setSubstackExpiresAt] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = `Avocado Estudio | ${getSectionLabel(pathname)}`
  }, [pathname])

  const loadSubstackExpiry = useCallback(async () => {
    try {
      const sub = await api<any>('/api/substack/profile')
      if (sub && sub.expires_at) setSubstackExpiresAt(sub.expires_at)
    } catch {}
  }, [])

  useEffect(() => { loadSubstackExpiry() }, [loadSubstackExpiry])

  useEffect(() => {
    if (!showNotifs) return
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifs])

  const notifications: ExpiryNotification[] = []

  if (settings.linkedinExpiresAt) {
    const d = daysUntil(settings.linkedinExpiresAt)
    if (d <= 7) {
      notifications.push({ platform: 'linkedin', label: `LinkedIn expira en ${d} días`, daysLeft: d, href: '/settings#linkedin' })
    }
  }

  if (substackExpiresAt) {
    const d = daysUntil(substackExpiresAt)
    if (d <= 7) {
      notifications.push({ platform: 'substack', label: `Substack expira en ${d} días`, daysLeft: d, href: '/settings#substack' })
    }
  }

  const visibleNotifications = notifications.filter(n => !dismissed.has(n.platform))

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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contenido, canales, tendencias..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12.5, color: '#64748b', width: '100%' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={() => router.push('/redactor')}
          className="flex items-center gap-2 rounded-lg px-4 text-white transition-all cursor-pointer"
          style={{
            height: 34,
            fontSize: 13,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
            fontFamily: 'var(--font-heading)',
            border: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,185,129,0.45)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(16,185,129,0.3)')}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Nuevo artículo
        </button>
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative flex items-center justify-center rounded-lg transition-all"
            style={{ width: 34, height: 34, background: '#f8f9fb', border: '1px solid var(--border)', color: '#64748b', cursor: 'pointer' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {visibleNotifications.length > 0 && (
              <span
                className="absolute flex items-center justify-center rounded-full text-white font-bold"
                style={{ minWidth: 16, height: 16, fontSize: 9, background: '#ef4444', border: '1.5px solid #fff', top: -4, right: -4, padding: '0 4px' }}
              >
                {visibleNotifications.length}
              </span>
            )}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 rounded-xl shadow-xl z-50"
              style={{ width: 300, background: '#fff', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0d1117' }}>Notificaciones</span>
                {visibleNotifications.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{visibleNotifications.length} alerta{visibleNotifications.length > 1 ? 's' : ''}</span>}
              </div>
              {visibleNotifications.length > 0 ? (
                <div className="py-1">
                  {visibleNotifications.map((n, i) => (
                    <button key={n.platform}
                      onClick={() => { setDismissed(prev => new Set([...prev, n.platform])); router.push(n.href); setShowNotifs(false) }}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer"
                      style={{ background: 'transparent', border: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fb')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: n.daysLeft <= 3 ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)' }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                            stroke={n.daysLeft <= 3 ? '#ef4444' : '#f59e0b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1117' }}>{n.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Ir a Configuración</div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: n.daysLeft <= 3 ? '#ef4444' : '#f59e0b' }}>
                        {n.daysLeft}d
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center" style={{ color: '#94a3b8', fontSize: 13 }}>
                  Sin notificaciones
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
