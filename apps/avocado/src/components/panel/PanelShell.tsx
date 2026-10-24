'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clearSession, getToken } from '@/lib/admin-auth'

const NAV = [
  { href: '/panel', label: 'Resumen', icon: '▦' },
  { href: '/panel/linkedin', label: 'LinkedIn', icon: 'in' },
  { href: '/panel/adquisicion', label: 'Adquisición', icon: '⇢' },
  { href: '/panel/usuarios', label: 'Usuarios', icon: '☺' },
  { href: '/panel/retencion', label: 'Retención', icon: '↻' },
]

/**
 * El marco del panel: menú y control de acceso. Sin sesión manda al inicio de sesión; el permiso de
 * superadmin lo vuelve a comprobar el servidor en cada petición, esto solo evita mostrar un panel vacío.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) router.replace('/login')
    else setReady(true)
  }, [router])

  if (!ready) return <div className="panel-app" style={{ display: 'block', padding: 32 }}><p className="panel-muted">Cargando…</p></div>

  const active = (href: string) => (href === '/panel' ? pathname === '/panel' : pathname.startsWith(href))

  return (
    <div className="panel-app">
      <aside className="panel-side">
        <Link href="/panel" className="panel-brand">
          <b>A</b>
          <span>Avo<em>Talent</em></span>
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
          Panel de analítica
          <br />
          <button type="button" onClick={() => { clearSession(); router.replace('/login') }}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="panel-main">{children}</main>
    </div>
  )
}
