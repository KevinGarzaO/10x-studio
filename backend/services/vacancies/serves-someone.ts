import { supabase } from '../supabase.service'
import { scoreMatch } from '../matching/score'
import { readAll } from '../analytics/read'

/**
 * Regla de negocio: al feed solo entra una vacante que le sirve a alguien — encaja (lo mismo que cuenta el panel
 * "Match" y "Para ti": `scoreMatch(...).qualifies`) con al menos una persona real que ya eligió su puesto. Una vacante
 * que no le sirve a nadie solo llena el feed de ruido.
 *
 * No se descarta: se queda en la cola, y se vuelve a revisar cada día (llega gente nueva, o alguien agrega skills).
 * Si todavía no hay NADIE a quien puntuar (comunidad vacía) la regla no se aplica: el feed no se queda sin vacantes.
 */
export interface PersonProfile {
  roleCategory: string
  seniority: string | null
  skills: string[]
  workModality: string | null
}

export interface VacancyShape {
  role_category: string | null
  seniority_level: string | null
  skills: unknown
  work_modality: string | null
}

const asSkills = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((skill): skill is string => typeof skill === 'string').map((skill) => skill.toLowerCase()) : [])

/** Las personas contra las que se mide: las mismas que cuenta el panel Match (candidatos reales con puesto elegido). */
export async function loadPeopleProfiles(): Promise<PersonProfile[]> {
  const rows = await readAll<{ role_category: string | null; seniority: string | null; skills: unknown; work_modality: string | null }>((from, to) =>
    supabase
      .from('users')
      .select('role_category, seniority, skills, work_modality')
      .eq('account_type', 'candidate')
      .eq('user_kind', 'user')
      .eq('is_test_account', false)
      .not('is_scraper_profile', 'is', true)
      .not('role_category', 'is', null)
      .range(from, to),
  )
  return rows.map((row) => ({ roleCategory: row.role_category as string, seniority: row.seniority, skills: asSkills(row.skills), workModality: row.work_modality }))
}

/** ¿Le sirve a alguien? Sin personas que puntuar, sí (ver arriba). */
export function servesSomeone(vacancy: VacancyShape, people: PersonProfile[]): boolean {
  if (people.length === 0) return true
  const target = { roleCategory: vacancy.role_category, seniority: vacancy.seniority_level, skills: asSkills(vacancy.skills), workModality: vacancy.work_modality }
  // Encaja Y comparte al menos un skill: sin skills en común no hay nada que recomendar, aunque el puesto coincida.
  return people.some((person) => {
    const result = scoreMatch({ ...person, validatedSkills: {} }, target)
    return result.qualifies && result.sharedSkills.length > 0
  })
}
