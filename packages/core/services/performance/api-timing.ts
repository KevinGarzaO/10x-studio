import type { NextFunction, Request, Response } from 'express'
import { supabase } from '../supabase.service'

/**
 * Cuánto tarda cada ruta de la API (SQL en backend/sql/api-timing-migration.sql, BACKLOG D).
 *
 * Cada petición a /api se mide al terminar, se suma en memoria por hora + método + ruta y cada minuto se manda el resumen a la base.
 * No se guarda ninguna petición suelta, ni parámetros, ni datos de personas: solo conteos y rangos de tiempo. Medir nunca debe
 * estorbar: si algo falla aquí, la petición ya salió y se sigue.
 *
 * La ruta es la que declaró Express (`/api/community/posts/:id`), no la dirección que pidieron: así las vacantes no se cuentan una
 * por una y lo que no coincide con ninguna ruta (robots buscando huecos) cae en un solo renglón, `(sin ruta)`.
 */

/** Hasta cuántos ms entra en cada rango; lo que pase del último va al octavo. Mismo orden que las columnas b0..b7 de la tabla. */
export const BUCKET_LIMITS_MS = [50, 100, 250, 500, 1000, 2500, 5000] as const

export const bucketOf = (ms: number): number => {
  const index = BUCKET_LIMITS_MS.findIndex((limit) => ms <= limit)
  return index === -1 ? BUCKET_LIMITS_MS.length : index
}

export interface TimingItem {
  hour: string
  method: string
  route: string
  requests: number
  errors: number
  sum_ms: number
  max_ms: number
  buckets: number[]
}

/** Lo que no se mide: ruido que no es parte del producto. */
const SKIPPED = /^\/api\/(analytics\/|admin\/analytics\/live)/

export function routeOf(req: Pick<Request, 'baseUrl' | 'route'>): string {
  const path = (req.route as { path?: unknown } | undefined)?.path
  if (path === undefined) return '(sin ruta)'
  if (typeof path !== 'string') return '(ruta con patrón)'
  const full = `${req.baseUrl}${path === '/' ? '' : path}` || '/'
  return full.slice(0, 200)
}

export class TimingAggregator {
  private items = new Map<string, TimingItem>()

  /** Un tope para no crecer sin fin si la base está caída mucho rato. */
  constructor(private readonly maxKeys = 2000) {}

  observe(input: { method: string; route: string; status: number; ms: number; at?: Date }): void {
    const at = input.at ?? new Date()
    const hour = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000).toISOString()
    const key = `${hour}|${input.method}|${input.route}`
    let item = this.items.get(key)
    if (!item) {
      if (this.items.size >= this.maxKeys) return
      item = { hour, method: input.method, route: input.route, requests: 0, errors: 0, sum_ms: 0, max_ms: 0, buckets: new Array(8).fill(0) }
      this.items.set(key, item)
    }
    const ms = Math.max(0, Math.round(input.ms))
    item.requests += 1
    if (input.status >= 500) item.errors += 1
    item.sum_ms += ms
    item.max_ms = Math.max(item.max_ms, ms)
    item.buckets[bucketOf(ms)] += 1
  }

  /** Entrega lo acumulado y lo vacía. */
  drain(): TimingItem[] {
    const out = [...this.items.values()]
    this.items.clear()
    return out
  }

  /** Devuelve un lote que no se pudo guardar para volver a intentarlo en el siguiente minuto. */
  restore(batch: TimingItem[]): void {
    for (const back of batch) {
      const key = `${back.hour}|${back.method}|${back.route}`
      const current = this.items.get(key)
      if (!current) {
        if (this.items.size < this.maxKeys) this.items.set(key, back)
        continue
      }
      current.requests += back.requests
      current.errors += back.errors
      current.sum_ms += back.sum_ms
      current.max_ms = Math.max(current.max_ms, back.max_ms)
      back.buckets.forEach((count, index) => { current.buckets[index] += count })
    }
  }

  get size(): number { return this.items.size }
}

export const timings = new TimingAggregator()

/** Mide cada petición a /api al terminar (no las OPTIONS, ni lo que no es de la API). */
export function apiTiming(aggregator: TimingAggregator = timings) {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint()
    res.on('finish', () => {
      try {
        if (req.method === 'OPTIONS' || !req.originalUrl.startsWith('/api/') || SKIPPED.test(req.originalUrl)) return
        aggregator.observe({ method: req.method, route: routeOf(req), status: res.statusCode, ms: Number(process.hrtime.bigint() - started) / 1e6 })
      } catch {
        // medir no debe romper nada
      }
    })
    next()
  }
}

let warnedMissing = false

/** Manda lo acumulado a la base. Si no se pudo (la migración falta, la base no contesta), lo devuelve a la memoria y lo reintenta. */
export async function flushTimings(aggregator: TimingAggregator = timings): Promise<number> {
  const batch = aggregator.drain()
  if (batch.length === 0) return 0
  try {
    const { error } = await supabase.rpc('api_timing_record', { p: batch })
    if (error) throw new Error(error.message)
    return batch.length
  } catch (error) {
    aggregator.restore(batch)
    const message = (error as Error).message
    if (!warnedMissing) {
      warnedMissing = true
      console.warn('[Velocidad] No se pudo guardar el resumen de tiempos (¿falta api-timing-migration.sql?):', message)
    }
    return 0
  }
}

export function startTimingFlush(intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => { void flushTimings() }, intervalMs)
  timer.unref?.()
  return timer
}

// ---------- Lectura ----------

export interface TimingRow {
  method: string; route: string; requests: number | string; errors: number | string; sum_ms: number | string; max_ms: number
  b0: number | string; b1: number | string; b2: number | string; b3: number | string; b4: number | string; b5: number | string; b6: number | string; b7: number | string
}

export interface RouteTiming {
  method: string
  route: string
  requests: number
  errors: number
  errorPct: number
  avgMs: number
  /** Estimado con los rangos: el límite superior del rango donde cae (por eso es "hasta N ms"). */
  p50Ms: number
  p95Ms: number
  maxMs: number
  /** Cuánto tiempo de servidor consume en total (segundos), y qué parte es del total de todas las rutas. */
  totalSeconds: number
  sharePct: number
  /** Lenta = su p95 pasa de 1 s. */
  slow: boolean
}

const n = (value: number | string) => Number(value) || 0

/** El tiempo bajo el cual cae la fracción `q` de las peticiones, estimado con los rangos (límite superior del rango; el último usa el máximo). */
export function percentileMs(buckets: number[], q: number, maxMs: number): number {
  const total = buckets.reduce((sum, count) => sum + count, 0)
  if (total === 0) return 0
  const target = Math.ceil(total * q)
  let seen = 0
  for (let index = 0; index < buckets.length; index++) {
    seen += buckets[index]
    if (seen >= target) return index < BUCKET_LIMITS_MS.length ? Math.min(BUCKET_LIMITS_MS[index], Math.max(maxMs, 1)) : maxMs
  }
  return maxMs
}

export function summarizeTimings(rows: TimingRow[]): RouteTiming[] {
  const grandTotal = rows.reduce((sum, row) => sum + n(row.sum_ms), 0)
  return rows
    .map((row) => {
      const requests = n(row.requests)
      const buckets = [row.b0, row.b1, row.b2, row.b3, row.b4, row.b5, row.b6, row.b7].map(n)
      const maxMs = n(row.max_ms)
      const p95Ms = percentileMs(buckets, 0.95, maxMs)
      return {
        method: row.method,
        route: row.route,
        requests,
        errors: n(row.errors),
        errorPct: requests ? Math.round((n(row.errors) / requests) * 1000) / 10 : 0,
        avgMs: requests ? Math.round(n(row.sum_ms) / requests) : 0,
        p50Ms: percentileMs(buckets, 0.5, maxMs),
        p95Ms,
        maxMs,
        totalSeconds: Math.round(n(row.sum_ms) / 100) / 10,
        sharePct: grandTotal ? Math.round((n(row.sum_ms) / grandTotal) * 1000) / 10 : 0,
        slow: p95Ms > 1000,
      }
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
}

/** El resumen de las últimas `hours` horas. `{ ready: false }` si falta la migración. */
export async function loadTimingSummary(hours: number): Promise<{ ready: false } | { ready: true; hours: number; routes: RouteTiming[]; pendingInMemory: number }> {
  const { data, error } = await supabase.rpc('api_timing_summary', { p_hours: hours })
  if (error) {
    if (/function|does not exist|schema cache|api_timing|relation/i.test(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  return { ready: true, hours, routes: summarizeTimings((data ?? []) as TimingRow[]), pendingInMemory: timings.size }
}
