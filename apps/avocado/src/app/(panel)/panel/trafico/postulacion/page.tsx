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

interface WallGroup { saw: number; clicked: number; clickedLinkedin: number; clickedGithub: number; clickedEmail: number; registered: number; clickPct: number | null; registerPct: number | null }
interface Wall { ready: boolean; total?: WallGroup; byDevice?: (WallGroup & { device: string })[]; byInApp?: (WallGroup & { inApp: string })[]; groups?: (WallGroup & { device: string; inApp: string })[]; notes?: string[] }
const IN_APP: Record<string, string> = { no: 'Navegador normal', linkedin: 'Dentro de la app de LinkedIn', facebook: 'Dentro de Facebook', instagram: 'Dentro de Instagram', other: 'Otro navegador interno', sin_dato: 'Sin dato (antes de medirse)' }

function WallTable({ title, hint, rows }: { title: string; hint: string; rows: { label: string; group: WallGroup }[] }) {
  return (
    <Card title={title} hint={hint}>
      <table className="panel-table">
        <thead><tr><th></th><th className="num">Vieron la ventana</th><th className="num">Tocaron un botón</th><th className="num">LinkedIn</th><th className="num">GitHub</th><th className="num">Correo</th><th className="num">Se registraron</th><th className="num">% que se registró</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="num">{fmtNum(row.group.saw)}</td>
              <td className="num">{fmtNum(row.group.clicked)}</td>
              <td className="num">{fmtNum(row.group.clickedLinkedin)}</td>
              <td className="num">{fmtNum(row.group.clickedGithub)}</td>
              <td className="num">{fmtNum(row.group.clickedEmail)}</td>
              <td className="num">{fmtNum(row.group.registered)}</td>
              <td className="num">{pct(row.group.registerPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

interface ProviderGroup { clicked: number; succeeded: number; denied: number; failed: number; noReturn: number; successPct: number | null; lostPct: number | null }
interface Providers {
  ready: boolean
  total?: ProviderGroup
  byProvider?: (ProviderGroup & { provider: string })[]
  byDevice?: (ProviderGroup & { device: string })[]
  byInApp?: (ProviderGroup & { inApp: string })[]
  reasons?: { provider: string; reason: string; people: number }[]
  notes?: string[]
}
const PROVIDER: Record<string, string> = { linkedin: 'LinkedIn', github: 'GitHub', google: 'Google', desconocido: 'Sin dato' }
const REASON: Record<string, string> = { access_denied: 'Canceló o negó el permiso', server_error: 'Error del proveedor', temporarily_unavailable: 'Proveedor no disponible', sync_failed: 'Falló nuestro servidor al volver', no_session: 'Volvió sin sesión', network: 'Sin conexión al volver', other: 'Otro motivo' }

function ProviderTable({ title, hint, rows }: { title: string; hint: string; rows: { label: string; group: ProviderGroup }[] }) {
  return (
    <Card title={title} hint={hint}>
      <table className="panel-table">
        <thead><tr><th></th><th className="num">Tocaron el botón</th><th className="num">Volvieron con sesión</th><th className="num">Cancelaron o negaron</th><th className="num">Volvieron con error</th><th className="num">No volvieron</th><th className="num">% que entró</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="num">{fmtNum(row.group.clicked)}</td>
              <td className="num">{fmtNum(row.group.succeeded)}</td>
              <td className="num">{fmtNum(row.group.denied)}</td>
              <td className="num">{fmtNum(row.group.failed)}</td>
              <td className="num">{fmtNum(row.group.noReturn)}</td>
              <td className="num">{pct(row.group.successPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
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
  const wall = usePanelData<Wall>(`/api/admin/analytics/web/wall?days=${days}`, { keepPrevious: true }).data
  const providers = usePanelData<Providers>(`/api/admin/analytics/web/providers?days=${days}`, { keepPrevious: true }).data

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
          {wall && !wall.ready && <TrafficNotReady migration="wall-funnel-migration.sql" />}
          {wall?.ready && wall.total && (
            <>
              <WallTable title="La ventana de registro sobre la vacante" hint="Quien no tiene cuenta no puede postularse: primero ve esta ventana" rows={[{ label: 'Todos', group: wall.total }]} />
              <WallTable title="Ventana por dispositivo" hint="Móvil contra escritorio" rows={(wall.byDevice ?? []).map(row => ({ label: DEVICE[row.device] ?? row.device, group: row }))} />
              <WallTable title="Ventana por tipo de navegador" hint="La app de LinkedIn abre las páginas en su propio navegador, donde iniciar sesión suele atorarse" rows={(wall.byInApp ?? []).map(row => ({ label: IN_APP[row.inApp] ?? row.inApp, group: row }))} />
            </>
          )}
          {providers && !providers.ready && <TrafficNotReady migration="provider-funnel-migration.sql" />}
          {providers?.ready && providers.total && (
            <>
              <ProviderTable title="Registro con LinkedIn o GitHub: por proveedor" hint="Personas que tocaron el botón de un proveedor y cómo volvieron. «No volvieron» = se quedaron en el proveedor o cerraron antes" rows={[{ label: 'Todos', group: providers.total }, ...(providers.byProvider ?? []).map(row => ({ label: PROVIDER[row.provider] ?? row.provider, group: row }))]} />
              <ProviderTable title="Proveedor: por dispositivo" hint="Móvil contra escritorio" rows={(providers.byDevice ?? []).map(row => ({ label: DEVICE[row.device] ?? row.device, group: row }))} />
              <ProviderTable title="Proveedor: por tipo de navegador" hint="Dentro de la app de LinkedIn, Facebook o Instagram, o un navegador normal" rows={(providers.byInApp ?? []).map(row => ({ label: IN_APP[row.inApp] ?? row.inApp, group: row }))} />
              {(providers.reasons ?? []).length > 0 && (
                <Card title="Por qué volvieron mal" hint="Código que devuelve el proveedor, no el texto">
                  <table className="panel-table">
                    <thead><tr><th>Proveedor</th><th>Motivo</th><th className="num">Personas</th></tr></thead>
                    <tbody>{(providers.reasons ?? []).map(row => <tr key={`${row.provider}-${row.reason}`}><td>{PROVIDER[row.provider] ?? row.provider}</td><td>{REASON[row.reason] ?? row.reason}</td><td className="num">{fmtNum(row.people)}</td></tr>)}</tbody>
                  </table>
                </Card>
              )}
              <Card title="Cómo leer el registro por proveedor"><ul>{(providers.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
            </>
          )}
          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
