/**
 * El color de cada tema del sidebar. Es fijo por nombre: "python" es siempre del mismo color,
 * sin importar en qué orden lleguen ni cuántos haya, así la persona lo reconoce de un vistazo.
 * Los colores viven en globals.css (`.tag-hue-0` … `.tag-hue-7`).
 */
export const TAG_HUES = 8

export function tagHue(name: string): number {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % TAG_HUES
}

/** Una etiqueta del sidebar tal como la manda el backend. */
export interface SidebarTag {
  name: string
  /** Nombre para mostrar ("IA / Machine Learning"). */
  label: string
  /** Si el tema es un skill con página propia en /empleos/<name>. */
  skill: boolean
}

/** Los temas que se muestran mientras llegan los reales (o si el backend no responde). */
export const DEFAULT_TAGS: SidebarTag[] = ['python', 'sql', 'aws', 'react', 'ia', 'git'].map(name => ({ name, label: name, skill: true }))

/** A dónde lleva un tema: su página de empleos si es un skill, y si no, filtra el feed. */
export function tagHref(tag: SidebarTag): string | null {
  return tag.skill ? `/empleos/${encodeURIComponent(tag.name)}` : null
}
