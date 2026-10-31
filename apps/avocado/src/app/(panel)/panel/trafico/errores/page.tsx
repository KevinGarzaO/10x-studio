'use client'

import { Fragment, useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtDate, fmtNum, Loading, PageHeader, PeriodPicker, Stat, usePanelData } from '@/components/panel/ui'
import { SessionDetailDrawer, VideoLink } from '@/components/panel/sessions'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Frame { file: string; fn: string | null; line: number | null; col: number | null }
interface ErrorGroup {
  fingerprint: string
  name: string
  message: string
  path: string
  source: 'frontend' | 'backend' | 'api'
  occurrences: number
  peopleAffected: number
  firstSeen: string
  lastSeen: string
  stack: string | null
  frames: Frame[]
  sessionId: string | null
  clarityUrl: string | null
  secondsIntoSession: number | null
}
interface ErrorsData {
  ready: boolean
  totals?: { errors: number; kinds: number; withVideo: number }
  errors?: ErrorGroup[]
}

const SOURCE: Record<string, string> = { frontend: 'Navegador', backend: 'Servidor', api: 'Llamada a la API' }

/** "00:42" desde el inicio de la sesión: el momento del video donde pasó el fallo. */
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export default function ErroresPage() {
  const [days, setDays] = useState(7)
  const [open, setOpen] = useState<string | null>(null)
  const [session, setSession] = useState<string | null>(null)
  const { data, loading, error, reload } = usePanelData<ErrorsData>(`/api/admin/analytics/web/errors?days=${days}`, { keepPrevious: true })

  return (
    <>
      <PageHeader title="Errores" subtitle="Lo que falló en el sitio, agrupado: el mismo error en la misma página. Con la gente afectada y el video de Clarity del más reciente.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="telemetry-migration.sql" />}

      {data?.ready && data.totals && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Errores" value={fmtNum(data.totals.errors)} caption="Veces que algo falló en el periodo (sin el equipo ni las cuentas de prueba)." tone={data.totals.errors > 0 ? 'warn' : 'good'} />
            <Stat label="Tipos distintos" value={fmtNum(data.totals.kinds)} caption="Cada uno es un error diferente (mismo mensaje, mismo lugar del código)." />
            <Stat label="Con video" value={fmtNum(data.totals.withVideo)} caption="De los tipos distintos, cuántos traen el video de Clarity de una sesión donde ocurrió." />
          </div>

          <Card title="Los errores más frecuentes" hint="Haz clic en una fila para ver el detalle técnico">
            {!data.errors || data.errors.length === 0 ? <Empty>Ningún error en este periodo.</Empty> : (
              <DataTable
                rows={data.errors}
                rowKey={row => row.fingerprint}
                searchText={row => `${row.name} ${row.message} ${row.path}`}
                searchLabel="Buscar error o página"
                filter={{
                  label: 'Origen',
                  options: [{ value: 'frontend', label: 'Navegador' }, { value: 'api', label: 'API' }, { value: 'backend', label: 'Servidor' }],
                  test: (row, value) => row.source === value,
                }}
                head={<tr><th>Error</th><th>Página</th><th>Origen</th><th className="num">Veces ↓</th><th className="num">Personas</th><th>Última vez</th><th>Video</th></tr>}
                renderRow={row => (
                  <Fragment>
                    <tr tabIndex={0} role="button" aria-expanded={open === row.fingerprint} onClick={() => setOpen(open === row.fingerprint ? null : row.fingerprint)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(open === row.fingerprint ? null : row.fingerprint) } }} style={{ cursor: 'pointer' }}>
                      <td style={{ maxWidth: 340 }}><b>{row.name}</b><span className="panel-muted" style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.message}</span></td>
                      <td><code>{row.path}</code></td>
                      <td><span className="panel-chip">{SOURCE[row.source] ?? row.source}</span></td>
                      <td className="num"><b>{fmtNum(row.occurrences)}</b></td>
                      <td className="num">{fmtNum(row.peopleAffected)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.lastSeen, true)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <VideoLink url={row.clarityUrl} compact />
                        {row.clarityUrl && row.secondsIntoSession !== null && <span className="panel-muted" title="Minuto del video donde falló"> · {clock(row.secondsIntoSession)}</span>}
                      </td>
                    </tr>
                    {open === row.fingerprint && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--panel-bg-soft, #f8fafc)' }}>
                          <p style={{ margin: '4px 0' }}><b>{row.name}:</b> {row.message}</p>
                          <p className="panel-muted" style={{ margin: '4px 0' }}>Primera vez: {fmtDate(row.firstSeen, true)} · Última: {fmtDate(row.lastSeen, true)}</p>
                          {row.frames.length > 0 ? (
                            <ol style={{ margin: '8px 0', paddingLeft: 20, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                              {row.frames.slice(0, 12).map((frame, index) => (
                                <li key={index}>{frame.fn ?? '(anónima)'} <span className="panel-muted">— {frame.file}:{frame.line}:{frame.col}</span></li>
                              ))}
                            </ol>
                          ) : row.stack ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{row.stack}</pre> : <p className="panel-muted">Sin stack trace.</p>}
                          {row.sessionId && <button type="button" className="panel-btn" onClick={() => setSession(row.sessionId)}>Ver la sesión donde pasó</button>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )}
              />
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Dos errores son &ldquo;el mismo&rdquo; si tienen el mismo nombre, el mismo mensaje (sin números ni ids) y fallan en el mismo lugar del código. <b>Personas</b> son cuentas o navegadores distintos.
            El <b>video</b> es de la sesión más reciente donde pasó y que Clarity grabó (se muestrea y se conserva unos 30 días); el minuto es el segundo de la sesión en que falló.
            Las líneas del stack son del código <b>ya empaquetado</b> (minificado): sirven para agrupar y ubicar el archivo, no para saltar a la línea del código fuente. Los mensajes se limpian de correos, tokens y parámetros antes de guardarse.
          </p>
        </>
      )}

      {session && <SessionDetailDrawer id={session} onClose={() => setSession(null)} onOpen={setSession} />}
    </>
  )
}
