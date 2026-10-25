/**
 * Reglas para publicar en la comunidad (discusiones y proyectos). Una sola definición, la misma que usa la ruta
 * y que se prueba aparte.
 *
 * Qué se puede publicar: `discussion` (una pregunta o tema) y `showcase` (un proyecto). Las vacantes (`job`)
 * las crea el scraper o el equipo; mientras el alta de empresas esté en pausa, nadie más las publica. Los
 * artículos (`editorial`) vienen del equipo editorial, no de los miembros.
 */
export const MEMBER_POST_TYPES = ['discussion', 'showcase'] as const
export type MemberPostType = (typeof MEMBER_POST_TYPES)[number]

export const TITLE_MIN = 8
export const TITLE_MAX = 140
export const CONTENT_MIN = 20
export const CONTENT_MAX = 10000
export const TAGS_MAX = 5
export const TAG_MAX_LENGTH = 30

/** Cuántas publicaciones puede hacer una persona por día: lo suficiente para participar, no para inundar el feed. */
export const POSTS_PER_DAY = 5

export interface PostInput {
  title?: unknown
  content?: unknown
  type?: unknown
  tags?: unknown
}

export type PostCheck =
  | { ok: true; clean: { title: string; content: string; type: MemberPostType; tags: string[] } }
  | { ok: false; errors: string[] }

/** Una etiqueta en minúsculas, sin espacios ni símbolos raros ("Node JS!" → "node-js"). */
export function normalizeTag(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^#+/, '')
    .replace(/[^a-z0-9+#.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_MAX_LENGTH)
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const item of raw) {
    const tag = normalizeTag(item)
    if (tag) seen.add(tag)
    if (seen.size >= TAGS_MAX) break
  }
  return [...seen]
}

export function validateMemberPost(input: PostInput): PostCheck {
  const errors: string[] = []

  const type = input.type
  if (!(MEMBER_POST_TYPES as readonly unknown[]).includes(type)) {
    errors.push('El tipo de publicación debe ser "discusión" o "proyecto".')
  }

  const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : ''
  if (title.length < TITLE_MIN) errors.push(`El título necesita al menos ${TITLE_MIN} caracteres.`)
  if (title.length > TITLE_MAX) errors.push(`El título no puede pasar de ${TITLE_MAX} caracteres.`)

  const content = typeof input.content === 'string' ? input.content.replace(/\r\n/g, '\n').trim() : ''
  if (content.length < CONTENT_MIN) errors.push(`El contenido necesita al menos ${CONTENT_MIN} caracteres.`)
  if (content.length > CONTENT_MAX) errors.push(`El contenido no puede pasar de ${CONTENT_MAX} caracteres.`)

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, clean: { title, content, type: type as MemberPostType, tags: normalizeTags(input.tags) } }
}
