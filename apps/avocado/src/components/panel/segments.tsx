'use client'

import type { ReactNode } from 'react'
import { DataTable } from './DataTable'
import { Card, Empty, fmtDate, fmtNum, fmtPct } from './ui'

/**
 * LA distinción de personas, la misma en todo el panel (definida en SQL: backend/sql/web-analytics-segments-migration.sql):
 *   NUEVA / RECURRENTE · ACTIVA (hizo algo) / SOLO VISITA (entró y se fue) · REGISTRADA (tiene cuenta) / ANÓNIMA.
 * La conversión se mide sobre las nuevas ACTIVAS. Lo que se destaca siempre son las personas ACTIVAS.
 */
export interface SegmentCounts {
  label: string
  visits: number
  people: number
  active: number
  newPeople: number
  newActive: number
  newVisitOnly: number
  returningPeople: number
  returningActive: number
  returningVisitOnly: number
  registered: number
  registeredActive: number
  anonymous: number
  anonymousActive: number
  registeredNew: number
  conversionPct: number | null
}

/** Una tarjeta con un número grande, lo que significa y una línea chica. */
function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'muted' }) {
  return (
    <div className={`panel-seg-tile${tone ? ` ${tone}` : ''}`}>
      <span className="panel-seg-label">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="panel-seg-sub">{sub}</span>}
    </div>
  )
}

/**
 * La distinción completa de un periodo. Se pone igual en Resumen, Tráfico, Vacantes, Adquisición y LinkedIn para que una cifra
 * siempre signifique lo mismo.
 */
export function SegmentSummary({ segments, title = 'Quién entra', hint, trackingSince, partial }: { segments: SegmentCounts; title?: string; hint?: string; trackingSince?: string | null; partial?: boolean }) {
  const s = segments
  return (
    <Card title={title} hint={hint ?? 'Personas distintas · las ACTIVAS son las que cuentan como usuarios'}>
      {partial && (
        <p className="panel-defs" style={{ marginTop: 0 }}>
          <b>La distinción se mide desde el {trackingSince ? fmtDate(trackingSince) : 'momento en que se active la medición'}.</b> Este periodo es más largo, así que las cifras están incompletas; quien ya entraba antes y no tiene cuenta aparece como nueva la primera vez que la medimos.
        </p>
      )}
      <div className="panel-seg-flow">
        <Tile label="Entradas" value={fmtNum(s.visits)} sub="Sesiones: cada vez que alguien llega" tone="muted" />
        <span className="panel-seg-arrow" aria-hidden="true">→</span>
        <Tile label="Personas" value={fmtNum(s.people)} sub="Distintas, hicieran algo o no" tone="muted" />
        <span className="panel-seg-arrow" aria-hidden="true">→</span>
        <Tile label="Activas" value={fmtNum(s.active)} sub={`${fmtNum(s.people - s.active)} solo visita`} tone="good" />
      </div>

      <div className="panel-seg-groups">
        <section aria-label="Nuevas">
          <h3>Nuevas <small>entran por primera vez</small></h3>
          <div className="panel-seg-row">
            <Tile label="Nuevas" value={fmtNum(s.newPeople)} tone="muted" />
            <Tile label="Activas" value={fmtNum(s.newActive)} sub="usuarios nuevos" tone="good" />
            <Tile label="Solo visita" value={fmtNum(s.newVisitOnly)} sub="se fueron sin hacer nada" />
          </div>
        </section>
        <section aria-label="Recurrentes">
          <h3>Recurrentes <small>ya habían entrado</small></h3>
          <div className="panel-seg-row">
            <Tile label="Recurrentes" value={fmtNum(s.returningPeople)} tone="muted" />
            <Tile label="Activas" value={fmtNum(s.returningActive)} sub="usuarios que vuelven" tone="good" />
            <Tile label="Solo visita" value={fmtNum(s.returningVisitOnly)} sub="volvieron y se fueron" />
          </div>
        </section>
        <section aria-label="Con cuenta y sin cuenta">
          <h3>Cuenta <small>registradas y anónimas</small></h3>
          <div className="panel-seg-row">
            <Tile label="Registradas" value={fmtNum(s.registered)} sub={`${fmtNum(s.registeredActive)} activas`} />
            <Tile label="Anónimas" value={fmtNum(s.anonymous)} sub={`${fmtNum(s.anonymousActive)} activas`} />
            <Tile label="Conversión de nuevas" value={fmtPct(s.conversionPct)} sub={`${fmtNum(s.registeredNew)} de ${fmtNum(s.newActive)} nuevas activas se registraron`} tone={s.conversionPct !== null && s.conversionPct >= 5 ? 'good' : undefined} />
          </div>
        </section>
      </div>
    </Card>
  )
}

/** Un número y, debajo, lo que es "activas" y "solo visita". */
function Pair({ total, active, visitOnly }: { total: number; active: number; visitOnly: number }) {
  return (
    <>
      <b>{fmtNum(total)}</b>
      <span className="panel-muted panel-seg-pair"> {fmtNum(active)} activas · {fmtNum(visitOnly)} solo visita</span>
    </>
  )
}

/**
 * Una tabla de grupos (canal, página, país, idioma...) con LA distinción en cada fila. Una persona cuenta una vez en cada grupo donde
 * entró, así que los grupos no suman el total del periodo.
 */
export function SegmentTable({ rows, labelHeader, labelRender, searchLabel, pageSize = 10, empty = 'Aún no hay visitas en este periodo.' }: { rows: SegmentCounts[]; labelHeader: string; labelRender?: (label: string) => ReactNode; searchLabel?: string; pageSize?: number; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>
  return (
    <DataTable
      rows={rows}
      rowKey={row => row.label}
      searchText={row => row.label}
      searchLabel={searchLabel ?? `Buscar en ${labelHeader.toLowerCase()}`}
      pageSize={pageSize}
      head={<tr><th>{labelHeader}</th><th className="num">Entradas</th><th className="num">Personas</th><th className="num">Activas</th><th>Nuevas</th><th>Recurrentes</th><th>Cuenta</th><th className="num">Conversión de nuevas</th></tr>}
      renderRow={row => (
        <tr>
          <td>{labelRender ? labelRender(row.label) : row.label}</td>
          <td className="num">{fmtNum(row.visits)}</td>
          <td className="num">{fmtNum(row.people)}</td>
          <td className="num"><b>{fmtNum(row.active)}</b></td>
          <td style={{ minWidth: 150 }}><Pair total={row.newPeople} active={row.newActive} visitOnly={row.newVisitOnly} /></td>
          <td style={{ minWidth: 150 }}><Pair total={row.returningPeople} active={row.returningActive} visitOnly={row.returningVisitOnly} /></td>
          <td style={{ minWidth: 130 }}><b>{fmtNum(row.registered)}</b><span className="panel-muted panel-seg-pair"> registradas · {fmtNum(row.anonymous)} anónimas</span></td>
          <td className="num">{fmtPct(row.conversionPct)}{row.newActive > 0 && <span className="panel-muted panel-seg-pair" style={{ display: 'block' }}>{fmtNum(row.registeredNew)} de {fmtNum(row.newActive)}</span>}</td>
        </tr>
      )}
    />
  )
}

/** Lo que se ve cuando falta correr la migración de la distinción de personas. */
export function SegmentsNotReady() {
  return (
    <Card title="Estas cifras todavía no distinguen a las personas">
      <p className="panel-muted" style={{ lineHeight: 1.6 }}>
        Falta aplicar la migración <b>web-analytics-segments-migration.sql</b> en Supabase (en el editor SQL; se puede correr más de una vez). Mientras tanto se cuenta por navegador,
        sin saber si la persona hizo algo, si era nueva o si ya tenía cuenta. Con la migración, cada cifra separa nuevas de recurrentes, activas de solo visita y registradas de anónimas, y la conversión se mide sobre las nuevas activas.
      </p>
    </Card>
  )
}
