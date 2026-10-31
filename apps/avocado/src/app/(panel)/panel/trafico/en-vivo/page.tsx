'use client'

import { useEffect, useState } from 'react'
import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { ago, countryName, fmtDuration, TrafficNotReady } from '@/components/panel/traffic'
import { deviceLabel, originLabel, personLabel, placeLabel, SessionDetailDrawer, type SessionRow } from '@/components/panel/sessions'

interface Live {
  ready: boolean
  minutes?: number
  now?: string
  sessions?: SessionRow[]
}

const REFRESH_MS = 10_000
const WINDOWS = [5, 15, 30]

export default function EnVivoPage() {
  const [minutes, setMinutes] = useState(5)
  const [open, setOpen] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const { data, loading, error, reload } = usePanelData<Live>(`/api/admin/analytics/web/live?minutes=${minutes}`, { keepPrevious: true })

  // Se actualiza sola cada 10 segundos mientras la pestaña está a la vista; el reloj de "hace X" corre cada segundo.
  useEffect(() => {
    const refresh = setInterval(() => { if (document.visibilityState === 'visible') reload() }, REFRESH_MS)
    const clock = setInterval(() => setTick(value => value + 1), 1000)
    return () => { clearInterval(refresh); clearInterval(clock) }
  }, [reload])

  void tick
  const sessions = data?.sessions ?? []
  const people = new Set(sessions.map(session => session.person_key)).size
  const countries = new Map<string, number>()
  for (const session of sessions) if (session.country) countries.set(session.country, (countries.get(session.country) ?? 0) + 1)
  const pages = new Map<string, number>()
  for (const session of sessions) pages.set(session.exit_path ?? session.entry_path, (pages.get(session.exit_path ?? session.entry_path) ?? 0) + 1)
  const topPages = [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <>
      <PageHeader title="En vivo" subtitle="Quién está en el sitio ahora mismo y en qué página. Se actualiza solo cada 10 segundos.">
        <div className="panel-period" role="group" aria-label="Ventana de tiempo">
          {WINDOWS.map(option => (
            <button key={option} type="button" className={minutes === option ? 'active' : ''} aria-pressed={minutes === option} onClick={() => setMinutes(option)}>Últimos {option} min</button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady />}

      {data?.ready && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Personas ahora" value={fmtNum(people)} caption={`Con actividad en los últimos ${data.minutes} minutos.`} />
            <Stat label="Sesiones" value={fmtNum(sessions.length)} caption="Una persona puede tener varias pestañas o dispositivos." />
            <Stat label="Países" value={fmtNum(countries.size)} caption={[...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, count]) => `${countryName(code)} ${count}`).join(' · ') || 'Aún sin ubicación.'} />
          </div>

          {topPages.length > 0 && (
            <Card title="Páginas con gente ahora">
              <ul className="panel-others">
                {topPages.map(([path, count]) => (
                  <li key={path}><span><code>{path}</code></span><b>{count}</b></li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Sesiones activas" hint="La actividad más reciente primero · toca una para ver su detalle">
            {sessions.length === 0 ? <Empty>Nadie ha estado en el sitio en los últimos {data.minutes} minutos.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table panel-clickable">
                  <thead><tr><th>Última actividad</th><th>Persona</th><th>Está en</th><th>Ubicación</th><th>Dispositivo</th><th>Llegó desde</th><th className="num">Páginas</th><th className="num">Tiempo</th></tr></thead>
                  <tbody>
                    {sessions.map(session => (
                      <tr key={session.session_id} tabIndex={0} role="button" aria-label={`Ver la sesión de ${personLabel(session)}`} onClick={() => setOpen(session.session_id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(session.session_id) } }}>
                        <td style={{ whiteSpace: 'nowrap' }}><span className="panel-live-dot" aria-hidden="true" /> {ago(session.last_activity_at)}</td>
                        <td><b>{personLabel(session)}</b></td>
                        <td><code>{session.exit_path ?? session.entry_path}</code></td>
                        <td>{placeLabel(session)}</td>
                        <td>{deviceLabel(session)}</td>
                        <td>{originLabel(session)}</td>
                        <td className="num">{session.page_views_count}</td>
                        <td className="num">{fmtDuration(session.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {open && <SessionDetailDrawer id={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  )
}
