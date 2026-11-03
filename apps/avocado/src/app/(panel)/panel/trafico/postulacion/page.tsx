'use client'

import { useState } from 'react'
import { Card, ErrorBox, fmtNum, Loading, PageHeader, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Group { viewers: number; sawButton: number; clicked: number; leftSite: number; clickRate: number | null; sawButtonRate: number | null }
interface Funnel {
  ready: boolean
  total?: Group
  byDevice?: (Group & { device: string })[]
  byAudience?: (Group & { audience: string })[]
  groups?: (Group & { device: string; audience: string })[]
  notes?: string[]
}

const PERIODS = [{ days: 1, label: '24 horas' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 90, label: '90 días' }]
const DEVICE: Record<string, string> = { mobile: 'Móvil', desktop: 'Escritorio', tablet: 'Tablet', desconocido: 'Sin dato' }
const AUDIENCE: Record<string, string> = { con_cuenta: 'Con cuenta', sin_cuenta: 'Sin cuenta' }
const pct = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)

function Table({ title, hint, rows }: { title: string; hint: string; rows: { label: string; group: Group }[] }) {
  return (
    <Card title={title} hint={hint}>
      <table className="panel-table">
        <thead><tr><th></th><th className="num">Abrieron la vacante</th><th className="num">Vieron el botón</th><th className="num">Tocaron Postularse</th><th className="num">% que tocó</th><th className="num">Salieron al sitio</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="num">{fmtNum(row.group.viewers)}</td>
              <td className="num">{fmtNum(row.group.sawButton)}</td>
              <td className="num">{fmtNum(row.group.clicked)}</td>
              <td className="num">{pct(row.group.clickRate)}</td>
              <td className="num">{fmtNum(row.group.leftSite)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export default function PostulacionPage() {
  const [days, setDays] = useState(7)
  const { data, loading, error, reload } = usePanelData<Funnel>(`/api/admin/analytics/web/apply-funnel?days=${days}`, { keepPrevious: true })

  return (
    <>
      <PageHeader title="Postulación" subtitle="Quién llega a postularse: personas que abren una vacante, ven el botón y lo tocan, por dispositivo y con o sin cuenta.">
        <div className="panel-period" role="group" aria-label="Periodo">
          {PERIODS.map(option => (
            <button key={option.days} type="button" className={days === option.days ? 'active' : ''} aria-pressed={days === option.days} onClick={() => setDays(option.days)}>{option.label}</button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="apply-funnel-migration.sql" />}

      {data?.ready && data.total && (
        <>
          <Table title="Todos" hint="Personas distintas, sin el equipo ni pruebas" rows={[{ label: 'Total', group: data.total }]} />
          <Table title="Por dispositivo" hint="Móvil contra escritorio" rows={(data.byDevice ?? []).map(row => ({ label: DEVICE[row.device] ?? row.device, group: row }))} />
          <Table title="Con cuenta y sin cuenta" hint="Sin cuenta, «Postularse» lleva al registro" rows={(data.byAudience ?? []).map(row => ({ label: AUDIENCE[row.audience] ?? row.audience, group: row }))} />
          <Table title="Cruzado" hint="Dispositivo y cuenta juntos" rows={(data.groups ?? []).map(row => ({ label: `${DEVICE[row.device] ?? row.device} · ${AUDIENCE[row.audience] ?? row.audience}`, group: row }))} />
          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
