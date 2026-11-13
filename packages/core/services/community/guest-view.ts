/**
 * Lo que se entrega de una vacante a quien NO tiene sesión (un visitante, un robot, un scraper) cuando la ve dentro de una lista:
 * el feed, el perfil de una empresa o de una persona.
 *
 * El detalle completo de una vacante ya exige sesión (GET /posts/:id). Las listas devolvían la fila completa (`select('*')`):
 * descripción, enlace de postulación, contactos y el texto original del scraper, así que cerrar solo el detalle no servía de nada.
 * Aquí se entrega lo que pinta una tarjeta del feed y nada más:
 *
 *  - Es una LISTA BLANCA: lo que no esté aquí no sale, aunque mañana se agregue una columna nueva con datos de contacto.
 *  - El contenido se reduce a las líneas de encabezado que la tarjeta lee (empresa, rol, ubicación, presupuesto, modalidad): sin
 *    descripción, requisitos, beneficios ni la sección de contacto.
 *  - Solo afecta a vacantes (`type = 'job'`) y solo sin sesión. Las discusiones y los artículos son públicos y no se tocan.
 */

/** Las líneas `**Empresa:** …` que la tarjeta del feed lee del contenido (mismos nombres que `parseJobContent` en la app). */
const HEADER_LINE = /\*\*(Empresa|Rol|Ubicaci[oó]n|Presupuesto|Modalidad):?\*\*/i

/** Los campos de una vacante que puede ver quien no tiene sesión. */
const GUEST_JOB_FIELDS = [
  'id', 'slug', 'title', 'type', 'company', 'company_logo', 'location', 'modalidad', 'budget', 'seniority_level', 'role_category', 'skills',
  'platform', 'is_scraper_post', 'image_url', 'created_at', 'updated_at', 'votes_count', 'comments_count', 'votesCount', 'commentsCount',
  'tags', 'author', 'stats', 'isSaved', 'historyId', 'hasVoted',
] as const

/** Solo las líneas de encabezado del contenido (sin descripción ni contacto). */
export function headerLinesOf(content: unknown): string {
  if (typeof content !== 'string') return ''
  return content.split('\n').map((line) => line.trim()).filter((line) => HEADER_LINE.test(line) && line.length <= 300).join('\n')
}

/** Una vacante tal como la ve quien no tiene sesión; cualquier otra publicación se devuelve igual. */
export function redactForGuest<T extends Record<string, any>>(post: T): T {
  if (!post || post.type !== 'job') return post
  const visible: Record<string, unknown> = {}
  for (const field of GUEST_JOB_FIELDS) if (field in post) visible[field] = post[field]
  visible.content = headerLinesOf(post.content)
  return visible as T
}

export const redactListForGuest = <T extends Record<string, any>>(posts: T[]): T[] => posts.map(redactForGuest)

/** Las publicaciones de un perfil (persona o empresa) con las vacantes ya reducidas, para quien no tiene sesión. */
export function redactProfileForGuest<T extends { community_posts?: Record<string, any>[] | null }>(profile: T): T {
  if (!profile || !Array.isArray(profile.community_posts)) return profile
  return { ...profile, community_posts: redactListForGuest(profile.community_posts) }
}
