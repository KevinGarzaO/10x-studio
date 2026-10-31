'use client'

import { useEffect, useState } from 'react'
import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { fmtDuration, fmtExact, languageName, TrafficNotReady } from '@/components/panel/traffic'
import { deviceLabel, originLabel, personLabel, placeLabel, SessionDetailDrawer, type SessionRow } from '@/components/panel/sessions'

interface SessionsData {
  ready: boolean
  page?: number
  pageSize?: number
  total?: number
  sessions?: SessionRow[]
}

const PAGE_SIZE = 25

export default function SesionesPage() {
  const [days, setDays] = useState(7)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [device, setDevice] = useState('')
  const [visitor, setVisitor] = useState('')
  const [engaged, setEngaged] = useState(false)
  const [conversion, setConversion] = useState(false)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)

  // La búsqueda espera a que se deje de teclear; cualquier cambio de filtro vuelve a la primera página.
  useEffect(() => {
    const timer = setTimeout(() => { setQ(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const params = new URLSearchParams({ days: String(days), page: String(page), pageSize: String(PAGE_SIZE) })
  if (q) params.set('q', q)
  if (device) params.set('device', device)
  if (visitor) params.set('visitor', visitor)
  if (engaged) params.set('engaged', '1')
  if (conversion) params.set('conversion', '1')
  const { data, loading, refreshing, error, reload } = usePanelData<SessionsData>(`/api/admin/analytics/web/sessions?${params}`, { keepPrevious: true })

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const first = total > 0 ? ((data?.page ?? 1) - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min((data?.page ?? 1) * PAGE_SIZE, total)

  const reset = (change: () => void) => { change(); setPage(1) }

  return (
    <>
      <PageHeader title="Sesiones" subtitle="Cada entrada al sitio, una por una. Toca una fila para ver todo lo que sabemos de ella: su recorrido, su ubicación, su dispositivo y de dónde llegó.">
        <PeriodPicker days={days} onChange={value => reset(() => setDays(value))} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady />}

      {data?.ready && (
        <Card title={`${fmtNum(total)} ${total === 1 ? 'sesión' : 'sesiones'}`} hint="La más reciente primero · hora de Monterrey">
          <div className="panel-toolbar">
            <input className="panel-search" type="search" placeholder="Buscar página, ciudad, país, origen, sitio o idioma" aria-label="Buscar sesiones" value={search} onChange={event => setSearch(event.target.value)} />
            <div className="panel-filter" role="group" aria-label="Dispositivo">
              {[['', 'Todos'], ['desktop', 'Computadora'], ['mobile', 'Celular'], ['tablet', 'Tableta']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={device === value} onClick={() => reset(() => setDevice(value))}>{label}</button>
              ))}
            </div>
            <div className="panel-filter" role="group" aria-label="Tipo de visitante">
              {[['', 'Todos'], ['new', 'Nuevos'], ['returning', 'Recurrentes']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={visitor === value} onClick={() => reset(() => setVisitor(value))}>{label}</button>
              ))}
            </div>
            <div className="panel-filter" role="group" aria-label="Estado">
              <button type="button" aria-pressed={engaged} onClick={() => reset(() => setEngaged(!engaged))}>Solo activas</button>
              <button type="button" aria-pressed={conversion} onClick={() => reset(() => setConversion(!conversion))}>Con conversión</button>
            </div>
          </div>

          <div className={refreshing ? 'panel-refreshing' : undefined} aria-busy={refreshing}>
            {!data.sessions || data.sessions.length === 0 ? <Empty>{q || device || visitor || engaged || conversion ? 'Ninguna sesión coincide con los filtros.' : 'Aún no hay sesiones en este periodo.'}</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table panel-clickable">
                  <thead>
                    <tr><th>Empezó</th><th>Persona</th><th>Ubicación</th><th>Dispositivo</th><th>Idioma</th><th>Llegó desde</th><th>Entró por</th><th className="num">Páginas</th><th className="num">Tiempo</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {data.sessions.map(session => (
                      <tr key={session.session_id} tabIndex={0} role="button" aria-label={`Ver la sesión de ${personLabel(session)}`} onClick={() => setOpen(session.session_id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(session.session_id) } }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtExact(session.created_at)}</td>
                        <td><b>{personLabel(session)}</b></td>
                        <td>{placeLabel(session)}</td>
                        <td>{deviceLabel(session)}</td>
                        <td>{session.language ? languageName(session.language) : '—'}</td>
                        <td>{originLabel(session)}</td>
                        <td><code>{session.entry_path}</code></td>
                        <td className="num">{session.page_views_count}</td>
                        <td className="num">{fmtDuration(session.duration_seconds)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {session.has_conversion ? <span className="panel-chip good">Conversión</span> : session.is_engaged ? <span className="panel-chip good">Activa</span> : <span className="panel-chip">Rebote</span>}
                          {session.is_new_visitor && <span className="panel-chip" style={{ marginLeft: 4 }}>Nueva</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel-pager">
            <span>{total > 0 ? `${first}–${last} de ${fmtNum(total)}` : 'Sin resultados'}</span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          </div>
        </Card>
      )}

      {open && <SessionDetailDrawer id={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  )
}
