'use client'

import { DataTable } from '@/components/panel/DataTable'
import { useState } from 'react'
import { Card, Empty, ErrorBox, fmtDate, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, roleLabel, Stat, usePanelData } from '@/components/panel/ui'
import { SegmentsNotReady } from '@/components/panel/segments'

/** Las personas que abrieron una vacante (o todas), con LA distinción. */
interface PeopleShape {
  viewers: number
  viewersActive: number
  viewersVisitOnly: number
  viewersNew: number
  viewersNewActive: number
  viewersNewVisitOnly: number
  viewersReturning: number
  viewersRegistered: number
  viewersAnonymous: number
  applicants: number
  applicantsActive: number
  /** De las personas ACTIVAS que abrieron, cuántas pulsaron Postularse. */
  applyRatePct: number | null
}

interface SegmentVacancies {
  ready: true
  source: 'segments'
  days: number
  trackingSince: string | null
  partial: boolean
  totals: PeopleShape & { vacancies: number; saved: number; recommendationsShown: number }
  top: (PeopleShape & { slug: string; title: string; company: string | null; role: string | null; saved: number })[]
}

/** La cuenta anterior, por navegador y sin saber si la persona hizo algo: solo mientras no exista la medición nueva. */
interface LegacyVacancies {
  ready: true
  source: 'legacy'
  days: number
  totals: { views: number; applies: number; viewers: number; applyRatePct: number | null; saved: number; recommendationsShown: number }
  top: { slug: string; title: string; company: string | null; role: string | null; views: number; applies: number; applyRatePct: number | null; saved: number }[]
}

type VacanciesData = { ready: false } | SegmentVacancies | LegacyVacancies

export default function VacantesPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<VacanciesData>(`/api/admin/analytics/vacancies?days=${days}`, { keepPrevious: true })

  const rows = data?.ready && data.source === 'segments' ? data.top : []
  const max = Math.max(1, ...rows.map(row => row.viewers))

  return (
    <>
      <PageHeader title="Vacantes" subtitle="Quién abre las vacantes: cuántas de esas personas ya tienen cuenta, cuántas son nuevas y, de las nuevas, cuántas son usuarios activos y cuántas solo visitaron.">
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

      {data?.ready && data.source === 'legacy' && (
        <>
          <SegmentsNotReady />
          <div className="panel-grid cols-4">
            <Stat label="Vacantes abiertas" value={fmtNum(data.totals.views)} caption={`Una persona que abre la misma vacante varias veces cuenta una. ${fmtNum(data.totals.viewers)} navegadores distintos abrieron alguna.`} />
            <Stat label="Clics en Postularse" value={fmtNum(data.totals.applies)} caption="Navegadores que pulsaron el botón de una vacante." />
            <Stat label="Tasa de postulación" value={fmtPct(data.totals.applyRatePct)} caption="Clics en Postularse entre vacantes abiertas." />
            <Stat label="Guardadas" value={fmtNum(data.totals.saved)} caption={`Vacantes que alguien marcó con Guardar. Se mostraron ${fmtNum(data.totals.recommendationsShown)} recomendaciones “Para ti”.`} />
          </div>
        </>
      )}

      {data?.ready && data.source === 'segments' && (
        <>
          {data.partial && (
            <p className="panel-defs" style={{ marginTop: 0 }}>
              <b>La distinción se mide desde el {data.trackingSince ? fmtDate(data.trackingSince) : 'momento en que se active la medición'}.</b> Este periodo es más largo que eso, así que
              las cifras están incompletas: lo que pasó antes de esa fecha no se puede recuperar.
            </p>
          )}

          <div className="panel-grid cols-4">
            <Stat label="Personas que abrieron vacantes" value={fmtNum(data.totals.viewers)} caption={`Personas distintas, en ${fmtNum(data.totals.vacancies)} vacantes distintas. Quien abre la misma vacante varias veces cuenta una.`} />
            <Stat label="Registradas y anónimas" value={`${fmtNum(data.totals.viewersRegistered)} · ${fmtNum(data.totals.viewersAnonymous)}`} caption="De esas personas, las que ya tienen cuenta y las que aún no." />
            <Stat label="Nuevas" value={fmtNum(data.totals.viewersNew)} caption={`${fmtNum(data.totals.viewersNewActive)} son usuarios activos y ${fmtNum(data.totals.viewersNewVisitOnly)} solo visitaron. Las demás (${fmtNum(data.totals.viewersReturning)}) son recurrentes.`} tone="good" />
            <Stat label="Activas en total" value={fmtNum(data.totals.viewersActive)} caption={`De las personas que abrieron, ${fmtNum(data.totals.viewersVisitOnly)} solo visitaron (no cuentan como usuarios).`} />
          </div>
          <div className="panel-grid cols-3">
            <Stat label="Pulsaron Postularse" value={fmtNum(data.totals.applicants)} caption="Personas distintas que pulsaron el botón en alguna vacante; también cuenta a quien aún no tiene cuenta." />
            <Stat label="Tasa de postulación" value={fmtPct(data.totals.applyRatePct)} tone={data.totals.applyRatePct !== null && data.totals.applyRatePct >= 10 ? 'good' : undefined} caption="Personas activas que pulsaron Postularse entre las personas activas que abrieron una vacante." />
            <Stat label="Guardadas" value={fmtNum(data.totals.saved)} caption={`Vacantes que alguien marcó con Guardar. Se mostraron ${fmtNum(data.totals.recommendationsShown)} recomendaciones “Para ti”.`} />
          </div>

          <Card title="Las vacantes más abiertas" hint="Las 100 con más personas distintas">
            {rows.length === 0 ? <Empty>Aún nadie abre vacantes en este periodo.</Empty> : (
              <DataTable
                rows={rows}
                rowKey={row => row.slug}
                searchText={row => `${row.title} ${row.company ?? ''} ${roleLabel(row.role)}`}
                searchLabel="Buscar vacante, empresa o rol"
                head={<tr><th>Vacante</th><th>Rol</th><th>Personas que la abrieron</th><th>Cuenta</th><th>Nuevas</th><th className="num">Postularse</th><th className="num">Tasa</th><th className="num">Guardadas</th></tr>}
                renderRow={row => (
                  <tr>
                    <td>
                      <b>{row.title}</b>
                      <div className="panel-muted" style={{ fontSize: 12 }}>{row.company ?? '—'}</div>
                    </td>
                    <td><span className="panel-chip">{roleLabel(row.role)}</span></td>
                    <td style={{ minWidth: 190 }}>
                      <InlineBar value={row.viewers} max={max} /> <b>{fmtNum(row.viewers)}</b>
                      <span className="panel-muted panel-seg-pair" style={{ display: 'block' }}>{fmtNum(row.viewersActive)} activas · {fmtNum(row.viewersVisitOnly)} solo visita</span>
                    </td>
                    <td style={{ minWidth: 130 }}><b>{fmtNum(row.viewersRegistered)}</b><span className="panel-muted panel-seg-pair"> registradas · {fmtNum(row.viewersAnonymous)} anónimas</span></td>
                    <td style={{ minWidth: 150 }}>
                      <b>{fmtNum(row.viewersNew)}</b>
                      <span className="panel-muted panel-seg-pair"> {fmtNum(row.viewersNewActive)} activas · {fmtNum(row.viewersNewVisitOnly)} solo visita</span>
                    </td>
                    <td className="num">{fmtNum(row.applicants)}</td>
                    <td className="num">{fmtPct(row.applyRatePct)}</td>
                    <td className="num">{fmtNum(row.saved)}</td>
                  </tr>
                )}
              />
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Cada persona cuenta una vez por vacante, la abra una o diez veces. <b>Activa</b> es quien tuvo una sesión de 10 segundos con la pestaña visible, 2 o más páginas o un evento clave (como pulsar Postularse);
            quien llega a una vacante y se va al instante es <b>solo visita</b> y no cuenta como usuario. <b>Nueva</b> es quien entra por primera vez en el periodo; <b>recurrente</b>, quien ya había entrado.
            <b> Registrada</b> es quien ya tiene cuenta. La tasa de postulación se mide entre las personas activas. Si muchas la abren y pocas pulsan Postularse, la vacante no convence o el botón no se entiende; si casi nadie la abre, el problema es llegar a ella.
            Con pocas personas por vacante, un solo clic mueve mucho el porcentaje: tómalo como tendencia.
          </p>
        </>
      )}
    </>
  )
}
