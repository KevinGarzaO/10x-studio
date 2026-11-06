'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Step {
  name: string
  order: number
  reached: number
  avgDurationMs: number | null
  avgLoadTimeMs: number | null
  errors: number
  frustrated: number
  rageClicks: number
  dropoffToNextPct: number | null
}
interface Flow {
  name: string
  runsStarted: number
  peopleStarted: number
  runsCompleted: number
  peopleCompleted: number
  runsDropped: number
  runsError: number
  runsInProgress: number
  completionRatePct: number | null
  dropoffRatePct: number | null
  avgDurationMs: number | null
  avgLoadTimeMs: number | null
  frustratedRuns: number
  steps: Step[]
}
interface FlowsData { ready: boolean; flows?: Flow[] }

const LABEL: Record<string, string> = {
  auth_login: 'Iniciar sesión',
  auth_register: 'Crear cuenta',
  job_search_filter: 'Buscar y filtrar vacantes',
  job_application: 'Postularse a una vacante',
  view_feed: 'Ver el feed (hasta las primeras tarjetas)',
  view_vacancy: 'Ver una vacante (hasta mostrarla)',
  profile_setup: 'Completar el perfil (paso por paso y campo por campo)',
}

/** 1250 -> "1.3 s"; 420 -> "420 ms". */
function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  return ms >= 1000 ? `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s` : `${ms} ms`
}

export default function FlujosPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<FlowsData>(`/api/admin/analytics/web/flows?days=${days}`, { keepPrevious: true })
  const flows = data?.flows ?? []

  return (
    <>
      <PageHeader title="Flujos críticos" subtitle="Iniciar sesión, crear cuenta, buscar vacantes y postularse: cuántos intentos se completan, dónde se abandona, cuánto tarda y dónde hay frustración.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="telemetry-migration.sql" />}

      {data?.ready && (
        <>
          {flows.length === 0 ? (
            <Card title="Todavía no hay intentos"><Empty>Aún nadie ha iniciado un flujo medido en este periodo.</Empty></Card>
          ) : (
            <>
              <Card title="Resumen por flujo" hint="Un intento es una persona recorriendo el flujo una vez">
                <DataTable
                  rows={flows}
                  rowKey={flow => flow.name}
                  head={<tr><th>Flujo</th><th className="num">Intentos</th><th className="num">Personas</th><th className="num">Completados</th><th className="num">Abandono</th><th className="num">Con error</th><th className="num">Duración</th><th className="num">Carga</th><th className="num">Con frustración</th></tr>}
                  renderRow={flow => (
                    <tr>
                      <td><b>{LABEL[flow.name] ?? flow.name}</b></td>
                      <td className="num">{fmtNum(flow.runsStarted)}{flow.runsInProgress > 0 && <span className="panel-muted" title="Siguen en curso: no cuentan como completados ni abandonados todavía"> ({flow.runsInProgress} en curso)</span>}</td>
                      <td className="num">{fmtNum(flow.peopleStarted)}</td>
                      <td className="num">{fmtNum(flow.runsCompleted)} <span className="panel-muted">· {fmtPct(flow.completionRatePct)}</span></td>
                      <td className="num">{fmtNum(flow.runsDropped)} <span className="panel-muted">· {fmtPct(flow.dropoffRatePct)}</span></td>
                      <td className="num">{flow.runsError > 0 ? <span className="panel-chip warn">{fmtNum(flow.runsError)}</span> : '0'}</td>
                      <td className="num">{fmtMs(flow.avgDurationMs)}</td>
                      <td className="num">{fmtMs(flow.avgLoadTimeMs)}</td>
                      <td className="num">{flow.frustratedRuns > 0 ? <span className="panel-chip warn">{fmtNum(flow.frustratedRuns)}</span> : '0'}</td>
                    </tr>
                  )}
                />
              </Card>

              <div className="panel-grid cols-2">
                {flows.map(flow => {
                  const top = Math.max(1, ...flow.steps.map(step => step.reached))
                  return (
                    <Card key={flow.name} title={LABEL[flow.name] ?? flow.name} hint={`${fmtNum(flow.runsStarted)} intentos · ${fmtPct(flow.completionRatePct)} completados`}>
                      {flow.steps.length === 0 ? <Empty>Sin pasos.</Empty> : flow.steps.map(step => (
                        <div key={step.name} className="panel-funnel-row">
                          <span>{step.name.replace(/_/g, ' ')}</span>
                          <InlineBar value={step.reached} max={top} />
                          <span style={{ textAlign: 'right' }}>
                            <b>{fmtNum(step.reached)}</b>
                            {step.dropoffToNextPct !== null && step.dropoffToNextPct > 0 && <span className="panel-muted" title="Se pierde entre este paso y el siguiente"> · −{fmtPct(step.dropoffToNextPct)}</span>}
                            {step.avgLoadTimeMs !== null && step.avgLoadTimeMs > 2500 && <span className="panel-chip warn" style={{ marginLeft: 6 }} title="Carga promedio de este paso">{fmtMs(step.avgLoadTimeMs)}</span>}
                            {step.rageClicks > 0 && <span className="panel-chip warn" style={{ marginLeft: 6 }} title="Rage clicks en este paso">{step.rageClicks} rage</span>}
                            {step.errors > 0 && <span className="panel-chip warn" style={{ marginLeft: 6 }}>{step.errors} error</span>}
                          </span>
                        </div>
                      ))}
                    </Card>
                  )
                })}
              </div>

              <div className="panel-grid cols-3">
                <Stat label="Intentos medidos" value={fmtNum(flows.reduce((sum, flow) => sum + flow.runsStarted, 0))} caption="Suma de los cuatro flujos." />
                <Stat label="Con frustración" value={fmtNum(flows.reduce((sum, flow) => sum + flow.frustratedRuns, 0))} caption="Intentos con una carga de más de 2.5 s o rage clicks en algún paso." tone={flows.some(flow => flow.frustratedRuns > 0) ? 'warn' : 'good'} />
                <Stat label="Con error técnico" value={fmtNum(flows.reduce((sum, flow) => sum + flow.runsError, 0))} caption="Intentos que terminaron por un fallo del servidor o de la conexión (no por escribir mal una contraseña)." tone={flows.some(flow => flow.runsError > 0) ? 'warn' : 'good'} />
              </div>
            </>
          )}

          <p className="panel-defs">
            <b>Cómo leerlo.</b> <b>Completado</b> es un intento que llegó a su paso final; <b>abandono</b> es el que se quedó a medias (la persona se fue, o pasaron 30 minutos sin avanzar); los que siguen en curso no cuentan todavía en ningún porcentaje.
            <b> Duración</b> es el tiempo que tarda la persona de principio a fin en los intentos completados; <b>carga</b> es lo que tarda la app en responder en un paso. Un intento tiene <b>frustración</b> si algún paso cargó en más de 2.5 s o la persona hizo rage clicks (3 clics seguidos casi en el mismo lugar).
            Equivocarse en la contraseña no es un error del flujo: el intento sigue abierto. Los porcentajes de abandono entre pasos se calculan con los intentos que llegaron a cada paso.
          </p>
        </>
      )}
    </>
  )
}
