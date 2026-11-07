'use client'

import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'

interface RoleSupply { role: string; label: string; candidates: number; open: number; openServing: number; queued: number; queuedServing: number; linkedinReserve: number; inLinkedinFocus: boolean }
interface Supply {
  ready: boolean
  people?: number
  totals?: { open: number; openServing: number; openServingPct: number | null; queued: number; queuedServing: number; queuedServingPct: number | null }
  linkedin?: { perDay: number; windowDays: number; needed: number; reserve: number; coveredDays: number; coversWindow: boolean; balanceAtRefresh: number; reserveWithQueue: number; balanceWithQueue: number; focusRoles: string[] }
  nextBatch?: { at: string | null; daysUntil: number | null }
  byRole?: RoleSupply[]
  rolesWithoutPeople?: string[]
  rolesWithoutVacancies?: string[]
  notes?: string[]
}

const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)
/** «Sobran 274» / «Faltan 34»: el saldo al llegar el lote nuevo. */
const balance = (value: number) => (value >= 0 ? `sobrarían ${fmtNum(value)}` : `faltarían ${fmtNum(-value)}`)

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
            <Stat label="LinkedIn hasta el próximo lote" value={`${fmtNum(data.linkedin.reserve)} de ${fmtNum(data.linkedin.needed)}`} tone={data.linkedin.coversWindow ? undefined : 'warn'} caption={`vacantes útiles sin publicar contra las que pide la ventana (${data.linkedin.windowDays} días × ${data.linkedin.perDay}) · al llegar el lote ${balance(data.linkedin.balanceAtRefresh)}`} />
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
