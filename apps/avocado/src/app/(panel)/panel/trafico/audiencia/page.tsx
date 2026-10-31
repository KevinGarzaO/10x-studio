'use client'

import { useState } from 'react'
import { ErrorBox, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { DimensionCard, languageName, TrafficNotReady } from '@/components/panel/traffic'
import { SegmentSummary, type SegmentCounts } from '@/components/panel/segments'

interface Audience {
  ready: boolean
  trackingSince?: string | null
  partial?: boolean
  groups?: Record<string, SegmentCounts[]>
}

const DEVICE: Record<string, string> = { desktop: 'Computadora', mobile: 'Celular', tablet: 'Tableta' }
const LIST = 'all,language,device_category,operating_system,browser_version,screen_resolution,timezone'

export default function AudienciaPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<Audience>(`/api/admin/analytics/web/segments?list=${LIST}&days=${days}`, { keepPrevious: true })
  const groups = data?.groups

  return (
    <>
      <PageHeader title="Audiencia" subtitle="Quién nos visita: el idioma, el dispositivo, el sistema, el navegador, la pantalla y la zona horaria. En cada fila, las personas nuevas y las recurrentes, las activas y las que solo visitaron.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="web-analytics-segments-migration.sql" />}

      {data?.ready && groups && (
        <>
          {groups.all?.[0] && <SegmentSummary segments={groups.all[0]} trackingSince={data.trackingSince} partial={data.partial} />}
          <DimensionCard title="Idioma" hint="El del navegador de cada persona" rows={groups.language ?? []} label={value => (value === '(sin dato)' ? value : `${languageName(value)} (${value})`)} />
          <div className="panel-grid cols-2">
            <DimensionCard title="Dispositivo" rows={groups.device_category ?? []} label={value => DEVICE[value] ?? value} />
            <DimensionCard title="Sistema operativo" rows={groups.operating_system ?? []} />
          </div>
          <div className="panel-grid cols-2">
            <DimensionCard title="Navegador" hint="Con su versión" rows={groups.browser_version ?? []} />
            <DimensionCard title="Resolución de pantalla" rows={groups.screen_resolution ?? []} />
          </div>
          <DimensionCard title="Zona horaria" hint="La del dispositivo, no la de la ciudad que vimos" rows={groups.timezone ?? []} />
        </>
      )}
    </>
  )
}
