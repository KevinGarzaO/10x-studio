'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, InlineBar, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'
import { SegmentSummary, SegmentTable, type SegmentCounts } from '@/components/panel/segments'

interface Pages {
  ready: boolean
  pages?: { path: string; views: number; sessions: number; people: number; entries: number; exits: number }[]
}

interface Landing {
  ready: boolean
  trackingSince?: string | null
  partial?: boolean
  groups?: Record<string, SegmentCounts[]>
}

export default function PaginasPage() {
  const [days, setDays] = useState(30)
  const pages = usePanelData<Pages>(`/api/admin/analytics/web/pages?days=${days}`, { keepPrevious: true })
  const landing = usePanelData<Landing>(`/api/admin/analytics/web/segments?list=all,landing&days=${days}`, { keepPrevious: true })
  const error = pages.error ?? landing.error
  const rows = pages.data?.pages ?? []
  const maxViews = Math.max(1, ...rows.map(row => row.views))
  const groups = landing.data?.groups

  return (
    <>
      <PageHeader title="Páginas" subtitle="Por dónde empiezan las sesiones y cada página que se ve. Las de vacantes son el SEO programático. En las páginas de entrada, las personas nuevas y las recurrentes, las activas y las que solo visitaron.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={() => { pages.reload(); landing.reload() }} />}
      {landing.loading && !landing.data && <Loading />}
      {landing.data && !landing.data.ready && <TrafficNotReady migration="web-analytics-segments-migration.sql" />}

      {landing.data?.ready && groups && (
        <>
          {groups.all?.[0] && <SegmentSummary segments={groups.all[0]} trackingSince={landing.data.trackingSince} partial={landing.data.partial} />}
          <Card title="Páginas de entrada" hint="Cómo rinde cada página como primera parada">
            <SegmentTable rows={groups.landing ?? []} labelHeader="Página de entrada" searchLabel="Buscar página de entrada" labelRender={label => <code>{label}</code>} />
          </Card>
        </>
      )}

      {pages.data?.ready && (
        <Card title="Todas las páginas vistas" hint="Vistas de página (no personas): cuántas sesiones entraron y salieron por ahí">
          {rows.length === 0 ? <Empty>Aún no hay páginas vistas en este periodo.</Empty> : (
            <DataTable
              rows={rows}
              rowKey={row => row.path}
              searchText={row => row.path}
              searchLabel="Buscar página"
              head={<tr><th>Página</th><th>Vistas</th><th className="num">Sesiones</th><th className="num">Personas</th><th className="num">Entradas</th><th className="num">Salidas</th></tr>}
              renderRow={row => (
                <tr>
                  <td><code>{row.path}</code></td>
                  <td style={{ minWidth: 150 }}><InlineBar value={row.views} max={maxViews} /> <span className="panel-muted">{fmtNum(row.views)}</span></td>
                  <td className="num">{fmtNum(row.sessions)}</td>
                  <td className="num">{fmtNum(row.people)}</td>
                  <td className="num">{fmtNum(row.entries)}</td>
                  <td className="num">{fmtNum(row.exits)}</td>
                </tr>
              )}
            />
          )}
        </Card>
      )}
    </>
  )
}
