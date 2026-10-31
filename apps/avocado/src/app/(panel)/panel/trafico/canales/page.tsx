'use client'

import { useState } from 'react'
import { Card, ErrorBox, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'
import { SegmentSummary, SegmentTable, type SegmentCounts } from '@/components/panel/segments'

interface Channels {
  ready: boolean
  trackingSince?: string | null
  partial?: boolean
  groups?: Record<string, SegmentCounts[]>
}

export default function CanalesPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<Channels>(`/api/admin/analytics/web/segments?list=all,channel,referrer_host&days=${days}`, { keepPrevious: true })
  const groups = data?.groups

  return (
    <>
      <PageHeader title="Canales" subtitle="De dónde llegan: el origen, el medio y la campaña de cada enlace, y el sitio que los mandó. En cada fila, las personas nuevas y las recurrentes, las activas y las que solo visitaron.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="web-analytics-segments-migration.sql" />}

      {data?.ready && groups && (
        <>
          {groups.all?.[0] && <SegmentSummary segments={groups.all[0]} trackingSince={data.trackingSince} partial={data.partial} />}
          <Card title="Origen / medio / campaña" hint="Lo que llega sin un enlace marcado aparece como (direct)">
            <SegmentTable rows={groups.channel ?? []} labelHeader="Canal" searchLabel="Buscar origen, medio o campaña" />
          </Card>
          <Card title="Sitios que nos mandan" hint="El dominio del que llegó la persona">
            <SegmentTable rows={groups.referrer_host ?? []} labelHeader="Sitio" />
          </Card>
        </>
      )}
    </>
  )
}
