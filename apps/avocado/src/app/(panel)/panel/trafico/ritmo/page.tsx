'use client'

import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtDay, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

type Status = 'flojo' | 'normal' | 'sin_base' | 'en_curso' | 'parcial'
interface Day {
  day: string
  dow: number
  isToday: boolean
  active: number
  newActive: number
  membersActive: number
  origins: { linkedin: number; email: number; direct: number; other: number }
  visitOnly: number
  sessions: number
  registrations: number
  baseline: number | null
  baselineSamples: number
  vsBaselinePct: number | null
  status: Status
  linkedinPosts: number
  emailsSent: number
  changes: string[]
}
interface Cell { dow: number; hour: number; people: number; occurrences: number; average: number | null }
interface RhythmData {
  ready: boolean
  days?: number
  trackedSince?: string | null
  rows?: Day[]
  heat?: Cell[]
  rules?: { baselineWeeks: number; minSamples: number; slowBelowPct: number; minBaseline: number }
}

const PERIODS = [7, 30, 90]
/** Lunes primero (0 = domingo en la base). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAY = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const POSTS_PER_DAY = 4

const STATUS: Record<Status, { label: string; hint: string; color?: string }> = {
  flojo: { label: 'Día flojo', hint: 'Quedó por debajo de la mitad de lo normal para ese día de la semana.', color: '#b91c1c' },
  normal: { label: 'Normal', hint: 'Dentro de lo normal para ese día de la semana.', color: '#047857' },
  sin_base: { label: 'Aún no hay base', hint: 'Hacen falta al menos 3 semanas de ese mismo día de la semana para compararlo.' },
  en_curso: { label: 'En curso', hint: 'El día no ha terminado: todavía no se juzga.' },
  parcial: { label: 'Medición a medias', hint: 'La medición empezó a media jornada de este día.' },
}

/** El color de una celda: más verde cuanto más gente; una hora medida sin gente se ve distinta a una hora que nunca se midió. */
function heatColor(cell: Cell, max: number): { background: string; color?: string } {
  if (cell.average === null) return { background: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(148,163,184,0.18) 4px 5px)' }
  if (cell.average === 0 || max === 0) return { background: 'rgba(148,163,184,0.12)' }
  const strength = Math.min(1, cell.average / max)
  return { background: `rgba(16,185,129,${(0.12 + strength * 0.85).toFixed(2)})`, color: strength > 0.55 ? '#fff' : undefined }
}

function HeatMap({ cells }: { cells: Cell[] }) {
  const max = Math.max(0, ...cells.map(cell => cell.average ?? 0))
  const at = (dow: number, hour: number) => cells.find(cell => cell.dow === dow && cell.hour === hour)!
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11, minWidth: 720 }} aria-label="Personas activas promedio por día de la semana y hora">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, hour) => <th key={hour} style={{ fontWeight: 500, color: '#64748b', textAlign: 'center' }}>{hour}</th>)}
          </tr>
        </thead>
        <tbody>
          {WEEK_ORDER.map(dow => (
            <tr key={dow}>
              <th scope="row" style={{ textAlign: 'right', paddingRight: 6, fontWeight: 600 }}>{WEEKDAY_SHORT[dow]}</th>
              {Array.from({ length: 24 }, (_, hour) => {
                const cell = at(dow, hour)
                const style = heatColor(cell, max)
                const text = cell.average === null
                  ? `${WEEKDAY[dow]} ${hour}:00, aún sin medir`
                  : `${WEEKDAY[dow]} ${hour}:00 a ${hour + 1}:00 · ${cell.average.toLocaleString('es-MX', { maximumFractionDigits: 2 })} personas activas en promedio (${cell.people} en ${cell.occurrences} ${cell.occurrences === 1 ? 'vez' : 'veces'})`
                return (
                  <td key={hour} title={text} aria-label={text} style={{ ...style, width: 26, height: 26, textAlign: 'center', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {cell.average !== null && cell.average > 0 ? (cell.average >= 10 ? Math.round(cell.average) : cell.average.toLocaleString('es-MX', { maximumFractionDigits: 1 })) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function RitmoPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<RhythmData>(`/api/admin/analytics/web/rhythm?days=${days}`, { keepPrevious: true })
  const rows = data?.rows ?? []
  const heat = data?.heat ?? []

  const judged = rows.filter(row => row.status === 'normal' || row.status === 'flojo' || row.status === 'sin_base')
  const slowDays = rows.filter(row => row.status === 'flojo')
  const average = judged.length ? judged.reduce((sum, row) => sum + row.active, 0) / judged.length : null
  const busiest = heat.filter(cell => cell.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0]
  const noBaselineYet = rows.length > 0 && rows.every(row => row.baseline === null)

  return (
    <>
      <PageHeader title="Ritmo de la semana" subtitle="Cuándo hay gente en AvoTalent y cuándo no: por día de la semana y por hora (hora de Monterrey), y cada día contra el mismo día de otras semanas.">
        <div className="panel-period" role="group" aria-label="Periodo">
          {PERIODS.map(option => (
            <button key={option} type="button" className={days === option ? 'active' : ''} aria-pressed={days === option} onClick={() => setDays(option)}>{option} días</button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="web-analytics-rhythm-migration.sql" />}

      {data?.ready && (
        <>
          {rows.length === 0 ? (
            <Card title="Todavía no hay días medidos"><Empty>La medición empezó recientemente; cuando haya un día completo aparece aquí.</Empty></Card>
          ) : (
            <>
              <div className="panel-grid cols-3">
                <Stat label="Días flojos" value={fmtNum(slowDays.length)} caption={noBaselineYet ? 'Aún no se puede decir: faltan semanas de cada día para saber qué es normal.' : `Días por debajo de la mitad de lo normal para su día de la semana (de ${rows.length} mostrados).`} tone={slowDays.length > 0 ? 'warn' : undefined} />
                <Stat label="Personas activas por día" value={average === null ? '—' : average.toLocaleString('es-MX', { maximumFractionDigits: 1 })} caption="Promedio de los días ya completos del periodo." />
                <Stat label="Hora más activa" value={busiest ? `${WEEKDAY_SHORT[busiest.dow]} ${busiest.hour}:00` : '—'} caption={busiest ? `${(busiest.average ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })} personas activas en promedio.` : 'Aún no hay horas completas.'} />
              </div>

              <Card title="Mapa de calor" hint="Personas activas en promedio por cada vez que pasó esa hora">
                <HeatMap cells={heat} />
                <p className="panel-muted" style={{ marginTop: 8 }}>
                  Cada celda es el promedio de personas activas en esa hora de ese día de la semana. Gris con rayas = esa hora aún no se ha medido; gris liso = se midió y no hubo nadie.
                </p>
              </Card>

              <Card title="Día por día" hint="Cada día contra la mediana del mismo día de las últimas semanas">
                <DataTable
                  rows={[...rows].reverse()}
                  rowKey={row => row.day}
                  pageSize={14}
                  searchText={row => `${row.day} ${WEEKDAY[row.dow]} ${STATUS[row.status].label} ${row.changes.join(' ')}`}
                  searchLabel="Buscar un día"
                  head={<tr><th>Día</th><th className="num">Personas activas</th><th>Contra lo normal</th><th className="num">Nuevas</th><th className="num">Ya tenían cuenta</th><th className="num">Registros</th><th className="num">LinkedIn</th><th className="num">Correo</th><th className="num">Directo</th><th className="num">Otro</th><th className="num">Solo visita</th><th>Se publicó</th></tr>}
                  renderRow={row => {
                    const status = STATUS[row.status]
                    return (
                      <tr>
                        <td><b>{WEEKDAY[row.dow]}</b> <span className="panel-muted">{fmtDay(row.day)}</span></td>
                        <td className="num"><b>{fmtNum(row.active)}</b></td>
                        <td title={status.hint}>
                          <span style={{ color: status.color, fontWeight: row.status === 'flojo' ? 700 : 400 }}>{status.label}</span>
                          {row.baseline !== null && (
                            <div className="panel-muted">
                              normal {row.baseline.toLocaleString('es-MX', { maximumFractionDigits: 1 })}{row.vsBaselinePct !== null ? ` · ${row.vsBaselinePct > 0 ? '+' : ''}${fmtNum(row.vsBaselinePct)}%` : ''}
                            </div>
                          )}
                          {row.baseline === null && row.baselineSamples > 0 && <div className="panel-muted">{row.baselineSamples} de 3 semanas</div>}
                        </td>
                        <td className="num">{fmtNum(row.newActive)}</td>
                        <td className="num">{fmtNum(row.membersActive)}</td>
                        <td className="num">{fmtNum(row.registrations)}</td>
                        <td className="num">{fmtNum(row.origins.linkedin)}</td>
                        <td className="num">{fmtNum(row.origins.email)}</td>
                        <td className="num">{fmtNum(row.origins.direct)}</td>
                        <td className="num">{fmtNum(row.origins.other)}</td>
                        <td className="num panel-muted">{fmtNum(row.visitOnly)}</td>
                        <td>
                          <span title="Publicaciones de vacantes en LinkedIn ese día">in {row.linkedinPosts}/{POSTS_PER_DAY}</span>
                          <span title="Correos enviados ese día (según la cuota de Resend)"> · ✉ {row.emailsSent}</span>
                          {row.changes.length > 0 && <div className="panel-muted" title={row.changes.join('\n')}>✎ {row.changes.length} cambio{row.changes.length === 1 ? '' : 's'}</div>}
                        </td>
                      </tr>
                    )
                  }}
                />
              </Card>
            </>
          )}

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una <b>persona activa</b> tuvo una sesión activa (10 segundos con la pestaña visible, 2 o más páginas o un evento clave); quien entró y se fue sin hacer nada es <b>solo visita</b> y nunca cuenta como usuario.
            <b> Nuevas</b> son las que entran por primera vez ese día; <b>ya tenían cuenta</b> son las que se registraron en un día anterior y volvieron, es decir, nuestra propia gente. El <b>origen</b> de cada persona es el de su primera sesión activa del día.
            Cada día se compara con la <b>mediana del mismo día de la semana</b> en las últimas {data.rules?.baselineWeeks ?? 4} semanas (un sábado con otros sábados) y solo cuando hay al menos {data.rules?.minSamples ?? 3}; mientras tanto dice «aún no hay base». Es <b>día flojo</b> si quedó por debajo del {data.rules?.slowBelowPct ?? 50}% de lo normal y lo normal es de al menos {data.rules?.minBaseline ?? 4} personas.
            No cuenta al equipo, las cuentas de prueba ni los robots; los días y las horas son de Monterrey, y una sesión se ubica en la hora en que empezó. La medición empezó el {data.trackedSince ? fmtDay(data.trackedSince) : '30 de octubre de 2026'}: antes de eso no hay horas, no «horas sin gente».
            Las publicaciones salen de LinkedIn (4 al día, todos los días) y de la cuota de correos; las marcas ✎ son cambios de la bitácora (<a href="/panel/trafico/cambios">Cambios</a>).
          </p>
        </>
      )}
    </>
  )
}
