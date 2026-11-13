import { supabase } from '../supabase.service'
import { isMissingMigration } from './segments'
import { periodStart } from './metrics'

/**
 * Embudo de postulación con tres cortes: dispositivo, con cuenta / sin cuenta, y paso (abrió la vacante, vio el botón, lo tocó, salió al sitio
 * de la empresa). Cuenta PERSONAS (backend/sql/apply-funnel-migration.sql). Las reglas de lectura son puras para poder probarlas.
 */
export interface FunnelRow { device: string; audience: 'con_cuenta' | 'sin_cuenta'; viewers: number; saw_button: number; clicked: number; left_site: number }
export interface FunnelCounts { viewers: number; sawButton: number; clicked: number; leftSite: number }
export interface FunnelGroup extends FunnelCounts { clickRate: number | null; sawButtonRate: number | null }
export interface ApplyFunnel {
  ready: true
  days: number
  /** Suma de todos los grupos. Una persona que entró desde dos dispositivos cuenta una vez en cada uno, así que puede pasar del total real. */
  total: FunnelGroup
  byDevice: (FunnelGroup & { device: string })[]
  byAudience: (FunnelGroup & { audience: string })[]
  groups: (FunnelGroup & { device: string; audience: string })[]
  notes: string[]
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const sum = (rows: FunnelRow[]): FunnelCounts => rows.reduce<FunnelCounts>((acc, row) => ({ viewers: acc.viewers + row.viewers, sawButton: acc.sawButton + row.saw_button, clicked: acc.clicked + row.clicked, leftSite: acc.leftSite + row.left_site }), { viewers: 0, sawButton: 0, clicked: 0, leftSite: 0 })
const group = (counts: FunnelCounts): FunnelGroup => ({ ...counts, clickRate: share(counts.clicked, counts.viewers), sawButtonRate: share(counts.sawButton, counts.viewers) })

export function buildApplyFunnel(rows: FunnelRow[], days: number): ApplyFunnel {
  const devices = [...new Set(rows.map((row) => row.device))].sort()
  const audiences = ['con_cuenta', 'sin_cuenta'] as const
  const notes = [
    'Cuenta personas, no clics. «Vio el botón» solo existe desde que se empezó a medir, así que antes de esa fecha siempre es 0.',
    'Salir al sitio de la empresa solo lo hace quien tiene cuenta: sin cuenta, «Postularse» lleva al registro.',
    'Lo que pasa después, en el sitio de la empresa, no se ve. «Me postulé» es lo que la gente dice en Mis postulaciones.',
  ]
  return {
    ready: true,
    days,
    total: group(sum(rows)),
    byDevice: devices.map((device) => ({ device, ...group(sum(rows.filter((row) => row.device === device))) })),
    byAudience: audiences.map((audience) => ({ audience, ...group(sum(rows.filter((row) => row.audience === audience))) })),
    groups: rows.map((row) => ({ device: row.device, audience: row.audience, ...group(sum([row])) })),
    notes,
  }
}

export async function loadApplyFunnel(days: number, now: Date = new Date()): Promise<{ ready: false } | ApplyFunnel> {
  const from = periodStart(days, now)
  const { data, error } = await supabase.rpc('analytics_apply_funnel', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString() })
  if (error) {
    if (isMissingMigration(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  return buildApplyFunnel((data ?? []) as FunnelRow[], days)
}
