'use client'

import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'

/**
 * Una confirmación con el aspecto de AvoTalent, en lugar del cuadro del navegador (`window.confirm`), que se ve
 * ajeno y cambia en cada navegador. Se cierra con Esc, con "Cancelar" o tocando fuera.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busyLabel,
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  busyLabel?: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        {danger && <div className="confirm-icon" aria-hidden="true"><Trash2 size={22} /></div>}
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" ref={cancelRef} className="confirm-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className={`confirm-ok${danger ? ' is-danger' : ''}`} onClick={onConfirm} disabled={busy}>{busy ? busyLabel ?? confirmLabel : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
