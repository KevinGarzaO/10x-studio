import { supabase } from '../supabase.service'
import { PUBLIC_ROLES, roleSlug } from '../seo/role-slug'
import { normalizeTag } from './post-rules'

/**
 * Las etiquetas de una publicación no son libres: solo existen los puestos (`backend`, `ux-ui`…) y los skills del
 * catálogo. Así cada etiqueta lleva a algo real (una página de vacantes) y no se llena de variantes ("react", "reactjs",
 * "React!").
 */
export async function loadAllowedTags(): Promise<Set<string>> {
  const allowed = new Set<string>(PUBLIC_ROLES.map(role => roleSlug(role)))
  const { data } = await supabase.from('skills').select('name')
  for (const row of (data ?? []) as { name: string }[]) {
    const tag = normalizeTag(row.name)
    if (tag) allowed.add(tag)
  }
  return allowed
}

/** Las etiquetas que no están en la lista permitida. */
export const findInvalidTags = (tags: string[], allowed: Set<string>): string[] => tags.filter(tag => !allowed.has(tag))
