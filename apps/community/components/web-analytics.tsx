'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { startWebAnalytics, trackPageView } from '../lib/web-analytics'

/**
 * No dibuja nada: mide la visita (sesión, tiempo activo con la pestaña visible, latidos) y cada página que se ve, también
 * al navegar dentro de la app, que no recarga. Ver lib/web-analytics.ts.
 */
export function WebAnalytics() {
  const pathname = usePathname()

  useEffect(() => startWebAnalytics(), [])

  useEffect(() => {
    void trackPageView(pathname)
  }, [pathname])

  return null
}
