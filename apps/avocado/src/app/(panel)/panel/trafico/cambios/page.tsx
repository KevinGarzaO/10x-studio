'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtDate, fmtNum, Loading, PageHeader, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Shift { before: number | null; after: number | null; changePct: number | null }
type Confidence = 'pendiente' | 'sin_base' | 'mezclado' | 'comparable'
interface Change {
  id: string
  shippedAt: string
  title: string
  kind: string
  area: string
  expectedMetric: string | null
  source: string
  activePeoplePerDay: Shift
  newActivePerDay: Shift
  sessionsPerDay: Shift
  registrationsPerDay: Shift
  errorsPerDay: Shift
  beforeTrackedDays: number
  afterTrackedDays: number
  afterComplete: boolean
  nearbyChanges: number
  confidence: Confidence
}
interface ChangesData { ready: boolean; windowDays?: number; changes?: Change[]; withoutExpectedMetric?: number }

const WINDOWS = [3, 7, 14]

const KIND: Record<string, string> = { feature: 'Función', fix: 'Arreglo', experiment: 'Experimento', config: 'Configuración', content: 'Contenido', chore: 'Mantenimiento' }

const CONFIDENCE: Record<Confidence, { label: string; hint: string }> = {
  comparable: { label: 'Comparable', hint: 'Hay días medidos antes y después y pocos otros cambios cerca. Aun así NO prueba que este cambio fue la causa.' },
  mezclado: { label: 'Mezclado', hint: 'Cayeron 3 o más otros cambios en la misma ventana: no se puede atribuir a este.' },
  sin_base: { label: 'Sin base', hint: 'Antes de este cambio hay menos de 2 días medidos (la medición nueva empezó el 30 de octubre de 2026).' },
  pendiente: { label: 'Muy reciente', hint: 'Aún no pasa ni un día de medición después del cambio.' },
}

/** "2 → 4 (+100%)"; si falta la base o el después, solo lo que haya. Los errores suben en rojo: más es peor. */
function ShiftCell({ shift, worseWhenUp = false }: { shift: Shift; worseWhenUp?: boolean }) {
  const show = (value: number | null) => (value === null ? '—' : value.toLocaleString('es-MX', { maximumFractionDigits: 2 }))
  const pct = shift.changePct
  const up = pct !== null && pct > 0
  const color = pct === null || pct === 0 ? undefined : (up === worseWhenUp ? '#b91c1c' : '#047857')
  return (
    <td className="num">
      {show(shift.before)} → {show(shift.after)}
      {pct !== null && <span style={{ color, marginLeft: 6 }}>{up ? '+' : ''}{fmtNum(pct)}%</span>}
    </td>
  )
}

export default function CambiosPage() {
  const [windowDays, setWindowDays] = useState(7)
  const { data, loading, error, reload } = usePanelData<ChangesData>(`/api/admin/analytics/changes?window=${windowDays}`, { keepPrevious: true })
  const changes = data?.changes ?? []

  return (
    <>
      <PageHeader title="Cambios" subtitle="Qué se cambió y cuándo, con lo que pasó los días de antes y los días de después. Es para ver qué se movió, no para decir qué lo causó.">
        <div className="panel-period" role="group" aria-label="Días a cada lado del cambio">
          {WINDOWS.map(option => (
            <button key={option} type="button" className={windowDays === option ? 'active' : ''} aria-pressed={windowDays === option} onClick={() => setWindowDays(option)}>
              {option} días
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="product-changes-migration.sql" />}

      {data?.ready && (
        <>
          {(data.withoutExpectedMetric ?? 0) > 0 && (
            <Card title={`${data.withoutExpectedMetric} cambios sin métrica esperada`} hint="Sin ella no se puede evaluar si el cambio sirvió">
              <p>Al hacer un commit, añade en el cuerpo una línea <code>Expects: qué métrica debe moverse y hacia dónde</code>.</p>
            </Card>
          )}
          {changes.length === 0 ? (
            <Card title="Todavía no hay cambios anotados"><Empty>Corre <code>npm run log-changes -- --apply</code> en el backend para traer lo que ya se subió; desde ahora cada despliegue se anota solo.</Empty></Card>
          ) : (
            <Card title="Cambios y su antes → después" hint={`Promedio por día medido, ${windowDays} días antes → ${windowDays} días después`}>
              <DataTable
                rows={changes}
                rowKey={change => change.id}
                searchText={change => `${change.title} ${change.area} ${KIND[change.kind] ?? change.kind} ${change.expectedMetric ?? ''}`}
                searchLabel="Buscar un cambio"
                head={<tr><th>Cuándo</th><th>Cambio</th><th className="num">Personas activas / día</th><th className="num">Nuevas activas / día</th><th className="num">Sesiones / día</th><th className="num">Registros / día</th><th className="num">Errores / día</th><th>Qué tan comparable</th></tr>}
                renderRow={change => {
                  const confidence = CONFIDENCE[change.confidence]
                  return (
                    <tr>
                      <td title={change.source === 'git' ? 'Hora del commit (no del despliegue)' : change.source === 'deploy' ? 'Hora del despliegue' : 'Anotado a mano'}>{fmtDate(change.shippedAt, true)}</td>
                      <td>
                        <b>{change.title}</b>
                        <div className="panel-muted">{KIND[change.kind] ?? change.kind} · {change.area}{change.expectedMetric ? ` · esperaba mover: ${change.expectedMetric}` : ''}</div>
                      </td>
                      <ShiftCell shift={change.activePeoplePerDay} />
                      <ShiftCell shift={change.newActivePerDay} />
                      <ShiftCell shift={change.sessionsPerDay} />
                      <ShiftCell shift={change.registrationsPerDay} />
                      <ShiftCell shift={change.errorsPerDay} worseWhenUp />
                      <td title={confidence.hint}>
                        {confidence.label}
                        <div className="panel-muted">
                          {change.beforeTrackedDays} d antes · {change.afterTrackedDays} d después{change.afterComplete ? '' : ' (en curso)'}
                          {change.nearbyChanges > 0 ? ` · ${change.nearbyChanges} cambio${change.nearbyChanges === 1 ? '' : 's'} cerca` : ''}
                        </div>
                      </td>
                    </tr>
                  )
                }}
              />
            </Card>
          )}

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Cada cifra es un promedio por día medido: personas <b>activas</b> (10 s visibles, 2 páginas o un evento clave) que entraron ese día, personas activas que eran <b>nuevas</b>, sesiones y errores del sitio, y registros de cuentas reales.
            Antes y después se calculan con la misma regla y sin el equipo, las pruebas ni los robots. <b>Un cambio no prueba una causa</b>: un sábado, una publicación de LinkedIn o otro cambio cerca mueven los mismos números. Por eso cada fila dice cuántos días medidos hay de cada lado y cuántos otros cambios cayeron cerca.
            La medición nueva empezó el 30 de octubre de 2026: antes de eso solo los registros tienen historia. La hora de un cambio traído de git es la del commit; los que salen desde ahora llevan la hora real del despliegue.
          </p>
        </>
      )}
    </>
  )
}
