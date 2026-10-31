'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { BarSeries, Card, Empty, ErrorBox, fmtDay, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, Stat, usePanelData } from '@/components/panel/ui'

interface WebTraffic {
  ready: boolean
  days?: number
  summary?: { dau: number; wau: number; mau: number; sessions: number; engagementRatePct: number | null; conversions: number; conversionRatePct: number | null }
  daily?: { day: string; dau: number; wau: number; mau: number }[]
  funnel?: { step: number; label: string; people: number; from_previous_pct: number | null; dropoff_pct: number | null; from_start_pct: number | null }[]
  landingPages?: { entry_path: string; sessions: number; active_users: number; engagement_rate: number | null; conversions: number; conversion_rate: number | null }[]
  channels?: { source: string; medium: string; campaign: string; referrer_host: string; sessions: number; active_users: number; conversions: number; conversion_rate: number | null }[]
  cohorts?: { week: string; size: number; retained: { offset: number; count: number; pct: number | null }[] }[]
}

/** El color de una celda de la matriz: más verde, más gente que volvió. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return { color: '#cbd5e1' }
  const alpha = Math.min(0.85, 0.08 + (value / 100) * 0.77)
  return { background: `rgba(16, 185, 129, ${alpha})`, color: value >= 55 ? '#fff' : '#064e3b' }
}

export default function TraficoPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<WebTraffic>(`/api/admin/analytics/web?days=${days}`, { keepPrevious: true })

  const maxFunnel = Math.max(1, ...(data?.funnel ?? []).map(step => step.people))
  const weeks = Math.max(0, ...(data?.cohorts ?? []).map(cohort => cohort.retained.length))

  return (
    <>
      <PageHeader title="Tráfico web" subtitle="La analítica propia de AvoTalent, con las reglas de GA4: sesiones, personas activas, de dónde llegan y qué hacen.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && !data.ready && (
        <Card title="Todavía no se está registrando el tráfico">
          <p className="panel-muted" style={{ lineHeight: 1.6 }}>
            Falta aplicar la migración <b>web-analytics-migration.sql</b> en Supabase. Desde ese momento el sitio empieza a guardar cada visita, y estos números se llenan con el tiempo:
            no se puede reconstruir lo que pasó antes.
          </p>
        </Card>
      )}

      {data?.ready && data.summary && (
        <>
          <div className="panel-grid cols-4">
            <Stat label="Activos hoy" value={fmtNum(data.summary.dau)} caption="Personas distintas con al menos una sesión activa hoy (DAU)." />
            <Stat label="Activos en 7 días" value={fmtNum(data.summary.wau)} caption="Personas distintas con una sesión activa en los últimos 7 días (WAU)." />
            <Stat label="Activos en 30 días" value={fmtNum(data.summary.mau)} caption="Personas distintas con una sesión activa en los últimos 30 días (MAU)." />
            <Stat label="Sesiones" value={fmtNum(data.summary.sessions)} caption={`En el periodo. ${fmtPct(data.summary.engagementRatePct)} fueron activas (10 s con la pestaña visible, 2 páginas o un evento clave).`} />
          </div>
          <div className="panel-grid cols-2">
            <Stat label="Conversiones" value={fmtNum(data.summary.conversions)} caption="Sesiones con un evento clave: registro, clic en postularse o perfil completo." />
            <Stat label="Tasa de conversión" value={fmtPct(data.summary.conversionRatePct)} caption="Sesiones con conversión entre todas las sesiones." />
          </div>

          <Card title="Personas activas por día" hint="DAU, WAU y MAU">
            {!data.daily || data.daily.length === 0 ? <Empty>Aún no hay visitas.</Empty> : (
              <BarSeries
                points={data.daily.map(row => ({ day: row.day, dau: row.dau, wau: row.wau, mau: row.mau }))}
                series={[{ key: 'dau', label: 'Día', color: '#10b981' }, { key: 'wau', label: '7 días', color: '#0ea5e9' }, { key: 'mau', label: '30 días', color: '#6366f1' }]}
              />
            )}
          </Card>

          <Card title="El recorrido del candidato" hint="Personas en cada paso, el avance y el abandono contra el paso anterior">
            {!data.funnel || data.funnel.every(step => step.people === 0) ? <Empty>Aún no hay recorridos en este periodo.</Empty> : data.funnel.map(step => (
              <div key={step.step} className="panel-funnel-row">
                <span>{step.label}</span>
                <InlineBar value={step.people} max={maxFunnel} />
                <span style={{ textAlign: 'right' }}>
                  <b>{fmtNum(step.people)}</b>
                  {step.from_previous_pct !== null && <span className="panel-muted"> · {fmtPct(step.from_previous_pct)} avanzó · {fmtPct(step.dropoff_pct)} abandonó</span>}
                </span>
              </div>
            ))}
          </Card>

          <Card title="Páginas de entrada" hint="Dónde empiezan las sesiones (el SEO programático de las vacantes)">
            {!data.landingPages || data.landingPages.length === 0 ? <Empty>Aún no hay visitas en este periodo.</Empty> : (
              <DataTable
                rows={data.landingPages}
                rowKey={row => row.entry_path}
                searchText={row => row.entry_path}
                searchLabel="Buscar página"
                head={<tr><th>Página</th><th className="num">Sesiones</th><th className="num">Activos</th><th className="num">Engagement</th><th className="num">Conversiones</th><th className="num">Conversión</th></tr>}
                renderRow={row => (
                  <tr>
                    <td><code>{row.entry_path}</code></td>
                    <td className="num">{fmtNum(row.sessions)}</td>
                    <td className="num">{fmtNum(row.active_users)}</td>
                    <td className="num">{fmtPct(row.engagement_rate)}</td>
                    <td className="num">{fmtNum(row.conversions)}</td>
                    <td className="num">{fmtPct(row.conversion_rate)}</td>
                  </tr>
                )}
              />
            )}
          </Card>

          <Card title="De dónde llegan" hint="Origen, medio, campaña y sitio de referencia">
            {!data.channels || data.channels.length === 0 ? <Empty>Aún no hay visitas en este periodo.</Empty> : (
              <DataTable
                rows={data.channels}
                rowKey={row => `${row.source}|${row.medium}|${row.campaign}|${row.referrer_host}`}
                searchText={row => `${row.source} ${row.medium} ${row.campaign} ${row.referrer_host}`}
                searchLabel="Buscar origen, medio o campaña"
                head={<tr><th>Origen</th><th>Medio</th><th>Campaña</th><th>Sitio</th><th className="num">Sesiones</th><th className="num">Activos</th><th className="num">Conversiones</th><th className="num">Conversión</th></tr>}
                renderRow={row => (
                  <tr>
                    <td><span className="panel-chip">{row.source}</span></td>
                    <td>{row.medium}</td>
                    <td>{row.campaign}</td>
                    <td>{row.referrer_host}</td>
                    <td className="num">{fmtNum(row.sessions)}</td>
                    <td className="num">{fmtNum(row.active_users)}</td>
                    <td className="num">{fmtNum(row.conversions)}</td>
                    <td className="num">{fmtPct(row.conversion_rate)}</td>
                  </tr>
                )}
              />
            )}
          </Card>

          <Card title="Cohortes por semana de adquisición" hint="Qué porcentaje de cada grupo volvió con una sesión activa">
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
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una <b>sesión activa</b> cumple al menos una: 10 segundos con la pestaña visible, 2 o más páginas vistas, o un evento clave (registro, clic en postularse, perfil completo).
            Una sesión nueva empieza tras 30 minutos sin actividad. Una <b>persona</b> es su cuenta si ya la reconocimos (al registrarse o iniciar sesión se unen sus visitas anónimas anteriores) y, si no, su navegador.
            No cuenta al equipo, las cuentas de prueba ni los robots, y los días son de Monterrey. Esta medición corre en paralelo a la de Adquisición y Retención hasta que las cifras cuadren; no esperes que coincida
            exactamente con GA4: GA4 aplica sus propios filtros de robots y umbrales.
          </p>
        </>
      )}
    </>
  )
}
