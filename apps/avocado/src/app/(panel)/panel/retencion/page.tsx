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

/** El color de una celda de la tabla de cohortes: más verde, más gente que volvió. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return { color: '#cbd5e1' }
  const alpha = Math.min(0.85, 0.08 + (value / 100) * 0.77)
  return { background: `rgba(16, 185, 129, ${alpha})`, color: value >= 55 ? '#fff' : '#064e3b' }
}

export default function RetencionPage() {
  const { data, loading, error, reload } = usePanelData<Retention>('/api/admin/analytics/retention')
  const shortHistory = !!data?.ready && (data.trackingDays ?? 0) < MIN_DAYS_FOR_FREQUENCY

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
              personas. Las cifras empiezan a separarse con las semanas. No cuentan al equipo, las cuentas de prueba ni los perfiles del scraper.
            </p>
          )}
          <div className="panel-grid cols-4">
            <Stat label="Activos hoy" value={fmtNum(data.dau)} caption="Personas con sesión que usaron AvoTalent hoy." />
            <Stat label="Activos en 7 días" value={fmtNum(data.wau)} caption="Personas distintas en la última semana." />
            <Stat label="Activos en 30 días" value={fmtNum(data.mau)} caption="Personas distintas en el último mes." />
            <Stat
              label="Frecuencia de uso"
              value={shortHistory ? '—' : fmtPct(data.stickinessPct)}
              caption={shortHistory ? `Se puede medir con ${MIN_DAYS_FOR_FREQUENCY} días de datos.` : 'Activos de hoy entre activos del mes: qué tan seguido vuelven.'}
            />
          </div>

          <Card title="Quién estuvo activo" hint="Últimos 30 días">
            {!data.people || data.people.length === 0 ? <Empty>Nadie ha entrado con sesión todavía.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead>
                    <tr>
                      <th>Persona</th><th>Tipo</th><th>Se registró</th><th>Perfil</th><th className="num">Días activo</th><th>Última vez</th>
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
                                {person.username && <span className="panel-muted" style={{ display: 'block', fontSize: 12 }}>@{person.username}</span>}
                              </span>
                            </span>
                          </td>
                          <td>{KIND[person.kind] ?? person.kind}{!person.counted && <span className="panel-muted" style={{ display: 'block', fontSize: 12 }}>no cuenta en las cifras</span>}</td>
                          <td>{fmtDay(person.createdAt.slice(0, 10))}</td>
                          <td>{person.profileCompleted ? 'Completo' : 'Sin completar'}</td>
                          <td className="num">{person.daysActive}</td>
                          <td>{person.activeToday ? 'Hoy' : fmtDay(person.lastActive)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Cohortes por semana de registro" hint={data.trackingSince ? `Se mide desde el ${fmtDay(data.trackingSince)}` : undefined}>
            {!data.cohorts || data.cohorts.length === 0 ? <Empty>Aún no hay registros que seguir.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table panel-cohort">
                  <thead>
                    <tr>
                      <th>Semana de registro</th><th className="num">Personas</th>
                      {data.cohorts[0].retained.map((_, index) => <th key={index} style={{ textAlign: 'center' }}>{index === 0 ? 'Misma semana' : `Semana +${index}`}</th>)}
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
            <b>Cómo leerlo.</b> Cada fila es el grupo de personas que se registró esa semana. Cada columna dice qué porcentaje de ese grupo volvió a usar AvoTalent
            esa semana. Un <b>·</b> significa que esa semana aún no llega, o que todavía no se medía la actividad. Con pocas personas por semana, un solo usuario mueve
            mucho el porcentaje: tómalo como tendencia, no como cifra exacta.
          </p>
        </>
      )}
    </>
  )
}
