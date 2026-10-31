'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, Stat, usePanelData } from '@/components/panel/ui'
import { countryName, DimensionCard, TrafficNotReady } from '@/components/panel/traffic'
import type { SegmentCounts } from '@/components/panel/segments'
import { WorldMap, type MapPoint } from '@/components/panel/WorldMap'

interface GeoData {
  ready: boolean
  points?: { country: string; region: string | null; city: string; latitude: number; longitude: number; sessions: number; people: number; engaged: number }[]
  countries?: SegmentCounts[]
  regions?: SegmentCounts[]
}

export default function GeografiaPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<GeoData>(`/api/admin/analytics/web/geo?days=${days}`, { keepPrevious: true })

  const countries = (data?.countries ?? []).filter(row => row.label !== '(sin dato)')
  const unknown = (data?.countries ?? []).find(row => row.label === '(sin dato)')
  const points: MapPoint[] = (data?.points ?? []).map(point => ({ ...point, latitude: Number(point.latitude), longitude: Number(point.longitude) }))
  const maxCity = Math.max(1, ...points.map(point => point.sessions))

  return (
    <>
      <PageHeader title="Geografía" subtitle="De dónde nos visitan: países, regiones y ciudades. La burbuja marca la ciudad, no la casa de la persona (no guardamos la IP).">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="web-analytics-segments-migration.sql" />}

      {data?.ready && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Países" value={fmtNum(countries.length)} caption="Con al menos una sesión en el periodo." />
            <Stat label="Ciudades" value={fmtNum(points.length)} caption="Ciudades distintas que se pueden ubicar en el mapa." />
            <Stat label="Sin ubicación" value={fmtNum(unknown?.visits ?? 0)} tone={(unknown?.visits ?? 0) > 0 ? 'warn' : undefined} caption="Entradas que llegaron sin ciudad (por ejemplo, desde un entorno de pruebas o un servicio sin datos de ubicación)." />
          </div>

          <Card title="Mapa" hint="Entre más grande la burbuja, más sesiones; el país se sombrea más fuerte">
            {points.length === 0 && countries.length === 0
              ? <Empty>Todavía no hay visitas con ubicación en este periodo.</Empty>
              : <WorldMap points={points} countries={countries.map(row => ({ value: row.label, sessions: row.visits }))} />}
          </Card>

          <Card title="Ciudades" hint="Las que más sesiones traen">
            {points.length === 0 ? <Empty>Todavía no hay ciudades.</Empty> : (
              <DataTable
                rows={points}
                rowKey={point => `${point.city}|${point.region}|${point.country}`}
                searchText={point => `${point.city} ${point.region ?? ''} ${countryName(point.country)} ${point.country}`}
                searchLabel="Buscar ciudad, región o país"
                head={<tr><th>Ciudad</th><th>Región</th><th>País</th><th>Sesiones</th><th className="num">Personas</th><th className="num">Activas</th><th className="num">Engagement</th></tr>}
                renderRow={point => (
                  <tr>
                    <td><b>{point.city}</b></td>
                    <td>{point.region ?? '—'}</td>
                    <td>{countryName(point.country)}</td>
                    <td style={{ minWidth: 150 }}><InlineBar value={point.sessions} max={maxCity} /> <span className="panel-muted">{fmtNum(point.sessions)}</span></td>
                    <td className="num">{fmtNum(point.people)}</td>
                    <td className="num">{fmtNum(point.engaged)}</td>
                    <td className="num">{fmtPct(point.sessions > 0 ? Math.round((point.engaged / point.sessions) * 1000) / 10 : null)}</td>
                  </tr>
                )}
              />
            )}
          </Card>

          <div className="panel-grid cols-2">
            <DimensionCard title="Países" rows={data.countries ?? []} label={value => (value === '(sin dato)' ? value : `${countryName(value)} (${value})`)} />
            <DimensionCard title="Regiones" hint="Estado, provincia o departamento" rows={data.regions ?? []} label={value => value.replace(/^([A-Za-z]{2}) · /, (_, code) => `${countryName(code)} · `)} />
          </div>
        </>
      )}
    </>
  )
}
