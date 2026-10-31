'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { clearSession, getToken } from '@/lib/admin-auth'
import { AccountMenu } from './AccountMenu'

interface NavItem {
  href: string
  label: string
  icon: string
  /** Activa solo en esa dirección exacta (el resumen de un módulo no debe quedar activo en sus pantallas). */
  exact?: boolean
}

interface NavGroup {
  id: string
  label: string
  icon: string
  items: NavItem[]
}

/**
 * El menú son MÓDULOS que se pliegan. Analítica es lo que ya existía (negocio, LinkedIn, vacantes, match, usuarios...);
 * Tráfico web es la analítica propia, visita por visita.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'analitica',
    label: 'Analítica',
    icon: '▦',
    items: [
      { href: '/panel', label: 'Resumen', icon: '▦', exact: true },
      { href: '/panel/linkedin', label: 'LinkedIn', icon: 'in' },
      { href: '/panel/vacantes', label: 'Vacantes', icon: '▤' },
      { href: '/panel/match', label: 'Match', icon: '✦' },
      { href: '/panel/adquisicion', label: 'Adquisición', icon: '⇢' },
      { href: '/panel/usuarios', label: 'Usuarios', icon: '☺' },
      { href: '/panel/retencion', label: 'Retención', icon: '↻' },
      { href: '/panel/configuracion', label: 'Configuración', icon: '⚙' },
    ],
  },
  {
    id: 'trafico',
    label: 'Tráfico web',
    icon: '≋',
    items: [
      { href: '/panel/trafico', label: 'Resumen', icon: '≋', exact: true },
      { href: '/panel/trafico/en-vivo', label: 'En vivo', icon: '●' },
      { href: '/panel/trafico/sesiones', label: 'Sesiones', icon: '☰' },
      { href: '/panel/trafico/geografia', label: 'Geografía', icon: '◍' },
      { href: '/panel/trafico/audiencia', label: 'Audiencia', icon: '☻' },
      { href: '/panel/trafico/paginas', label: 'Páginas', icon: '▭' },
      { href: '/panel/trafico/canales', label: 'Canales', icon: '⇉' },
      { href: '/panel/trafico/embudo', label: 'Embudo y eventos', icon: '▽' },
      { href: '/panel/trafico/cohortes', label: 'Cohortes', icon: '▥' },
      { href: '/panel/trafico/retencion', label: 'Retención', icon: '↺' },
    ],
  },
]

const GROUPS_KEY = 'avo_panel_groups'

export const isActive = (item: NavItem, pathname: string) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`))

interface Alert {
  id: string
  level: 'bad' | 'warn'
  title: string
  detail: string
}

/**
 * El marco del panel: menú, alarmas y control de acceso. Sin sesión manda al inicio de sesión; el
 * permiso de superadmin lo vuelve a comprobar el servidor en cada petición, esto solo evita mostrar
 * un panel vacío.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  // Qué módulos están plegados: se recuerda en este navegador. El que contiene la pantalla abierta siempre se muestra.
  const [folded, setFolded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUPS_KEY)
      if (saved) setFolded(JSON.parse(saved))
    } catch {
      // sin almacenamiento: los módulos quedan abiertos
    }
  }, [])

  const toggleGroup = (id: string) => {
    setFolded(current => {
      const next = { ...current, [id]: !current[id] }
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)) } catch { /* no pasa nada */ }
      return next
    })
  }

  useEffect(() => {
    if (!getToken()) router.replace('/login')
    else setReady(true)
  }, [router])

  // Las alarmas se revisan en cada pantalla que se abre: lo grave no debe esperar a que entres a la sección correcta.
  useEffect(() => {
    if (!ready) return
    api<{ alerts: Alert[] }>('/api/admin/analytics/alerts')
      .then(result => setAlerts(result.alerts))
      .catch(() => setAlerts([]))
  }, [ready, pathname])

  // En el celular el menú es un cajón: se cierra al elegir una sección.
  useEffect(() => { setMenuOpen(false) }, [pathname])

  if (!ready) return <div className="panel-app" style={{ display: 'block', padding: 32 }}><p className="panel-muted">Cargando…</p></div>

  const activeGroup = NAV_GROUPS.find(group => group.items.some(item => isActive(item, pathname)))
  const activeItem = activeGroup?.items.find(item => isActive(item, pathname))

  return (
    <div className="panel-app">
      {menuOpen && <div className="panel-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className={`panel-side${menuOpen ? ' open' : ''}`}>
        <Link href="/panel" className="panel-brand">
          <img src="/icon-192.png" alt="" width={32} height={32} />
          <span>Avo<em>Talent</em> <small>Admin</small></span>
        </Link>
        <nav className="panel-nav" aria-label="Secciones del panel">
          {NAV_GROUPS.map(group => {
            // El módulo de la pantalla abierta no se puede plegar: así nunca desaparece dónde estás.
            const open = group.id === activeGroup?.id || !folded[group.id]
            return (
              <div key={group.id} className="panel-group">
                <button type="button" className="panel-group-head" aria-expanded={open} aria-controls={`panel-group-${group.id}`} onClick={() => toggleGroup(group.id)}>
                  <span aria-hidden="true" className="panel-group-icon">{group.icon}</span>
                  <span className="panel-group-label">{group.label}</span>
                  <span aria-hidden="true" className={`panel-group-chevron${open ? ' open' : ''}`}>›</span>
                </button>
                {open && (
                  <div id={`panel-group-${group.id}`} className="panel-group-items">
                    {group.items.map(item => (
                      <Link key={item.href} href={item.href} className={isActive(item, pathname) ? 'active' : ''} aria-current={isActive(item, pathname) ? 'page' : undefined}>
                        <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
      <div className="panel-body">
        <header className="panel-top">
          <button type="button" className="panel-burger" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
            <span /><span /><span />
          </button>
          <Link href="/panel" className="panel-top-brand">
            <img src="/icon-192.png" alt="" width={30} height={30} />
            <span>Avo<em>Talent</em> <small>Admin</small></span>
          </Link>
          <span className="panel-top-title">{activeItem ? `${activeGroup?.label} · ${activeItem.label}` : 'Panel'}</span>
          <AccountMenu />
        </header>
      <main className="panel-main">
        {alerts.length > 0 && (
          <section className="panel-alerts" aria-label="Alarmas">
            {alerts.map(alert => (
              <div key={alert.id} className={`panel-alert ${alert.level}`} role="alert">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </div>
            ))}
          </section>
        )}
        {children}
      </main>
      </div>
    </div>
  )
}
