/**
 * Texto de búsqueda seguro para los filtros de PostgREST: la coma y los paréntesis separan condiciones y
 * `%`, `*`, `_` y `\` son comodines, así que se quitan en lugar de dejar que quien escribe altere la consulta.
 */
export function sanitizeQuery(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[,()%*\\_"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** Sin acentos y en minúsculas, para comparar "Diseño" con "diseno". */
export const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Los puestos cuyo nombre contiene lo escrito (sin importar acentos). */
export function matchRoles<T extends { label: string }>(roles: T[], query: string): T[] {
  const needle = fold(query)
  if (needle.length < 2) return []
  return roles.filter((role) => fold(role.label).includes(needle))
}
