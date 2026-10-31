'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { clarityBootstrap, clarityEnabled, CLARITY_PROJECT_ID, linkClaritySession, sendClarityLink } from '../lib/clarity'
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
      const sessionId = currentSessionId()
      linkClaritySession({ userId: user?.id ?? null, sessionId, path: pathname, userKind: user?.user_kind ?? null })
      // Las cookies de Clarity aparecen unos segundos después de cargar su script: de ahí los reintentos.
      sendClarityLink(sessionId)
    }
    link()
    const retries = [1500, 5000, 15000].map(ms => window.setTimeout(link, ms))
    return () => retries.forEach(window.clearTimeout)
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
