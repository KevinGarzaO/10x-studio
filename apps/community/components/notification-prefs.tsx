'use client'

import { useEffect, useState } from 'react'
import { fetchEmailPrefs, saveEmailPrefs, type EmailPrefs } from '../lib/notifications'
import { disablePush, enablePush, isPushActive, lastPushProblem, pushPermission, type PushStatus } from '../lib/push'

const OPTIONS: { key: keyof EmailPrefs; title: string; detail: string }[] = [
  { key: 'digest', title: 'Resumen semanal de vacantes', detail: 'Una vez por semana, las vacantes nuevas que más encajan con tu perfil.' },
  { key: 'followups', title: 'Seguimiento de tus postulaciones', detail: 'Unos días después de postularte, un recordatorio para que cuentes cómo te fue. Como máximo uno por semana.' },
  { key: 'push', title: 'Avisos en tu dispositivo (push)', detail: 'El seguimiento de tus postulaciones y las vacantes que mejor te quedan, en tu teléfono o computadora. Como máximo 3 al día.' },
  { key: 'community', title: 'Novedades e invitaciones de la comunidad', detail: 'De vez en cuando, novedades de AvoTalent y la invitación a participar o a contarnos qué piensas. Pocas, y puedes apagarlas cuando quieras.' },
  { key: 'alerts', title: 'Alertas de coincidencia fuerte', detail: 'Cuando se publica una vacante con 80 % o más de compatibilidad contigo. Como máximo una al día y tres por semana.' },
]

/** El interruptor de ESTE dispositivo: pide el permiso del navegador y guarda la suscripción (lib/push.ts). */
function PushDevice() {
  const [permission, setPermission] = useState<PushStatus>('unsupported')
  const [active, setActive] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPermission(pushPermission())
    void isPushActive().then(setActive)
  }, [])

  if (permission === 'unsupported') return <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>Este navegador no admite avisos push. En iPhone funcionan si agregas AvoTalent a tu pantalla de inicio.</p>

  async function toggle() {
    if (busy) return
    setBusy(true)
    setNote('')
    if (active) {
      if (await disablePush()) setActive(false)
    } else {
      const result = await enablePush('settings')
      setPermission(pushPermission())
      if (result === 'enabled') setActive(true)
      else if (result === 'denied') setNote('El navegador bloqueó los avisos. Puedes permitirlos desde los permisos del sitio.')
      else setNote(`Los avisos push todavía no están disponibles. Intenta más tarde.${lastPushProblem ? ` (Detalle: ${lastPushProblem})` : ''}`)
    }
    setBusy(false)
  }

  return (
    <div style={{ marginTop: 14, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      <strong style={{ display: 'block', fontSize: 14 }}>Este dispositivo</strong>
      <span className="muted" style={{ fontSize: 13, display: 'block', margin: '2px 0 8px' }}>
        {permission === 'denied' ? 'Los avisos están bloqueados en este navegador.' : active ? 'Recibirás los avisos en este dispositivo.' : 'Activa los avisos para no perderte de nada.'}
      </span>
      {permission !== 'denied' && <button type="button" className="detail-action is-outline" disabled={busy} onClick={toggle}>{active ? 'Desactivar avisos' : 'Activar avisos'}</button>}
      {note && <p className="muted" role="status" style={{ marginTop: 8, fontSize: 13 }}>{note}</p>}
    </div>
  )
}

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
      {prefs && <PushDevice />}
      {message && <p className="muted" role="status" style={{ marginTop: 10, fontSize: 13 }}>{message}</p>}
    </div>
  )
}
