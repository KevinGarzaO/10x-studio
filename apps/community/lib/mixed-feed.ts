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
  historyId: string
  isSaved: boolean
}

export type FeedEntry<P extends { id: string }> =
  | { kind: 'article'; key: string; post: P }
  | { kind: 'job'; key: string; post: P }
  | { kind: 'forYou'; key: string; item: MatchedItem }

export interface FeedSources<P extends { id: string }> {
  articles: P[]
  jobs: P[]
  /** Solo coincidencias reales; vacío si no hay sesión. */
  forYou: MatchedItem[]
  /** Si todavía hay más artículos / vacantes por traer del backend. */
  moreArticles: boolean
  moreJobs: boolean
}

// Un "Para ti" cada seis tarjetas, vacantes intercaladas y el resto artículos.
// El orden es fijo para que las tarjetas ya mostradas no se muevan al cargar más.
const CYCLE = ['forYou', 'article', 'job', 'article', 'job', 'article'] as const

/**
 * Mezcla artículos, vacantes y coincidencias "Para ti" en un solo feed.
 *
 * - Una vacante que ya sale como "Para ti" no se repite como vacante normal.
 * - Si a una fuente se le acaba lo cargado pero el backend aún tiene más, el feed
 *   se detiene ahí en vez de saltarla: así, al cargar la siguiente página, las
 *   tarjetas anteriores conservan su lugar. Si la fuente de verdad se agotó, se
 *   salta y el feed sigue con las demás.
 */
export function buildFeed<P extends { id: string }>(sources: FeedSources<P>): FeedEntry<P>[] {
  const matchedCommunityIds = new Set(
    sources.forYou.filter(item => item.sourceType === 'community').map(item => item.id),
  )

  const queues = {
    forYou: [...sources.forYou],
    article: [...sources.articles],
    job: sources.jobs.filter(job => !matchedCommunityIds.has(job.id)),
  }
  const hasMore = { forYou: false, article: sources.moreArticles, job: sources.moreJobs }

  const remaining = () => queues.forYou.length + queues.article.length + queues.job.length
  const out: FeedEntry<P>[] = []

  for (let slot = 0; remaining() > 0; slot++) {
    const kind = CYCLE[slot % CYCLE.length]

    if (queues[kind].length === 0) {
      if (hasMore[kind]) break
      continue
    }

    if (kind === 'forYou') {
      const item = queues.forYou.shift()!
      out.push({ kind, key: `forYou:${item.sourceType}:${item.id}`, item })
    } else {
      const post = queues[kind].shift()!
      out.push({ kind, key: `${kind}:${post.id}`, post })
    }
  }

  return out
}
