'use client'

import { useEffect, type ReactNode } from 'react'
import { ErrorBox, fmtNum, Loading, usePanelData } from './ui'
import { countryName, fmtClock, fmtDuration, fmtExact, languageName } from './traffic'

export interface SessionRow {
  session_id: string
  user_id: string | null
  client_id: string
  person_key: string
  entry_path: string
  exit_path: string | null
  country: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  device_category: string | null
  operating_system: string | null
  os_version: string | null
  browser: string | null
  browser_version: string | null
  language: string | null
  screen_resolution: string | null
  timezone: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  referrer_host: string | null
  is_new_visitor: boolean
  page_views_count: number
  duration_seconds: number
  is_engaged: boolean
  has_conversion: boolean
  created_at: string
  last_activity_at: string
  user?: { username: string | null; displayName: string | null; email: string | null } | null
}

const DEVICE: Record<string, string> = { desktop: 'Computadora', mobile: 'Celular', tablet: 'Tableta' }

/** Quién es: la cuenta si ya la reconocimos, y si no, un visitante anónimo con las últimas letras de su navegador. */
export function personLabel(session: Pick<SessionRow, 'user' | 'client_id'>): string {
  if (session.user) return session.user.displayName || session.user.username || session.user.email || 'Cuenta'
  return `Anónimo ·${session.client_id.slice(-4)}`
}

export function deviceLabel(session: Pick<SessionRow, 'device_category' | 'operating_system' | 'browser'>): string {
  const parts = [DEVICE[session.device_category ?? ''] ?? session.device_category, session.operating_system, session.browser].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

export function placeLabel(session: Pick<SessionRow, 'city' | 'region' | 'country'>): string {
  const parts = [session.city, session.country ? countryName(session.country) : null].filter(Boolean)
  return parts.length ? parts.join(', ') : '(sin ubicación)'
}

/** De dónde llegó: el origen marcado, el sitio de referencia o directo. */
export function originLabel(session: Pick<SessionRow, 'utm_source' | 'utm_medium' | 'referrer_host'>): string {
  if (session.utm_source) return session.utm_medium ? `${session.utm_source} / ${session.utm_medium}` : session.utm_source
  return session.referrer_host ?? '(directo)'
}

/* ------------------------------------------------------------------ */
/* El detalle de una sesión                                            */
/* ------------------------------------------------------------------ */

interface Detail {
  ready: boolean
  session?: SessionRow & { user?: SessionRow['user'] }
  pageViews?: { id: number; path: string; query_params: Record<string, string> | null; created_at: string }[]
  events?: { id: number; event_name: string; event_params: Record<string, unknown>; is_conversion: boolean; created_at: string }[]
  otherSessions?: { session_id: string; created_at: string; entry_path: string; exit_path: string | null; is_engaged: boolean; has_conversion: boolean; duration_seconds: number; page_views_count: number; utm_source: string | null; referrer_host: string | null }[]
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="panel-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function SessionDetailDrawer({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, loading, error, reload } = usePanelData<Detail>(`/api/admin/analytics/web/sessions/${id}`)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const session = data?.session
  const start = session ? new Date(session.created_at).getTime() : 0

  // Cada página y cada evento en un solo recorrido, en el orden en que pasaron.
  const timeline = [
    ...(data?.pageViews ?? []).map(view => ({ kind: 'page' as const, at: view.created_at, key: `p${view.id}`, view })),
    ...(data?.events ?? []).map(event => ({ kind: 'event' as const, at: event.created_at, key: `e${event.id}`, event })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <>
      <div className="panel-overlay panel-overlay-on" onClick={onClose} aria-hidden="true" />
      <aside className="panel-drawer" role="dialog" aria-modal="true" aria-label="Detalle de la sesión">
        <header className="panel-drawer-head">
          <div>
            <h2>{session ? personLabel(session) : 'Sesión'}</h2>
            {session && <span className="panel-muted">{fmtExact(session.created_at)} · {placeLabel(session)}</span>}
          </div>
          <button type="button" className="panel-btn" onClick={onClose} aria-label="Cerrar el detalle">Cerrar</button>
        </header>

        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {data && !data.ready && <p className="panel-muted">Falta aplicar la migración de analítica web.</p>}

        {session && (
          <div className="panel-drawer-body">
            <div className="panel-chips">
              <span className={`panel-chip ${session.is_engaged ? 'good' : ''}`}>{session.is_engaged ? 'Sesión activa' : 'Sesión sin engagement'}</span>
              {session.has_conversion && <span className="panel-chip good">Conversión</span>}
              <span className="panel-chip">{session.is_new_visitor ? 'Visitante nuevo' : 'Visitante recurrente'}</span>
              {session.user ? <span className="panel-chip">Cuenta reconocida</span> : <span className="panel-chip warn">Anónimo</span>}
            </div>

            <h3>Recorrido</h3>
            <ol className="panel-timeline">
              {timeline.map(item => {
                const offset = Math.max(0, Math.round((new Date(item.at).getTime() - start) / 1000))
                return item.kind === 'page' ? (
                  <li key={item.key}>
                    <span className="panel-timeline-time">{fmtClock(item.at)} <small>+{fmtDuration(offset)}</small></span>
                    <span className="panel-timeline-dot page" aria-hidden="true" />
                    <div>
                      <code>{item.view.path}</code>
                      {item.view.query_params && <div className="panel-muted panel-timeline-meta">{Object.entries(item.view.query_params).map(([key, value]) => `${key}=${value}`).join(' · ')}</div>}
                    </div>
                  </li>
                ) : (
                  <li key={item.key}>
                    <span className="panel-timeline-time">{fmtClock(item.at)} <small>+{fmtDuration(offset)}</small></span>
                    <span className={`panel-timeline-dot ${item.event.is_conversion ? 'key' : 'event'}`} aria-hidden="true" />
                    <div>
                      <b>{item.event.event_name}</b> {item.event.is_conversion && <span className="panel-chip good">Evento clave</span>}
                      {Object.keys(item.event.event_params ?? {}).length > 0 && (
                        <div className="panel-muted panel-timeline-meta">{Object.entries(item.event.event_params).map(([key, value]) => `${key}=${String(value)}`).join(' · ')}</div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>

            <h3>Cuándo y cuánto</h3>
            <dl className="panel-fields">
              <Field label="Empezó">{fmtExact(session.created_at)}</Field>
              <Field label="Última actividad">{fmtExact(session.last_activity_at)}</Field>
              <Field label="Tiempo activo">{fmtDuration(session.duration_seconds)}</Field>
              <Field label="Páginas vistas">{fmtNum(session.page_views_count)}</Field>
              <Field label="Entró por"><code>{session.entry_path}</code></Field>
              <Field label="Salió por"><code>{session.exit_path ?? '—'}</code></Field>
            </dl>

            <h3>Quién</h3>
            <dl className="panel-fields">
              <Field label="Persona">{session.user ? `${session.user.displayName ?? session.user.username ?? '—'}${session.user.username ? ` (@${session.user.username})` : ''}` : 'Visitante anónimo (aún no se registra o inicia sesión)'}</Field>
              {session.user?.email && <Field label="Correo">{session.user.email}</Field>}
              <Field label="Navegador (cookie)"><code>{session.client_id}</code></Field>
            </dl>

            <h3>Dónde</h3>
            <dl className="panel-fields">
              <Field label="País">{session.country ? `${countryName(session.country)} (${session.country})` : '—'}</Field>
              <Field label="Región">{session.region ?? '—'}</Field>
              <Field label="Ciudad">{session.city ?? '—'}</Field>
              <Field label="Coordenadas">{session.latitude !== null && session.longitude !== null ? `${session.latitude}, ${session.longitude}` : '—'}</Field>
              <Field label="Zona horaria">{session.timezone ?? '—'}</Field>
              <Field label="Idioma">{session.language ? `${languageName(session.language)} (${session.language})` : '—'}</Field>
            </dl>

            <h3>Dispositivo</h3>
            <dl className="panel-fields">
              <Field label="Tipo">{DEVICE[session.device_category ?? ''] ?? session.device_category ?? '—'}</Field>
              <Field label="Sistema">{[session.operating_system, session.os_version].filter(Boolean).join(' ') || '—'}</Field>
              <Field label="Navegador">{[session.browser, session.browser_version].filter(Boolean).join(' ') || '—'}</Field>
              <Field label="Pantalla">{session.screen_resolution ?? '—'}</Field>
            </dl>

            <h3>De dónde llegó</h3>
            <dl className="panel-fields">
              <Field label="Origen (utm_source)">{session.utm_source ?? '—'}</Field>
              <Field label="Medio (utm_medium)">{session.utm_medium ?? '—'}</Field>
              <Field label="Campaña (utm_campaign)">{session.utm_campaign ?? '—'}</Field>
              <Field label="Término (utm_term)">{session.utm_term ?? '—'}</Field>
              <Field label="Contenido (utm_content)">{session.utm_content ?? '—'}</Field>
              <Field label="Sitio de referencia">{session.referrer_host ?? '(directo)'}</Field>
            </dl>

            <h3>Otras visitas de esta persona</h3>
            {!data?.otherSessions || data.otherSessions.length === 0 ? <p className="panel-muted">Es su única visita registrada.</p> : (
              <ul className="panel-others">
                {data.otherSessions.map(other => (
                  <li key={other.session_id}>
                    <button type="button" onClick={() => onOpen(other.session_id)}>
                      <b>{fmtExact(other.created_at)}</b>
                      <span><code>{other.entry_path}</code> · {fmtNum(other.page_views_count)} {other.page_views_count === 1 ? 'página' : 'páginas'} · {fmtDuration(other.duration_seconds)}</span>
                      {other.has_conversion && <span className="panel-chip good">Conversión</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
