/** Una vacante del scraper o de la comunidad que coincide con los skills de la persona. */
export interface MatchedItem {
  /** Cuánta gente abrió, guardó y se postuló a la vacante. */
  stats?: { views: number; saves: number; applies: number }
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
  /** Tus skills que pide la vacante y validaste con examen. */
  validatedSkills?: { skill: string; level: 'basico' | 'intermedio' | 'avanzado' }[]
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

/** Un artículo después de cada tantas vacantes: las vacantes mandan, los artículos las acompañan. */
export const ARTICLE_EVERY = 4

function timeOf(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : NaN
  // Sin fecha válida, al final: nunca se cuela entre lo reciente.
  return Number.isNaN(time) ? 0 : time
}

/**
 * Arma el feed en UN solo flujo. Las vacantes van en el orden que manda el servidor, que es el de popularidad
 * (más vistas, guardados y postulaciones primero; a igual interés, la más nueva). Este orden NO se vuelve a
 * ordenar por fecha: antes se mezclaba todo por fecha y la popularidad se perdía.
 *
 * - Las coincidencias "Para ti" van AL PRINCIPIO, de mayor a menor porcentaje de match (a igual porcentaje, la
 *   más reciente). Una vacante que ya sale como "Para ti" no se repite como vacante normal.
 * - Los artículos se reparten entre las vacantes: uno después de cada `ARTICLE_EVERY`, del más nuevo al más viejo.
 *   Los que sobran van al final cuando ya no hay más vacantes por cargar.
 *
 * Cada fuente llega por páginas y lo que ya se mostró no se mueve al cargar más: solo se agregan tarjetas al
 * final. Por eso, mientras falten artículos por cargar, las vacantes se muestran solo hasta el hueco del siguiente
 * artículo (que aún no llega), y los artículos sobrantes esperan a que no queden vacantes pendientes.
 */
export function buildFeed<P extends { id: string; created_at?: string | null }>(
  sources: FeedSources<P>,
): FeedEntry<P>[] {
  const matchedCommunityIds = new Set(
    sources.forYou.filter(item => item.sourceType === 'community').map(item => item.id),
  )

  const forYou: FeedEntry<P>[] = [...sources.forYou]
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || timeOf(b.postDate) - timeOf(a.postDate))
    .map(item => ({ kind: 'forYou', key: `forYou:${item.sourceType}:${item.id}`, item }))

  const articles = [...sources.articles].sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at))
  let jobs = sources.jobs.filter(post => !matchedCommunityIds.has(post.id))

  // Con artículos por cargar, no se pasa del hueco del siguiente artículo: ese lugar ya está reservado.
  if (sources.moreArticles) jobs = jobs.slice(0, (articles.length + 1) * ARTICLE_EVERY)

  const flow: FeedEntry<P>[] = []
  let nextArticle = 0
  jobs.forEach((post, index) => {
    flow.push({ kind: 'job', key: `job:${post.id}`, post })
    if ((index + 1) % ARTICLE_EVERY === 0 && nextArticle < articles.length) {
      const article = articles[nextArticle++]
      flow.push({ kind: 'article', key: `article:${article.id}`, post: article })
    }
  })

  // Los artículos que sobran, al final, solo cuando ya no puede llegar otra vacante que los desplace.
  if (!sources.moreJobs) {
    for (; nextArticle < articles.length; nextArticle++) {
      const article = articles[nextArticle]
      flow.push({ kind: 'article', key: `article:${article.id}`, post: article })
    }
  }

  return [...forYou, ...flow]
}
