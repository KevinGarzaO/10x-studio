'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { trackEvent } from '../lib/web-analytics'
import { answerApplication, fetchPendingApplication, type Application, type ApplyAnswer } from '../lib/applications'
import { formatCompanyName } from '../lib/company'

/**
 * «¿Ya te postulaste a X?». Cuando la persona sale al sitio de la empresa a postularse y regresa a AvoTalent, aparece esta franja para
 * que lo confirme (Sí, ya / Todavía no / Más tarde). Lo que contesta es lo único que sabemos de sus postulaciones: el formulario es
 * de la empresa, no lo vemos.
 *
 * Se pregunta al abrir una página y cada vez que la pestaña vuelve a estar a la vista, a lo más una vez cada 5 segundos. El servidor
 * decide qué toca preguntar (lo que ya se contestó o quedó en «más tarde» no vuelve a salir), así que preguntar de más no repite nada.
 */
const MIN_GAP_MS = 5000

export function ApplyPrompt({ enabled }: { enabled: boolean }) {
  const [application, setApplication] = useState<Application | null>(null)
  const [thanks, setThanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastAsk = useRef(0)
  const asking = useRef(false)

  const ask = useCallback(async () => {
    if (!enabled || asking.current || Date.now() - lastAsk.current < MIN_GAP_MS) return
    asking.current = true
    lastAsk.current = Date.now()
    try {
      const pending = await fetchPendingApplication()
      if (pending) setApplication(current => current ?? pending)
    } finally {
      asking.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) { setApplication(null); return }
    void ask()
    const onVisible = () => { if (document.visibilityState === 'visible') void ask() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled, ask])

  async function answer(choice: ApplyAnswer) {
    if (!application || busy) return
    setBusy(true)
    const result = await answerApplication(application.id, choice)
    setBusy(false)
    if (!result) return // no se pudo guardar: la franja se queda para intentarlo otra vez
    void trackEvent('application_answer', { answer: choice })
    setApplication(null)
    if (choice === 'applied') {
      setThanks(true)
      window.setTimeout(() => setThanks(false), 8000)
    }
  }

  if (thanks) {
    return (
      <div className="apply-prompt is-thanks" role="status">
        <span className="apply-prompt-text"><Check size={15} aria-hidden="true" /> ¡Genial! La guardamos en <Link href="/postulaciones">Mis postulaciones</Link>, donde puedes ir actualizando cómo avanza.</span>
      </div>
    )
  }
  if (!application) return null

  const company = formatCompanyName(application.company)
  return (
    <div className="apply-prompt" role="status" aria-live="polite">
      <span className="apply-prompt-text">
        ¿Ya te postulaste a <strong>{application.title}</strong>{company ? <> en <strong>{company}</strong></> : null}?
      </span>
      <span className="apply-prompt-actions">
        <button type="button" className="apply-prompt-yes" disabled={busy} onClick={() => answer('applied')}>Sí, ya</button>
        <button type="button" disabled={busy} onClick={() => answer('not_yet')}>Todavía no</button>
        <button type="button" disabled={busy} onClick={() => answer('later')}>Más tarde</button>
      </span>
    </div>
  )
}
