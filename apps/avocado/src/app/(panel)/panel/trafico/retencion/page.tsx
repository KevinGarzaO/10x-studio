'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Avatar, BarSeries, Card, Empty, ErrorBox, fmtDay, fmtNum, fmtPct, Loading, PageHeader, PeriodPicker, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Person {
  key: string
  registered: boolean
  username: string | null
  displayName: string | null
  photoUrl: string | null
  profileCompleted: boolean | null
  isNew: boolean
  firstDay: string
  daysActive: number
  returnDays: number
  lastActive: string
  activeToday: boolean
  activeDays: string[]
}

interface WebRetention {
  ready: boolean
  trackingSince?: string | null
  partial?: boolean
  summary?: {
    dau: number; wau: number; mau: number; stickinessPct: number | null
    activePeople: number; newActive: number; returningActive: number
    eligible: number; returned: number; returnRatePct: number | null
  }
  daily?: { day: string; dau: number; wau: number; mau: number }[]
  people?: Person[]
  cohorts?: { week: string; size: number; retained: { offset: number; count: number; pct: number | null }[] }[]
}

const STRIP_DAYS = 14

/** Hoy en Monterrey (YYYY-MM-DD), el mismo día que usa el servidor. */
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })

/** Los últimos 14 días, del más viejo al de hoy. */
function lastDays(today: string): string[] {
  const end = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: STRIP_DAYS }, (_, i) => new Date(end - (STRIP_DAYS - 1 - i) * 86400000).toISOString().slice(0, 10))
}

/** Una cajita por día: verde si estuvo activa ese día; con borde oscuro, el día de su primera visita. */
function DaysStrip({ person, today }: { person: Person; today: string }) {
  const days = lastDays(today)
  const active = new Set(person.activeDays)
  const shown = person.activeDays.map(fmtDay).join(', ') || 'ninguno'
  return (
    <span className="panel-days" role="img" aria-label={`Días activa en las últimas dos semanas: ${shown}`}>
      {days.map(day => (
        <i key={day} className={`${active.has(day) ? 'on' : ''}${day === person.firstDay ? ' signup' : ''}`} title={`${fmtDay(day)}${active.has(day) ? ' · activa' : ''}${day === person.firstDay ? ' · primera visita' : ''}`} />
      ))}
    </span>
  )
}

/** El color de una celda de la matriz: más verde, más gente que volvió. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return { color: '#cbd5e1' }
  const alpha = Math.min(0.85, 0.08 + (value / 100) * 0.77)
  return { background: `rgba(16, 185, 129, ${alpha})`, color: value >= 55 ? '#fff' : '#064e3b' }
}

export default function RetencionWebPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<WebRetention>(`/api/admin/analytics/web/retention?days=${days}`, { keepPrevious: true })
  const today = todayKey()
  const weeks = Math.max(0, ...(data?.cohorts ?? []).map(cohort => cohort.retained.length))
  const summary = data?.summary

  return (
    <>
      <PageHeader title="Retención" subtitle="Cuánta gente activa vuelve a AvoTalent, medida con las sesiones nuevas y la misma distinción de personas del resto del módulo.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady />}

      {data?.ready && summary && (
        <>
          {data.partial && (
            <p className="panel-defs" style={{ marginTop: 0 }}>
              <b>Medición incompleta.</b> {data.trackingSince ? `Esta medición empezó el ${fmtDay(data.trackingSince)}` : 'Esta medición aún no tiene sesiones'}, así que parte del periodo no existe y pocas personas han tenido un día para volver.
              Las cifras se vuelven útiles con un par de semanas de datos.
            </p>
          )}

          <div className="panel-grid cols-4">
            <Stat label="Activas hoy" value={fmtNum(summary.dau)} caption="Personas distintas con una sesión activa hoy (DAU)." />
            <Stat label="Activas en 7 días" value={fmtNum(summary.wau)} caption="Personas distintas con una sesión activa esta semana (WAU)." />
            <Stat label="Activas en 30 días" value={fmtNum(summary.mau)} caption="Personas distintas con una sesión activa este mes (MAU)." />
            <Stat label="Frecuencia de uso" value={fmtPct(summary.stickinessPct)} caption="Activas de hoy entre activas del mes: cuánto del mes usan el sitio." />
          </div>

          <div className="panel-grid cols-3">
            <Stat label="Personas activas en el periodo" value={fmtNum(summary.activePeople)} caption={`${fmtNum(summary.newActive)} nuevas · ${fmtNum(summary.returningActive)} recurrentes. Quien solo visitó no cuenta.`} tone="good" />
            <Stat label="Volvieron" value={summary.eligible ? `${fmtNum(summary.returned)} de ${fmtNum(summary.eligible)}` : '—'} caption="De las activas con primera visita anterior a hoy, cuántas estuvieron activas otro día." tone={summary.eligible > 0 && summary.returned === 0 ? 'warn' : undefined} />
            <Stat label="Tasa de regreso" value={fmtPct(summary.returnRatePct)} caption="Volvieron entre las que ya podían volver." />
          </div>

          <Card title="Personas activas por día" hint="DAU, WAU y MAU">
            {!data.daily || data.daily.length === 0 ? <Empty>Aún no hay visitas.</Empty> : (
              <BarSeries
                points={data.daily.map(row => ({ day: row.day, dau: row.dau, wau: row.wau, mau: row.mau }))}
                series={[{ key: 'dau', label: 'Día', color: '#10b981' }, { key: 'wau', label: '7 días', color: '#0ea5e9' }, { key: 'mau', label: '30 días', color: '#6366f1' }]}
              />
            )}
          </Card>

          <Card title="Quién usa AvoTalent" hint="Personas activas del periodo · primero quien más días ha estado activa">
            {!data.people || data.people.length === 0 ? <Empty>Nadie ha tenido una sesión activa en este periodo.</Empty> : (
              <DataTable
                rows={data.people}
                rowKey={person => person.key}
                searchText={person => `${person.displayName ?? ''} ${person.username ?? ''}`}
                searchLabel="Buscar persona"
                filter={{
                  label: 'Quién',
                  options: [
                    { value: 'volvio', label: 'Volvieron' },
                    { value: 'solo', label: 'No han vuelto' },
                    { value: 'nueva', label: 'Nuevas' },
                    { value: 'recurrente', label: 'Recurrentes' },
                    { value: 'registrada', label: 'Registradas' },
                    { value: 'anonima', label: 'Anónimas' },
                  ],
                  test: (person, value) => {
                    if (value === 'volvio') return person.returnDays > 0
                    if (value === 'solo') return person.returnDays === 0
                    if (value === 'nueva') return person.isNew
                    if (value === 'recurrente') return !person.isNew
                    if (value === 'registrada') return person.registered
                    return !person.registered
                  },
                }}
                head={<tr><th>Persona</th><th>Primera visita</th><th className="num">Días activa ↓</th><th>¿Volvió?</th><th>Últimos 14 días</th><th>Última vez</th></tr>}
                renderRow={person => {
                  const name = person.displayName || person.username || (person.registered ? 'Sin nombre' : 'Anónima')
                  return (
                    <tr>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={name} photo={person.photoUrl} />
                          <span>
                            {person.username ? <a href={`https://avotalent.app/users/${person.username}`} target="_blank" rel="noreferrer">{name}</a> : name}
                            <span className="panel-muted" style={{ display: 'block', fontSize: 12 }}>
                              {person.registered ? (person.profileCompleted ? 'Registrada · perfil completo' : 'Registrada · perfil sin completar') : 'Sin cuenta'} · {person.isNew ? 'nueva' : 'recurrente'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>{fmtDay(person.firstDay)}</td>
                      <td className="num"><b>{person.daysActive}</b></td>
                      <td>
                        {person.returnDays > 0
                          ? <span className="panel-chip good">Volvió {person.returnDays} {person.returnDays === 1 ? 'día' : 'días'}</span>
                          : <span className="panel-chip">Aún no</span>}
                      </td>
                      <td><DaysStrip person={person} today={today} /></td>
                      <td>{person.activeToday ? 'Hoy' : fmtDay(person.lastActive)}</td>
                    </tr>
                  )
                }}
              />
            )}
            <p className="panel-defs" style={{ marginTop: 12 }}>
              Cada cajita de <b>Últimos 14 días</b> es un día (la de la derecha es hoy): verde si esa persona estuvo activa; con borde oscuro, el día de su primera visita.
            </p>
          </Card>

          <Card title="Cohortes por semana de llegada" hint="Qué porcentaje de cada grupo volvió con una sesión activa">
            {!data.cohorts || data.cohorts.length === 0 ? <Empty>Aún no hay suficientes semanas.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table panel-cohort">
                  <thead>
                    <tr>
                      <th>Semana de llegada</th><th className="num">Personas</th>
                      {Array.from({ length: weeks }, (_, index) => <th key={index} style={{ textAlign: 'center' }}>{index === 0 ? 'Semana 0' : `Semana +${index}`}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map(cohort => (
                      <tr key={cohort.week}>
                        <td>{fmtDay(cohort.week)}</td>
                        <td className="num">{cohort.size}</td>
                        {Array.from({ length: weeks }, (_, index) => {
                          const cell = cohort.retained.find(item => item.offset === index)
                          return <td key={index} className="cell" style={shade(cell?.pct ?? null)}>{cell ? `${cell.pct ?? 0}%` : '·'}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una persona está <b>activa</b> un día si ese día tuvo una sesión activa (10 segundos con la pestaña visible, 2 páginas o un evento clave); quien entró y se fue es <b>solo visita</b> y no cuenta.
            <b> Volvió</b> es estar activa en un día posterior al de su primera visita (o al de su cuenta, si es más vieja que la medición); las personas cuya primera visita es hoy aún no pueden volver y no entran en la tasa.
            No cuenta al equipo, las cuentas de prueba ni los robots, y los días son de Monterrey. Esta pantalla <b>no sustituye</b> a la Retención de Analítica, que sigue leyendo la actividad de las cuentas; las dos conviven hasta que las cifras cuadren.
            Con pocas personas por semana, una sola mueve mucho el porcentaje: tómalo como tendencia.
          </p>
        </>
      )}
    </>
  )
}
