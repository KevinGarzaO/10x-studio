import { supabase } from '../supabase.service'
import { isMissingMigration } from './segments'
import { periodStart } from './metrics'

/**
 * El registro con LinkedIn / GitHub por proveedor (backend/sql/provider-funnel-migration.sql). Cuenta personas. Las reglas de lectura son
 * puras para poder probarlas.
 */
export interface ProviderRow { kind: 'provider' | 'reason'; provider: string; device: string; in_app: string; label: string; clicked: number; succeeded: number; denied: number; failed: number; no_return: number }
export interface ProviderGroup { clicked: number; succeeded: number; denied: number; failed: number; noReturn: number; successPct: number | null; lostPct: number | null }

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const group = (rows: ProviderRow[]): ProviderGroup => {
  const total = rows.reduce((acc, row) => ({ clicked: acc.clicked + row.clicked, succeeded: acc.succeeded + row.succeeded, denied: acc.denied + row.denied, failed: acc.failed + row.failed, noReturn: acc.noReturn + row.no_return }), { clicked: 0, succeeded: 0, denied: 0, failed: 0, noReturn: 0 })
  return { ...total, successPct: share(total.succeeded, total.clicked), lostPct: share(total.clicked - total.succeeded, total.clicked) }
}

export interface ProviderFunnel {
  ready: true
  days: number
  total: ProviderGroup
  byProvider: (ProviderGroup & { provider: string })[]
  byDevice: (ProviderGroup & { device: string })[]
  byInApp: (ProviderGroup & { inApp: string })[]
  groups: (ProviderGroup & { provider: string; device: string; inApp: string })[]
  reasons: { provider: string; reason: string; people: number }[]
  notes: string[]
}

export function buildProviderFunnel(rows: ProviderRow[], days: number): ProviderFunnel {
  const providers = rows.filter((row) => row.kind === 'provider')
  const unique = (pick: (row: ProviderRow) => string) => [...new Set(providers.map(pick))].sort()
  return {
    ready: true,
    days,
    total: group(providers),
    byProvider: unique((row) => row.provider).map((provider) => ({ provider, ...group(providers.filter((row) => row.provider === provider)) })),
    byDevice: unique((row) => row.device).map((device) => ({ device, ...group(providers.filter((row) => row.device === device)) })),
    byInApp: unique((row) => row.in_app).map((inApp) => ({ inApp, ...group(providers.filter((row) => row.in_app === inApp)) })),
    groups: providers.map((row) => ({ provider: row.provider, device: row.device, inApp: row.in_app, ...group([row]) })),
    reasons: rows.filter((row) => row.kind === 'reason').map((row) => ({ provider: row.provider, reason: row.label, people: row.failed })).sort((a, b) => b.people - a.people),
    notes: [
      'Cuenta personas que tocaron el botón de un proveedor. «Volvieron con sesión» es quien regresó del proveedor ya dentro; «no volvieron» es quien tocó y no regresó en el periodo (se quedó en el proveedor o cerró antes): no se sabe cuál de las dos, se lee como pérdida.',
      'Los motivos son códigos del proveedor (por ejemplo access_denied = canceló o negó el permiso). No se guarda el texto del proveedor.',
      'Solo hay datos desde que se activó esta medición. Pocas personas: no saques conclusiones con menos de unas 30 por proveedor.',
    ],
  }
}

export async function loadProviderFunnel(days: number, now: Date = new Date()): Promise<{ ready: false } | ProviderFunnel> {
  const from = periodStart(days, now)
  const { data, error } = await supabase.rpc('analytics_provider_funnel', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString() })
  if (error) {
    if (isMissingMigration(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  return buildProviderFunnel((data ?? []) as ProviderRow[], days)
}
