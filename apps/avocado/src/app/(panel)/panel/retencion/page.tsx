'use client'

import { Card, Empty, ErrorBox, fmtDay, fmtNum, fmtPct, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'

interface Retention {
  ready: boolean
  dau?: number
  wau?: number
  mau?: number
  stickinessPct?: number | null
  trackingSince?: string | null
  cohorts?: { week: string; size: number; retained: (number | null)[] }[]
}

/** El color de una celda de la tabla de cohortes: más verde, más gente que volvió. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return { color: '#cbd5e1' }
  const alpha = Math.min(0.85, 0.08 + (value / 100) * 0.77)
  return { background: `rgba(16, 185, 129, ${alpha})`, color: value >= 55 ? '#fff' : '#064e3b' }
}

export default function RetencionPage() {
  const { data, loading, error, reload } = usePanelData<Retention>('/api/admin/analytics/retention')

  return (
    <>
      <PageHeader title="Retención" subtitle="Cuánta gente vuelve a AvoTalent después de registrarse." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && !data.ready && (
        <Card title="Todavía no se está registrando la actividad">
          <p className="panel-muted" style={{ lineHeight: 1.6 }}>
            Para medir la retención hay que anotar qué días estuvo activa cada persona, y hoy no se anota. Aplica la migración
            <b> user-activity-migration.sql</b> en Supabase: desde ese momento el sistema guarda, una vez al día por persona, que estuvo activa.
            Ese dato no se puede reconstruir después, así que conviene aplicarla cuanto antes.
          </p>
        </Card>
      )}

      {data?.ready && (
        <>
          <div className="panel-grid cols-4">
            <Stat label="Activos hoy" value={fmtNum(data.dau)} caption="Personas con sesión que usaron AvoTalent hoy." />
            <Stat label="Activos en 7 días" value={fmtNum(data.wau)} caption="Personas distintas en la última semana." />
            <Stat label="Activos en 30 días" value={fmtNum(data.mau)} caption="Personas distintas en el último mes." />
            <Stat label="Frecuencia de uso" value={fmtPct(data.stickinessPct)} caption="Activos de hoy entre activos del mes: qué tan seguido vuelven." />
          </div>

          <Card title="Cohortes por semana de registro" hint={data.trackingSince ? `Se mide desde el ${fmtDay(data.trackingSince)}` : undefined}>
            {!data.cohorts || data.cohorts.length === 0 ? <Empty>Aún no hay registros que seguir.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table panel-cohort">
                  <thead>
                    <tr>
                      <th>Semana de registro</th><th className="num">Personas</th>
                      {data.cohorts[0].retained.map((_, index) => <th key={index} style={{ textAlign: 'center' }}>{index === 0 ? 'Misma semana' : `Semana +${index}`}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map(cohort => (
                      <tr key={cohort.week}>
                        <td>{fmtDay(cohort.week)}</td>
                        <td className="num">{cohort.size}</td>
                        {cohort.retained.map((value, index) => <td key={index} className="cell" style={shade(value)}>{value === null ? '·' : `${value}%`}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Cada fila es el grupo de personas que se registró esa semana. Cada columna dice qué porcentaje de ese grupo volvió a usar AvoTalent
            esa semana. Un <b>·</b> significa que esa semana aún no llega, o que todavía no se medía la actividad. Con pocas personas por semana, un solo usuario mueve
            mucho el porcentaje: tómalo como tendencia, no como cifra exacta.
          </p>
        </>
      )}
    </>
  )
}
