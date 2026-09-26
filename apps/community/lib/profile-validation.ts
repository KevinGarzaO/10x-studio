import { buildCandidateProfileSchema, type SkillCatalog } from '@avocado/schemas'

export interface ProfileValidationError {
  field: string | null
  message: string
}

/**
 * Valida el perfil con el MISMO schema que usa el backend (principio I), contra
 * el catálogo que ya cargó la pantalla. Sirve para mostrar el error en el propio
 * formulario en vez de esperar el rechazo del servidor (FR-027).
 *
 * El backend vuelve a validar siempre: esto no lo sustituye.
 */
export function validateCandidateProfile(
  payload: unknown,
  catalog: SkillCatalog,
): ProfileValidationError | null {
  const schema = buildCandidateProfileSchema(catalog.skills.map(skill => skill.name))
  const parsed = schema.safeParse(payload)
  if (parsed.success) return null

  const issue = parsed.error.issues[0]
  return {
    field: typeof issue.path[0] === 'string' ? issue.path[0] : null,
    message: issue.message,
  }
}

/** Mensaje amable para cada campo obligatorio vacío. */
export const REQUIRED_FIELD_MESSAGES: Record<string, string> = {
  title: 'Tu título profesional es obligatorio',
  roleCategory: 'Elige tu categoría de rol',
  seniority: 'Elige tu nivel',
  skills: 'Elige al menos un skill del catálogo',
  location: 'Tu ubicación es obligatoria',
  workModality: 'Elige tu modalidad',
  photo: 'Tu foto de perfil es obligatoria',
}

export function messageForField(error: ProfileValidationError): string {
  if (error.field && REQUIRED_FIELD_MESSAGES[error.field]) {
    return REQUIRED_FIELD_MESSAGES[error.field]
  }
  return error.message
}
