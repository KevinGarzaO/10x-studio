/**
 * Quiénes salen en "Usuarios destacados": personas reales con el perfil completo, ordenadas por lo que
 * muestran de verdad: skills validados con examen pesan más que skills declarados.
 */
export interface FeaturedCandidate {
  id: string
  username: string | null
  display_name: string | null
  photo_url: string | null
  role_category: string | null
  seniority: string | null
  skills: string[] | null
  created_at: string
}

export interface FeaturedUser {
  username: string
  displayName: string
  photoUrl: string | null
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  validatedSkills: number
}

export const VALIDATED_WEIGHT = 3
/** Más de esto en skills declarados no suma: el que lista 40 skills no es más destacado que el que lista 10. */
export const SKILLS_CAP = 10

export const featuredScore = (input: { skills: number; validated: number; hasPhoto: boolean }): number =>
  input.validated * VALIDATED_WEIGHT + Math.min(input.skills, SKILLS_CAP) + (input.hasPhoto ? 1 : 0)

/**
 * Ordena a los candidatos y devuelve los primeros. A igual puntaje va primero quien llegó más recientemente
 * (la comunidad se renueva). Quien lee la lista nunca se ve a sí mismo, y quien no tiene nombre de usuario
 * no tiene página a la que llevar y se omite.
 */
export function rankFeaturedUsers(input: {
  candidates: FeaturedCandidate[]
  validatedBy: Map<string, number>
  viewerId?: string | null
  limit: number
}): FeaturedUser[] {
  return input.candidates
    .filter((person) => person.id !== input.viewerId && !!person.username)
    .map((person) => {
      const skills = (person.skills ?? []).filter(Boolean)
      const validated = input.validatedBy.get(person.id) ?? 0
      return { person, skills, validated, score: featuredScore({ skills: skills.length, validated, hasPhoto: !!person.photo_url }) }
    })
    .sort((a, b) => b.score - a.score || b.person.created_at.localeCompare(a.person.created_at))
    .slice(0, input.limit)
    .map(({ person, skills, validated }) => ({
      username: person.username as string,
      displayName: person.display_name || (person.username as string),
      photoUrl: person.photo_url,
      roleCategory: person.role_category,
      seniority: person.seniority,
      skills: skills.slice(0, 3),
      validatedSkills: validated,
    }))
}
