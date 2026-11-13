import type { Seniority } from '@avocado/schemas'
import { classifyRole } from '../scraper/role-rules'
import { cleanVacancyText, vacancyTitle, vacancyBody, vacancyHeader } from './text'
import { inferSeniority } from './seniority'
import { inferModality, type VacancyModality } from './modality'
import { detectSkills, type SkillMatcher } from './skill-detect'

/** Lo que se sabe de una vacante al ingresarla. */
export interface VacancyInput {
  text: string
  location?: string | null
  /** Lo que declara la fuente: remote | hybrid | onsite | unknown. */
  work_modality?: string | null
}

/**
 * Los datos estructurados de una vacante: lo que la liga con candidatos, con
 * empresas y con los reportes. Todo sale del texto con reglas explícitas, no de un
 * modelo, así que es predecible y se puede probar.
 *
 * `null` y `unknown` significan "no se pudo saber", y se guardan tal cual: es más
 * útil que una suposición, porque el match sabe tratarlos con menos peso.
 */
export interface VacancyEnrichment {
  role_category: string | null
  seniority_level: Seniority | null
  skills: string[]
  work_modality: VacancyModality
}

export function enrichVacancy(input: VacancyInput, matchers: SkillMatcher[]): VacancyEnrichment {
  const clean = cleanVacancyText(input.text)
  const role = classifyRole(clean)

  return {
    role_category: role,
    seniority_level: inferSeniority(vacancyTitle(input.text), vacancyBody(input.text)),
    // El rol va primero: un skill que aparece una sola vez solo cuenta si es del rol.
    skills: detectSkills({ header: vacancyHeader(input.text), body: vacancyBody(input.text) }, matchers, role),
    work_modality: inferModality(input.work_modality, input.location, clean),
  }
}
