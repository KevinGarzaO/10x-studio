'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { clearSession, getToken } from '@/lib/admin-auth'

const NAV = [
  { href: '/panel', label: 'Resumen', icon: '▦' },
  { href: '/panel/linkedin', label: 'LinkedIn', icon: 'in' },
  { href: '/panel/vacantes', label: 'Vacantes', icon: '▤' },
  { href: '/panel/match', label: 'Match', icon: '✦' },
  { href: '/panel/adquisicion', label: 'Adquisición', icon: '⇢' },
  { href: '/panel/usuarios', label: 'Usuarios', icon: '☺' },
  { href: '/panel/retencion', label: 'Retención', icon: '↻' },
]

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

  if (!ready) return <div className="panel-app" style={{ display: 'block', padding: 32 }}><p className="panel-muted">Cargando…</p></div>

  const active = (href: string) => (href === '/panel' ? pathname === '/panel' : pathname.startsWith(href))

  return (
    <div className="panel-app">
      <aside className="panel-side">
        <Link href="/panel" className="panel-brand">
          <img src="/icon-192.png" alt="" width={30} height={30} />
          <span>Avo<em>Talent</em> <small>Admin</small></span>
        </Link>
        <nav className="panel-nav" aria-label="Secciones del panel">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className={active(item.href) ? 'active' : ''} aria-current={active(item.href) ? 'page' : undefined}>
              <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="panel-side-foot">
          AvoTalent Admin
          <br />
          <button type="button" onClick={() => { clearSession(); router.replace('/login') }}>Cerrar sesión</button>
        </div>
      </aside>
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
  )
}
