'use client'

import { useState } from 'react'
import { ErrorBox, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { DimensionCard, languageName, TrafficNotReady, type DimensionRow } from '@/components/panel/traffic'

interface Audience {
  ready: boolean
  dimensions?: Record<string, DimensionRow[]>
}

const DEVICE: Record<string, string> = { desktop: 'Computadora', mobile: 'Celular', tablet: 'Tableta' }
const LIST = 'language,device_category,operating_system,browser_version,screen_resolution,timezone,visitor_type'

export default function AudienciaPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<Audience>(`/api/admin/analytics/web/dimensions?list=${LIST}&days=${days}`, { keepPrevious: true })
  const dimensions = data?.dimensions

  return (
    <>
      <PageHeader title="Audiencia" subtitle="Quién nos visita: el idioma, el dispositivo, el sistema, el navegador, la pantalla y la zona horaria.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady />}

      {data?.ready && dimensions && (
        <>
          <div className="panel-grid cols-2">
            <DimensionCard title="Idioma" hint="El del navegador de cada persona" rows={dimensions.language ?? []} label={value => (value === '(sin dato)' ? value : `${languageName(value)} (${value})`)} />
            <DimensionCard title="Nuevos y recurrentes" hint="Si ya habían entrado antes desde ese navegador" rows={dimensions.visitor_type ?? []} />
          </div>
          <div className="panel-grid cols-2">
            <DimensionCard title="Dispositivo" rows={dimensions.device_category ?? []} label={value => DEVICE[value] ?? value} />
            <DimensionCard title="Sistema operativo" rows={dimensions.operating_system ?? []} />
          </div>
          <div className="panel-grid cols-2">
            <DimensionCard title="Navegador" hint="Con su versión" rows={dimensions.browser_version ?? []} />
            <DimensionCard title="Resolución de pantalla" rows={dimensions.screen_resolution ?? []} />
          </div>
          <DimensionCard title="Zona horaria" hint="La del dispositivo, no la de la ciudad que vimos" rows={dimensions.timezone ?? []} />
        </>
      )}
    </>
  )
}
