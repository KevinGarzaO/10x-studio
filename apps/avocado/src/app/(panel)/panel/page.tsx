'use client'

import { useState } from 'react'
import { BarSeries, Card, Empty, ErrorBox, fmtDate, fmtNum, fmtPct, Loading, PageHeader, PeriodPicker, periodPhrase, Stat, usePanelData } from '@/components/panel/ui'
import { SegmentSummary, SegmentsNotReady, type SegmentCounts } from '@/components/panel/segments'

interface Overview {
  days: number
  visitors: number
  visits: number
  signups: number
  completedProfiles: number
  conversionPct: number | null
  vs: { visitors: number | null; signups: number | null }
  /** Personas ACTIVAS (analítica web propia), nuevas y recurrentes. */
  traffic?: Traffic
  linkedin: { visitors: number; signups: number; posts: number; failedPosts: number }
  series: { day: string; visitors: number; signups: number }[]
  totals: { users: number; activeVacancies: number; queuedVacancies: number; lastIngestedAt: string | null; lastPublishedAt: string | null; nextScrapeAt: string | null; dailyQuota?: number; daysToNextBatch?: number }
}

type Traffic =
  | { ready: false }
  | {
      ready: true
      trackingSince: string | null
      partial: boolean
      segments: SegmentCounts
      linkedinActive: number
      vs: { active: number | null; newActive: number | null }
      series: { day: string; active: number; newActive: number }[]
    }

export default function ResumenPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<Overview>(`/api/admin/analytics/overview?days=${days}`)
  const traffic = data?.traffic
  // Activos y nuevos de la analítica propia, junto a los registros de cada día (que salen de las cuentas).
  const chart = traffic?.ready && data
    ? traffic.series.map((point, index) => ({ day: point.day, active: point.active, newActive: point.newActive, signups: data.series[index]?.signups ?? 0 }))
    : []

  return (
    <>
      <PageHeader title="Resumen" subtitle={days === 1 ? 'Qué pasó en AvoTalent en las últimas 24 horas, contra las 24 anteriores.' : `Qué pasó en AvoTalent en ${periodPhrase(days)}, contra los ${days} anteriores.`}>
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          {traffic?.ready ? (
            <>
              <div className="panel-grid cols-4">
                <Stat label="Usuarios activos" value={fmtNum(traffic.segments.active)} delta={traffic.vs.active} caption="Personas distintas con una sesión activa (10 s con la pestaña visible, 2 páginas o un evento clave). Quien entra y se va no cuenta." />
                <Stat label="Nuevos activos" value={fmtNum(traffic.segments.newActive)} delta={traffic.vs.newActive} caption={`Entraron por primera vez y hicieron algo. Otras ${fmtNum(traffic.segments.newVisitOnly)} nuevas solo visitaron.`} />
                <Stat label="Recurrentes activos" value={fmtNum(traffic.segments.returningActive)} caption={`Ya habían entrado y volvieron a hacer algo. Otras ${fmtNum(traffic.segments.returningVisitOnly)} recurrentes solo visitaron.`} />
                <Stat label="Conversión de nuevos" value={fmtPct(traffic.segments.conversionPct)} tone={traffic.segments.conversionPct !== null && traffic.segments.conversionPct >= 5 ? 'good' : undefined} caption={`${fmtNum(traffic.segments.registeredNew)} de ${fmtNum(traffic.segments.newActive)} nuevos activos se registraron en el periodo. Un recurrente que se registra no entra en esta cuenta.`} />
              </div>
              <div className="panel-grid cols-2">
                <Stat label="Registros" value={fmtNum(data.signups)} delta={data.vs.signups} caption="Cuentas nuevas reales (todas, vengan de donde vengan), sin las de prueba ni las que crea el scraper." />
                <Stat label="Perfiles completos" value={fmtNum(data.completedProfiles)} caption={`De ${fmtNum(data.signups)} registros del periodo: ya pueden recibir vacantes “Para ti”.`} />
              </div>
              <SegmentSummary segments={traffic.segments} trackingSince={traffic.trackingSince} partial={traffic.partial} />
            </>
          ) : (
            <>
              <SegmentsNotReady />
              <div className="panel-grid cols-4">
                <Stat label="Visitantes" value={fmtNum(data.visitors)} delta={data.vs.visitors} caption={`Navegadores distintos (sin filtrar por actividad). Hubo ${fmtNum(data.visits)} entradas.`} />
                <Stat label="Registros" value={fmtNum(data.signups)} delta={data.vs.signups} caption="Cuentas nuevas reales, sin las de prueba ni las que crea el scraper." />
                <Stat label="Conversión" value={fmtPct(data.conversionPct)} caption="Registros entre visitantes." />
                <Stat label="Perfiles completos" value={fmtNum(data.completedProfiles)} caption={`De ${fmtNum(data.signups)} registros del periodo: ya pueden recibir vacantes “Para ti”.`} />
              </div>
            </>
          )}

          <Card title={days === 1 ? (traffic?.ready ? 'Visitantes activos y registros por hora' : 'Visitantes y registros por hora') : (traffic?.ready ? 'Visitantes activos y registros por día' : 'Visitantes y registros por día')} hint="Hora de Monterrey">
            {traffic?.ready ? (
              chart.every(point => point.active === 0 && point.signups === 0)
                ? <Empty>Todavía no hay visitantes activos medidos en este periodo.</Empty>
                : <BarSeries points={chart} series={[{ key: 'active', label: 'Activos', color: '#94a3b8' }, { key: 'newActive', label: 'Nuevos', color: '#0ea5e9' }, { key: 'signups', label: 'Registros', color: '#10b981' }]} />
            ) : (
              data.series.every(point => point.visitors === 0 && point.signups === 0)
                ? <Empty>Todavía no hay visitas en este periodo.</Empty>
                : <BarSeries points={data.series} series={[{ key: 'visitors', label: 'Visitantes', color: '#94a3b8' }, { key: 'signups', label: 'Registros', color: '#10b981' }]} />
            )}
          </Card>

          <div className="panel-grid cols-2">
            <Card title="LinkedIn en este periodo" hint="Detalle en la sección LinkedIn">
              <div className="panel-grid cols-2">
                <Stat label="Publicaciones" value={fmtNum(data.linkedin.posts)} tone={data.linkedin.failedPosts > 0 ? 'warn' : undefined} caption={data.linkedin.failedPosts > 0 ? `${data.linkedin.failedPosts} fallaron: revisa la sección LinkedIn.` : 'Vacantes publicadas en tu perfil.'} />
                {traffic?.ready
                  ? <Stat label="Usuarios activos de LinkedIn" value={fmtNum(traffic.linkedinActive)} caption={`${fmtPct(traffic.segments.active > 0 ? Math.round((traffic.linkedinActive / traffic.segments.active) * 1000) / 10 : null)} de los usuarios activos.`} />
                  : <Stat label="Visitantes de LinkedIn" value={fmtNum(data.linkedin.visitors)} caption={`${fmtPct(data.visitors > 0 ? Math.round((data.linkedin.visitors / data.visitors) * 1000) / 10 : null)} de todos los visitantes.`} />}
              </div>
              <p className="panel-muted" style={{ marginTop: 12 }}>
                <b>{fmtNum(data.linkedin.signups)}</b> {data.linkedin.signups === 1 ? 'registro llegó' : 'registros llegaron'} desde LinkedIn.
              </p>
            </Card>

            <Card title="Lo que hay en la plataforma ahora" hint="Foto de hoy">
              <div className="panel-grid cols-2">
                <Stat label="Usuarios" value={fmtNum(data.totals.users)} caption="Cuentas reales en total." />
                <Stat label="Vacantes abiertas" value={fmtNum(data.totals.activeVacancies)} caption="Publicadas en los últimos 45 días." />
                <Stat label="En cola" value={fmtNum(data.totals.queuedVacancies)} caption={data.totals.dailyQuota ? `Esperando salir al feed: unas ${data.totals.dailyQuota} por día hasta el próximo lote (${data.totals.daysToNextBatch} días).` : 'Esperando salir al feed.'} />
                <Stat label="Última publicada en el feed" value={fmtDate(data.totals.lastPublishedAt, true)} caption="El feed publica cada día una parte de la cola, repartida entre los 15 días del lote." />
                <Stat label="Último lote del scraper" value={fmtDate(data.totals.lastIngestedAt, true)} caption={`El scraper trae un lote cada 15 días${data.totals.nextScrapeAt ? `; el siguiente toca hacia el ${fmtDate(data.totals.nextScrapeAt)}` : ''}.`} />
              </div>
            </Card>
          </div>

          <p className="panel-defs">
            <b>Cómo leer estos números.</b> Un <b>visitante activo</b> es una persona con al menos una sesión activa en el periodo: 10 segundos con la pestaña visible, 2 o más páginas vistas o un evento clave
            (registro, clic en postularse, perfil completo). Quien entra y se va sin hacer nada no es un visitante. <b>Nuevo</b> es quien entra por primera vez en el periodo; <b>recurrente</b>, quien ya había entrado antes.
            La <b>conversión de nuevos</b> divide los registros de gente nueva entre los nuevos activos. Una persona es su cuenta si ya la reconocimos y, si no, su navegador: si abre el sitio en el celular y en la computadora
            sin haber iniciado sesión, cuenta dos. Los días se cuentan en hora de Monterrey.
          </p>
        </>
      )}
    </>
  )
}
