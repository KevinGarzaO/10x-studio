import type { SkillCatalog } from '@avocado/schemas'
import { unresolvedSkills } from './skill-catalog'

export type ProfileGateReason = 'missing_photo' | 'missing_fields' | 'unresolved_skills'

export interface GatedUser {
  account_type?: string | null
  /** Lo calcula la base (users.profile_completed). Puede faltar en respuestas viejas. */
  profile_completed?: boolean | null
  photo_url?: string | null
  title?: string | null
  role_category?: string | null
  seniority?: string | null
  skills?: string[] | null
  location?: string | null
  work_modality?: string | null
}

function blank(value: string | null | undefined): boolean {
  return !value || value.trim() === ''
}

/**
 * Por qué hay que mandar a esta cuenta a completar su perfil, o `null` si está
 * completo (FR-024, FR-025).
 *
 * Reglas por tipo de cuenta:
 * - **empresa**: solo la foto. El resto de sus datos los define la feature de
 *   registro de empresa; aquí no se le puede pedir un perfil de candidato.
 * - **candidato**: foto, los 6 campos del perfil profesional, y que todos sus
 *   skills estén en el catálogo aprobado (FR-015).
 *
 * `catalog` puede llegar vacío mientras carga o si falló: en ese caso NO se
 * reporta `unresolved_skills`, porque no se sabe qué es válido y expulsaría a
 * gente con el perfil correcto.
 */
export function profileGateReason(
  user: GatedUser | null | undefined,
  catalog: SkillCatalog,
): ProfileGateReason | null {
  if (!user) return null

  // La base dice cuándo un perfil está completo y el servidor es la fuente de
  // verdad: si dice que no, se manda a onboarding aunque las reglas de abajo no
  // encuentren el motivo (por ejemplo, si la base exige algo nuevo).
  return specificReason(user, catalog) ?? (user.profile_completed === false ? 'missing_fields' : null)
}

/** El motivo concreto, para poder explicarle a la persona qué le falta. */
function specificReason(user: GatedUser, catalog: SkillCatalog): ProfileGateReason | null {
  if (blank(user.photo_url)) return 'missing_photo'

  if (user.account_type === 'company') return null

  const skills = user.skills || []
  if (
    blank(user.title) ||
    blank(user.role_category) ||
    blank(user.seniority) ||
    blank(user.location) ||
    blank(user.work_modality) ||
    skills.length === 0
  ) {
    return 'missing_fields'
  }

  if (catalog.skills.length > 0 && unresolvedSkills(skills, catalog).length > 0) {
    return 'unresolved_skills'
  }

  return null
}
