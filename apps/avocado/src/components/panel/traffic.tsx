'use client'

import { Card } from './ui'
import { SegmentTable, type SegmentCounts } from './segments'

/* ------------------------------------------------------------------ */
/* Nombres legibles                                                    */
/* ------------------------------------------------------------------ */

let regionNames: Intl.DisplayNames | null = null
let languageNames: Intl.DisplayNames | null = null

/** "MX" -> "México". Si el navegador no sabe el nombre, se deja el código. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '(sin dato)'
  try {
    regionNames ??= new Intl.DisplayNames(['es'], { type: 'region' })
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** "es-MX" -> "español (México)". */
export function languageName(code: string | null | undefined): string {
  if (!code || code === '(sin dato)') return '(sin dato)'
  try {
    languageNames ??= new Intl.DisplayNames(['es'], { type: 'language' })
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

const TIME_ZONE = 'America/Monterrey'

/** Fecha y hora al segundo, en horario de Monterrey: cada entrada se puede ubicar exactamente. */
export function fmtExact(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('es-MX', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/** "hace 12 s", "hace 3 min". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `hace ${seconds} s`
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`
  return `hace ${Math.floor(seconds / 86400)} d`
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

/** Un desglose (idioma, dispositivo, sistema...) con LA distinción de personas en cada fila. */
export function DimensionCard({ title, hint, rows, label, searchLabel }: { title: string; hint?: string; rows: SegmentCounts[]; label?: (value: string) => string; searchLabel?: string }) {
  return (
    <Card title={title} hint={hint}>
      <SegmentTable rows={rows} labelHeader={title} labelRender={label} searchLabel={searchLabel} pageSize={8} />
    </Card>
  )
}

/** Lo que se ve cuando falta correr la migración en Supabase. */
export function TrafficNotReady({ migration = 'web-analytics-migration.sql' }: { migration?: string }) {
  return (
    <Card title="Todavía no está listo">
      <p className="panel-muted" style={{ lineHeight: 1.6 }}>
        Falta aplicar la migración <b>{migration}</b> en Supabase (en el editor SQL; se puede correr dos veces sin problema).
        Desde ese momento el sitio guarda cada visita y esta pantalla se llena con el tiempo: no se puede reconstruir lo que pasó antes.
      </p>
    </Card>
  )
}
