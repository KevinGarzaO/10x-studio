'use client'

import { useState } from 'react'
import { Card, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface PushData {
  ready: boolean
  devices?: { active: number; activatedInPeriod: number }
  invitation?: { shown: number; accepted: number; denied: number; dismissed: number; acceptRatePct: number | null }
  delivery?: { sent: number; failed: number; clicked: number; clickRatePct: number | null; peopleReached: number; peopleClicked: number }
  byType?: { type: string; sent: number; failed: number; clicked: number; clickRatePct: number | null }[]
  unsubscribed?: number
  notes?: string[]
}

const PERIODS = [{ days: 1, label: '24 horas' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 90, label: '90 días' }]
const TYPE: Record<string, string> = { application: 'Seguimiento de postulación', match: 'Vacante para ti', welcome: 'Aviso de muestra' }
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)

export default function PushPage() {
  const [days, setDays] = useState(7)
  const { data, loading, error, reload } = usePanelData<PushData>(`/api/admin/analytics/push?days=${days}`, { keepPrevious: true })

  return (
    <>
      <PageHeader title="Avisos push" subtitle="Cuánta gente acepta recibir avisos en su dispositivo, cuántos se mandan y cuántos se tocan.">
        <div className="panel-period" role="group" aria-label="Periodo">
          {PERIODS.map(option => (
            <button key={option.days} type="button" className={days === option.days ? 'active' : ''} aria-pressed={days === option.days} onClick={() => setDays(option.days)}>{option.label}</button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="push-notifications-migration.sql" />}

      {data?.ready && data.invitation && data.delivery && data.devices && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Dispositivos activos" value={fmtNum(data.devices.active)} caption={`${fmtNum(data.devices.activatedInPeriod)} nuevos en el periodo`} />
            <Stat label="Aceptan la invitación" value={pct(data.invitation.acceptRatePct)} caption={`${fmtNum(data.invitation.accepted)} de ${fmtNum(data.invitation.shown)} veces que se mostró`} />
            <Stat label="Avisos que se tocan" value={pct(data.delivery.clickRatePct)} caption={`${fmtNum(data.delivery.clicked)} clics de ${fmtNum(data.delivery.sent)} enviados`} />
          </div>
          <Card title="La invitación" hint="Después de contestar «¿Ya te postulaste?» y en Ajustes">
            <table className="panel-table">
              <tbody>
                <tr><td>Se mostró</td><td className="num">{fmtNum(data.invitation.shown)}</td></tr>
                <tr><td>Aceptó (permiso concedido)</td><td className="num">{fmtNum(data.invitation.accepted)}</td></tr>
                <tr><td>El navegador negó el permiso</td><td className="num">{fmtNum(data.invitation.denied)}</td></tr>
                <tr><td>Dijo «ahora no»</td><td className="num">{fmtNum(data.invitation.dismissed)}</td></tr>
                <tr><td>Apagó los avisos después</td><td className="num">{fmtNum(data.unsubscribed ?? 0)}</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Por tipo de aviso" hint={`${fmtNum(data.delivery.peopleReached)} personas recibieron · ${fmtNum(data.delivery.peopleClicked)} tocaron alguno`}>
            {(data.byType ?? []).length === 0 ? <p>Todavía no se ha mandado ningún aviso en este periodo.</p> : (
              <table className="panel-table">
                <thead><tr><th>Tipo</th><th className="num">Enviados</th><th className="num">Fallidos</th><th className="num">Tocados</th><th className="num">% que tocó</th></tr></thead>
                <tbody>
                  {(data.byType ?? []).map(row => (
                    <tr key={row.type}><td>{TYPE[row.type] ?? row.type}</td><td className="num">{fmtNum(row.sent)}</td><td className="num">{fmtNum(row.failed)}</td><td className="num">{fmtNum(row.clicked)}</td><td className="num">{pct(row.clickRatePct)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
