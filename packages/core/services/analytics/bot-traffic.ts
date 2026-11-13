import { supabase } from '../supabase.service'
import { isMissingMigration } from './segments'
import { periodStart } from './metrics'

/**
 * Posibles bots (backend/sql/web-analytics-bots-migration.sql). SOLO MARCA, nunca borra ni cambia los números del panel: dice cuántas de
 * las «personas nuevas activas» probablemente son servidores o revisores automáticos, y dónde. La regla vive en SQL (ciudades de centros de
 * datos y tamaños de pantalla de navegadores sin cabeza) para poder discutirla y ajustarla sin tocar el código.
 */
export interface BotRow { dimension: 'total' | 'reason' | 'country' | 'city'; label: string; sessions: number; people: number; active_people: number; new_active_people: number }

export interface BotSummary {
  ready: true
  days: number
  /** Todo el tráfico real del periodo (sin equipo ni pruebas) y lo que parece de bots. */
  all: { sessions: number; people: number; activePeople: number; newActivePeople: number }
  likelyBots: { sessions: number; people: number; activePeople: number; newActivePeople: number }
  /** Qué parte de las personas nuevas activas parece de bots. */
  newActiveBotSharePct: number | null
  /** «Nuevas activas» si se descuentan las marcadas. */
  newActiveWithoutBots: number
  byReason: { reason: string; label: string; sessions: number; people: number; newActivePeople: number }[]
  byCountry: { label: string; sessions: number; people: number; newActivePeople: number }[]
  byCity: { label: string; sessions: number; people: number; newActivePeople: number }[]
  rule: string[]
  notes: string[]
}

const REASON_LABEL: Record<string, string> = {
  centro_de_datos: 'Ciudad de centro de datos (servidores)',
  pantalla_de_servidor: 'Pantalla típica de navegador sin cabeza (800x600 o 400x400)',
}

const counts = (row: BotRow | undefined) => ({ sessions: row?.sessions ?? 0, people: row?.people ?? 0, activePeople: row?.active_people ?? 0, newActivePeople: row?.new_active_people ?? 0 })
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

export function buildBotSummary(rows: BotRow[], days: number): BotSummary {
  const total = (label: string) => rows.find((row) => row.dimension === 'total' && row.label === label)
  const all = counts(total('todas'))
  const likely = counts(total('probables'))
  const list = (dimension: BotRow['dimension']) => rows.filter((row) => row.dimension === dimension).map((row) => ({ label: row.label, sessions: row.sessions, people: row.people, newActivePeople: row.new_active_people }))
  return {
    ready: true,
    days,
    all,
    likelyBots: likely,
    newActiveBotSharePct: share(likely.newActivePeople, all.newActivePeople),
    newActiveWithoutBots: Math.max(0, all.newActivePeople - likely.newActivePeople),
    byReason: rows.filter((row) => row.dimension === 'reason').map((row) => ({ reason: row.label, label: REASON_LABEL[row.label] ?? row.label, sessions: row.sessions, people: row.people, newActivePeople: row.new_active_people })),
    byCountry: list('country'),
    byCity: list('city'),
    rule: [
      'Se marca una sesión si la ciudad es un centro de datos conocido (Ashburn, Dulles, Des Moines, Council Bluffs, Boydton, Moses Lake...) o si la pantalla es 800x600 o 400x400.',
      'Nunca se marca la sesión de alguien con cuenta ni una que hizo una acción clave (registrarse, salir a postular...).',
    ],
    notes: [
      'Es una marca, no un borrado: los números del resto del panel no cambian. Esto dice cuántas «nuevas activas» probablemente no son personas.',
      '«Probable» significa que ninguna persona con cuenta entra por ahí, pero una persona real en una de esas ciudades podría caer; y un bot en una conexión residencial no se detecta.',
      'La lista de ciudades está en la tabla analytics_datacenter_places: se puede añadir o quitar una fila en Supabase.',
    ],
  }
}

export async function loadBotSummary(days: number, now: Date = new Date()): Promise<{ ready: false } | BotSummary> {
  const from = periodStart(days, now)
  const { data, error } = await supabase.rpc('analytics_bot_summary', { p_from: from.toISOString(), p_to: new Date(now.getTime() + 1).toISOString() })
  if (error) {
    if (isMissingMigration(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  return buildBotSummary((data ?? []) as BotRow[], days)
}
