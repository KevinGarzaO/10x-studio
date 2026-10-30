'use client'

import { Avatar, Card, Empty, ErrorBox, fmtDay, fmtNum, fmtPct, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'

interface ActivePerson {
  id: string
  username: string | null
  display_name: string | null
  photo_url: string | null
  kind: string
  createdAt: string
  profileCompleted: boolean | null
  counted: boolean
  daysActive: number
  lastActive: string
  activeToday: boolean
  activeDays: string[]
  returnDays: number
}

const KIND: Record<string, string> = { user: 'Candidato', company: 'Empresa', superadmin: 'Equipo' }

/** Con menos de esto, "hoy", "7 días" y "30 días" son casi las mismas personas y la frecuencia de uso no dice nada. */
const MIN_DAYS_FOR_FREQUENCY = 30

interface Retention {
  ready: boolean
  dau?: number
  wau?: number
  mau?: number
  stickinessPct?: number | null
  trackingSince?: string | null
  trackingDays?: number
  people?: ActivePerson[]
  cohorts?: { week: string; size: number; retained: (number | null)[] }[]
}

const STRIP_DAYS = 14

/** Hoy en Monterrey (YYYY-MM-DD), el mismo día que usa el servidor. */
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })

/** Los últimos 14 días, del más viejo al de hoy. */
function lastDays(today: string): string[] {
  const end = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: STRIP_DAYS }, (_, i) => new Date(end - (STRIP_DAYS - 1 - i) * 86400000).toISOString().slice(0, 10))
}

/** Una cajita por día: verde si estuvo activa ese día. Es la forma más directa de ver cuándo volvió. */
function DaysStrip({ person, today }: { person: ActivePerson; today: string }) {
  const days = lastDays(today)
  const active = new Set(person.activeDays)
  const signup = person.createdAt.slice(0, 10)
  const shown = person.activeDays.filter(day => day >= days[0]).map(fmtDay).join(', ') || 'ninguno'
  return (
    <span className="panel-days" role="img" aria-label={`Días activo en las últimas dos semanas: ${shown}`}>
      {days.map(day => (
        <i key={day} className={`${active.has(day) ? 'on' : ''}${day === signup ? ' signup' : ''}`} title={`${fmtDay(day)}${active.has(day) ? ' · activo' : ''}${day === signup ? ' · se registró' : ''}`} />
      ))}
    </span>
  )
}

/** El color de una celda de la tabla de cohortes: más verde, más gente que volvió. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return { color: '#cbd5e1' }
  const alpha = Math.min(0.85, 0.08 + (value / 100) * 0.77)
  return { background: `rgba(16, 185, 129, ${alpha})`, color: value >= 55 ? '#fff' : '#064e3b' }
}

export default function RetencionPage() {
  const { data, loading, error, reload } = usePanelData<Retention>('/api/admin/analytics/retention')
  const shortHistory = !!data?.ready && (data.trackingDays ?? 0) < MIN_DAYS_FOR_FREQUENCY
  const today = todayKey()
  const counted = (data?.people ?? []).filter(person => person.counted)
  const returned = counted.filter(person => person.returnDays > 0)

  return (
    <>
      <PageHeader title="Retención" subtitle="Cuánta gente vuelve a AvoTalent después de registrarse." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && !data.ready && (
        <Card title="Todavía no se está registrando la actividad">
          <p className="panel-muted" style={{ lineHeight: 1.6 }}>
            Para medir la retención hay que anotar qué días estuvo activa cada persona, y hoy no se anota. Aplica la migración
            <b> user-activity-migration.sql</b> en Supabase: desde ese momento el sistema guarda, una vez al día por persona, que estuvo activa.
            Ese dato no se puede reconstruir después, así que conviene aplicarla cuanto antes.
          </p>
        </Card>
      )}

      {data?.ready && (
        <>
          {shortHistory && (
            <p className="panel-defs" style={{ marginTop: 0 }}>
              <b>Solo hay {data.trackingDays} {data.trackingDays === 1 ? 'día' : 'días'} de datos</b> (desde el {fmtDay(data.trackingSince!)}), por eso hoy, 7 días y 30 días muestran a las mismas
              personas y aún hay pocas que hayan podido volver. No se cuenta al equipo, las cuentas de prueba ni los perfiles del scraper.
            </p>
          )}
          <div className="panel-grid cols-4">
            <Stat label="Activos hoy" value={fmtNum(data.dau)} caption="Personas que entraron hoy con su sesión." />
            <Stat label="Activos en 7 días" value={fmtNum(data.wau)} caption="Personas distintas que entraron esta semana." />
            <Stat label="Activos en 30 días" value={fmtNum(data.mau)} caption="Personas distintas que entraron este mes." />
            <Stat
              label="Volvieron"
              value={counted.length ? `${returned.length} de ${counted.length}` : '—'}
              caption="De quienes entraron este mes, cuántas lo hicieron en un día distinto al de su registro."
              tone={counted.length && returned.length === 0 ? 'warn' : undefined}
            />
          </div>

          <Card title="Quién usa AvoTalent" hint="Últimos 30 días · primero quien más días ha entrado">
            {!data.people || data.people.length === 0 ? <Empty>Nadie ha entrado con sesión todavía.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead>
                    <tr>
                      <th>Persona</th><th>Se registró</th><th className="num">Días activo ↓</th><th>¿Volvió?</th><th>Últimos 14 días</th><th>Última vez</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map(person => {
                      const name = person.display_name || person.username || 'Sin nombre'
                      return (
                        <tr key={person.id} style={person.counted ? undefined : { opacity: 0.6 }}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                              <Avatar name={name} photo={person.photo_url} />
                              <span>
                                {person.username ? <a href={`https://avotalent.app/users/${person.username}`} target="_blank" rel="noreferrer">{name}</a> : name}
                                <span className="panel-muted" style={{ display: 'block', fontSize: 12 }}>
                                  {!person.counted ? `${KIND[person.kind] ?? person.kind} · no cuenta en las cifras` : person.profileCompleted ? 'Perfil completo' : 'Perfil sin completar'}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td>{fmtDay(person.createdAt.slice(0, 10))}</td>
                          <td className="num"><b>{person.daysActive}</b></td>
                          <td>
                            {person.returnDays > 0
                              ? <span className="panel-chip good">Volvió {person.returnDays} {person.returnDays === 1 ? 'día' : 'días'}</span>
                              : <span className="panel-chip">Solo el día del registro</span>}
                          </td>
                          <td><DaysStrip person={person} today={today} /></td>
                          <td>{person.activeToday ? 'Hoy' : fmtDay(person.lastActive)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="panel-defs" style={{ marginTop: 12 }}>
              Cada cajita de <b>Últimos 14 días</b> es un día (la de la derecha es hoy): verde si esa persona entró; con borde oscuro, el día en que se registró.
              <b> Volvió</b> cuenta los días en que entró después del día de su registro.
            </p>
          </Card>

          <Card title="Cohortes por semana de registro" hint={data.trackingSince ? `Se mide desde el ${fmtDay(data.trackingSince)}` : undefined}>
            {!data.cohorts || data.cohorts.length === 0 ? <Empty>Aún no hay registros que seguir.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table panel-cohort">
                  <thead>
                    <tr>
                      <th>Semana de registro</th><th className="num">Personas</th>
                      {data.cohorts[0].retained.map((_, index) => <th key={index} style={{ textAlign: 'center' }}>{index === 0 ? 'Semana del registro' : index === 1 ? '1 semana después' : `${index} semanas después`}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map(cohort => (
                      <tr key={cohort.week}>
                        <td>{fmtDay(cohort.week)}</td>
                        <td className="num">{cohort.size}</td>
                        {cohort.retained.map((value, index) => <td key={index} className="cell" style={shade(value)}>{value === null ? '·' : `${value}%`}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Cada fila es el grupo de personas que se registró esa semana, y cada columna dice qué porcentaje de ese grupo entró de nuevo esa semana. Un <b>·</b> es una semana que aún no llega o
            de la que todavía no hay datos. Con pocas personas por semana, una sola mueve mucho el porcentaje: tómalo como tendencia.
            {!shortHistory && data.stickinessPct !== null && data.stickinessPct !== undefined && <> Frecuencia de uso: {fmtPct(data.stickinessPct)} (activos de hoy entre activos del mes).</>}
          </p>
        </>
      )}
    </>
  )
}
