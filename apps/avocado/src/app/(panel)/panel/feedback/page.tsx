'use client'

import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { DataTable } from '@/components/panel/DataTable'
import { TrafficNotReady } from '@/components/panel/traffic'

interface Entry {
  createdAt: string
  channel: string
  questionVersion: number
  category: string | null
  text: string
  page: string | null
  theme: string | null
  context: { signupWeek?: string; activeDays?: number; profileComplete?: boolean; applied?: boolean; source?: string; device?: string } | null
}
interface Feedback {
  ready: boolean
  total?: number
  last7Days?: number
  byCategory?: { category: string; label: string; count: number }[]
  funnel?: { eligible: number; shown: number; dismissed: number; answered: number; peopleAnswered: number; responseRatePct: number | null }
  entries?: Entry[]
  notes?: string[]
}

const day = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)
const yesNo = (value: boolean | undefined) => (value === undefined ? '—' : value ? 'sí' : 'no')

export default function FeedbackPage() {
  const { data, loading, error, reload } = usePanelData<Feedback>('/api/admin/analytics/feedback', { keepPrevious: true })

  return (
    <>
      <PageHeader title="Feedback" subtitle="Lo que la gente cuenta dentro de la app con «¿Qué te faltó?». Sin nombres ni correos: solo el comentario y el contexto con el que lo escribió." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="feedback-migration.sql" />}

      {data?.ready && data.funnel && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Cuentas que ven el botón" value={fmtNum(data.funnel.eligible)} caption="Cuenta real con 2 o más días de uso después de registrarse" />
            <Stat label="Respondieron" value={`${fmtNum(data.funnel.peopleAnswered)} personas`} caption={`${pct(data.funnel.responseRatePct)} de las que lo ven · ${fmtNum(data.total ?? 0)} comentarios, ${fmtNum(data.last7Days ?? 0)} en 7 días`} />
            <Stat label="Abrieron y no enviaron" value={fmtNum(data.funnel.dismissed)} caption={`${fmtNum(data.funnel.shown)} veces que se abrió la hoja`} />
          </div>

          <Card title="Por tema" hint="La categoría que eligió la persona (es opcional)">
            {(data.byCategory ?? []).length === 0 ? <Empty>Todavía no hay comentarios.</Empty> : (
              <table className="panel-table">
                <thead><tr><th>Tema</th><th className="num">Comentarios</th></tr></thead>
                <tbody>{(data.byCategory ?? []).map(row => <tr key={row.category}><td>{row.label}</td><td className="num">{fmtNum(row.count)}</td></tr>)}</tbody>
              </table>
            )}
          </Card>

          <Card title="Los comentarios" hint="Lo más nuevo primero · cada texto es lo que escribió una persona, nada más">
            <DataTable
              rows={data.entries ?? []}
              rowKey={row => `${row.createdAt}|${row.text.slice(0, 20)}`}
              searchText={row => `${row.text} ${row.category ?? ''} ${row.page ?? ''}`}
              searchLabel="Buscar en los comentarios"
              empty="Todavía no hay comentarios."
              head={<tr><th>Fecha</th><th>Tema</th><th>Comentario</th><th>Dónde estaba</th><th>Contexto</th></tr>}
              renderRow={row => (
                <tr>
                  <td>{day(row.createdAt)}</td>
                  <td>{row.category ?? '—'}</td>
                  <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{row.text}</td>
                  <td><code>{row.page ?? '—'}</code></td>
                  <td>
                    {row.context ? `${row.context.device ?? '—'} · ${row.context.activeDays ?? '—'} días activos · perfil completo: ${yesNo(row.context.profileComplete)} · se postuló: ${yesNo(row.context.applied)} · origen: ${row.context.source ?? '—'} · se registró la semana del ${row.context.signupWeek ?? '—'}` : '—'}
                  </td>
                </tr>
              )}
            />
          </Card>
          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
