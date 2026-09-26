import { z } from 'zod'

/** Máximo de caracteres del texto que alguien puede proponer como skill. */
export const MAX_SKILL_TEXT_LENGTH = 50

/** Propuestas pendientes que un candidato puede acumular a la vez (FR-019). */
export const MAX_PENDING_PROPOSALS = 5

/**
 * Clave canónica de un skill, para comparar "React.js", "reactjs" y "React"
 * como lo mismo.
 *
 * `+` y `#` se conservan a propósito: sin ellos `C`, `C++` y `C#` colapsarían
 * en la misma clave y serían el mismo skill (FR-011).
 *
 * Tiene un gemelo en SQL, `normalize_skill_key()`, porque la base de datos
 * necesita la misma clave para su índice de unicidad; un test de integración
 * compara ambas implementaciones.
 */
export function normalizeSkillKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#]/g, '')
}

export interface CatalogSkill {
  name: string
  label: string
}

export interface CatalogAlias {
  alias: string
  skillName: string
}

export interface SkillCatalog {
  skills: CatalogSkill[]
  aliases: CatalogAlias[]
}

/**
 * Resuelve texto escrito por una persona a un skill aprobado del catálogo, o
 * `null` si no corresponde a ninguno (FR-013).
 *
 * El orden importa: el nombre canónico gana sobre la etiqueta, y la etiqueta
 * sobre un alias, para que un alias mal capturado nunca tape a un skill real.
 */
export function resolveSkill(text: string, catalog: SkillCatalog): CatalogSkill | null {
  const key = normalizeSkillKey(text)
  if (!key) return null

  const byName = catalog.skills.find((skill) => normalizeSkillKey(skill.name) === key)
  if (byName) return byName

  const byLabel = catalog.skills.find((skill) => normalizeSkillKey(skill.label) === key)
  if (byLabel) return byLabel

  const alias = catalog.aliases.find((entry) => normalizeSkillKey(entry.alias) === key)
  if (alias) {
    return catalog.skills.find((skill) => skill.name === alias.skillName) ?? null
  }

  return null
}

/**
 * Texto de una propuesta de skill nuevo. El backend es la autoridad, pero el
 * frontend valida con este mismo schema antes de enviar (principio I).
 */
export const skillProposalSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre del skill')
    .max(MAX_SKILL_TEXT_LENGTH, `Máximo ${MAX_SKILL_TEXT_LENGTH} caracteres`)
    .refine((value) => normalizeSkillKey(value).length > 0, {
      message: 'El nombre debe tener al menos una letra o número',
    }),
})

export type SkillProposalInput = z.infer<typeof skillProposalSchema>
