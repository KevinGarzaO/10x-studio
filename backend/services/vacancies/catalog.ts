import { supabase } from '../supabase.service'
import { buildSkillMatchers, type DetectableSkill, type SkillMatcher } from './skill-detect'
import { SKILL_TERMS } from './skill-terms'

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; matchers: SkillMatcher[] } | null = null

/**
 * Lee el catálogo de skills de la base y arma los detectores.
 *
 * Se guarda unos minutos en memoria: el scraper analiza cientos de vacantes por
 * corrida y no hace falta leer el catálogo en cada una. Un skill nuevo entra en
 * cuanto vence ese tiempo.
 *
 * Funciona aunque las migraciones de enriquecimiento aún no se hayan aplicado: si la
 * base no tiene `detect_terms` se usan los términos de este código, y si tampoco
 * tiene `role_categories` simplemente no se aplica la regla de "una mención basta
 * si es del rol".
 */
export async function loadSkillMatchers(force = false): Promise<SkillMatcher[]> {
  if (cache && !force && Date.now() - cache.at < TTL_MS) return cache.matchers

  const attempts = ['name, label, detect_terms, role_categories', 'name, label, role_categories', 'name, label']
  let rows: any[] | null = null
  for (const columns of attempts) {
    const { data, error } = await supabase.from('skills').select(columns)
    if (!error) {
      rows = data
      break
    }
  }
  if (!rows) throw new Error('No se pudo leer el catálogo de skills')

  const skills: DetectableSkill[] = rows.map((row) => ({
    name: row.name,
    label: row.label,
    // Lo que diga la base manda; si no dice nada, los términos que trae el código.
    detect_terms: row.detect_terms?.length ? row.detect_terms : SKILL_TERMS[row.name],
    role_categories: row.role_categories ?? [],
  }))

  cache = { at: Date.now(), matchers: buildSkillMatchers(skills) }
  return cache.matchers
}

/** Solo para pruebas: olvida el catálogo guardado. */
export function resetSkillMatcherCache() {
  cache = null
}
