import { MIN_SCORE, scoreMatch, type MatchCandidate } from '../matching/score'
import { modalityFromLabel } from '../vacancies/modality'

/** Lo que cada correo de "Para ti" pide para que una vacante entre. */
export const DIGEST_MIN_SCORE = 60
/** La alerta de coincidencia fuerte. */
export const ALERT_MIN_SCORE = 80
/** El resumen semanal enseña hasta tantas vacantes. */
export const DIGEST_SIZE = 5
/** El resumen semanal solo cuenta vacantes publicadas en estos días. */
export const DIGEST_WINDOW_DAYS = 7

export interface MatchableVacancy {
  id: string
  slug: string
  title: string
  company: string | null
  modalidad: string | null
  seniority_level: string | null
  role_category: string | null
  skills: string[]
  created_at: string
}

export interface RankedMatch {
  vacancy: MatchableVacancy
  score: number
  /** Los skills de la persona que la vacante pide. */
  shared: string[]
  /** Los que la vacante pide y la persona no tiene. */
  missing: string[]
}

const SENIORITY: Record<string, string> = { junior: 'Junior', semi_senior: 'Semi Senior', senior: 'Senior' }

/** "Reddit • Remoto • Semi Senior" */
export function metaOf(vacancy: Pick<MatchableVacancy, 'company' | 'modalidad' | 'seniority_level'>): string {
  return [
    vacancy.company?.trim() || null,
    modalityFromLabel(vacancy.modalidad) !== 'unknown' ? vacancy.modalidad!.trim() : null,
    SENIORITY[vacancy.seniority_level ?? ''] ?? null,
  ].filter(Boolean).join(' • ')
}

/**
 * Las vacantes que más encajan con una persona: las mejores primero, solo las que "califican" para "Para ti" y
 * pasan el mínimo que se pida, y de las últimas `windowDays` días. Pura: usa el mismo cálculo que la app.
 */
export function rankMatches(
  candidate: MatchCandidate,
  vacancies: MatchableVacancy[],
  options: { minScore?: number; limit?: number; windowDays?: number; now?: Date } = {},
): RankedMatch[] {
  const { minScore = DIGEST_MIN_SCORE, limit = DIGEST_SIZE, windowDays = DIGEST_WINDOW_DAYS, now = new Date() } = options
  const since = now.getTime() - windowDays * 86400000
  const mine = new Set(candidate.skills.map(skill => skill.toLowerCase()))

  return vacancies
    .filter(vacancy => Date.parse(vacancy.created_at) >= since)
    .map(vacancy => {
      const skills = vacancy.skills.map(skill => skill.toLowerCase())
      const result = scoreMatch({ ...candidate, skills: [...mine] }, { roleCategory: vacancy.role_category, seniority: vacancy.seniority_level, skills, workModality: vacancy.modalidad })
      return { vacancy, result, skills }
    })
    .filter(({ result }) => result.qualifies && result.score >= Math.max(minScore, MIN_SCORE))
    .map(({ vacancy, result, skills }) => ({ vacancy, score: result.score, shared: result.sharedSkills, missing: skills.filter(skill => !mine.has(skill)) }))
    .sort((a, b) => b.score - a.score || b.vacancy.created_at.localeCompare(a.vacancy.created_at))
    .slice(0, limit)
}
