'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clearSession } from '@/lib/admin-auth'
import { Avatar, usePanelData } from './ui'

export interface AdminMe {
  ok: boolean
  user: { username: string | null; displayName: string | null; photoUrl: string | null; email: string | null } | null
}

export const SITE_URL = 'https://avotalent.app'

/** La cuenta de quien mira el panel: foto y nombre en la barra, con configuración y cerrar sesión. */
export function AccountMenu() {
  const router = useRouter()
  const { data } = usePanelData<AdminMe>('/api/admin/analytics/me')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const name = data?.user?.displayName || data?.user?.username || 'Administrador'

  return (
    <div className="panel-account" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Avatar name={name} photo={data?.user?.photoUrl ?? null} />
        <span className="panel-account-name">{name}</span>
      </button>
      {open && (
        <div className="panel-account-menu" role="menu">
          <div className="panel-account-head">
            <strong>{name}</strong>
            {data?.user?.email && <span>{data.user.email}</span>}
          </div>
          <Link href="/panel/configuracion" role="menuitem" onClick={() => setOpen(false)}>Configuración</Link>
          <a href={SITE_URL} target="_blank" rel="noreferrer" role="menuitem">Abrir AvoTalent</a>
          <button type="button" role="menuitem" onClick={() => { clearSession(); router.replace('/login') }}>Cerrar sesión</button>
        </div>
      )}
    </div>
  )
}
