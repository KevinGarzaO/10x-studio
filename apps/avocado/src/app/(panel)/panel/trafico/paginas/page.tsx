'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Pages {
  ready: boolean
  pages?: { path: string; views: number; sessions: number; people: number; entries: number; exits: number }[]
}

interface Landing {
  ready: boolean
  landingPages?: { entry_path: string; sessions: number; active_users: number; engagement_rate: number | null; conversions: number; conversion_rate: number | null }[]
}

export default function PaginasPage() {
  const [days, setDays] = useState(30)
  const pages = usePanelData<Pages>(`/api/admin/analytics/web/pages?days=${days}`, { keepPrevious: true })
  const landing = usePanelData<Landing>(`/api/admin/analytics/web?days=${days}`, { keepPrevious: true })
  const error = pages.error ?? landing.error
  const rows = pages.data?.pages ?? []
  const maxViews = Math.max(1, ...rows.map(row => row.views))

  return (
    <>
      <PageHeader title="Páginas" subtitle="Cada página que se ve, por dónde empiezan las sesiones y por dónde terminan. Las de vacantes son el SEO programático.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={() => { pages.reload(); landing.reload() }} />}
      {pages.loading && !pages.data && <Loading />}
      {pages.data && !pages.data.ready && <TrafficNotReady migration="web-analytics-detail-migration.sql" />}

      {pages.data?.ready && (
        <Card title="Todas las páginas vistas" hint="Vistas, sesiones y personas; cuántas sesiones entraron y salieron por ahí">
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

      {landing.data?.ready && (
        <Card title="Páginas de entrada" hint="Cómo rinde cada página como primera parada: engagement y conversión">
          {!landing.data.landingPages || landing.data.landingPages.length === 0 ? <Empty>Aún no hay visitas en este periodo.</Empty> : (
            <DataTable
              rows={landing.data.landingPages}
              rowKey={row => row.entry_path}
              searchText={row => row.entry_path}
              searchLabel="Buscar página de entrada"
              head={<tr><th>Página</th><th className="num">Sesiones</th><th className="num">Activos</th><th className="num">Engagement</th><th className="num">Conversiones</th><th className="num">Conversión</th></tr>}
              renderRow={row => (
                <tr>
                  <td><code>{row.entry_path}</code></td>
                  <td className="num">{fmtNum(row.sessions)}</td>
                  <td className="num">{fmtNum(row.active_users)}</td>
                  <td className="num">{fmtPct(row.engagement_rate)}</td>
                  <td className="num">{fmtNum(row.conversions)}</td>
                  <td className="num">{fmtPct(row.conversion_rate)}</td>
                </tr>
              )}
            />
          )}
        </Card>
      )}
    </>
  )
}
