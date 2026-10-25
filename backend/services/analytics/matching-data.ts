import { supabase } from '../supabase.service'
import type { ValidationLevel } from '../matching/score'
import { buildMatchingOverview, type MatchingOverview, type PanelCandidate, type PanelVacancy } from './matching'
import { readAll } from './read'

const ACTIVE_DAYS = 45

const asSkills = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((skill): skill is string => typeof skill === 'string') : [])

/**
 * Lee a las personas reales y las vacantes abiertas, y las pasa por el motor de match
 * (services/analytics/matching.ts). Las mismas personas que ven "Para ti": candidatos reales, sin
 * cuentas de prueba, ni el equipo (administradores), ni perfiles del scraper. Quien aún no eligió su puesto no se puede puntuar y
 * se cuenta aparte.
 */
export async function loadMatchingOverview(): Promise<MatchingOverview & { withoutRole: number }> {
  const since = new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString()

  const [people, vacancies] = await Promise.all([
    readAll<{
      id: string; username: string | null; display_name: string | null; photo_url: string | null
      role_category: string | null; seniority: string | null; skills: unknown; work_modality: string | null
    }>((from, to) =>
      supabase
        .from('users')
        .select('id, username, display_name, photo_url, role_category, seniority, skills, work_modality')
        .eq('account_type', 'candidate')
        .eq('user_kind', 'user')
        .eq('is_test_account', false)
        .not('is_scraper_profile', 'is', true)
        .range(from, to),
    ),
    readAll<{ slug: string; title: string; company: string | null; role_category: string | null; seniority_level: string | null; skills: unknown; modalidad: string | null }>((from, to) =>
      supabase
        .from('community_posts')
        .select('slug, title, company, role_category, seniority_level, skills, modalidad')
        .eq('type', 'job')
        .not('slug', 'is', null)
        .gte('created_at', since)
        .range(from, to),
    ),
  ])

  // Los exámenes aprobados: pesan en el puntaje igual que en "Para ti". Si la tabla no está, se sigue sin ellos.
  const validated = new Map<string, Record<string, ValidationLevel>>()
  const levels = await supabase.from('user_skill_levels').select('user_id, skill_name, level').in('user_id', people.map((person) => person.id))
  for (const row of levels.error ? [] : levels.data ?? []) {
    if (row.level !== 'basico' && row.level !== 'intermedio' && row.level !== 'avanzado') continue
    validated.set(row.user_id, { ...(validated.get(row.user_id) ?? {}), [String(row.skill_name).toLowerCase()]: row.level })
  }

  const scorable = people.filter((person) => person.role_category)
  const candidates: PanelCandidate[] = scorable.map((person) => ({
    id: person.id,
    name: person.display_name || person.username || 'Sin nombre',
    photo: person.photo_url,
    roleCategory: person.role_category,
    seniority: person.seniority,
    skills: asSkills(person.skills).map((skill) => skill.toLowerCase()),
    workModality: person.work_modality,
    validatedSkills: validated.get(person.id) ?? {},
  }))

  const panelVacancies: PanelVacancy[] = vacancies.map((vacancy) => ({
    slug: vacancy.slug,
    title: vacancy.title,
    company: vacancy.company,
    roleCategory: vacancy.role_category,
    seniority: vacancy.seniority_level,
    skills: asSkills(vacancy.skills),
    workModality: vacancy.modalidad,
  }))

  return { ...buildMatchingOverview({ candidates, vacancies: panelVacancies }), withoutRole: people.length - scorable.length }
}
