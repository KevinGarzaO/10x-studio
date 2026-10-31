'use client'

import { DataTable } from '@/components/panel/DataTable'
import { useState } from 'react'
import { Card, Empty, ErrorBox, fmtDate, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, roleLabel, Stat, usePanelData } from '@/components/panel/ui'

interface PeopleVacancies {
  ready: true
  source: 'people'
  days: number
  trackingSince: string | null
  partial: boolean
  totals: { viewers: number; applicants: number; vacancies: number; applyRatePct: number | null; saved: number; recommendationsShown: number }
  top: { slug: string; title: string; company: string | null; role: string | null; viewers: number; applicants: number; applyRatePct: number | null; saved: number }[]
}

/** La cuenta anterior, por navegador y sin saber si la persona hizo algo: solo mientras no exista la medición nueva. */
interface LegacyVacancies {
  ready: true
  source: 'legacy'
  days: number
  totals: { views: number; applies: number; viewers: number; applyRatePct: number | null; saved: number; recommendationsShown: number }
  top: { slug: string; title: string; company: string | null; role: string | null; views: number; applies: number; applyRatePct: number | null; saved: number }[]
}

type VacanciesData = { ready: false } | PeopleVacancies | LegacyVacancies

export default function VacantesPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<VacanciesData>(`/api/admin/analytics/vacancies?days=${days}`, { keepPrevious: true })

  // Las dos formas se llevan a las mismas columnas: personas que abrieron, personas que pulsaron Postularse.
  const rows = !data || !data.ready ? [] : data.source === 'people'
    ? data.top
    : data.top.map(row => ({ slug: row.slug, title: row.title, company: row.company, role: row.role, viewers: row.views, applicants: row.applies, applyRatePct: row.applyRatePct, saved: row.saved }))
  const max = Math.max(1, ...rows.map(row => row.viewers))

  return (
    <>
      <PageHeader title="Vacantes" subtitle="Qué hacen con las vacantes las personas activas: cuántas las abren, cuántas pulsan Postularse y cuántas las guardan.">
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
        <Card title="Estas cifras todavía no son de personas activas">
          <p className="panel-muted" style={{ lineHeight: 1.6 }}>
            Falta aplicar la migración <b>web-analytics-active-people-migration.sql</b> en Supabase. Mientras tanto se cuenta por navegador, sin saber si la persona hizo algo en el sitio
            (un robot o alguien que se fue al instante cuentan igual). Con la migración, solo cuentan las personas con una sesión activa.
          </p>
        </Card>
      )}

      {data?.ready && (
        <>
          {data.source === 'people' && data.partial && (
            <p className="panel-defs" style={{ marginTop: 0 }}>
              <b>Las personas activas se miden desde el {data.trackingSince ? fmtDate(data.trackingSince) : 'momento en que se active la medición'}.</b> Este periodo es más largo que eso, así que
              las cifras están incompletas: lo que pasó antes de esa fecha no se puede recuperar.
            </p>
          )}

          <div className="panel-grid cols-4">
            {data.source === 'people' ? (
              <>
                <Stat label="Personas que abrieron vacantes" value={fmtNum(data.totals.viewers)} caption={`Personas activas distintas que abrieron al menos una vacante, entre ${fmtNum(data.totals.vacancies)} vacantes distintas. Quien abre la misma vacante varias veces cuenta una.`} />
                <Stat label="Personas que pulsaron Postularse" value={fmtNum(data.totals.applicants)} caption="Personas activas distintas que pulsaron el botón en alguna vacante; también cuenta a quien aún no tiene cuenta." />
                <Stat label="Tasa de postulación" value={fmtPct(data.totals.applyRatePct)} tone={data.totals.applyRatePct !== null && data.totals.applyRatePct >= 10 ? 'good' : undefined} caption="Personas que pulsaron Postularse entre personas que abrieron una vacante." />
                <Stat label="Guardadas" value={fmtNum(data.totals.saved)} caption={`Vacantes que alguien marcó con Guardar. Se mostraron ${fmtNum(data.totals.recommendationsShown)} recomendaciones “Para ti”.`} />
              </>
            ) : (
              <>
                <Stat label="Vacantes abiertas" value={fmtNum(data.totals.views)} caption={`Una persona que abre la misma vacante varias veces cuenta una. ${fmtNum(data.totals.viewers)} navegadores distintos abrieron alguna.`} />
                <Stat label="Clics en Postularse" value={fmtNum(data.totals.applies)} caption="Navegadores que pulsaron el botón de una vacante." />
                <Stat label="Tasa de postulación" value={fmtPct(data.totals.applyRatePct)} caption="Clics en Postularse entre vacantes abiertas." />
                <Stat label="Guardadas" value={fmtNum(data.totals.saved)} caption={`Vacantes que alguien marcó con Guardar. Se mostraron ${fmtNum(data.totals.recommendationsShown)} recomendaciones “Para ti”.`} />
              </>
            )}
          </div>

          <Card title="Las vacantes más abiertas" hint="Las 100 con más personas distintas">
            {rows.length === 0 ? <Empty>Aún nadie activo abre vacantes en este periodo.</Empty> : (
              <DataTable
                rows={rows}
                rowKey={row => row.slug}
                searchText={row => `${row.title} ${row.company ?? ''} ${roleLabel(row.role)}`}
                searchLabel="Buscar vacante, empresa o rol"
                head={<tr><th>Vacante</th><th>Rol</th><th>Personas que la abrieron</th><th className="num">Postularse</th><th className="num">Tasa</th><th className="num">Guardadas</th></tr>}
                renderRow={row => (
                  <tr>
                    <td>
                      <b>{row.title}</b>
                      <div className="panel-muted" style={{ fontSize: 12 }}>{row.company ?? '—'}</div>
                    </td>
                    <td><span className="panel-chip">{roleLabel(row.role)}</span></td>
                    <td style={{ minWidth: 170 }}><InlineBar value={row.viewers} max={max} /> <span className="panel-muted">{fmtNum(row.viewers)}</span></td>
                    <td className="num">{fmtNum(row.applicants)}</td>
                    <td className="num">{fmtPct(row.applyRatePct)}</td>
                    <td className="num">{fmtNum(row.saved)}</td>
                  </tr>
                )}
              />
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Solo cuentan <b>personas activas</b>: con una sesión de 10 segundos con la pestaña visible, 2 o más páginas o un evento clave (como pulsar Postularse).
            Quien llega a una vacante y se va al instante no cuenta como alguien que la abrió. Cada persona cuenta una vez por vacante. Si muchas la abren y pocas pulsan Postularse,
            la vacante no convence o el botón no se entiende; si casi nadie la abre, el problema es llegar a ella. Con pocas personas por vacante, un solo clic mueve mucho el porcentaje: tómalo como tendencia.
          </p>
        </>
      )}
    </>
  )
}
