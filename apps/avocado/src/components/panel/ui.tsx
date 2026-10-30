'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export interface PanelData<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

// Lo último que se vio de cada consulta: al volver a una pantalla (o cambiar de periodo y regresar) se muestra
// al instante y se actualiza por detrás, en lugar de empezar cada vez desde un "Cargando".
const seen = new Map<string, unknown>()

/** Pide un dato del panel al backend y lo vuelve a pedir cuando cambia la ruta (por ejemplo, el periodo). */
export function usePanelData<T>(path: string): PanelData<T> {
  const [data, setData] = useState<T | null>(() => (seen.get(path) as T | undefined) ?? null)
  const [loading, setLoading] = useState(!seen.has(path))
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const known = seen.get(path) as T | undefined
    setData(known ?? null)
    setLoading(known === undefined)
    setError(null)
    // Recargar a mano se salta lo que el servidor guarda unos segundos.
    const url = tick > 0 ? `${path}${path.includes('?') ? '&' : '?'}fresh=1` : path
    api<T>(url)
      .then(result => { seen.set(path, result); if (!cancelled) setData(result) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, tick])

  const reload = useCallback(() => setTick(value => value + 1), [])
  return { data, loading, error, reload }
}

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

export const fmtNum = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value.toLocaleString('es-MX'))
export const fmtPct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`)

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Monterrey',
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/** "2026-10-24" -> "24 oct" (sin pasar por una zona horaria que lo mueva de día). */
export function fmtDay(day: string): string {
  const [, month, date] = day.split('-').map(Number)
  return `${date} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][month - 1]}`
}

export const ROLE_LABELS: Record<string, string> = {
  frontend: 'Frontend', backend: 'Backend', fullstack: 'Full Stack', mobile: 'Móvil', devops: 'DevOps', data_engineer: 'Ing. de datos',
  data_scientist: 'Ciencia de datos', qa: 'QA', ux_ui: 'UX/UI', marketing: 'Marketing', customer_support: 'Atención al cliente',
  product: 'Producto', recursos_humanos: 'Recursos Humanos', administracion: 'Administración', finanzas: 'Finanzas', ventas: 'Ventas',
  legal: 'Legal', otro: 'Otro',
}
export const roleLabel = (role: string | null | undefined) => (role ? ROLE_LABELS[role] ?? role : '—')

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="panel-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}

/** 1 es "las últimas 24 horas"; los demás son días completos. */
export const PERIOD_OPTIONS = [1, 7, 30, 90]

export const periodButton = (days: number): string => (days === 1 ? '24 horas' : `${days} días`)

/** "las últimas 24 horas" / "los últimos 7 días", para frases. */
export const periodPhrase = (days: number): string => (days === 1 ? 'las últimas 24 horas' : `los últimos ${days} días`)

export function PeriodPicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="panel-period" role="group" aria-label="Periodo">
      {PERIOD_OPTIONS.map(option => (
        <button key={option} type="button" className={days === option ? 'active' : ''} aria-pressed={days === option} onClick={() => onChange(option)}>
          {periodButton(option)}
        </button>
      ))}
    </div>
  )
}

export function Card({ title, hint, children, className = '' }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel-card ${className}`}>
      {title && (
        <div className="panel-card-head">
          <h2>{title}</h2>
          {hint && <span className="panel-hint">{hint}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Un número grande con su nombre, y debajo QUÉ cuenta: ningún número queda sin definición. */
export function Stat({ label, value, caption, delta, tone }: { label: string; value: string; caption: string; delta?: number | null; tone?: 'good' | 'warn' }) {
  return (
    <div className={`panel-stat ${tone ?? ''}`}>
      <span className="panel-stat-label">{label}</span>
      <strong className="panel-stat-value">{value}</strong>
      {delta !== undefined && delta !== null && (
        <span className={`panel-delta ${delta >= 0 ? 'up' : 'down'}`} title="Contra el periodo anterior de la misma duración">
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%
        </span>
      )}
      <span className="panel-stat-caption">{caption}</span>
    </div>
  )
}

export function Loading() {
  return (
    <div className="panel-skeleton" role="status" aria-label="Cargando">
      <i /><i /><i />
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel-error" role="alert">
      <strong>No se pudo cargar.</strong> {message}
      {onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="panel-empty">{children}</p>
}

/** Una etiqueta de la gráfica: "14h" para una hora ("2026-10-25T14"), "25 oct" para un día. */
export function fmtPoint(key: string): string {
  return key.includes('T') ? `${key.slice(11, 13)}h` : fmtDay(key)
}

/**
 * Barras verticales por día (o por hora), con el número de cada barra a la vista, en celular y en escritorio:
 * nadie tiene que pasar el dedo o el cursor para leerlo. Las de cero también se dibujan, para que un hueco no
 * se confunda con falta de datos. Con muchos puntos la gráfica se desplaza hacia los lados, sin apretar los
 * números, y arranca mostrando lo más reciente.
 */
export function BarSeries({ points, series }: { points: { day: string; [key: string]: number | string }[]; series: { key: string; label: string; color: string }[] }) {
  const max = Math.max(1, ...points.flatMap(point => series.map(item => Number(point[item.key]) || 0)))
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollLeft = element.scrollWidth
  }, [points])

  const summary = points.map(point => `${fmtPoint(point.day)} ${series.map(item => `${item.label} ${point[item.key]}`).join(', ')}`).join('; ')

  return (
    <div className="panel-chart">
      <div className="panel-chart-legend">
        {series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <div className="panel-chart-scroll" ref={scroller}>
        <div className="panel-chart-bars" role="img" aria-label={`Gráfica de ${series.map(item => item.label).join(' y ')}: ${summary}`}>
          {points.map(point => (
            <div key={point.day} className="panel-chart-day">
              <div className="panel-chart-stack">
                {series.map(item => {
                  const value = Number(point[item.key]) || 0
                  return (
                    <div key={item.key} className="panel-chart-col">
                      <span className={`panel-chart-value${value === 0 ? ' is-zero' : ''}`}>{fmtNum(value)}</span>
                      <div className="panel-chart-bar" style={{ height: `calc((100% - 24px) * ${value / max})`, background: item.color }} />
                    </div>
                  )
                })}
              </div>
              <span className="panel-chart-label">{fmtPoint(point.day)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Una barra horizontal proporcional al valor más grande de su grupo. */
export function InlineBar({ value, max, color = '#10b981' }: { value: number; max: number; color?: string }) {
  return (
    <span className="panel-inline-bar" aria-hidden="true">
      <i style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </span>
  )
}

/** La foto de la persona; si no tiene, sus iniciales. */
/** La foto de la persona; si no hay o no carga (un enlace de LinkedIn vencido), sus iniciales. */
export function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [photo])
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
  return photo && !failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="panel-avatar" src={photo} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="panel-avatar panel-avatar-fallback" aria-hidden="true">{initials}</span>
}
