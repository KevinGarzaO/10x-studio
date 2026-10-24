/**
 * Cuántos skills se le recomienda tener a una persona. Es una recomendación, nunca un requisito: el
 * perfil se puede guardar con menos (la regla obligatoria sigue siendo "al menos uno").
 *
 * Con pocos skills la persona comparte pocos con las vacantes, y el match sale bajo o no sale: es lo
 * que se vio en los datos del panel.
 */
export const RECOMMENDED_SKILLS = 5

/** Cuántos skills faltan para llegar a la recomendación (0 si ya los tiene). */
export function skillsMissing(count: number): number {
  return Math.max(0, RECOMMENDED_SKILLS - count)
}

/** El texto de ayuda junto al selector de skills. */
export function skillsRecommendation(count: number): string {
  const missing = skillsMissing(count)
  if (missing === 0) return `Tienes ${count} skills: con eso te llegan más vacantes que encajan.`
  return `Te recomendamos agregar al menos ${RECOMMENDED_SKILLS} skills (llevas ${count}). No es obligatorio, pero con más skills te llegan más vacantes que encajan.`
}

/** Si en el feed se le muestra el aviso: solo a personas con cuenta de candidato y menos skills de los recomendados. */
export function shouldNudgeSkills(user: { account_type?: string | null; skills?: unknown } | null | undefined): boolean {
  if (!user) return false
  if (user.account_type && user.account_type !== 'candidate') return false
  const count = Array.isArray(user.skills) ? user.skills.length : 0
  return count < RECOMMENDED_SKILLS
}
