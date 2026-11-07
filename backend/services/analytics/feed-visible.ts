import { supabase } from '../supabase.service'
import { readAll } from './read'
import { feedVisibilityReady } from '../vacancies/feed-visibility'

/**
 * La vista del feed VISIBLE: de las vacantes abiertas (45 días), cuántas se ven en el feed y cuántas están ocultas porque no le sirven a
 * nadie (services/vacancies/feed-visibility.ts), en total y por puesto. Solo mide. Las reglas de armado son puras para poder probarlas.
 */
export interface FeedRow { role_category: string | null; hidden_from_feed: boolean | null; hidden_at: string | null }

export interface FeedVisibleRole { role: string; open: number; visible: number; hidden: number }
export interface FeedVisible {
  ready: true
  open: number
  visible: number
  hidden: number
  hiddenPct: number | null
  lastHiddenAt: string | null
  byRole: FeedVisibleRole[]
  notes: string[]
}

export function buildFeedVisible(rows: FeedRow[]): FeedVisible {
  const roles = new Map<string, FeedVisibleRole>()
  let hidden = 0
  let lastHiddenAt: string | null = null
  for (const row of rows) {
    const role = row.role_category ?? 'sin_puesto'
    const entry = roles.get(role) ?? { role, open: 0, visible: 0, hidden: 0 }
    entry.open++
    if (row.hidden_from_feed === true) {
      entry.hidden++
      hidden++
      if (row.hidden_at && (!lastHiddenAt || row.hidden_at > lastHiddenAt)) lastHiddenAt = row.hidden_at
    } else entry.visible++
    roles.set(role, entry)
  }
  const open = rows.length
  return {
    ready: true,
    open,
    visible: open - hidden,
    hidden,
    hiddenPct: open > 0 ? Math.round((hidden / open) * 1000) / 10 : null,
    lastHiddenAt,
    byRole: [...roles.values()].sort((a, b) => b.visible - a.visible || a.role.localeCompare(b.role)),
    notes: [
      '«Abiertas» son las vacantes de los últimos 45 días. «Ocultas» no se borran: siguen abriendo por enlace directo y se vuelven a mostrar solas si llega alguien a quien le sirvan.',
      'Lo oculto es lo que no le sirve a ninguna persona real (encaja y comparte al menos un skill). Se recalcula cada día a las 9:30 hora de Monterrey, solo si FEED_HIDE_UNSERVED está en «on».',
      'Esta vista no cambia qué se publica: solo cuenta lo que ya está visible u oculto.',
    ],
  }
}

export async function loadFeedVisible(now: Date = new Date()): Promise<{ ready: false } | FeedVisible> {
  if (!(await feedVisibilityReady())) return { ready: false }
  const since = new Date(now.getTime() - 45 * 86_400_000).toISOString()
  const rows = await readAll<FeedRow>((from, to) =>
    supabase.from('community_posts').select('role_category, hidden_from_feed, hidden_at').eq('type', 'job').gte('created_at', since).range(from, to))
  return buildFeedVisible(rows)
}
