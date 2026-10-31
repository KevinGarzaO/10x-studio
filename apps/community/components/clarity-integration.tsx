'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { clarityBootstrap, clarityEnabled, CLARITY_PROJECT_ID, linkClaritySession } from '../lib/clarity'
import { currentSessionId } from '../lib/web-analytics'
import { getCachedUser } from '../lib/session'

/**
 * Sincroniza Clarity con nuestra analítica: en cada página (y cuando cambia la cuenta) le pasa la cuenta y el id de la sesión.
 * La sesión de analítica se abre un instante después de cargar la página, por eso se reintenta una vez.
 */
export function useClarityIntegration(): void {
  const pathname = usePathname()

  useEffect(() => {
    if (!clarityEnabled()) return
    const link = () => {
      const user = getCachedUser()
      linkClaritySession({ userId: user?.id ?? null, sessionId: currentSessionId(), path: pathname, userKind: user?.user_kind ?? null })
    }
    link()
    const retry = window.setTimeout(link, 1500)
    return () => window.clearTimeout(retry)
  }, [pathname])
}

/** El script de Clarity (asíncrono, después de que la página es interactiva) y la sincronización. No dibuja nada. */
export function ClarityIntegration() {
  // Se decide en el navegador: el equipo (`?notrack=1`) no debe ni cargar el script.
  const [on, setOn] = useState(false)
  useEffect(() => setOn(clarityEnabled()), [])
  useClarityIntegration()

  if (!on) return null
  return <Script id="clarity-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: clarityBootstrap(CLARITY_PROJECT_ID) }} />
}
