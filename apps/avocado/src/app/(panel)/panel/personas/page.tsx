'use client'

import { Card, ErrorBox, fmtDate, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { DataTable } from '@/components/panel/DataTable'

type Temperature = 'caliente' | 'tibio' | 'frio'
interface Person {
  id: string
  email: string | null
  createdAt: string
  value: number
  temperature: Temperature
  lastActiveDay: string | null
  daysSinceActive: number | null
  parts: { profileComplete: boolean; savedVacancies: number; tappedApply: number; applied: number; returnedAnotherDay: boolean; emailClicks: number; participated: boolean }
}
interface Summary {
  total: number
  byTemperature: Record<Temperature, number>
  byValueRange: { range: string; people: number }[]
  notes: string[]
}
interface Response {
  people: Person[]
  config: { points: Record<string, number>; maxPerAction: number; temperature: { hotWithinDays: number; warmWithinDays: number } }
  summary: Summary
}

const LABEL: Record<Temperature, string> = { caliente: 'Caliente', tibio: 'Tibio', frio: 'Frío' }
const POINT_LABEL: Record<string, string> = {
  profileComplete: 'Perfil completo', savedVacancy: 'Guardar una vacante', tappedApply: 'Tocar postular', applied: 'Postularse (lo dice la persona)',
  returnedAnotherDay: 'Volver otro día', emailClick: 'Clic en un correo', participated: 'Participar en la comunidad',
}

/** Cada celda entre comillas, para que una coma o un salto de línea no desarme el CSV; y sin que una fórmula se ejecute al abrirlo en Excel. */
const cell = (value: string | number | null) => {
  const text = value === null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function exportCsv(people: Person[]) {
  const head = ['correo', 'registro', 'valor', 'temperatura', 'ultima_actividad', 'dias_sin_actividad']
  const lines = [head.map(cell).join(',')]
  for (const person of people) lines.push([person.email, person.createdAt.slice(0, 10), person.value, LABEL[person.temperature], person.lastActiveDay, person.daysSinceActive].map(cell).join(','))
  // BOM para que Excel lea bien los acentos.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `personas-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function PersonasPage() {
  const { data, loading, error, reload } = usePanelData<Response>('/api/admin/analytics/people-value', { keepPrevious: true })

  return (
    <>
      <PageHeader title="Personas de valor" subtitle="Una fila por cuenta real (sin equipo, pruebas ni perfiles del scraper): cuánto valor suma y qué tan caliente está. Solo para el fundador: lleva correos.">
        {data && <button type="button" className="panel-btn" onClick={() => exportCsv(data.people)}>Exportar CSV</button>}
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Calientes" value={fmtNum(data.summary.byTemperature.caliente)} caption={`activas en los últimos ${data.config.temperature.hotWithinDays} días`} />
            <Stat label="Tibias" value={fmtNum(data.summary.byTemperature.tibio)} caption={`hasta ${data.config.temperature.warmWithinDays} días sin entrar`} />
            <Stat label="Frías" value={fmtNum(data.summary.byTemperature.frio)} caption="más tiempo, o sin actividad" />
          </div>

          <Card title="Personas" hint={`${fmtNum(data.summary.total)} cuentas reales, de más a menos valor`}>
            <DataTable
              rows={data.people}
              rowKey={person => person.id}
              searchText={person => person.email ?? ''}
              searchLabel="Buscar correo"
              filter={{
                label: 'Temperatura',
                options: [{ value: 'caliente', label: 'Calientes' }, { value: 'tibio', label: 'Tibias' }, { value: 'frio', label: 'Frías' }],
                test: (person, value) => person.temperature === value,
              }}
              head={<tr><th>Correo</th><th>Registro</th><th className="num">Valor</th><th>Temperatura</th><th>Última actividad</th></tr>}
              renderRow={person => (
                <tr>
                  <td>{person.email ?? '—'}</td>
                  <td>{fmtDate(person.createdAt)}</td>
                  <td className="num">{fmtNum(person.value)}</td>
                  <td>{LABEL[person.temperature]}</td>
                  <td>{person.lastActiveDay ? `${person.lastActiveDay}${person.daysSinceActive !== null ? ` · hace ${person.daysSinceActive} d` : ''}` : '—'}</td>
                </tr>
              )}
            />
          </Card>

          <Card title="Cómo se calcula" hint="Provisional: los puntos y los umbrales están en un solo lugar del código (services/analytics/people-value.ts)">
            <table className="panel-table">
              <thead><tr><th>Acción</th><th className="num">Puntos</th></tr></thead>
              <tbody>{Object.entries(data.config.points).map(([key, points]) => <tr key={key}><td>{POINT_LABEL[key] ?? key}</td><td className="num">{points}</td></tr>)}</tbody>
            </table>
            <ul>
              <li>Una misma acción repetida suma hasta {data.config.maxPerAction} veces.</li>
              {data.summary.notes.map(note => <li key={note}>{note}</li>)}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
