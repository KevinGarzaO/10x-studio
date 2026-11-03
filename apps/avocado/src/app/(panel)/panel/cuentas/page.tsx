'use client'

import { Card, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'

interface Week {
  weekStart: string
  weekEnd: string
  registrations: number
  completedProfiles: number
  changeAbs: number | null
  changePct: number | null
  partial: boolean
  daysCounted: number
}
interface Weekly { weeks: Week[]; totals: { accounts: number; completedProfiles: number; completedPct: number | null }; note: string }

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

export default function CuentasPage() {
  const { data, loading, error, reload } = usePanelData<Weekly>('/api/admin/analytics/accounts/weekly?weeks=12', { keepPrevious: true })
  const weeks = [...(data?.weeks ?? [])].reverse()
  const last = (data?.weeks ?? []).filter(week => !week.partial).slice(-1)[0]

  return (
    <>
      <PageHeader title="Cuentas por semana" subtitle="Cuentas nuevas de lunes a domingo (hora de Monterrey) y cómo cambian contra la semana anterior." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Cuentas en total" value={fmtNum(data.totals.accounts)} caption="Reales: sin pruebas ni perfiles del scraper." />
            <Stat label="Perfiles completos" value={fmtNum(data.totals.completedProfiles)} caption={data.totals.completedPct === null ? '' : `${data.totals.completedPct.toLocaleString('es-MX')} % de todas las cuentas`} />
            <Stat label="Última semana completa" value={last ? fmtNum(last.registrations) : '—'} caption={last ? `${day(last.weekStart)} al ${day(last.weekEnd)}` : 'Aún no hay una semana completa'} />
          </div>
          <Card title="Semana por semana" hint="La más reciente primero · la semana en curso aún no termina">
            <table className="panel-table">
              <thead><tr><th>Semana</th><th className="num">Cuentas nuevas</th><th className="num">Cambio</th><th className="num">Con perfil completo</th></tr></thead>
              <tbody>
                {weeks.map(week => (
                  <tr key={week.weekStart}>
                    <td>{day(week.weekStart)} al {day(week.weekEnd)}{week.partial ? ` (en curso, ${week.daysCounted} ${week.daysCounted === 1 ? 'día' : 'días'})` : ''}</td>
                    <td className="num">{fmtNum(week.registrations)}</td>
                    <td className="num">{week.partial || week.changeAbs === null ? '—' : `${week.changeAbs > 0 ? '+' : ''}${week.changeAbs}${week.changePct === null ? '' : ` (${week.changePct > 0 ? '+' : ''}${week.changePct.toLocaleString('es-MX')} %)`}`}</td>
                    <td className="num">{fmtNum(week.completedProfiles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Cómo leerlo"><p>{data.note}</p></Card>
        </>
      )}
    </>
  )
}
