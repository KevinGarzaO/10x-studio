import { modalityFromLabel, type VacancyModality } from '../vacancies/modality'

/**
 * Qué tan bien encaja una vacante con una persona.
 *
 * Reemplaza el criterio anterior de "mismo rol y mismo nivel, exactos": dejaba fuera a
 * un fullstack que busca una vacante de backend con sus mismos skills, y mostraba como
 * match una vacante sin un solo skill en común. Ahora cada dimensión suma puntos, y el
 * resultado dice POR QUÉ encaja para poder mostrarlo y medirlo.
 *
 * Es una función pura: no toca la base, así la usan igual el endpoint "Para ti", el
 * reporte de huecos y las pruebas.
 */

/** El nivel que sacó la persona en el examen de un skill. */
export type ValidationLevel = 'basico' | 'intermedio' | 'avanzado'

export interface MatchCandidate {
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  /** Lo que la persona eligió: "Remoto", "Híbrido" o "Presencial". */
  workModality: string | null
  /** Skills validados con examen (nombre en minúsculas -> nivel). Opcional. */
  validatedSkills?: Record<string, ValidationLevel>
}

export interface MatchVacancy {
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  /** Como la guarda la vacante: "Remoto"… o remote | hybrid | onsite | unknown. */
  workModality: string | null
}

export type RoleFit = 'exact' | 'adjacent' | 'unknown' | 'none'
export type SeniorityFit = 'exact' | 'near' | 'unknown' | 'far'
export type ModalityFit = 'match' | 'compatible' | 'unknown' | 'mismatch'

export interface MatchResult {
  /** 0 a 100. */
  score: number
  role: RoleFit
  seniority: SeniorityFit
  modality: ModalityFit
  /** Los skills de la persona que la vacante pide. */
  sharedSkills: string[]
  /** De esos, los que la persona validó con examen, con su nivel. */
  validatedSkills: { skill: string; level: ValidationLevel }[]
  /** Cuántos skills se detectaron en la vacante (0 = no se sabe qué pide). */
  vacancySkills: number
  /** ¿Vale la pena mostrársela? */
  qualifies: boolean
}

/** Roles cercanos: quien busca uno puede encajar en el otro, con menos puntos. */
const ADJACENT_ROLES: Record<string, string[]> = {
  frontend: ['fullstack', 'ux_ui'],
  backend: ['fullstack', 'devops', 'data_engineer'],
  fullstack: ['frontend', 'backend', 'mobile'],
  mobile: ['fullstack', 'frontend'],
  devops: ['backend'],
  data_engineer: ['data_scientist', 'backend'],
  data_scientist: ['data_engineer'],
  qa: ['fullstack'],
  ux_ui: ['frontend', 'product'],
  product: ['ux_ui', 'marketing'],
  marketing: ['product', 'ventas'],
  recursos_humanos: ['administracion'],
  administracion: ['recursos_humanos', 'finanzas', 'legal'],
  ventas: ['marketing', 'customer_support'],
  customer_support: ['ventas'],
  legal: ['administracion'],
  finanzas: ['administracion'],
}

const SENIORITY_RANK: Record<string, number> = { junior: 0, semi_senior: 1, senior: 2 }

/** Peso de cada dimensión; suman 100. */
export const WEIGHTS = { role: 35, skills: 28, validation: 7, seniority: 15, modality: 15 } as const

/**
 * Cuánto vale un skill según lo validado: un examen avanzado pesa lo de un skill
 * completo; uno básico, la mitad. Un skill sin examen no suma al bonus (sí a "skills").
 */
export const VALIDATION_WEIGHT: Record<ValidationLevel, number> = { basico: 0.5, intermedio: 0.8, avanzado: 1 }

/** Cuántos skills pedidos bastan para considerar cubierta la parte de skills. */
const SKILLS_FULL_COVERAGE = 4

/** Puntaje mínimo para mostrar una vacante en "Para ti". */
export const MIN_SCORE = 42

function roleFit(candidate: string | null, vacancy: string | null): RoleFit {
  if (!vacancy) return 'unknown'
  if (!candidate) return 'none'
  if (candidate === vacancy) return 'exact'
  return ADJACENT_ROLES[candidate]?.includes(vacancy) ? 'adjacent' : 'none'
}

function seniorityFit(candidate: string | null, vacancy: string | null): SeniorityFit {
  if (!candidate || !vacancy || !(candidate in SENIORITY_RANK) || !(vacancy in SENIORITY_RANK)) return 'unknown'
  const gap = Math.abs(SENIORITY_RANK[candidate] - SENIORITY_RANK[vacancy])
  return gap === 0 ? 'exact' : gap === 1 ? 'near' : 'far'
}

/** Candidato remoto: lo remoto es ideal, lo híbrido casi, lo presencial no. Y así por cada preferencia. */
const MODALITY_TABLE: Record<Exclude<VacancyModality, 'unknown'>, Record<Exclude<VacancyModality, 'unknown'>, ModalityFit>> = {
  remote: { remote: 'match', hybrid: 'compatible', onsite: 'mismatch' },
  hybrid: { remote: 'compatible', hybrid: 'match', onsite: 'compatible' },
  onsite: { remote: 'mismatch', hybrid: 'compatible', onsite: 'match' },
}

function modalityFit(candidate: string | null, vacancy: string | null): ModalityFit {
  const wanted = modalityFromLabel(candidate)
  const offered = modalityFromLabel(vacancy)
  if (wanted === 'unknown' || offered === 'unknown') return 'unknown'
  return MODALITY_TABLE[wanted][offered]
}

const POINTS = {
  role: { exact: 1, adjacent: 0.5, unknown: 0.3, none: 0 },
  seniority: { exact: 1, near: 0.5, unknown: 0.55, far: 0 },
  modality: { match: 1, compatible: 0.6, unknown: 0.5, mismatch: 0 },
} as const

export function scoreMatch(candidate: MatchCandidate, vacancy: MatchVacancy): MatchResult {
  const role = roleFit(candidate.roleCategory, vacancy.roleCategory)
  const seniority = seniorityFit(candidate.seniority, vacancy.seniority)
  const modality = modalityFit(candidate.workModality, vacancy.workModality)

  const mine = new Set(candidate.skills)
  const sharedSkills = vacancy.skills.filter((skill) => mine.has(skill))
  const vacancySkills = vacancy.skills.length

  // Si no se sabe qué skills pide la vacante no se castiga ni se premia del todo: es
  // falta de dato, no falta de encaje.
  let skillsPoints: number
  if (vacancySkills === 0) skillsPoints = candidate.skills.length > 0 ? 0.3 : 0
  else skillsPoints = Math.min(1, sharedSkills.length / Math.min(vacancySkills, SKILLS_FULL_COVERAGE))

  // Bonus por lo validado con examen, medido contra los mismos skills que cubren la parte
  // de "skills". Un skill declarado y uno aprobado ya no valen igual.
  const validatedSkills = sharedSkills.flatMap((skill) => {
    const level = candidate.validatedSkills?.[skill]
    return level ? [{ skill, level }] : []
  })
  const validationPoints =
    vacancySkills === 0
      ? 0
      : Math.min(
          1,
          validatedSkills.reduce((sum, item) => sum + VALIDATION_WEIGHT[item.level], 0) / Math.min(vacancySkills, SKILLS_FULL_COVERAGE),
        )

  const score = Math.round(
    WEIGHTS.role * POINTS.role[role] +
      WEIGHTS.skills * skillsPoints +
      WEIGHTS.validation * validationPoints +
      WEIGHTS.seniority * POINTS.seniority[seniority] +
      WEIGHTS.modality * POINTS.modality[modality],
  )

  // Se muestra si hay algo concreto en común: al menos un skill; o, cuando la vacante
  // no dice qué skills pide, que el rol sea el mismo. Y que el puntaje alcance.
  const concrete = sharedSkills.length > 0 || (vacancySkills === 0 && role === 'exact')
  const qualifies = concrete && score >= MIN_SCORE && role !== 'none'

  return { score, role, seniority, modality, sharedSkills, validatedSkills, vacancySkills, qualifies }
}
