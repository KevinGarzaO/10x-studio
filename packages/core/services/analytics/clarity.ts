import { supabase } from '../supabase.service'
import { dayKey } from './metrics'

/**
 * Microsoft Clarity: las métricas de frustración por página (rage clicks, dead clicks, quickbacks, scroll).
 *
 * La API de exportación (GET https://www.clarity.ms/export-data/api/v1/project-live-insights) solo entrega las últimas 24 h,
 * máximo 10 llamadas al día por proyecto y 1000 filas sin paginar. Por eso una llamada al día (cron) con `dimension1=URL`
 * trae TODAS las métricas por página, y cada día se guarda en `analytics_clarity_metrics` (backend/sql/clarity-migration.sql):
 * así queda un historial propio que se puede cruzar con el embudo.
 *
 * Los nombres de los campos de la respuesta no están del todo documentados por Microsoft, así que el lector es tolerante
 * (acepta `Url` / `URL` / `url`, cuentas como número o como texto) y `npm run clarity-sync -- --raw` imprime lo que llega
 * de verdad para comprobarlo con la primera respuesta real.
 */

export const CLARITY_EXPORT_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'

export interface ClarityPathMetrics {
  path: string
  sessions: number
  pageViews: number
  rageClicks: number
  deadClicks: number
  quickBacks: number
  /** Promedio de scroll (0-100), o null si Clarity no lo dio para esa página. */
  avgScrollDepth: number | null
}

type Row = Record<string, unknown>
interface ExportMetric { metricName?: unknown; information?: unknown }

/** "RageClickCount", "Rage Click Count" y "rage_click_count" son el mismo nombre. */
const key = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  return Number.isFinite(number) ? number : null
}

/** Primer campo (sin importar mayúsculas) que exista entre los nombres dados. */
const field = (row: Row, ...names: string[]): unknown => {
  const wanted = names.map(key)
  for (const [name, value] of Object.entries(row)) if (wanted.includes(key(name))) return value
  return undefined
}

/** La ruta de una URL de Clarity, sin dominio, parámetros ni "/" final; null si no es una página nuestra utilizable. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let path = raw.trim()
  try {
    path = new URL(path).pathname
  } catch {
    if (!path.startsWith('/')) return null
    path = path.split(/[?#]/)[0]
  }
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path.slice(0, 300) || '/'
}

/** La respuesta de Clarity (una lista de métricas, cada una con sus filas) convertida a una fila por página. */
export function parseClarityExport(json: unknown): ClarityPathMetrics[] {
  if (!Array.isArray(json)) return []
  const byPath = new Map<string, ClarityPathMetrics & { scrollSum: number; scrollN: number }>()
  const entry = (path: string) => {
    let row = byPath.get(path)
    if (!row) {
      row = { path, sessions: 0, pageViews: 0, rageClicks: 0, deadClicks: 0, quickBacks: 0, avgScrollDepth: null, scrollSum: 0, scrollN: 0 }
      byPath.set(path, row)
    }
    return row
  }

  for (const metric of json as ExportMetric[]) {
    const name = key(metric?.metricName)
    if (!Array.isArray(metric?.information)) continue
    const kind = name.includes('rageclick') ? 'rage' : name.includes('deadclick') ? 'dead' : name.includes('quickback') ? 'quick' : name.includes('scrolldepth') ? 'scroll' : null
    if (!kind) continue

    for (const item of metric.information as Row[]) {
      const path = normalizePath(field(item, 'Url', 'URL', 'pageUrl', 'Page'))
      if (!path) continue
      const row = entry(path)

      const sessions = toNumber(field(item, 'sessionsCount', 'totalSessionCount', 'sessions'))
      const views = toNumber(field(item, 'pagesViews', 'pageViews', 'pageViewsCount'))
      // Sin cuentas separadas por métrica, el mayor valor visto es el de la página; varias URLs con parámetros se suman abajo.
      if (sessions !== null) row.sessions = Math.max(row.sessions, sessions)
      if (views !== null) row.pageViews = Math.max(row.pageViews, views)

      if (kind === 'scroll') {
        const scroll = toNumber(field(item, 'averageScrollDepth', 'avgScrollDepth', 'scrollDepth'))
        if (scroll !== null) {
          row.scrollSum += scroll
          row.scrollN += 1
        }
        continue
      }
      // `subTotal` es cuántas veces ocurrió; si no viene, se estima con el porcentaje de sesiones que lo tuvieron.
      let count = toNumber(field(item, 'subTotal', 'count', 'total'))
      if (count === null) {
        const percent = toNumber(field(item, 'sessionsWithMetricPercentage'))
        count = percent !== null && sessions !== null ? Math.round((percent / 100) * sessions) : 0
      }
      if (kind === 'rage') row.rageClicks += count
      else if (kind === 'dead') row.deadClicks += count
      else row.quickBacks += count
    }
  }

  return [...byPath.values()].map(({ scrollSum, scrollN, ...row }) => ({
    ...row,
    avgScrollDepth: scrollN > 0 ? Math.round((scrollSum / scrollN) * 100) / 100 : null,
  }))
}

export class ClarityApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

/** Una llamada a la API de Clarity: las últimas 24 h por página. Gasta 1 de las 10 llamadas diarias. */
export async function fetchClarityExport(token: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const url = `${CLARITY_EXPORT_URL}?numOfDays=1&dimension1=URL`
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) {
    const reason = response.status === 429 ? 'se pasó del límite diario de la API de Clarity (10 llamadas)' : response.status === 401 || response.status === 403 ? 'el token de Clarity no es válido o venció' : `Clarity respondió ${response.status}`
    throw new ClarityApiError(response.status, reason)
  }
  return response.json()
}

export interface ClaritySyncOutcome {
  status: 'ok' | 'skipped' | 'error'
  paths: number
  reason?: string
}

/** Trae las métricas de las últimas 24 h y las guarda en el día de Monterrey de hoy (repetirlo el mismo día solo las actualiza). */
export async function syncClarity(options: { token?: string; fetcher?: typeof fetch; db?: Pick<typeof supabase, 'from'>; now?: Date; onRaw?: (json: unknown) => void } = {}): Promise<ClaritySyncOutcome> {
  const token = options.token ?? process.env.CLARITY_API_KEY
  if (!token) return { status: 'skipped', paths: 0, reason: 'falta CLARITY_API_KEY' }

  let json: unknown
  try {
    json = await fetchClarityExport(token, options.fetcher)
  } catch (error) {
    const known = error instanceof ClarityApiError
    return { status: known && error.status === 429 ? 'skipped' : 'error', paths: 0, reason: (error as Error).message }
  }
  options.onRaw?.(json)

  const rows = parseClarityExport(json)
  if (rows.length === 0) return { status: 'skipped', paths: 0, reason: 'Clarity no devolvió páginas (¿aún sin tráfico o cambió el formato?)' }

  const day = dayKey((options.now ?? new Date()).toISOString())
  const db = options.db ?? supabase
  const records = rows.map((row) => ({
    day,
    path: row.path,
    sessions: row.sessions,
    page_views: row.pageViews,
    rage_clicks_count: row.rageClicks,
    dead_clicks_count: row.deadClicks,
    quick_backs_count: row.quickBacks,
    avg_scroll_depth: row.avgScrollDepth,
    updated_at: new Date().toISOString(),
  }))

  for (let start = 0; start < records.length; start += 500) {
    const { error } = await db.from('analytics_clarity_metrics').upsert(records.slice(start, start + 500), { onConflict: 'day,path' })
    if (error) {
      const missing = /relation|does not exist|schema cache|analytics_clarity_metrics/i.test(error.message)
      return { status: missing ? 'skipped' : 'error', paths: 0, reason: missing ? 'falta correr clarity-migration.sql' : error.message }
    }
  }
  return { status: 'ok', paths: records.length }
}
