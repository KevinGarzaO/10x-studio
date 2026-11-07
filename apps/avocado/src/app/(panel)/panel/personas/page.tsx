'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { DataTable } from '@/components/panel/DataTable'
import { api } from '@/lib/api'

type Temperature = 'caliente' | 'tibio' | 'frio'
interface PersonEvent { action: string; at: string | null; valuePoints: number; engagementPoints: number; notes: string[] }
interface Person {
  id: string
  email: string | null
  name: string | null
  photoUrl: string | null
  createdAt: string
  value: number
  engagement: number
  actionPoints: number
  activeDays7: number
  activeDays7List: string[]
  activeDayPoints: number
  temperature: Temperature
  state: string | null
  reason: string
  lastActiveDay: string | null
  daysSinceActive: number | null
  acceptsCommunityNews: boolean
  emailClicks: number
  events: PersonEvent[]
}
interface Summary {
  total: number
  activeDaysDistribution: { days: number; people: number }[]
  byTemperature: Record<Temperature, number>
  engagementDistribution: { points: number; people: number }[]
  byEngagementRange: { range: string; people: number }[]
  notes: string[]
}
interface HistoryWeek { weekStart: string; kind: string; value: number | null; engagement: number | null; temperature: string | null; activeDays: number | null; discussions: number | null; comments: number | null; votes: number | null; repliesGiven: number | null; repliesReceived: number | null; emailsSent: number | null; emailClicks: number | null; pushClicks: number | null }
interface PersonHistory { ready: boolean; weeks?: HistoryWeek[]; keyDates?: { registeredAt: string | null; profileCompletedAt: string | null; firstApplyTapAt: string | null; firstAppliedAt: string | null; firstCommunityAt: string | null; lastCommunityAt: string | null; invitedManuallyAt: string | null } | null }
interface Response {
  stateLabels: Record<string, string>
  stateReady: boolean
  people: Person[]
  config: { points: Record<string, number>; maxPerAction: number; onceActions: string[]; engagementDays: number; engagementExcluded: string[]; activeDayPoints: number; temperature: { hotAtLeast: number; warmAtLeast: number } }
  summary: Summary
}

const LABEL: Record<Temperature, string> = { caliente: 'Caliente', tibio: 'Tibio', frio: 'Frío' }
const ACTION_LABEL: Record<string, string> = {
  profileComplete: 'Perfil completo', savedVacancy: 'Guardó una vacante', tappedApply: 'Tocó postular', applied: 'Dijo que se postuló',
  returnedAnotherDay: 'Volvió otro día', emailClick: 'Clic en un correo', participated: 'Participó en la comunidad',
}
const POINT_LABEL: Record<string, string> = {
  profileComplete: 'Perfil completo', savedVacancy: 'Guardar una vacante', tappedApply: 'Tocar postular', applied: 'Postularse (lo dice la persona)',
  returnedAnotherDay: 'Volver otro día', emailClick: 'Clic en un correo', participated: 'Participar en la comunidad',
}

type SortKey = 'engagement' | 'value' | 'activeDays' | 'activity'
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Monterrey' }) : 'sin fecha')

/** Las iniciales de quien no tiene foto (o cuya foto no carga). */
function initialsOf(person: Pick<Person, 'name' | 'email'>): string {
  const source = (person.name ?? '').trim() || (person.email ?? '').split('@')[0] || '?'
  const words = source.split(/[\s._-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

function Avatar({ person, size = 34 }: { person: Pick<Person, 'name' | 'email' | 'photoUrl'>; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (person.photoUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="pv-avatar" src={person.photoUrl} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: size, height: size }} />
  }
  return <span className="pv-avatar pv-initials" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{initialsOf(person)}</span>
}

const StateTag = ({ state, labels }: { state: string | null; labels: Record<string, string> }) => (state ? <span className={`pv-state ${state}`}>{labels[state] ?? state}</span> : <span className="panel-hint">—</span>)

const Tag = ({ temperature }: { temperature: Temperature }) => <span className={`pv-tag ${temperature}`}>{LABEL[temperature]}</span>

/** Cada celda entre comillas, para que una coma o un salto de línea no desarme el CSV; y sin que una fórmula se ejecute al abrirlo en Excel. */
const cell = (value: string | number | null) => {
  const text = value === null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function exportCsv(people: Person[], stateLabels: Record<string, string>) {
  const head = ['correo', 'registro', 'valor', 'enganche', 'dias_activos_7d', 'temperatura', 'estado', 'ultima_actividad', 'dias_sin_actividad', 'clics_en_correos', 'acepta_novedades']
  const lines = [head.map(cell).join(',')]
  for (const person of people) {
    lines.push([person.email, person.createdAt.slice(0, 10), person.value, person.engagement, person.activeDays7, LABEL[person.temperature], person.state ? stateLabels[person.state] ?? person.state : '', person.lastActiveDay, person.daysSinceActive, person.emailClicks, person.acceptsCommunityNews ? 'Sí' : 'No'].map(cell).join(','))
  }
  // BOM para que Excel lea bien los acentos.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `personas-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/** El detalle de una persona: por qué tiene ese valor, ese enganche y esa temperatura. */
function History({ person }: { person: Person }) {
  const { data } = usePanelData<PersonHistory>(`/api/admin/analytics/people-value/${person.id}/history`, { keepPrevious: true, refreshMs: false })
  const [invited, setInvited] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const keyDates = data?.keyDates
  const invitedAt = invited === undefined ? keyDates?.invitedManuallyAt ?? null : invited

  async function toggleInvited() {
    setBusy(true)
    try {
      await api('/api/admin/analytics/people-value/' + person.id + '/invited', { method: 'POST', body: JSON.stringify({ invited: !invitedAt }) })
      setInvited(invitedAt ? null : new Date().toISOString())
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  if (!data.ready) return <p className="panel-hint">El historial por semanas empieza cuando se corra engagement-history-migration.sql.</p>
  const weeks = data.weeks ?? []
  const max = Math.max(1, ...weeks.map(week => week.engagement ?? week.activeDays ?? 0))
  return (
    <>
      <h3>Evolución por semanas</h3>
      {weeks.length === 0 ? <p className="panel-hint">Todavía no hay fotos de esta persona. La primera semanal sale el lunes.</p> : (
        <div className="pv-scroll">
          <table className="panel-table">
            <thead><tr><th>Semana</th><th>Enganche</th><th className="num">Días activos</th><th className="num">Comunidad</th><th className="num">Respuestas (dadas / recibidas)</th><th className="num">Correos (clics / enviados)</th></tr></thead>
            <tbody>
              {weeks.map(week => (
                <tr key={`${week.kind}-${week.weekStart}`}>
                  <td>{dayLabel(week.weekStart)}{week.kind === 'reconstruida' ? ' ·  reconstruida' : week.kind === 'base' ? ' · foto base' : ''}</td>
                  <td>{week.engagement === null ? <span className="panel-hint">sin dato</span> : <span className="pv-spark"><span style={{ width: `${Math.max(3, (week.engagement / max) * 100)}%` }} />{week.engagement}{week.temperature ? ` · ${LABEL[week.temperature as Temperature] ?? week.temperature}` : ''}</span>}</td>
                  <td className="num">{week.activeDays ?? '—'}</td>
                  <td className="num">{week.kind === 'base' ? '—' : `${week.discussions ?? 0} / ${week.comments ?? 0} / ${week.votes ?? 0}`}</td>
                  <td className="num">{week.kind === 'base' ? '—' : `${week.repliesGiven ?? 0} / ${week.repliesReceived ?? 0}`}</td>
                  <td className="num">{week.kind === 'base' ? '—' : `${week.emailClicks ?? 0} / ${week.emailsSent ?? 0}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="panel-hint">Comunidad = discusiones / comentarios / votos de la semana. Una foto por semana, guardada para siempre.</p>

      <h3>Fechas clave</h3>
      <ul className="pv-list">
        <li>Registro: <strong>{dateOf(keyDates?.registeredAt ?? person.createdAt)}</strong></li>
        <li>Perfil completo: <strong>{keyDates?.profileCompletedAt ? dateOf(keyDates.profileCompletedAt) : 'sin fecha'}</strong></li>
        <li>Primer toque en postular: <strong>{keyDates?.firstApplyTapAt ? dateOf(keyDates.firstApplyTapAt) : '—'}</strong> · dijo que se postuló: <strong>{keyDates?.firstAppliedAt ? dateOf(keyDates.firstAppliedAt) : '—'}</strong></li>
        <li>Comunidad, primera acción: <strong>{keyDates?.firstCommunityAt ? dateOf(keyDates.firstCommunityAt) : '—'}</strong> · última: <strong>{keyDates?.lastCommunityAt ? dateOf(keyDates.lastCommunityAt) : '—'}</strong></li>
        <li>Invitada a mano: <strong>{invitedAt ? dateOf(invitedAt) : 'no'}</strong> <button type="button" className="panel-btn pv-mini" disabled={busy} onClick={toggleInvited}>{invitedAt ? 'Quitar marca' : 'Marcar como invitada'}</button></li>
      </ul>
    </>
  )
}

function Detail({ person, config, stateLabels, onClose }: { person: Person; config: Response['config']; stateLabels: Record<string, string>; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const clicks = person.events.filter(event => event.action === 'emailClick')
  return (
    <div className="pv-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="pv-dialog" role="dialog" aria-modal="true" aria-labelledby="pv-title">
        <header className="pv-dialog-head">
          <Avatar person={person} size={48} />
          <div>
            <h2 id="pv-title">{person.name || person.email || 'Sin nombre'}</h2>
            <p>{person.email ?? '—'} · registro {dateOf(person.createdAt)}</p>
          </div>
          <button type="button" className="pv-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <p className="pv-reason"><Tag temperature={person.temperature} /> {person.reason}</p>
        {person.state && <p className="pv-reason"><StateTag state={person.state} labels={stateLabels} /> Estado de compromiso, calculado desde sus fotos semanales.</p>}

        <div className="pv-numbers">
          <div><span>Valor (acumulado)</span><strong>{fmtNum(person.value)}</strong></div>
          <div><span>Enganche (últimos {config.engagementDays} días)</span><strong>{fmtNum(person.engagement)}</strong></div>
          <div><span>Días activos ({config.engagementDays} d)</span><strong>{person.activeDays7} de {config.engagementDays}</strong></div>
          <div><span>Última actividad</span><strong>{person.lastActiveDay ? `${person.lastActiveDay}${person.daysSinceActive !== null ? ` (hace ${person.daysSinceActive} d)` : ''}` : '—'}</strong></div>
        </div>

        <h3>Puntos por cada acción</h3>
        {person.events.length === 0 ? <p className="panel-hint">Todavía no hizo ninguna acción que sume.</p> : (
          <div className="pv-scroll">
            <table className="panel-table">
              <thead><tr><th>Acción</th><th>Fecha</th><th className="num">Valor</th><th className="num">Últimos {config.engagementDays} d</th></tr></thead>
              <tbody>
                {person.events.map((event, index) => (
                  <tr key={`${event.action}-${event.at ?? 'x'}-${index}`}>
                    <td>{ACTION_LABEL[event.action] ?? event.action}{event.notes.length > 0 && <small className="pv-note">{event.notes.join(' · ')}</small>}</td>
                    <td>{dateOf(event.at)}</td>
                    <td className="num">{event.valuePoints > 0 ? `+${event.valuePoints}` : '0'}</td>
                    <td className="num">{event.engagementPoints > 0 ? `+${event.engagementPoints}` : '0'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={2}><strong>Total</strong></td><td className="num"><strong>{fmtNum(person.value)}</strong></td><td className="num"><strong>{fmtNum(person.engagement)}</strong></td></tr></tfoot>
            </table>
          </div>
        )}
        <p className="panel-hint">Cuando una acción da 0, la fila dice por qué. Algunas acciones (perfil completo, volver otro día, participar) se cuentan una sola vez; las demás, hasta {config.maxPerAction} veces. Una acción sin fecha cuenta en el valor, no en el enganche.</p>

        <h3>Cómo sale el enganche</h3>
        <ul className="pv-list">
          <li>Acciones de uso en los últimos {config.engagementDays} días: <strong>{fmtNum(person.actionPoints)}</strong> {person.actionPoints === 1 ? 'punto' : 'puntos'}</li>
          <li>Días distintos con actividad: <strong>{person.activeDays7}</strong>{person.activeDays7 > 0 ? ` (${person.activeDays7List.map(dayLabel).join(', ')})` : ''} × {config.activeDayPoints} = <strong>{fmtNum(person.activeDayPoints)}</strong> {person.activeDayPoints === 1 ? 'punto' : 'puntos'}</li>
          <li>Total de enganche: <strong>{fmtNum(person.engagement)}</strong>. Completar el perfil cuenta en el valor, no en el enganche.</li>
        </ul>

        <History person={person} />

        <h3>Correos</h3>
        <ul className="pv-list">
          <li>Clics en correos: <strong>{clicks.length}</strong>{clicks.length > 0 ? ` (el último ${dateOf(clicks[0].at)})` : ''}</li>
          <li>Acepta recibir «Novedades e invitaciones de la comunidad»: <strong>{person.acceptsCommunityNews ? 'Sí' : 'No'}</strong></li>
        </ul>
      </section>
    </div>
  )
}

export default function PersonasPage() {
  const { data, loading, error, reload } = usePanelData<Response>('/api/admin/analytics/people-value', { keepPrevious: true })
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'engagement', dir: 'desc' })
  const [openId, setOpenId] = useState<string | null>(null)

  const people = useMemo(() => {
    const rows = [...(data?.people ?? [])]
    const pick = (person: Person) => (sort.key === 'engagement' ? person.engagement : sort.key === 'value' ? person.value : sort.key === 'activeDays' ? person.activeDays7 : person.daysSinceActive === null ? Number.POSITIVE_INFINITY : -person.daysSinceActive)
    rows.sort((a, b) => (sort.dir === 'desc' ? pick(b) - pick(a) : pick(a) - pick(b)) || b.engagement - a.engagement || b.value - a.value)
    return rows
  }, [data, sort])
  const open = people.find(person => person.id === openId) ?? null

  const header = (key: SortKey, label: string, className = '') => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="pv-sort" onClick={() => setSort(current => ({ key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' }))}>
        {label}{sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  const maxBar = Math.max(1, ...(data?.summary.engagementDistribution.map(item => item.people) ?? [1]))

  return (
    <>
      <PageHeader title="Personas de valor" subtitle="Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper). Valor = lo que ha hecho en total; enganche = lo que hizo en los últimos días; la temperatura sale del enganche. Solo para el fundador: lleva correos.">
        {data && <button type="button" className="panel-btn" onClick={() => exportCsv(people, data.stateLabels)}>Exportar CSV</button>}
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Calientes" value={fmtNum(data.summary.byTemperature.caliente)} caption={`${data.config.temperature.hotAtLeast} puntos o más en ${data.config.engagementDays} días`} />
            <Stat label="Tibias" value={fmtNum(data.summary.byTemperature.tibio)} caption={`de ${data.config.temperature.warmAtLeast} a ${data.config.temperature.hotAtLeast - 1} puntos`} />
            <Stat label="Frías" value={fmtNum(data.summary.byTemperature.frio)} caption={`menos de ${data.config.temperature.warmAtLeast} puntos`} />
          </div>

          <Card title="Personas" hint={`${fmtNum(data.summary.total)} cuentas reales · toca una fila para ver por qué tiene ese valor, ese enganche y esa temperatura`}>
            <DataTable
              rows={people}
              rowKey={person => person.id}
              searchText={person => `${person.email ?? ''} ${person.name ?? ''}`}
              searchLabel="Buscar persona"
              filter={{
                label: 'Temperatura',
                options: [{ value: 'caliente', label: 'Calientes' }, { value: 'tibio', label: 'Tibias' }, { value: 'frio', label: 'Frías' }],
                test: (person, value) => person.temperature === value,
              }}
              head={<tr><th>Persona</th><th className="pv-hide-sm">Registro</th>{header('value', 'Valor', 'num')}{header('engagement', `Enganche ${data.config.engagementDays} d`, 'num')}{header('activeDays', `Días activos (${data.config.engagementDays} d)`, 'num pv-hide-sm')}<th>Temperatura</th><th className="pv-hide-sm">Estado</th>{header('activity', 'Última actividad', 'pv-hide-sm')}</tr>}
              renderRow={person => (
                <tr className="pv-row" onClick={() => setOpenId(person.id)}>
                  <td>
                    <button type="button" className="pv-person" onClick={event => { event.stopPropagation(); setOpenId(person.id) }} aria-label={`Ver detalle de ${person.name || person.email || 'la persona'}`}>
                      <Avatar person={person} />
                      <span><strong>{person.name || (person.email ?? '—').split('@')[0]}</strong><small>{person.email ?? '—'}</small></span>
                    </button>
                  </td>
                  <td className="pv-hide-sm">{dateOf(person.createdAt)}</td>
                  <td className="num">{fmtNum(person.value)}</td>
                  <td className="num"><strong>{fmtNum(person.engagement)}</strong></td>
                  <td className="num pv-hide-sm">{person.activeDays7}</td>
                  <td><Tag temperature={person.temperature} /></td>
                  <td className="pv-hide-sm"><StateTag state={person.state} labels={data.stateLabels} /></td>
                  <td className="pv-hide-sm">{person.lastActiveDay ? `${person.lastActiveDay}${person.daysSinceActive !== null ? ` · hace ${person.daysSinceActive} d` : ''}` : '—'}</td>
                </tr>
              )}
            />
          </Card>

          <Card title={`Distribución del enganche (últimos ${data.config.engagementDays} días)`} hint="Cuántas cuentas tienen exactamente esos puntos. Sirve para fijar los umbrales de temperatura mirando los datos reales.">
            <table className="panel-table pv-ranges">
              <thead><tr><th>Rango de enganche</th>{data.summary.byEngagementRange.map(item => <th key={item.range} className="num">{item.range}</th>)}</tr></thead>
              <tbody><tr><td>Cuentas</td>{data.summary.byEngagementRange.map(item => <td key={item.range} className="num"><strong>{fmtNum(item.people)}</strong></td>)}</tr></tbody>
            </table>
            <div className="pv-bars">
              {data.summary.engagementDistribution.map(item => (
                <div key={item.points} className="pv-bar-row">
                  <span className="pv-bar-label">{item.points} {item.points === 1 ? 'punto' : 'puntos'}</span>
                  <span className="pv-bar-track"><span className={`pv-bar-fill ${item.points >= data.config.temperature.hotAtLeast ? 'caliente' : item.points >= data.config.temperature.warmAtLeast ? 'tibio' : 'frio'}`} style={{ width: `${Math.max(2, (item.people / maxBar) * 100)}%` }} /></span>
                  <span className="pv-bar-count">{fmtNum(item.people)}</span>
                </div>
              ))}
            </div>
            <p className="panel-hint">Umbrales actuales (provisionales): caliente desde {data.config.temperature.hotAtLeast} puntos, tibio desde {data.config.temperature.warmAtLeast}.</p>
          </Card>

          <Card title="Cómo se calcula" hint="Provisional: los puntos, el tope, el periodo y los umbrales están en un solo lugar del código (services/analytics/people-value.ts)">
            <table className="panel-table">
              <thead><tr><th>Acción</th><th className="num">Puntos</th><th>Cuántas veces cuenta</th></tr></thead>
              <tbody>{Object.entries(data.config.points).map(([key, points]) => <tr key={key}><td>{POINT_LABEL[key] ?? key}</td><td className="num">{points}</td><td>{data.config.onceActions.includes(key) ? 'Una sola vez' : `Hasta ${data.config.maxPerAction} veces`}</td></tr>)}</tbody>
            </table>
            <ul>
              <li>Enganche = acciones de uso de los últimos {data.config.engagementDays} días + {data.config.activeDayPoints} {data.config.activeDayPoints === 1 ? 'punto' : 'puntos'} por cada día distinto con actividad (de 0 a {data.config.engagementDays}). No cuenta: {data.config.engagementExcluded.map(key => POINT_LABEL[key] ?? key).join(', ')} (configurar la cuenta no es usar la app).</li>
              <li>Las acciones que se repiten suman hasta {data.config.maxPerAction} veces; las de «una sola vez» dan sus puntos una vez, aunque se repitan. Esto aplica al valor y, aparte, al enganche.</li>
              {data.summary.notes.map(note => <li key={note}>{note}</li>)}
            </ul>
          </Card>
        </>
      )}

      {open && data && <Detail person={open} config={data.config} stateLabels={data.stateLabels} onClose={() => setOpenId(null)} />}
    </>
  )
}
