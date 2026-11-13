import { supabase } from '../supabase.service'
import { readAll } from '../analytics/read'
import { loadPool, scoreAgainstPool, scoreForUser, type MatchedItem, type MatchProfile, type PoolItem } from './compute'
import { loadValidatedSkills } from './validated'

/**
 * "Para ti" ya no se calcula cuando la persona abre el inicio: las coincidencias se calculan de fondo y se guardan
 * (`vacancy_matches`, las mejores TOP por persona), y abrir el inicio solo las lee.
 *
 * Se recalcula cuando:
 *  - la persona guarda su perfil (rol, nivel, skills o modalidad): `refreshUserMatches`;
 *  - pasa el tiempo y llegan vacantes nuevas: `refreshAllMatches`, cada 30 minutos (una sola lectura de las
 *    vacantes sirve para toda la gente);
 *  - alguien abre el inicio y aún no tiene nada calculado: se calcula ahí una vez (camino lento, solo la primera vez).
 *
 * Migración: backend/sql/vacancy-matches-migration.sql. Sin ella todo sigue funcionando, calculando en el momento.
 */
export const TOP_MATCHES = 50

/** Lo guardado para esta persona, o null si aún no se ha calculado (o la tabla no existe). */
export async function readStoredMatches(userId: string): Promise<MatchedItem[] | null> {
  try {
    const { data: state, error: stateError } = await supabase.from('vacancy_match_state').select('computed_at').eq('user_id', userId).maybeSingle()
    if (stateError || !state) return null
    const { data, error } = await supabase.from('vacancy_matches').select('item').eq('user_id', userId).order('rank', { ascending: true }).limit(TOP_MATCHES)
    if (error) return null
    return (data ?? []).map((row: { item: MatchedItem }) => row.item)
  } catch {
    return null
  }
}

/** Reemplaza lo guardado de esta persona por lo nuevo. Un fallo se avisa pero nunca rompe quien lo llamó. */
export async function storeMatches(userId: string, items: MatchedItem[]): Promise<void> {
  try {
    const now = new Date().toISOString()
    const rows = items.slice(0, TOP_MATCHES).map((item, rank) => ({
      user_id: userId, source_type: item.sourceType, source_id: item.id, rank, score: item.matchScore, item, computed_at: now,
    }))
    if (rows.length > 0) {
      const { error } = await supabase.from('vacancy_matches').upsert(rows, { onConflict: 'user_id,source_type,source_id' })
      if (error) throw new Error(error.message)
    }
    // Lo que quedó de la vez anterior y ya no encaja.
    await supabase.from('vacancy_matches').delete().eq('user_id', userId).lt('computed_at', now)
    await supabase.from('vacancy_match_state').upsert({ user_id: userId, computed_at: now }, { onConflict: 'user_id' })
  } catch (error) {
    console.warn('[Match] No se pudieron guardar las coincidencias (¿falta vacancy-matches-migration.sql?):', (error as Error).message)
  }
}

/** Recalcula y guarda las coincidencias de una persona. Se llama al guardar su perfil, sin esperarla. */
export async function refreshUserMatches(user: MatchProfile): Promise<MatchedItem[]> {
  const items = await scoreForUser(user)
  await storeMatches(user.id, items)
  return items
}

/** Recalcula la gente con perfil: las vacantes se leen UNA vez y se puntúan contra cada persona. */
export async function refreshAllMatches(): Promise<{ people: number }> {
  const [pool, people] = await Promise.all([
    loadPool(),
    readAll<MatchProfile>((from, to) =>
      supabase
        .from('users')
        .select('id, role_category, seniority, skills, work_modality')
        .not('role_category', 'is', null)
        .not('is_scraper_profile', 'is', true)
        .range(from, to),
    ),
  ])
  await scorePeople(people, pool)
  return { people: people.length }
}

async function scorePeople(people: MatchProfile[], pool: PoolItem[]) {
  for (const person of people) {
    try {
      const validated = await loadValidatedSkills(person.id)
      await storeMatches(person.id, scoreAgainstPool(person, validated, pool))
    } catch (error) {
      console.warn(`[Match] No se pudo recalcular a ${person.id}:`, (error as Error).message)
    }
  }
}
