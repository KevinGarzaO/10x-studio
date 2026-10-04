/** Una vacante del scraper o de la comunidad que coincide con los skills de la persona. */
export interface MatchedItem {
  sourceType: 'scraper' | 'community'
  id: string
  title: string
  company: string | null
  companyLogo: string | null
  roleCategory: string | null
  seniorityLevel: string | null
  skills: string[]
  url: string
  postDate: string | null
  matchingSkills: number
  /** Cuáles de tus skills pide la vacante (en el nombre del catálogo). */
  sharedSkills?: string[]
  /** 0 a 100: qué tan bien encaja contigo. Puede faltar si el backend es anterior. */
  matchScore?: number
  /** Qué tan cerca está el rol de la vacante del tuyo. */
  roleFit?: 'exact' | 'adjacent' | 'unknown' | 'none'
  modalidad?: string | null
  seniorityFit?: string
  modalityFit?: string
  historyId: string
  isSaved: boolean
}

export type FeedEntry<P extends { id: string }> =
  | { kind: 'article'; key: string; post: P }
  | { kind: 'job'; key: string; post: P }
  | { kind: 'forYou'; key: string; item: MatchedItem }

export interface FeedSources<P extends { id: string; created_at?: string | null }> {
  articles: P[]
  jobs: P[]
  /** Solo coincidencias reales; vacío si no hay sesión. */
  forYou: MatchedItem[]
  /** Si todavía hay más artículos / vacantes por traer del backend. */
  moreArticles: boolean
  moreJobs: boolean
}

type Dated<T> = { time: number; order: number; entry: T }

function timeOf(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : NaN
  // Sin fecha válida, al final: nunca se cuela entre lo reciente.
  return Number.isNaN(time) ? 0 : time
}

/**
 * Mezcla artículos, vacantes y coincidencias "Para ti" en UN solo feed, de lo más
 * nuevo a lo más antiguo.
 *
 * Cada fuente llega por páginas, así que no se puede ordenar solo lo cargado:
 * si la página 2 de las vacantes trae algo más nuevo que lo último que se cargó
 * de los artículos, las tarjetas ya mostradas tendrían que moverse. Por eso solo
 * se muestra lo que ya no puede ser superado por algo sin cargar: una fuente con
 * más páginas pendientes sabe que lo que falta es más viejo que lo último que
 * trajo, y el feed se corta ahí (el "frente") hasta que cargue más. Al cargar más
 * solo se agregan tarjetas al final; las anteriores conservan su lugar.
 *
 * Una vacante que ya sale como "Para ti" no se repite como vacante normal.
 *
 * Las "Para ti" van AL PRINCIPIO, de mayor a menor porcentaje de match (a igual
 * porcentaje, la más reciente): son lo que la persona más quiere ver. Siempre llegan
 * completas, así que ponerlas arriba no mueve nada al cargar más.
 */
export function buildFeed<P extends { id: string; created_at?: string | null }>(
  sources: FeedSources<P>,
): FeedEntry<P>[] {
  const matchedCommunityIds = new Set(
    sources.forYou.filter(item => item.sourceType === 'community').map(item => item.id),
  )

  const items: Dated<FeedEntry<P>>[] = []
  let order = 0

  for (const post of sources.articles) {
    items.push({ time: timeOf(post.created_at), order: order++, entry: { kind: 'article', key: `article:${post.id}`, post } })
  }
  for (const post of sources.jobs) {
    if (matchedCommunityIds.has(post.id)) continue
    items.push({ time: timeOf(post.created_at), order: order++, entry: { kind: 'job', key: `job:${post.id}`, post } })
  }
  const forYou: FeedEntry<P>[] = [...sources.forYou]
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || timeOf(b.postDate) - timeOf(a.postDate))
    .map(item => ({ kind: 'forYou', key: `forYou:${item.sourceType}:${item.id}`, item }))

  // Más nuevo primero; a igual fecha, se respeta el orden en que llegó cada fuente.
  items.sort((a, b) => b.time - a.time || a.order - b.order)

  // El frente: de cada fuente con páginas pendientes, lo más viejo que ya trajo.
  // Todo lo más nuevo que el más reciente de esos límites es seguro de mostrar.
  const limits: number[] = []
  if (sources.moreArticles) limits.push(oldestOf(sources.articles))
  if (sources.moreJobs) limits.push(oldestOf(sources.jobs))
  const frontier = limits.length > 0 ? Math.max(...limits) : -Infinity

  return [...forYou, ...items.filter(item => item.time >= frontier).map(item => item.entry)]
}

/** La fecha más vieja que ya se trajo de una fuente; Infinity si no trajo nada. */
function oldestOf<P extends { created_at?: string | null }>(posts: P[]): number {
  if (posts.length === 0) return Infinity
  return Math.min(...posts.map(post => timeOf(post.created_at)))
}
