'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
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
interface TestResult { enabled: boolean; hasKeys: boolean; devices: { id: string; ok: boolean; reason?: string }[]; account?: string; notFound?: boolean }

/** Manda un aviso de prueba a TUS dispositivos activos y explica qué pasó con cada uno. */
function TestPush({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [failed, setFailed] = useState('')
  const [account, setAccount] = useState('')

  async function send() {
    setBusy(true); setFailed(''); setResult(null)
    try {
      setResult(await api<TestResult>('/api/admin/analytics/push/test', { method: 'POST', body: JSON.stringify({ account: account.trim() }) }))
      onDone()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'No se pudo mandar')
    }
    setBusy(false)
  }

  return (
    <Card title="Probar con mis dispositivos" hint="Manda un aviso de prueba a los dispositivos que activaste con tu cuenta">
      <p><label>Otra cuenta tuya (usuario o correo, opcional) <input value={account} onChange={event => setAccount(event.target.value)} placeholder="vacío = la cuenta con la que entraste al panel" style={{ minWidth: 280 }} /></label></p>
      <button type="button" className="panel-btn" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Mandarme un aviso de prueba'}</button>
      {failed && <p>{failed}</p>}
      {result && (
        <ul>
          {result.notFound && <li>No encontré una cuenta con «{result.account}».</li>}
          {!result.hasKeys && <li>Al servidor le faltan las llaves VAPID (VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Railway).</li>}
          {result.hasKeys && !result.enabled && <li>Los avisos están apagados en el servidor (falta PUSH_NOTIFICATIONS=on en Railway).</li>}
          {result.hasKeys && !result.notFound && result.devices.length === 0 && <li>{result.account === 'tu cuenta del panel' ? 'La cuenta con la que entraste al panel' : `La cuenta ${result.account ?? ''}`} no tiene ningún dispositivo activo. Si activaste los avisos con otra cuenta tuya, escribe su usuario o correo en el campo de arriba. Actívalo desde la ventana «¿Ya te postulaste?» o en Ajustes → Notificaciones.</li>}
          {result.devices.map((device, index) => (
            <li key={device.id}>Dispositivo {index + 1}: {device.ok ? 'el servidor lo entregó al navegador; si no lo ves, revisa las notificaciones del sistema y del navegador.' : `falló (${device.reason})`}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

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
          <TestPush onDone={reload} />
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
