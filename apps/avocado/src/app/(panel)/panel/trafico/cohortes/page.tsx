'use client'

import { Card, Empty, ErrorBox, fmtDay, Loading, PageHeader, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Cohorts {
  ready: boolean
  cohorts?: { week: string; size: number; retained: { offset: number; count: number; pct: number | null }[] }[]
}

/** El color de una celda de la matriz: más verde, más gente que volvió. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return { color: '#cbd5e1' }
  const alpha = Math.min(0.85, 0.08 + (value / 100) * 0.77)
  return { background: `rgba(16, 185, 129, ${alpha})`, color: value >= 55 ? '#fff' : '#064e3b' }
}

export default function CohortesPage() {
  const { data, loading, error, reload } = usePanelData<Cohorts>('/api/admin/analytics/web?days=30')
  const weeks = Math.max(0, ...(data?.cohorts ?? []).map(cohort => cohort.retained.length))

  return (
    <>
      <PageHeader title="Cohortes" subtitle="Quién vuelve: cada fila es la gente que llegó esa semana, ya con sus visitas anónimas unidas a su cuenta." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady />}

      {data?.ready && (
        <Card title="Retención semanal" hint="Qué porcentaje de cada grupo volvió con una sesión activa">
          {!data.cohorts || data.cohorts.length === 0 ? <Empty>Aún no hay suficientes semanas.</Empty> : (
            <div className="panel-table-wrap">
              <table className="panel-table panel-cohort">
                <thead>
                  <tr>
                    <th>Semana de adquisición</th><th className="num">Personas</th>
                    {Array.from({ length: weeks }, (_, index) => <th key={index} style={{ textAlign: 'center' }}>{index === 0 ? 'Semana 0' : `Semana +${index}`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map(cohort => (
                    <tr key={cohort.week}>
                      <td>{fmtDay(cohort.week)}</td>
                      <td className="num">{cohort.size}</td>
                      {Array.from({ length: weeks }, (_, index) => {
                        const cell = cohort.retained.find(item => item.offset === index)
                        return <td key={index} className="cell" style={shade(cell?.pct ?? null)}>{cell ? `${cell.pct ?? 0}%` : '·'}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="panel-defs" style={{ marginTop: 12 }}>
            <b>Cómo leerlo.</b> La semana 0 es la de la primera sesión de la persona; cada columna siguiente dice qué porcentaje de ese grupo tuvo una sesión activa esa semana. Un <b>·</b> es una semana que aún no llega.
            Con pocas personas por semana, una sola mueve mucho el porcentaje: tómalo como tendencia.
          </p>
        </Card>
      )}
    </>
  )
}
