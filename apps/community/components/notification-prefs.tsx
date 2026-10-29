'use client'

import { useEffect, useState } from 'react'
import { fetchEmailPrefs, saveEmailPrefs, type EmailPrefs } from '../lib/notifications'

const OPTIONS: { key: keyof EmailPrefs; title: string; detail: string }[] = [
  { key: 'digest', title: 'Resumen semanal de vacantes', detail: 'Una vez por semana, las vacantes nuevas que más encajan con tu perfil.' },
  { key: 'alerts', title: 'Alertas de coincidencia fuerte', detail: 'Cuando se publica una vacante con 80 % o más de compatibilidad contigo. Como máximo una al día y tres por semana.' },
]

/** Qué correos de "Para ti" quiere recibir la persona. Los avisos dentro de la app no se apagan aquí. */
export function NotificationPrefs() {
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => { fetchEmailPrefs().then(setPrefs) }, [])

  async function toggle(key: keyof EmailPrefs) {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    const saved = await saveEmailPrefs({ [key]: next[key] })
    if (saved) { setPrefs(saved); setMessage('Guardado') } else { setPrefs(prefs); setMessage('No se pudo guardar. Intenta de nuevo.') }
  }

  return (
    <div>
      <h2 className="section-title">Correos de vacantes</h2>
      <p className="muted" style={{ marginBottom: 14 }}>Elige qué correos quieres recibir. Los avisos dentro de AvoTalent (la campana) siguen llegándote.</p>
      {prefs === null && <p className="muted">Cargando…</p>}
      {prefs && OPTIONS.map(option => (
        <label key={option.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
          <input type="checkbox" checked={prefs[option.key]} onChange={() => toggle(option.key)} style={{ marginTop: 3 }} aria-label={option.title} />
          <span><strong style={{ display: 'block', fontSize: 14 }}>{option.title}</strong><span className="muted" style={{ fontSize: 13 }}>{option.detail}</span></span>
        </label>
      ))}
      {message && <p className="muted" role="status" style={{ marginTop: 10, fontSize: 13 }}>{message}</p>}
    </div>
  )
}
