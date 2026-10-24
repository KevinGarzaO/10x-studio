'use client'

import { useState } from 'react'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, roleLabel, Stat, usePanelData } from '@/components/panel/ui'

interface VacanciesData {
  ready: boolean
  days?: number
  totals?: { views: number; applies: number; viewers: number; applyRatePct: number | null; saved: number; recommendationsShown: number }
  top?: { slug: string; title: string; company: string | null; role: string | null; views: number; applies: number; applyRatePct: number | null; saved: number }[]
}

export default function VacantesPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<VacanciesData>(`/api/admin/analytics/vacancies?days=${days}`)
  const top = data?.top ?? []
  const max = Math.max(1, ...top.map(row => row.views))

  return (
    <>
      <PageHeader title="Vacantes" subtitle="Qué hace la gente con las vacantes: cuántas abre, cuántas intenta postular y cuántas guarda.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && !data.ready && (
        <Card title="Todavía no se están registrando las vistas">
          <p className="panel-muted" style={{ lineHeight: 1.6 }}>
            Para saber cuánta gente abre cada vacante y pulsa “Postularse” hay que anotar esos eventos, y hoy no se anotan. Aplica la migración
            <b> vacancy-events-migration.sql</b> en Supabase: desde ese momento cada vacante abierta y cada clic en “Postularse” queda registrado.
          </p>
        </Card>
      )}

      {data?.ready && data.totals && (
        <>
          <div className="panel-grid cols-4">
            <Stat label="Vacantes abiertas" value={fmtNum(data.totals.views)} caption={`Una persona que abre la misma vacante varias veces cuenta una. ${fmtNum(data.totals.viewers)} personas distintas abrieron alguna.`} />
            <Stat label="Clics en Postularse" value={fmtNum(data.totals.applies)} caption="Personas que pulsaron el botón de una vacante; también cuenta a quien aún no tiene cuenta." />
            <Stat label="Tasa de postulación" value={fmtPct(data.totals.applyRatePct)} tone={data.totals.applyRatePct !== null && data.totals.applyRatePct >= 10 ? 'good' : undefined} caption="Clics en Postularse entre vacantes abiertas." />
            <Stat label="Guardadas" value={fmtNum(data.totals.saved)} caption={`Vacantes que alguien marcó con Guardar. Se mostraron ${fmtNum(data.totals.recommendationsShown)} recomendaciones “Para ti”.`} />
          </div>

          <Card title="Las vacantes más abiertas" hint="Las 15 con más personas distintas">
            {top.length === 0 ? <Empty>Aún nadie abre vacantes en este periodo.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead><tr><th>Vacante</th><th>Rol</th><th>Personas que la abrieron</th><th className="num">Postularse</th><th className="num">Tasa</th><th className="num">Guardadas</th></tr></thead>
                  <tbody>
                    {top.map(row => (
                      <tr key={row.slug}>
                        <td>
                          <b>{row.title}</b>
                          <div className="panel-muted" style={{ fontSize: 12 }}>{row.company ?? '—'}</div>
                        </td>
                        <td><span className="panel-chip">{roleLabel(row.role)}</span></td>
                        <td style={{ minWidth: 170 }}><InlineBar value={row.views} max={max} /> <span className="panel-muted">{fmtNum(row.views)}</span></td>
                        <td className="num">{fmtNum(row.applies)}</td>
                        <td className="num">{fmtPct(row.applyRatePct)}</td>
                        <td className="num">{fmtNum(row.saved)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una vacante “abierta” es una persona que llegó a su página, desde LinkedIn, el feed, una búsqueda o un enlace.
            Si muchas la abren y pocas pulsan Postularse, la vacante no convence o el botón no se entiende. Si casi nadie la abre, el problema es
            llegar a ella. Con pocas personas por vacante, un solo clic mueve mucho el porcentaje: tómalo como tendencia.
          </p>
        </>
      )}
    </>
  )
}
