/**
 * Detecta qué skills del catálogo aparecen en el texto de una vacante.
 *
 * Los términos de cada skill vienen de la base (`skills.detect_terms`), así que un
 * skill nuevo se detecta sin desplegar código. Si un skill aún no tiene términos, se
 * usa su etiqueta y su nombre.
 */

export interface DetectableSkill {
  name: string
  label: string
  /** Términos de detección; un `=` al inicio los hace sensibles a mayúsculas. */
  detect_terms?: string[] | null
  /** Roles a los que pertenece el skill (skills.role_categories). */
  role_categories?: string[] | null
}

export interface SkillMatcher {
  name: string
  /** Términos que cuentan en cualquier parte del texto. */
  patterns: RegExp[]
  /** Términos que solo cuentan en la cabecera (título o departamento). */
  headerOnly: RegExp[]
  roleCategories: string[]
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Palabra completa: ni letra, ni número, ni guion bajo pegados a los lados. */
function toPattern(term: string): RegExp | null {
  const caseSensitive = term.startsWith('=')
  const raw = (caseSensitive ? term.slice(1) : term).trim()
  if (!raw) return null

  // El guion bajo y la ñ cuentan como parte de la palabra; un término que empieza o
  // termina en símbolo (".net", "c++", "c#") solo exige límite del lado que es palabra.
  const startsWord = /^[\p{L}\p{N}]/u.test(raw)
  const endsWord = /[\p{L}\p{N}]$/u.test(raw)
  const before = startsWord ? '(?<![\\p{L}\\p{N}_])' : '(?<![\\p{L}\\p{N}_])'
  const after = endsWord ? '(?![\\p{L}\\p{N}_])' : '(?![\\p{L}\\p{N}_+#])'
  return new RegExp(`${before}${escapeRegex(raw)}${after}`, caseSensitive ? 'u' : 'iu')
}

/** Los términos efectivos de un skill: los suyos, o su etiqueta y nombre si no tiene. */
export function termsFor(skill: DetectableSkill): string[] {
  const own = (skill.detect_terms || []).filter((term) => term.trim() !== '')
  if (own.length > 0) return own
  return [skill.label, skill.name.replace(/-/g, ' ')]
}

const isPattern = (pattern: RegExp | null): pattern is RegExp => pattern !== null

export function buildSkillMatchers(skills: DetectableSkill[]): SkillMatcher[] {
  return skills.map((skill) => {
    const terms = termsFor(skill)
    return {
      name: skill.name,
      patterns: terms.filter((term) => !term.startsWith('^')).map(toPattern).filter(isPattern),
      headerOnly: terms.filter((term) => term.startsWith('^')).map((term) => toPattern(term.slice(1))).filter(isPattern),
      roleCategories: skill.role_categories || [],
    }
  })
}

/** Cuántas veces aparece el skill en un texto, sumando los términos dados. */
function mentions(text: string, patterns: RegExp[]): number {
  if (!text) return 0
  let total = 0
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    total += text.match(global)?.length ?? 0
  }
  return total
}

/**
 * Los skills que de verdad pide una vacante, en el orden del catálogo y sin repetir.
 *
 * Un nombre suelto en medio del texto casi nunca es un requisito: las descripciones
 * de empresa dicen "modelo de negocio AI-first", listan clientes ("incluyendo
 * GitHub, Yelp..."), hablan de beneficios ("payroll, seguros") o del proceso
 * ("our recruiting team"). Por eso se pide más evidencia según qué tan creíble sea el
 * skill para ese puesto:
 *  - en la cabecera (título o departamento): siempre cuenta, dice qué puesto es;
 *  - un skill DEL ROL de la vacante: una mención en el cuerpo basta (un Python suelto
 *    en un puesto de backend sí);
 *  - rol desconocido: dos menciones;
 *  - un skill que NO es del rol (recruiting en un puesto de ingeniería): tres.
 */
export function detectSkills(
  parts: { header: string; body: string },
  matchers: SkillMatcher[],
  roleCategory: string | null = null,
): string[] {
  return matchers
    .filter((matcher) => {
      if (mentions(parts.header, [...matcher.patterns, ...matcher.headerOnly]) > 0) return true
      const inBody = mentions(parts.body, matcher.patterns)
      if (!roleCategory) return inBody >= 2
      return inBody >= (matcher.roleCategories.includes(roleCategory) ? 1 : 3)
    })
    .map((matcher) => matcher.name)
}
