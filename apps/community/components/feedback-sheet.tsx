'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { trackEvent } from '../lib/web-analytics'
import { FEEDBACK_CATEGORIES, MAX_FEEDBACK_TEXT, MIN_FEEDBACK_TEXT, recordFeedbackEvent, sendFeedback, type FeedbackCategory } from '../lib/feedback'

/**
 * «¿Qué te faltó?»: la hoja que la persona abre cuando quiere (desde el menú de su cuenta). Solo el texto es obligatorio; las categorías
 * ayudan a ordenar y son opcionales. No insiste: no aparece sola. Se anota que se mostró y, si se cierra sin enviar, que se descartó
 * (así se sabe cuántas personas la abrieron y no contestaron). Lo escrito no se interpreta jamás: es un comentario.
 */
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const answered = useRef(false)

  useEffect(() => {
    void recordFeedbackEvent('shown')
    void trackEvent('feedback_opened', {})
  }, [])

  function close() {
    if (!answered.current) void recordFeedbackEvent('dismissed')
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function submit() {
    if (busy) return
    if (text.trim().length < MIN_FEEDBACK_TEXT) { setError('Cuéntanos un poco más: escribe al menos unas palabras.'); return }
    setBusy(true)
    setError('')
    const result = await sendFeedback({ text: text.trim(), category, page: window.location.pathname })
    setBusy(false)
    if (result === 'ok') {
      answered.current = true
      setSent(true)
      void trackEvent('feedback_sent', { category: category ?? 'sin_categoria' })
    } else if (result === 'too_many') setError('Ya nos mandaste varias hoy: gracias. Puedes seguir mañana.')
    else if (result === 'not_available') setError('Esta opción todavía no está disponible para tu cuenta.')
    else setError('No pudimos enviarlo. Revisa tu conexión e intenta de nuevo.')
  }

  return (
    <div className="apply-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="apply-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <p className="apply-modal-eyebrow"><MessageSquare size={14} aria-hidden="true" /> Tu opinión</p>
        {sent ? (
          <>
            <h2 id="feedback-title">¡Gracias!</h2>
            <p className="apply-modal-hint">Leemos todo lo que nos cuentas y lo usamos para decidir qué mejorar.</p>
            <div className="apply-modal-actions"><button type="button" className="apply-modal-yes" autoFocus onClick={close}>Cerrar</button></div>
          </>
        ) : (
          <>
            <h2 id="feedback-title">¿Qué te faltó?</h2>
            <p className="apply-modal-hint">Cuéntanos qué buscabas y no encontraste.</p>
            <div className="feedback-chips" role="group" aria-label="Tema (opcional)">
              {FEEDBACK_CATEGORIES.map(option => (
                <button key={option.value} type="button" className={`feedback-chip${category === option.value ? ' active' : ''}`} aria-pressed={category === option.value} onClick={() => setCategory(category === option.value ? null : option.value)}>{option.label}</button>
              ))}
            </div>
            <label className="feedback-label" htmlFor="feedback-text">Tu comentario</label>
            <textarea id="feedback-text" className="feedback-text" rows={5} maxLength={MAX_FEEDBACK_TEXT} value={text} autoFocus placeholder="Por ejemplo: busco vacantes de…, me faltó poder…" onChange={event => setText(event.target.value)} />
            {error && <p className="feedback-error" role="alert">{error}</p>}
            <div className="apply-modal-actions">
              <button type="button" className="apply-modal-yes" disabled={busy} onClick={submit}>{busy ? 'Enviando…' : 'Enviar'}</button>
              <button type="button" disabled={busy} onClick={close}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
