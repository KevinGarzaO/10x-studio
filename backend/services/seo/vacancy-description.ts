/**
 * El texto de una vacante para los buscadores (la descripción del JSON-LD de Google for
 * Jobs). Es público, así que NUNCA lleva lo que el sitio guarda detrás del registro: la
 * sección de contacto (correo, teléfono, WhatsApp) y los datos de postulación.
 */

/** Las entidades HTML con las que el scraper guarda el texto. */
function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Líneas de la cabecera guardada ("**Empresa:** …"): ya salen en campos propios. */
const METADATA_LINE = /^\s*(\*\*(Empresa|Rol|Ubicaci[oó]n|Modalidad|Presupuesto|Departamento|Equipo)\b|🔗)/i

/** Cuántos caracteres de descripción se publican: suficiente para Google, sin volcar la oferta entera. */
export const MAX_DESCRIPTION_CHARS = 4000

/**
 * @returns la descripción como párrafos HTML (`<p>…</p>`), o null si no queda nada útil.
 */
export function seoDescription(raw: string | null | undefined, title: string): string | null {
  if (!raw) return null

  // 1. Todo lo que va del encabezado de contacto en adelante se descarta.
  let text = unescapeHtml(raw).replace(/\*{0,3}Contacto[\s\S]*/gi, '')

  // 2. Fuera las líneas de cabecera ("**Empresa:** …"): se reconocen por su marca de negritas,
  //    así que van ANTES de quitar el markdown.
  text = text
    .split('\n')
    .filter((line) => !METADATA_LINE.test(line))
    .join('\n')

  // 3. Fuera etiquetas HTML y marcas de markdown: queda texto plano, sin el título repetido.
  text = text
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*{1,3}/g, '')

  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '' && line !== title.trim())

  if (lines.length === 0) return null

  // 4. Texto plano recortado, cada línea como un párrafo (escapado: se inyecta en un script JSON).
  let used = 0
  const paragraphs: string[] = []
  for (const line of lines) {
    if (used >= MAX_DESCRIPTION_CHARS) break
    const piece = line.slice(0, MAX_DESCRIPTION_CHARS - used)
    paragraphs.push(`<p>${escapeHtml(piece)}</p>`)
    used += piece.length
  }
  return paragraphs.join('')
}
