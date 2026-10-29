'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, Bell, Briefcase, Check, Loader2, MessageCircle, Settings2 } from 'lucide-react'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, timeAgo, type AppNotification } from '../lib/notifications'

const ICONS: Record<string, { icon: typeof Bell; className: string }> = {
  comment: { icon: MessageCircle, className: 'reply' },
  match: { icon: Briefcase, className: 'job' },
  skill: { icon: Award, className: 'vote' },
}

/** Los avisos reales de la persona (comentarios en sus publicaciones, vacantes que encajan, skills validados). */
export function NotificationsList() {
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchNotifications().then(data => {
      if (data) setItems(data.notifications)
      else { setItems([]); setFailed(true) }
    })
  }, [])

  const unread = (items ?? []).filter(item => !item.read).length

  async function readAll() {
    if (await markAllNotificationsRead()) setItems(current => (current ?? []).map(item => ({ ...item, read: true })))
  }

  function open(item: AppNotification) {
    if (item.read) return
    setItems(current => (current ?? []).map(entry => (entry.id === item.id ? { ...entry, read: true } : entry)))
    void markNotificationRead(item.id)
  }

  return (
    <section className="account-card notifications-section">
      <div className="account-section-head">
        <div>
          <div className="eyebrow">TUS AVISOS</div>
          <h1>Notificaciones</h1>
          <p className="muted">Comentarios en tus publicaciones, vacantes que encajan mucho contigo y skills que validas.</p>
        </div>
        {unread > 0 && <button className="outline-btn notification-action" onClick={readAll}><Check size={14} /> Marcar todo leído</button>}
      </div>

      {items === null && <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}><Loader2 size={18} className="animate-spin" /> Cargando…</p>}

      {items !== null && items.length === 0 && (
        <p className="muted" style={{ padding: '28px 0', textAlign: 'center' }}>
          {failed ? 'No pudimos cargar tus avisos. Intenta de nuevo en un momento.' : 'Todavía no tienes avisos. Aquí te contaremos cuando alguien comente tus publicaciones o aparezca una vacante que encaje mucho contigo.'}
        </p>
      )}

      <div className="notification-list">
        {(items ?? []).map(item => {
          const { icon: Icon, className } = ICONS[item.type] ?? { icon: Bell, className: '' }
          const body = (
            <>
              <div className={`notification-icon ${className}`}><Icon size={17} /></div>
              <div>
                <strong>{item.message}</strong>
                <span className="muted">{timeAgo(item.created_at)}</span>
              </div>
              {!item.read && <i aria-label="Sin leer" />}
            </>
          )
          return item.link
            ? <Link key={item.id} href={item.link} className={`notification-item${item.read ? '' : ' unread'}`} onClick={() => open(item)}>{body}</Link>
            : <div key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>{body}</div>
        })}
      </div>

      <div className="notification-settings"><Settings2 size={16} /><span>Elige qué correos quieres recibir</span><Link href="/settings">Ir a configuración</Link></div>
    </section>
  )
}
