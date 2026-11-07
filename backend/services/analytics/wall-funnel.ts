import { supabase } from '../supabase.service'
import { isMissingMigration } from './segments'
import { periodStart } from './metrics'

/**
 * La ventana de registro sobre una vacante, paso por paso y por tipo de dispositivo / navegador interno de otra app
 * (backend/sql/wall-funnel-migration.sql). Cuenta personas. Las reglas de lectura son puras para poder probarlas.
 */
export interface WallRow { device: string; in_app: string; saw: number; clicked: number; clicked_linkedin: number; clicked_github: number; clicked_email: number; registered: number }
export interface WallGroup { saw: number; clicked: number; clickedLinkedin: number; clickedGithub: number; clickedEmail: number; registered: number; clickPct: number | null; registerPct: number | null; clickToRegisterPct: number | null }

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const sum = (rows: WallRow[]) => rows.reduce((acc, row) => ({
  saw: acc.saw + row.saw, clicked: acc.clicked + row.clicked, clickedLinkedin: acc.clickedLinkedin + row.clicked_linkedin,
  clickedGithub: acc.clickedGithub + row.clicked_github, clickedEmail: acc.clickedEmail + row.clicked_email, registered: acc.registered + row.registered,
}), { saw: 0, clicked: 0, clickedLinkedin: 0, clickedGithub: 0, clickedEmail: 0, registered: 0 })
const group = (rows: WallRow[]): WallGroup => {
  const total = sum(rows)
  return { ...total, clickPct: share(total.clicked, total.saw), registerPct: share(total.registered, total.saw), clickToRegisterPct: share(total.registered, total.clicked) }
}

export interface WallFunnel {
  ready: true
  days: number
  total: WallGroup
  byDevice: (WallGroup & { device: string })[]
  byInApp: (WallGroup & { inApp: string })[]
  groups: (WallGroup & { device: string; inApp: string })[]
  notes: string[]
}

export function buildWallFunnel(rows: WallRow[], days: number): WallFunnel {
  const unique = (pick: (row: WallRow) => string) => [...new Set(rows.map(pick))].sort()
  return {
    ready: true,
    days,
    total: group(rows),
    byDevice: unique((row) => row.device).map((device) => ({ device, ...group(rows.filter((row) => row.device === device)) })),
    byInApp: unique((row) => row.in_app).map((inApp) => ({ inApp, ...group(rows.filter((row) => row.in_app === inApp)) })),
    groups: rows.map((row) => ({ device: row.device, inApp: row.in_app, ...group([row]) })),
    notes: [
      'Cuenta personas, no vistas. «Se registró» es quien tuvo un registro en el periodo (casi todos pasan por esta ventana).',
      '«Navegador interno» = la página se abrió dentro de la app de LinkedIn, Facebook o Instagram, donde el inicio de sesión con LinkedIn o GitHub suele atorarse. «sin_dato» son los eventos anteriores a que se midiera.',
      'Quien toca un botón y no se registra se perdió en el camino (en el proveedor o al volver); quien no toca nada no vio un motivo para registrarse.',
    ],
  }
}

export async function loadWallFunnel(days: number, now: Date = new Date()): Promise<{ ready: false } | WallFunnel> {
  const from = periodStart(days, now)
  const { data, error } = await supabase.rpc('analytics_wall_funnel', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString() })
  if (error) {
    if (isMissingMigration(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  return buildWallFunnel((data ?? []) as WallRow[], days)
}
