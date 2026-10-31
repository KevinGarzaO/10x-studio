'use client'

import { DataTable } from '@/components/panel/DataTable'
import { useState } from 'react'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { SegmentSummary, SegmentsNotReady, SegmentTable, type SegmentCounts } from '@/components/panel/segments'

type Funnel = { step: string; count: number | null; pctOfPrevious: number | null }[]

/** Con LA distinción de personas: nuevas / recurrentes, activas / solo visita, registradas / anónimas. */
interface SegmentAcquisition {
  days: number
  source: 'segments'
  trackingSince: string | null
  partial: boolean
  totals: SegmentCounts
  channels: SegmentCounts[]
  landing: SegmentCounts[]
  funnel: Funnel
}

/** La cuenta anterior, por navegador y sin saber si la persona hizo algo: solo mientras no exista la medición nueva. */
interface LegacyAcquisition {
  days: number
  source: 'legacy'
  sources: { source: string; medium: string; campaign: string; visitors: number; visits: number; signups: number; conversionPct: number | null }[]
  landingPages: { path: string; visitors: number }[]
  funnel: Funnel
}

type Acquisition = SegmentAcquisition | LegacyAcquisition

export default function AdquisicionPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<Acquisition>(`/api/admin/analytics/acquisition?days=${days}`, { keepPrevious: true })
  const top = data ? Math.max(1, ...data.funnel.map(step => step.count ?? 0)) : 1

  return (
    <>
      <PageHeader title="Adquisición" subtitle="De dónde llega la gente y por dónde avanza hasta quedarse. En cada fila, las personas nuevas y las recurrentes, las activas y las que solo visitaron, y las que ya tienen cuenta.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data?.source === 'legacy' && <SegmentsNotReady />}

      {data && (
        <>
          {data.source === 'segments' && <SegmentSummary segments={data.totals} trackingSince={data.trackingSince} partial={data.partial} />}

          <Card title="El recorrido" hint={data.source === 'segments' ? 'En personas, cada paso contra el anterior' : 'Cada paso contra el anterior'}>
            {data.funnel.map(step => (
              <div key={step.step} className="panel-funnel-row">
                <span>{step.step}</span>
                {step.count === null ? <span className="panel-muted">Aún no se mide: falta activar el registro de actividad.</span> : <InlineBar value={step.count} max={top} />}
                <span style={{ textAlign: 'right' }}>
                  <b>{fmtNum(step.count)}</b>
                  {step.pctOfPrevious !== null && <span className="panel-muted"> · {fmtPct(step.pctOfPrevious)}</span>}
                </span>
              </div>
            ))}
          </Card>

          {data.source === 'segments' ? (
            <>
              <Card title="Por origen" hint="Origen / medio / campaña del enlace · lo que llega sin un enlace marcado es (direct)">
                <SegmentTable rows={data.channels} labelHeader="Canal" searchLabel="Buscar origen, medio o campaña" empty="Sin visitas en este periodo." />
              </Card>
              <Card title="Por dónde entran" hint="La página con la que empiezan las sesiones">
                <SegmentTable rows={data.landing} labelHeader="Página de entrada" searchLabel="Buscar página" labelRender={label => <code>{label}</code>} empty="Sin visitas en este periodo." />
              </Card>
            </>
          ) : (
            <>
              <Card title="Por origen" hint="Origen, medio y campaña del enlace">
                {data.sources.length === 0 ? <Empty>Sin visitas en este periodo.</Empty> : (
                  <DataTable
                    rows={data.sources}
                    rowKey={row => `${row.source}|${row.medium}|${row.campaign}`}
                    searchText={row => `${row.source} ${row.medium} ${row.campaign}`}
                    searchLabel="Buscar origen, medio o campaña"
                    head={<tr><th>Origen</th><th>Medio</th><th>Campaña</th><th className="num">Visitantes</th><th className="num">Entradas</th><th className="num">Registros</th><th className="num">Conversión</th></tr>}
                    renderRow={row => (
                      <tr>
                        <td><span className="panel-chip">{row.source}</span></td>
                        <td>{row.medium}</td>
                        <td>{row.campaign}</td>
                        <td className="num">{fmtNum(row.visitors)}</td>
                        <td className="num">{fmtNum(row.visits)}</td>
                        <td className="num">{fmtNum(row.signups)}</td>
                        <td className="num">{fmtPct(row.conversionPct)}</td>
                      </tr>
                    )}
                  />
                )}
              </Card>
              <Card title="Por dónde entran" hint="Las páginas con más visitantes nuevos">
                {data.landingPages.length === 0 ? <Empty>Sin visitas en este periodo.</Empty> : (
                  <DataTable
                    rows={data.landingPages}
                    rowKey={page => page.path}
                    searchText={page => page.path}
                    searchLabel="Buscar página"
                    head={<tr><th>Página</th><th>Visitantes</th></tr>}
                    renderRow={page => (
                      <tr>
                        <td><code>{page.path}</code></td>
                        <td style={{ minWidth: 200 }}><InlineBar value={page.visitors} max={data.landingPages[0].visitors} /> <span className="panel-muted">{fmtNum(page.visitors)}</span></td>
                      </tr>
                    )}
                  />
                )}
              </Card>
            </>
          )}

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una <b>persona</b> es su cuenta si ya la reconocimos y, si no, su navegador. <b>Activa</b> es quien hizo algo (10 segundos con la pestaña visible, 2 páginas o un evento clave); quien entró y se fue es <b>solo visita</b> y no cuenta como usuario.
            <b> Nueva</b> es quien entra por primera vez en el periodo; <b>recurrente</b>, quien ya había entrado. La <b>conversión</b> mide cuántas personas nuevas se registraron entre las nuevas activas. Lo que llega sin un enlace marcado aparece como <b>(direct)</b>:
            incluye a quien escribió la dirección, a quien llegó desde un mensaje o una app, y las visitas tuyas y del equipo. Una persona que llegó por dos canales cuenta en los dos, por eso las filas no suman el total.
          </p>
        </>
      )}
    </>
  )
}
