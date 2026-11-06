'use client'

import { useState } from 'react'
import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Counts { sessions: number; people: number; activePeople: number; newActivePeople: number }
interface Line { label: string; sessions: number; people: number; newActivePeople: number }
interface BotData {
  ready: boolean
  all?: Counts
  likelyBots?: Counts
  newActiveBotSharePct?: number | null
  newActiveWithoutBots?: number
  byReason?: (Line & { reason: string })[]
  byCountry?: Line[]
  byCity?: Line[]
  rule?: string[]
  notes?: string[]
}

const PERIODS = [{ days: 1, label: '24 horas' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 90, label: '90 días' }]
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)

function Table({ rows, first }: { rows: Line[]; first: string }) {
  if (rows.length === 0) return <Empty>Nada marcado en este periodo.</Empty>
  return (
    <table className="panel-table">
      <thead><tr><th>{first}</th><th className="num">Sesiones</th><th className="num">Personas</th><th className="num">Nuevas activas</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td className="num">{fmtNum(row.sessions)}</td><td className="num">{fmtNum(row.people)}</td><td className="num">{fmtNum(row.newActivePeople)}</td></tr>)}</tbody>
    </table>
  )
}

export default function BotsPage() {
  const [days, setDays] = useState(7)
  const { data, loading, error, reload } = usePanelData<BotData>(`/api/admin/analytics/web/bots?days=${days}`, { keepPrevious: true })

  return (
    <>
      <PageHeader title="Posibles bots" subtitle="Cuánto de lo que entra al sitio parece tráfico de servidores y no de personas. Solo marca: los demás números del panel no cambian.">
        <div className="panel-period" role="group" aria-label="Periodo">
          {PERIODS.map(option => (
            <button key={option.days} type="button" className={days === option.days ? 'active' : ''} aria-pressed={days === option.days} onClick={() => setDays(option.days)}>{option.label}</button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="web-analytics-bots-migration.sql" />}

      {data?.ready && data.all && data.likelyBots && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Nuevas activas que parecen bots" value={pct(data.newActiveBotSharePct)} caption={`${fmtNum(data.likelyBots.newActivePeople)} de ${fmtNum(data.all.newActivePeople)} personas nuevas activas`} tone={(data.newActiveBotSharePct ?? 0) >= 20 ? 'warn' : undefined} />
            <Stat label="Nuevas activas sin bots" value={fmtNum(data.newActiveWithoutBots ?? 0)} caption="Lo que queda si se descuentan las marcadas" />
            <Stat label="Sesiones marcadas" value={fmtNum(data.likelyBots.sessions)} caption={`de ${fmtNum(data.all.sessions)} sesiones en total`} />
          </div>
          <Card title="Por qué se marcaron"><Table rows={(data.byReason ?? []).map(row => ({ ...row }))} first="Motivo" /></Card>
          <Card title="Por país"><Table rows={data.byCountry ?? []} first="País" /></Card>
          <Card title="Por ciudad" hint="Las ciudades marcadas son centros de datos conocidos"><Table rows={data.byCity ?? []} first="Ciudad" /></Card>
          <Card title="La regla"><ul>{(data.rule ?? []).map(item => <li key={item}>{item}</li>)}</ul></Card>
          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(item => <li key={item}>{item}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
