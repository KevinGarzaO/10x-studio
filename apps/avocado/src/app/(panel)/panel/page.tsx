'use client'

import { useState } from 'react'
import { BarSeries, Card, Empty, ErrorBox, fmtDate, fmtNum, fmtPct, Loading, PageHeader, PeriodPicker, periodPhrase, Stat, usePanelData } from '@/components/panel/ui'

interface Overview {
  days: number
  visitors: number
  visits: number
  signups: number
  completedProfiles: number
  conversionPct: number | null
  vs: { visitors: number | null; signups: number | null }
  linkedin: { visitors: number; signups: number; posts: number; failedPosts: number }
  series: { day: string; visitors: number; signups: number }[]
  totals: { users: number; activeVacancies: number; queuedVacancies: number; lastIngestedAt: string | null; lastPublishedAt: string | null; nextScrapeAt: string | null }
}

export default function ResumenPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<Overview>(`/api/admin/analytics/overview?days=${days}`)

  return (
    <>
      <PageHeader title="Resumen" subtitle={days === 1 ? 'Qué pasó en AvoTalent en las últimas 24 horas, contra las 24 anteriores.' : `Qué pasó en AvoTalent en ${periodPhrase(days)}, contra los ${days} anteriores.`}>
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-4">
            <Stat label="Visitantes" value={fmtNum(data.visitors)} delta={data.vs.visitors} caption={`Navegadores distintos. Hubo ${fmtNum(data.visits)} entradas: quien vuelve cuenta una sola vez.`} />
            <Stat label="Registros" value={fmtNum(data.signups)} delta={data.vs.signups} caption="Cuentas nuevas reales, sin las de prueba ni las que crea el scraper." />
            <Stat label="Conversión" value={fmtPct(data.conversionPct)} tone={data.conversionPct !== null && data.conversionPct >= 5 ? 'good' : undefined} caption="Registros entre visitantes." />
            <Stat label="Perfiles completos" value={fmtNum(data.completedProfiles)} caption={`De ${fmtNum(data.signups)} registros del periodo: ya pueden recibir vacantes “Para ti”.`} />
          </div>

          <Card title={days === 1 ? 'Visitantes y registros por hora' : 'Visitantes y registros por día'} hint="Hora de Monterrey">
            {data.series.every(point => point.visitors === 0 && point.signups === 0)
              ? <Empty>Todavía no hay visitas en este periodo.</Empty>
              : <BarSeries points={data.series} series={[{ key: 'visitors', label: 'Visitantes', color: '#94a3b8' }, { key: 'signups', label: 'Registros', color: '#10b981' }]} />}
          </Card>

          <div className="panel-grid cols-2">
            <Card title="LinkedIn en este periodo" hint="Detalle en la sección LinkedIn">
              <div className="panel-grid cols-2">
                <Stat label="Publicaciones" value={fmtNum(data.linkedin.posts)} tone={data.linkedin.failedPosts > 0 ? 'warn' : undefined} caption={data.linkedin.failedPosts > 0 ? `${data.linkedin.failedPosts} fallaron: revisa la sección LinkedIn.` : 'Vacantes publicadas en tu perfil.'} />
                <Stat label="Visitantes de LinkedIn" value={fmtNum(data.linkedin.visitors)} caption={`${fmtPct(data.visitors > 0 ? Math.round((data.linkedin.visitors / data.visitors) * 1000) / 10 : null)} de todos los visitantes.`} />
              </div>
              <p className="panel-muted" style={{ marginTop: 12 }}>
                <b>{fmtNum(data.linkedin.signups)}</b> {data.linkedin.signups === 1 ? 'registro llegó' : 'registros llegaron'} desde LinkedIn.
              </p>
            </Card>

            <Card title="Lo que hay en la plataforma ahora" hint="Foto de hoy">
              <div className="panel-grid cols-2">
                <Stat label="Usuarios" value={fmtNum(data.totals.users)} caption="Cuentas reales en total." />
                <Stat label="Vacantes abiertas" value={fmtNum(data.totals.activeVacancies)} caption="Publicadas en los últimos 45 días." />
                <Stat label="En cola" value={fmtNum(data.totals.queuedVacancies)} caption="Esperando salir al feed (20 por día)." />
                <Stat label="Última publicada en el feed" value={fmtDate(data.totals.lastPublishedAt, true)} caption="El feed publica 20 por día, de lunes a viernes, de la cola." />
                <Stat label="Último lote del scraper" value={fmtDate(data.totals.lastIngestedAt, true)} caption={`El scraper trae un lote cada 15 días${data.totals.nextScrapeAt ? `; el siguiente toca hacia el ${fmtDate(data.totals.nextScrapeAt)}` : ''}.`} />
              </div>
            </Card>
          </div>

          <p className="panel-defs">
            <b>Cómo leer estos números.</b> Un <b>visitante</b> es un navegador distinto: si la misma persona entra el lunes y el viernes cuenta una vez,
            y si abre el sitio en el celular y en la computadora cuenta dos. Una <b>entrada</b> es cada vez que alguien llega al sitio. La
            <b> conversión</b> divide registros entre visitantes, no entre entradas. Los días se cuentan en hora de Monterrey.
          </p>
        </>
      )}
    </>
  )
}
