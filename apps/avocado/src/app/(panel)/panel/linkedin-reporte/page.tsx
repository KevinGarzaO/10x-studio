'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { DataTable } from '@/components/panel/DataTable'
import { TrafficNotReady } from '@/components/panel/traffic'

type Verdict = 'cuadra' | 'revisar' | 'pierde' | 'sin_clics' | 'sin_medicion' | 'no_es_nuestra'
interface PostLine {
  postKey: string; url: string | null; publishedOn: string | null; slug: string | null; company: string | null; role: string | null
  impressions: number | null; linkClicks: number | null; clickRatePct: number | null; arrivals: number | null; registrations: number | null
  arrivalPct: number | null; verdict: Verdict; note: string
}
interface Week { from: string; to: string; impressions: number; interactions: number; newFollowers: number; days: number }
interface Report {
  ready: boolean
  empty?: boolean
  upload?: { uploadedAt: string; fileName: string | null; periodStart: string | null; periodEnd: string | null; impressions: number | null; membersReached: number | null; followersTotal: number | null; followersSincePrevious: number | null }
  week?: { current: Week; previous: Week; change: { impressions: number | null; interactions: number | null; newFollowers: number | null } }
  verdicts?: Record<string, number>
  posts?: PostLine[]
  roles?: { role: string; posts: number; impressions: number; linkClicks: number; arrivals: number; registrations: number; arrivalsPer1000: number | null }[]
  audience?: { source: string; category: string; value: string; pct: number | null; rank: number }[]
  notes?: string[]
}

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  cuadra: { label: 'Cuadra', tone: 'up' },
  revisar: { label: 'Revisar', tone: 'down' },
  pierde: { label: 'Pierde clics', tone: 'down' },
  sin_clics: { label: 'Sin clics', tone: 'down' },
  sin_medicion: { label: 'Sin comparar', tone: '' },
  no_es_nuestra: { label: 'No es de AvoTalent', tone: '' },
}
const day = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—')
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)
const n = (value: number | null | undefined) => (value === null || value === undefined ? '—' : fmtNum(value))

interface UploadResult { duplicate: boolean; posts: number; days: number; warnings?: string[]; period?: { start: string | null; end: string | null } }

/** Sube el Excel tal cual lo exporta LinkedIn (Análisis conjunto). Cada lunes. */
function UploadCard({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<UploadResult | null>(null)

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(''); setResult(null)
    try {
      const saved = await api<UploadResult>(`/api/admin/analytics/linkedin-report?name=${encodeURIComponent(file.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
      })
      setResult(saved)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo')
    }
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  return (
    <Card title="Subir el reporte de esta semana" hint="El Excel «Análisis conjunto» que exporta LinkedIn · súbelo cada lunes">
      <input ref={input} type="file" accept=".xlsx" disabled={busy} onChange={event => void upload(event.target.files?.[0])} />
      {busy && <p>Leyendo el archivo…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          {result.duplicate ? 'Ese archivo ya estaba subido: no se duplicó nada.' : `Listo: ${result.posts} publicaciones y ${result.days} días leídos${result.period?.start ? ` (${day(result.period.start)} al ${day(result.period.end ?? null)})` : ''}.`}
          {(result.warnings ?? []).length > 0 && <> Avisos: {(result.warnings ?? []).join(' ')}</>}
        </p>
      )}
    </Card>
  )
}

export default function ReporteLinkedInPage() {
  const { data, loading, error, reload } = usePanelData<Report>('/api/admin/analytics/linkedin-report', { keepPrevious: true })
  const posts = data?.posts ?? []
  const week = data?.week

  return (
    <>
      <PageHeader title="Reporte de LinkedIn" subtitle="Lo que LinkedIn dice de tus publicaciones contra lo que AvoTalent mide: qué funciona y qué no." />
      <UploadCard onDone={reload} />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="linkedin-report-migration.sql" />}
      {data?.ready && data.empty && <Card title="Todavía no hay ningún reporte"><Empty>Sube el primer Excel de LinkedIn arriba y aquí aparecerá todo.</Empty></Card>}

      {data?.ready && !data.empty && data.upload && week && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Impresiones (últimos 7 días)" value={fmtNum(week.current.impressions)} caption={`${day(week.current.from)} al ${day(week.current.to)} · contra los 7 anteriores`} delta={week.change.impressions} />
            <Stat label="Interacciones (últimos 7 días)" value={fmtNum(week.current.interactions)} caption="Reacciones, comentarios y compartidos" delta={week.change.interactions} />
            <Stat label="Seguidores nuevos (últimos 7 días)" value={fmtNum(week.current.newFollowers)} caption={`${n(data.upload.followersTotal)} en total${data.upload.followersSincePrevious !== null ? ` · ${data.upload.followersSincePrevious >= 0 ? '+' : ''}${data.upload.followersSincePrevious} desde la subida anterior` : ''}`} delta={week.change.newFollowers} />
          </div>

          <Card title="¿Cuadra con lo que medimos?" hint="Solo las publicaciones para las que LinkedIn dio el detalle">
            <p>{Object.entries(data.verdicts ?? {}).map(([key, count]) => `${VERDICT[key as Verdict]?.label ?? key}: ${count}`).join(' · ') || 'Sin publicaciones.'}</p>
            <DataTable
              rows={posts}
              rowKey={row => row.postKey}
              searchText={row => `${row.company ?? ''} ${row.role ?? ''} ${row.slug ?? ''} ${VERDICT[row.verdict].label}`}
              searchLabel="Buscar empresa, puesto o resultado"
              head={<tr><th>Publicada</th><th>Vacante</th><th className="num">Impresiones</th><th className="num">Clics (LinkedIn)</th><th className="num">% clic</th><th className="num">Llegadas medidas</th><th className="num">Registros</th><th>Resultado</th></tr>}
              renderRow={row => (
                <tr>
                  <td>{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{day(row.publishedOn)}</a> : day(row.publishedOn)}</td>
                  <td>{row.company ?? '—'}{row.role ? <> · {row.role}</> : null}</td>
                  <td className="num">{n(row.impressions)}</td>
                  <td className="num">{n(row.linkClicks)}</td>
                  <td className="num">{pct(row.clickRatePct)}</td>
                  <td className="num">{n(row.arrivals)}</td>
                  <td className="num">{n(row.registrations)}</td>
                  <td title={row.note}><span className={`panel-delta ${VERDICT[row.verdict].tone}`}>{VERDICT[row.verdict].label}</span></td>
                </tr>
              )}
            />
          </Card>

          <Card title="Qué tipo de vacante funciona" hint="Solo publicaciones nuestras con medición · llegadas por cada 1,000 impresiones">
            {(data.roles ?? []).length === 0 ? <Empty>Todavía no hay publicaciones medidas con detalle de LinkedIn.</Empty> : (
              <table className="panel-table">
                <thead><tr><th>Puesto</th><th className="num">Publicaciones</th><th className="num">Impresiones</th><th className="num">Clics</th><th className="num">Llegadas</th><th className="num">Registros</th><th className="num">Llegadas / 1,000 imp.</th></tr></thead>
                <tbody>
                  {(data.roles ?? []).map(row => (
                    <tr key={row.role}><td>{row.role}</td><td className="num">{row.posts}</td><td className="num">{fmtNum(row.impressions)}</td><td className="num">{fmtNum(row.linkClicks)}</td><td className="num">{fmtNum(row.arrivals)}</td><td className="num">{fmtNum(row.registrations)}</td><td className="num">{n(row.arrivalsPer1000)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {(['publico', 'contenido'] as const).map(source => {
            const rows = (data.audience ?? []).filter(row => row.source === source && row.rank <= 5)
            if (rows.length === 0) return null
            const categories = [...new Set(rows.map(row => row.category))]
            return (
              <Card key={source} title={source === 'publico' ? 'Quién te sigue' : 'Quién vio tu contenido'} hint="Los 5 principales por categoría, según LinkedIn">
                <div className="panel-grid cols-3">
                  {categories.map(category => (
                    <div key={category}>
                      <strong>{category}</strong>
                      <ul>{rows.filter(row => row.category === category).map(row => <li key={row.value}>{row.value} · {pct(row.pct)}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}

          <Card title="Cómo leerlo"><ul>{(data.notes ?? []).map(note => <li key={note}>{note}</li>)}</ul></Card>
        </>
      )}
    </>
  )
}
