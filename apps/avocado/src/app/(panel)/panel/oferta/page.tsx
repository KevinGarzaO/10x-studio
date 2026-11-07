'use client'

import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'

interface RoleSupply { role: string; label: string; candidates: number; open: number; openServing: number; queued: number; queuedServing: number; linkedinReserve: number; inLinkedinFocus: boolean }
interface Supply {
  ready: boolean
  people?: number
  totals?: { open: number; openServing: number; openServingPct: number | null; queued: number; queuedServing: number; queuedServingPct: number | null }
  linkedin?: { perDay: number; reserve: number; reserveDays: number | null; reserveWithQueue: number; reserveWithQueueDays: number | null; focusRoles: string[] }
  nextBatch?: { at: string | null; daysUntil: number | null }
  byRole?: RoleSupply[]
  rolesWithoutPeople?: string[]
  rolesWithoutVacancies?: string[]
  notes?: string[]
}

const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)
const dayCount = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} días`)

export default function OfertaPage() {
  const { data, loading, error, reload } = usePanelData<Supply>('/api/admin/analytics/supply', { keepPrevious: true })

  return (
    <>
      <PageHeader title="Oferta y cola de vacantes" subtitle="Cuántas vacantes hay por puesto, cuántas le sirven a alguien y cuántos días de reserva le quedan a LinkedIn. Solo mide: no cambia qué se publica." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data?.ready && data.totals && data.linkedin && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Vacantes abiertas que le sirven a alguien" value={pct(data.totals.openServingPct)} caption={`${fmtNum(data.totals.openServing)} de ${fmtNum(data.totals.open)} en el feed · ${fmtNum(data.people ?? 0)} personas`} />
            <Stat label="En la cola del scraper" value={fmtNum(data.totals.queued)} caption={`${fmtNum(data.totals.queuedServing)} le sirven a alguien (${pct(data.totals.queuedServingPct)})${data.nextBatch?.daysUntil !== null && data.nextBatch?.daysUntil !== undefined ? ` · próximo lote en ${data.nextBatch.daysUntil} días` : ''}`} />
            <Stat label="Reserva para LinkedIn" value={dayCount(data.linkedin.reserveDays)} caption={`${fmtNum(data.linkedin.reserve)} sin publicar, a ${data.linkedin.perDay} por día · con la cola: ${dayCount(data.linkedin.reserveWithQueueDays)}`} />
          </div>

          <Card title="Por puesto" hint="Puestos con más candidatas primero · «foco» = se publican en LinkedIn">
            <table className="panel-table">
              <thead><tr><th>Puesto</th><th className="num">Candidatas</th><th className="num">Abiertas</th><th className="num">Le sirven a alguien</th><th className="num">En cola</th><th className="num">Cola que sirve</th><th className="num">Reserva LinkedIn</th></tr></thead>
              <tbody>
                {(data.byRole ?? []).map(row => (
                  <tr key={row.role}>
                    <td>{row.label}{row.inLinkedinFocus ? ' · foco' : ''}</td>
                    <td className="num">{fmtNum(row.candidates)}</td>
                    <td className="num">{fmtNum(row.open)}</td>
                    <td className="num">{fmtNum(row.openServing)}</td>
                    <td className="num">{fmtNum(row.queued)}</td>
                    <td className="num">{fmtNum(row.queuedServing)}</td>
                    <td className="num">{row.inLinkedinFocus ? fmtNum(row.linkedinReserve) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Huecos">
            {(data.rolesWithoutPeople ?? []).length === 0 && (data.rolesWithoutVacancies ?? []).length === 0 ? <Empty>Ningún puesto está descubierto.</Empty> : (
              <ul>
                {(data.rolesWithoutPeople ?? []).length > 0 && <li><strong>Hay vacantes y no hay candidatas:</strong> {(data.rolesWithoutPeople ?? []).join(', ')}.</li>}
                {(data.rolesWithoutVacancies ?? []).length > 0 && <li><strong>Hay candidatas y no hay vacantes:</strong> {(data.rolesWithoutVacancies ?? []).join(', ')}.</li>}
              </ul>
            )}
          </Card>
          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
