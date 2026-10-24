/**
 * Utilidades para registrar publicaciones de LinkedIn y etiquetar sus links.
 *
 * La idea: cada publicación tiene un código utm_content único. El link que se
 * pega en la publicación lleva ese código, y por eso las visitas y registros
 * que llegan con él se asocian a esa publicación en el reporte
 * (vista acquisition_by_post).
 */

/** Campaña por defecto de los links registrados a mano. */
export const TRACKED_CAMPAIGN_DEFAULT = 'linkedin-manual'

/** Campaña que ya usan los links que etiqueta el panel al publicar. */
export const STUDIO_CAMPAIGN = 'release_1_0_0'

/** Start of the current calendar week, Monday 00:00 in Monterrey. */
export function monterreyWeekStart(now: Date = new Date()): string {
  const timeZone = 'America/Monterrey'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const localDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)))
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday)

  const localMidnight = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate())
  const offsetAt = (timestamp: number) => {
    const zonedParts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
    const zoned = Object.fromEntries(zonedParts.map(({ type, value }) => [type, value]))
    return Date.UTC(
      Number(zoned.year),
      Number(zoned.month) - 1,
      Number(zoned.day),
      Number(zoned.hour),
      Number(zoned.minute),
      Number(zoned.second),
    ) - timestamp
  }

  let start = localMidnight
  for (let attempt = 0; attempt < 2; attempt++) start = localMidnight - offsetAt(start)
  return new Date(start).toISOString()
}

/** Texto plano usable en un código: "5 Tips Seniors" -> "5-tips-seniors". */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}`
}

function rand4(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0')
}

/**
 * Código único por publicación: slug del título + fecha + aleatorio.
 * Dos publicaciones con el mismo título no chocan (el aleatorio las separa),
 * y el UNIQUE de la tabla es el respaldo final.
 */
export function makeUtmContent(
  label: string,
  now: Date = new Date(),
  rand: () => string = rand4,
): string {
  const slug = slugify(label)
  return slug ? `${slug}-${stamp(now)}-${rand()}` : `post-${stamp(now)}-${rand()}`
}

/**
 * Link listo para pegar en la publicación: el destino con los UTMs de
 * LinkedIn y el código de esta publicación. Lanza si la URL no es válida.
 */
export function trackedUrl(destination: string, campaign: string, content: string): string {
  const url = new URL(destination)
  url.searchParams.set('utm_source', 'linkedin')
  url.searchParams.set('utm_medium', 'social')
  url.searchParams.set('utm_campaign', campaign || TRACKED_CAMPAIGN_DEFAULT)
  url.searchParams.set('utm_content', content)
  return url.toString()
}

/** Primer renglón con texto, cortado, para usar de etiqueta. */
export function labelFromText(text: string, max = 60): string {
  const line = text
    .split('\n')
    .map(l => l.trim())
    .find(Boolean) || ''
  if (line.length <= max) return line
  return `${line.slice(0, max - 1).trimEnd()}…`
}

/** Primer link a nuestros sitios en el texto del post, si hay. */
export function firstSiteUrl(text: string): string | null {
  const match = text.match(
    /https?:\/\/(?:avotalent\.io|avocado(?:-studio)?\.vercel\.app|community\.avotalent\.io)[^\s)]*/gi,
  )
  return match ? match[0] : null
}
