'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
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

/** Pide un dato del panel al backend y lo vuelve a pedir cuando cambia la ruta (por ejemplo, el periodo). */
export function usePanelData<T>(path: string): PanelData<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api<T>(path)
      .then(result => { if (!cancelled) setData(result) })
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

export function PeriodPicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="panel-period" role="group" aria-label="Periodo">
      {[7, 30, 90].map(option => (
        <button key={option} type="button" className={days === option ? 'active' : ''} aria-pressed={days === option} onClick={() => onChange(option)}>
          {option} días
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
  return <p className="panel-muted" role="status">Cargando…</p>
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

/** Barras verticales por día; las de cero también se dibujan, para que un hueco no se confunda con falta de datos. */
export function BarSeries({ points, series }: { points: { day: string; [key: string]: number | string }[]; series: { key: string; label: string; color: string }[] }) {
  const max = Math.max(1, ...points.flatMap(point => series.map(item => Number(point[item.key]) || 0)))
  const every = Math.ceil(points.length / 8)

  return (
    <div className="panel-chart">
      <div className="panel-chart-legend">
        {series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <div className="panel-chart-bars" role="img" aria-label={`Gráfica diaria de ${series.map(item => item.label).join(' y ')}`}>
        {points.map((point, index) => (
          <div key={point.day} className="panel-chart-day" title={`${fmtDay(point.day)}: ${series.map(item => `${item.label} ${point[item.key]}`).join(', ')}`}>
            <div className="panel-chart-stack">
              {series.map(item => (
                <div key={item.key} className="panel-chart-bar" style={{ height: `${((Number(point[item.key]) || 0) / max) * 100}%`, background: item.color }} />
              ))}
            </div>
            <span className="panel-chart-label">{index % every === 0 ? fmtDay(point.day) : ''}</span>
          </div>
        ))}
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
