'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { DimensionCard, TrafficNotReady, type DimensionRow } from '@/components/panel/traffic'

interface Channels {
  ready: boolean
  channels?: { source: string; medium: string; campaign: string; referrer_host: string; sessions: number; active_users: number; conversions: number; conversion_rate: number | null }[]
}

export default function CanalesPage() {
  const [days, setDays] = useState(30)
  const web = usePanelData<Channels>(`/api/admin/analytics/web?days=${days}`, { keepPrevious: true })
  const sites = usePanelData<{ ready: boolean; rows?: DimensionRow[] }>(`/api/admin/analytics/web/dimension?dimension=referrer_host&days=${days}`, { keepPrevious: true })
  const error = web.error ?? sites.error

  return (
    <>
      <PageHeader title="Canales" subtitle="De dónde llegan: el origen, el medio y la campaña de cada enlace, y el sitio que los mandó.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={() => { web.reload(); sites.reload() }} />}
      {web.loading && !web.data && <Loading />}
      {web.data && !web.data.ready && <TrafficNotReady />}

      {web.data?.ready && (
        <Card title="Origen, medio y campaña" hint="Lo que llega sin un enlace marcado aparece como (direct)">
          {!web.data.channels || web.data.channels.length === 0 ? <Empty>Aún no hay visitas en este periodo.</Empty> : (
            <DataTable
              rows={web.data.channels}
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
      )}

      {sites.data?.ready && <DimensionCard title="Sitios que nos mandan" hint="El dominio del que llegó la persona" rows={sites.data.rows ?? []} />}
    </>
  )
}
