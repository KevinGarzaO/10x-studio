/**
 * Limpieza del texto de una vacante antes de analizarla.
 *
 * El scraper guarda la descripción con el HTML escapado ("&lt;p&gt;At Lyft...&lt;/p&gt;"),
 * y buscar skills o roles sobre eso mezcla etiquetas con contenido. Aquí se decodifica,
 * se quitan las etiquetas y se normalizan los espacios; la primera línea sigue siendo el
 * título.
 */

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '-',
  '&mdash;': '-',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&(lt|gt|amp|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|ldquo|rdquo|#39|#x27);/gi, (match) => ENTITIES[match.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

/**
 * El texto de la vacante listo para analizar: sin HTML, con las entidades
 * decodificadas. Se decodifica dos veces porque el texto llega escapado y a veces
 * con las entidades escapadas otra vez ("&amp;lt;").
 */
export function cleanVacancyText(text: string | null | undefined): string {
  if (!text) return ''
  const decoded = decodeEntities(decodeEntities(text))
  return decoded
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** El título de la vacante: su primera línea, sin los `#` de markdown. */
export function vacancyTitle(text: string | null | undefined): string {
  return (cleanVacancyText(text).split('\n')[0] || '').replace(/^#+\s*/, '').trim()
}

/**
 * La cabecera de la vacante: el título y su departamento. Es lo que dice QUÉ puesto
 * es, a diferencia del cuerpo, que mezcla requisitos con texto de la empresa.
 */
export function vacancyHeader(text: string | null | undefined): string {
  const clean = cleanVacancyText(text)
  const department = /\*\*Departamento:\*\*\s*([^\n]+)/i.exec(clean)?.[1] || ''
  return `${vacancyTitle(text)}\n${department}`.trim()
}

/** El cuerpo: todo lo que sigue al título. */
export function vacancyBody(text: string | null | undefined): string {
  const lines = cleanVacancyText(text).split('\n')
  return lines.slice(1).join('\n').trim()
}
