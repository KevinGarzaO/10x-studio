'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Funnel {
  ready: boolean
  funnel?: { step: number; label: string; people: number; from_previous_pct: number | null; dropoff_pct: number | null; from_start_pct: number | null }[]
}

interface Events {
  ready: boolean
  events?: { event_name: string; events: number; sessions: number; people: number; is_conversion: boolean }[]
}

export default function EmbudoPage() {
  const [days, setDays] = useState(30)
  const funnel = usePanelData<Funnel>(`/api/admin/analytics/web?days=${days}`, { keepPrevious: true })
  const events = usePanelData<Events>(`/api/admin/analytics/web/events?days=${days}`, { keepPrevious: true })
  const error = funnel.error ?? events.error
  const steps = funnel.data?.funnel ?? []
  const max = Math.max(1, ...steps.map(step => step.people))
  const eventRows = events.data?.events ?? []
  const maxEvents = Math.max(1, ...eventRows.map(row => row.events))

  return (
    <>
      <PageHeader title="Embudo y eventos" subtitle="El recorrido del candidato, paso por paso, y cada evento que dispara la gente.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={() => { funnel.reload(); events.reload() }} />}
      {funnel.loading && !funnel.data && <Loading />}
      {funnel.data && !funnel.data.ready && <TrafficNotReady />}

      {funnel.data?.ready && (
        <Card title="El recorrido del candidato" hint="Personas en cada paso, el avance y el abandono contra el paso anterior">
          {steps.every(step => step.people === 0) ? <Empty>Aún no hay recorridos en este periodo.</Empty> : steps.map(step => (
            <div key={step.step} className="panel-funnel-row">
              <span>{step.label}</span>
              <InlineBar value={step.people} max={max} />
              <span style={{ textAlign: 'right' }}>
                <b>{fmtNum(step.people)}</b>
                {step.from_previous_pct !== null && <span className="panel-muted"> · {fmtPct(step.from_previous_pct)} avanzó · {fmtPct(step.dropoff_pct)} abandonó</span>}
              </span>
            </div>
          ))}
        </Card>
      )}

      {events.data?.ready && (
        <Card title="Cada evento" hint="Cuántas veces ocurrió y a cuánta gente; los marcados son eventos clave (conversiones)">
          {eventRows.length === 0 ? <Empty>Aún no hay eventos en este periodo.</Empty> : (
            <DataTable
              rows={eventRows}
              rowKey={row => row.event_name}
              searchText={row => row.event_name}
              searchLabel="Buscar evento"
              filter={{ label: 'Tipo de evento', options: [{ value: 'key', label: 'Eventos clave' }, { value: 'other', label: 'Los demás' }], test: (row, value) => (value === 'key' ? row.is_conversion : !row.is_conversion) }}
              head={<tr><th>Evento</th><th>Veces</th><th className="num">Sesiones</th><th className="num">Personas</th><th>Tipo</th></tr>}
              renderRow={row => (
                <tr>
                  <td><code>{row.event_name}</code></td>
                  <td style={{ minWidth: 150 }}><InlineBar value={row.events} max={maxEvents} /> <span className="panel-muted">{fmtNum(row.events)}</span></td>
                  <td className="num">{fmtNum(row.sessions)}</td>
                  <td className="num">{fmtNum(row.people)}</td>
                  <td>{row.is_conversion ? <span className="panel-chip good">Evento clave</span> : <span className="panel-chip">Evento</span>}</td>
                </tr>
              )}
            />
          )}
        </Card>
      )}
    </>
  )
}
