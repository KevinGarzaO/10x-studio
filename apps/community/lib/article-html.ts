/**
 * El cuerpo de un artículo llega como texto plano en párrafos: los subtítulos vienen en MAYÚSCULAS ("¿CUÁL ES EL
 * PLOT TWIST?"), sin marca de título. Aquí se reconocen y se vuelven subtítulos de verdad, para que el artículo
 * tenga estructura y se pueda leer de un vistazo.
 */
const LETTER = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/

export function isCapsHeading(text: string): boolean {
  const clean = text.trim()
  if (clean.length < 4 || clean.length > 90 || !LETTER.test(clean)) return false
  if (/[.;]$/.test(clean)) return false
  return clean === clean.toUpperCase() && clean !== clean.toLowerCase()
}

/** Convierte los `<p>` que son solo un texto en mayúsculas en `<h2>`. No toca párrafos con etiquetas dentro. */
export function promoteCapsHeadings(html: string): string {
  return html.replace(/<p>([^<]*)<\/p>/g, (whole, inner: string) => (isCapsHeading(inner) ? `<h2>${inner.trim()}</h2>` : whole))
}

const plain = (text: string): string => text.replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()

/**
 * Si el cuerpo ya empieza con el mismo texto que el extracto, el extracto sobra: se leería dos veces seguidas.
 */
export function excerptRepeatsBody(excerpt: string | null | undefined, body: string | null | undefined): boolean {
  if (!excerpt || !body) return false
  const lead = plain(excerpt).slice(0, 40)
  return lead.length >= 12 && plain(body).startsWith(lead)
}
