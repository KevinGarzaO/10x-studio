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

/**
 * El color de cada tema de una lista, sin repetir mientras alcancen los colores. Cada tema parte
 * del color que le toca por su nombre y, si ya lo tiene otro tema de la lista, toma el siguiente
 * libre: así "python" y "ventas" nunca salen del mismo color. Con más temas que colores, se repiten.
 */
export function assignHues(names: string[]): Record<string, number> {
  const taken = new Set<number>()
  const hues: Record<string, number> = {}

  for (const name of names) {
    let hue = tagHue(name)
    if (taken.size < TAG_HUES) while (taken.has(hue)) hue = (hue + 1) % TAG_HUES
    taken.add(hue)
    hues[name] = hue
  }
  return hues
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

/** Un puesto en tendencia del sidebar, con su página en /puestos/<slug>. */
export interface SidebarRole {
  slug: string
  label: string
  /** Vacantes abiertas de este puesto (si el servidor las trae). */
  count?: number
}

/** Los puestos que se muestran mientras llegan los reales. */
export const DEFAULT_ROLES: SidebarRole[] = [
  { slug: 'fullstack', label: 'Full Stack' },
  { slug: 'backend', label: 'Backend' },
  { slug: 'frontend', label: 'Frontend' },
  { slug: 'devops', label: 'DevOps' },
]

/** A dónde lleva un tema: su página de empleos si es un skill, y si no, filtra el feed. */
export function tagHref(tag: SidebarTag): string | null {
  return tag.skill ? `/empleos/${encodeURIComponent(tag.name)}` : null
}
