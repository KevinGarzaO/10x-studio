import { scoreMatch } from './score'

/**
 * Dónde la oferta de vacantes no alcanza a la gente que hay, y al revés.
 *
 * Responde tres preguntas con datos reales:
 *  - ¿qué roles tienen candidatos pero no vacantes recientes?
 *  - ¿qué skills declaran los candidatos que ninguna vacante pide?
 *  - ¿a qué candidatos no les estamos mostrando buenas ofertas?
 *
 * Es una función pura sobre listas, así la usan igual el script `match-report` y las
 * pruebas; no toca la base.
 */

export interface ReportCandidate {
  username: string
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  workModality: string | null
}

export interface ReportVacancy {
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  workModality: string | null
  /** Cuándo entró; null si no se sabe. */
  createdAt: string | null
}

export type SupplyState = 'sin_vacantes' | 'pocas_vacantes' | 'sin_candidatos' | 'ok'
export type CandidateState = 'sin_ofertas' | 'pocas_ofertas' | 'ok'

export interface RoleRow {
  role: string
  candidates: number
  vacancies30d: number
  vacanciesTotal: number
  /** Días desde la última vacante de este rol; null si nunca hubo. */
  daysSinceLast: number | null
  state: SupplyState
}

export interface SkillRow {
  skill: string
  candidates: number
  vacancies30d: number
  state: 'candidatos_sin_oferta' | 'oferta_sin_candidatos' | 'ok'
}

export interface CandidateRow {
  username: string
  roleCategory: string | null
  goodMatches: number
  bestScore: number
  state: CandidateState
}

export interface MatchReport {
  roles: RoleRow[]
  skills: SkillRow[]
  candidates: CandidateRow[]
  summary: {
    candidates: number
    vacancies: number
    candidatesWithoutOffers: number
    candidatesWithFewOffers: number
    rolesWithoutVacancies: string[]
  }
}

export interface ReportOptions {
  now?: Date
  /** Cuántas ofertas buenas hacen falta para considerar que a alguien se le atiende bien. */
  goodMatches?: number
  /** Cuántas vacantes del mes por candidato son "pocas" en un rol. */
  vacanciesPerCandidate?: number
}

const DAY_MS = 86_400_000

export function buildMatchReport(
  candidates: ReportCandidate[],
  vacancies: ReportVacancy[],
  options: ReportOptions = {},
): MatchReport {
  const now = (options.now ?? new Date()).getTime()
  const goodMatches = options.goodMatches ?? 3
  const perCandidate = options.vacanciesPerCandidate ?? 3
  const isRecent = (vacancy: ReportVacancy) => !!vacancy.createdAt && now - new Date(vacancy.createdAt).getTime() <= 30 * DAY_MS

  // --- por rol
  const roleNames = new Set<string>()
  for (const candidate of candidates) if (candidate.roleCategory) roleNames.add(candidate.roleCategory)
  for (const vacancy of vacancies) if (vacancy.roleCategory) roleNames.add(vacancy.roleCategory)

  const roles: RoleRow[] = [...roleNames].map((role) => {
    const people = candidates.filter((c) => c.roleCategory === role).length
    const ofRole = vacancies.filter((v) => v.roleCategory === role)
    const recent = ofRole.filter(isRecent)
    const newest = ofRole.reduce<number | null>((max, v) => {
      const time = v.createdAt ? new Date(v.createdAt).getTime() : null
      return time !== null && (max === null || time > max) ? time : max
    }, null)

    let state: SupplyState = 'ok'
    if (people > 0 && recent.length === 0) state = 'sin_vacantes'
    else if (people > 0 && recent.length / people < perCandidate) state = 'pocas_vacantes'
    else if (people === 0 && recent.length > 0) state = 'sin_candidatos'

    return {
      role,
      candidates: people,
      vacancies30d: recent.length,
      vacanciesTotal: ofRole.length,
      daysSinceLast: newest === null ? null : Math.floor((now - newest) / DAY_MS),
      state,
    }
  })
  // Lo más urgente primero: roles con gente y sin vacantes, de más candidatos a menos.
  const urgency: Record<SupplyState, number> = { sin_vacantes: 0, pocas_vacantes: 1, sin_candidatos: 2, ok: 3 }
  roles.sort((a, b) => urgency[a.state] - urgency[b.state] || b.candidates - a.candidates || a.role.localeCompare(b.role))

  // --- por skill
  const declared = new Map<string, number>()
  for (const candidate of candidates) for (const skill of new Set(candidate.skills)) declared.set(skill, (declared.get(skill) ?? 0) + 1)
  const asked = new Map<string, number>()
  for (const vacancy of vacancies.filter(isRecent)) for (const skill of new Set(vacancy.skills)) asked.set(skill, (asked.get(skill) ?? 0) + 1)

  const skills: SkillRow[] = [...new Set([...declared.keys(), ...asked.keys()])].map((skill) => {
    const people = declared.get(skill) ?? 0
    const demand = asked.get(skill) ?? 0
    return {
      skill,
      candidates: people,
      vacancies30d: demand,
      state: people > 0 && demand === 0 ? 'candidatos_sin_oferta' : people === 0 && demand > 0 ? 'oferta_sin_candidatos' : 'ok',
    }
  })
  skills.sort((a, b) => {
    const order = { candidatos_sin_oferta: 0, oferta_sin_candidatos: 1, ok: 2 }
    return order[a.state] - order[b.state] || b.candidates - a.candidates || b.vacancies30d - a.vacancies30d
  })

  // --- por candidato
  const candidateRows: CandidateRow[] = candidates.map((candidate) => {
    let good = 0
    let best = 0
    for (const vacancy of vacancies) {
      const result = scoreMatch(
        { roleCategory: candidate.roleCategory, seniority: candidate.seniority, skills: candidate.skills, workModality: candidate.workModality },
        vacancy,
      )
      if (result.qualifies) good++
      if (result.score > best) best = result.score
    }
    return {
      username: candidate.username,
      roleCategory: candidate.roleCategory,
      goodMatches: good,
      bestScore: best,
      state: good === 0 ? 'sin_ofertas' : good < goodMatches ? 'pocas_ofertas' : 'ok',
    }
  })
  candidateRows.sort((a, b) => a.goodMatches - b.goodMatches || a.username.localeCompare(b.username))

  return {
    roles,
    skills,
    candidates: candidateRows,
    summary: {
      candidates: candidates.length,
      vacancies: vacancies.length,
      candidatesWithoutOffers: candidateRows.filter((c) => c.state === 'sin_ofertas').length,
      candidatesWithFewOffers: candidateRows.filter((c) => c.state === 'pocas_ofertas').length,
      rolesWithoutVacancies: roles.filter((r) => r.state === 'sin_vacantes').map((r) => r.role),
    },
  }
}
