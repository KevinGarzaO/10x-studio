'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, Send } from 'lucide-react'
import { trackEvent } from '../lib/web-analytics'
import { answerApplication, fetchPendingApplication, type Application, type ApplyAnswer } from '../lib/applications'
import { formatCompanyName } from '../lib/company'
import { enablePush, recordPushEvent, rememberPushDismissed, shouldOfferPush } from '../lib/push'

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
  // Después de contestar (cualquiera de las tres), se invita a activar los avisos push para darle seguimiento a esa vacante.
  const [pushOffer, setPushOffer] = useState<{ choice: ApplyAnswer; title: string } | null>(null)
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

  // Escape = «Más tarde».
  useEffect(() => {
    if (!application) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') void answerRef.current('later') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [application])

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

  const answerRef = useRef<(choice: ApplyAnswer) => Promise<void>>(async () => {})
  async function answer(choice: ApplyAnswer) {
    if (!application || busy) return
    setBusy(true)
    const result = await answerApplication(application.id, choice)
    setBusy(false)
    if (!result) return // no se pudo guardar: la franja se queda para intentarlo otra vez
    void trackEvent('application_answer', { answer: choice })
    setApplication(null)
    if (shouldOfferPush()) {
      setPushOffer({ choice, title: application.title })
      void recordPushEvent('prompt_shown', 'application_answer')
      return
    }
    finish(choice)
  }

  function finish(choice: ApplyAnswer) {
    if (choice === 'applied') {
      setThanks(true)
      window.setTimeout(() => setThanks(false), 8000)
    }
  }

  async function activatePush() {
    if (!pushOffer || busy) return
    setBusy(true)
    await enablePush('application_answer')
    setBusy(false)
    const { choice } = pushOffer
    setPushOffer(null)
    finish(choice)
  }

  function skipPush() {
    if (!pushOffer) return
    rememberPushDismissed()
    void recordPushEvent('prompt_dismissed', 'application_answer')
    const { choice } = pushOffer
    setPushOffer(null)
    finish(choice)
  }

  answerRef.current = answer

  if (pushOffer) {
    const hint = pushOffer.choice === 'applied'
      ? 'Te avisamos cuando toque ver cómo te fue y si aparece algo parecido, para que no se te pase nada.'
      : 'Te avisamos cuando toque volver a revisarla, para que no se te pase.'
    return (
      <div className="apply-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) skipPush() }}>
        <div className="apply-modal" role="dialog" aria-modal="true" aria-labelledby="push-offer-title">
          <p className="apply-modal-eyebrow"><Bell size={14} aria-hidden="true" /> Avisos</p>
          <h2 id="push-offer-title">¿Quieres estar más atento a <strong>{pushOffer.title}</strong>?</h2>
          <p className="apply-modal-hint">Activa los avisos para darle mejor seguimiento y no perderte de nada. {hint}</p>
          <div className="push-preview" aria-hidden="true">
            <span className="push-preview-app">AvoTalent · ahora</span>
            <strong>{pushOffer.choice === 'applied' ? 'Tu postulación' : 'Una vacante te espera'}</strong>
            <span>{pushOffer.choice === 'applied' ? `¿Cómo te fue con «${pushOffer.title}»? Cuéntanos.` : `Te recordamos revisar «${pushOffer.title}».`}</span>
          </div>
          <div className="apply-modal-actions">
            <button type="button" className="apply-modal-yes" disabled={busy} autoFocus onClick={activatePush}>Sí, activar avisos</button>
            <button type="button" disabled={busy} onClick={skipPush}>Ahora no</button>
          </div>
        </div>
      </div>
    )
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
  // Una ventana que se ve (no una franja pequeña): es la única manera de saber si la persona llegó a postularse. En pantallas chicas sube
  // desde abajo. Escape o tocar fuera equivale a «Más tarde», para que nunca deje a nadie atrapado.
  return (
    <div className="apply-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) void answer('later') }}>
      <div className="apply-modal" role="dialog" aria-modal="true" aria-labelledby="apply-modal-title">
        <p className="apply-modal-eyebrow"><Send size={14} aria-hidden="true" /> Mis postulaciones</p>
        <h2 id="apply-modal-title">
          ¿Ya te postulaste a <strong>{application.title}</strong>{company ? <> en <strong>{company}</strong></> : null}?
        </h2>
        <p className="apply-modal-hint">La postulación se hace en el sitio de la empresa y desde aquí no la vemos. Cuéntanos y te ayudamos a llevar el seguimiento.</p>
        <div className="apply-modal-actions">
          <button type="button" className="apply-modal-yes" disabled={busy} autoFocus onClick={() => answer('applied')}>Sí, ya me postulé</button>
          <button type="button" disabled={busy} onClick={() => answer('not_yet')}>Todavía no<span>te lo volvemos a preguntar en 2 días</span></button>
          <button type="button" disabled={busy} onClick={() => answer('later')}>Más tarde<span>te preguntamos mañana</span></button>
        </div>
      </div>
    </div>
  )
}
