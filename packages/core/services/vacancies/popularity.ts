import { supabase } from '../supabase.service'

/**
 * Qué tan popular es una vacante, con lo que ya se mide:
 *  - vistas: personas (navegadores) distintas que abrieron la vacante (`vacancy_events`, evento 'view');
 *  - postulaciones: personas distintas que pulsaron "Postularse" (evento 'apply');
 *  - guardados: personas que la guardaron (`user_vacancy_history`).
 * Se cuenta una vez por persona, así que recargar la página no infla nada.
 */
export interface VacancyStats {
  views: number
  saves: number
  applies: number
}

export const EMPTY_STATS: VacancyStats = { views: 0, saves: 0, applies: 0 }

/** Guardar y postularse pesan más que mirar: son lo que dice que la vacante interesa de verdad. */
export const VIEW_WEIGHT = 1
export const SAVE_WEIGHT = 3
export const APPLY_WEIGHT = 5

export const popularityScore = (stats: VacancyStats): number =>
  stats.views * VIEW_WEIGHT + stats.saves * SAVE_WEIGHT + stats.applies * APPLY_WEIGHT

/**
 * El orden del feed: la más popular primero y, a igual popularidad, la más nueva. Así las vacantes
 * que aún nadie ha visto no se pierden: quedan ordenadas por fecha detrás de las que sí interesan.
 */
export function rankByPopularity<T extends { created_at: string }>(items: T[], statsOf: (item: T) => VacancyStats): T[] {
  return [...items].sort((a, b) => popularityScore(statsOf(b)) - popularityScore(statsOf(a)) || b.created_at.localeCompare(a.created_at))
}

interface Loaded {
  bySlug: Map<string, { views: number; applies: number }>
  savesById: Map<string, number>
}

// Se guarda poco tiempo y, además, se borra en cuanto alguien abre, guarda o se postula (ver clearPopularityCache).
const CACHE_MS = 30 * 1000
let cache: { at: number; value: Loaded } | null = null

export function clearPopularityCache(): void {
  cache = null
}

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function load(): Promise<Loaded> {
  const bySlug = new Map<string, { views: number; applies: number }>()
  const savesById = new Map<string, number>()

  try {
    const events = await readAll<{ vacancy_slug: string; event: string; visitor_id: string }>((from, to) =>
      supabase.from('vacancy_events').select('vacancy_slug, event, visitor_id').range(from, to),
    )
    const seen = new Set<string>()
    for (const row of events) {
      const key = `${row.vacancy_slug}|${row.event}|${row.visitor_id}`
      if (seen.has(key)) continue
      seen.add(key)
      const entry = bySlug.get(row.vacancy_slug) ?? { views: 0, applies: 0 }
      if (row.event === 'view') entry.views += 1
      else if (row.event === 'apply') entry.applies += 1
      bySlug.set(row.vacancy_slug, entry)
    }
  } catch {
    // Sin la tabla de eventos (aún no se aplicó la migración) todo cuenta como cero.
  }

  try {
    const saved = await readAll<{ source_id: string }>((from, to) =>
      supabase.from('user_vacancy_history').select('source_id').eq('source_type', 'community').eq('is_saved', true).range(from, to),
    )
    for (const row of saved) savesById.set(row.source_id, (savesById.get(row.source_id) ?? 0) + 1)
  } catch {
    // igual: sin datos, ceros
  }

  return { bySlug, savesById }
}

/** Lee las cifras de todas las vacantes (se guarda unos minutos: el feed la pide en cada página). */
export async function loadVacancyStats(): Promise<(post: { id: string; slug?: string | null }) => VacancyStats> {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), value: await load() }
  const { bySlug, savesById } = cache.value
  return (post) => {
    const events = post.slug ? bySlug.get(post.slug) : undefined
    return { views: events?.views ?? 0, applies: events?.applies ?? 0, saves: savesById.get(post.id) ?? 0 }
  }
}
