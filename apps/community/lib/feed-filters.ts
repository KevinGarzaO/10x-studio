import { RECOMMENDED_SKILLS } from './skills-recommendation'

/** Qué se ve en el feed: todo, lo que encaja contigo, solo vacantes o solo discusiones. */
export type FeedView = 'all' | 'forYou' | 'jobs' | 'posts'

export interface FeedFilters {
  view: FeedView
  /** Solo vacantes remotas. */
  remote: boolean
  /** Solo vacantes de tu nivel. */
  myLevel: boolean
}

export const DEFAULT_FILTERS: FeedFilters = { view: 'all', remote: false, myLevel: false }

export const isRemote = (modalidad: string | null | undefined): boolean => !!modalidad && /remot/i.test(modalidad)

interface VacancyLike { modalidad?: string | null; seniority_level?: string | null }
interface ForYouLike { modalidad?: string | null; seniorityLevel?: string | null }

/**
 * Aplica los filtros del feed a las tres fuentes. "Remoto" y "Mi nivel" son filtros de vacantes: al encenderlos las
 * discusiones se esconden (no tienen modalidad ni nivel). Pura: no toca nada fuera de lo que recibe.
 */
export function applyFeedFilters<A, J extends VacancyLike, F extends ForYouLike>(
  input: { articles: A[]; jobs: J[]; forYou: F[] },
  filters: FeedFilters,
  seniority: string | null | undefined,
): { articles: A[]; jobs: J[]; forYou: F[] } {
  const vacancyFilters = filters.remote || filters.myLevel
  const keepJob = (modalidad: string | null | undefined, level: string | null | undefined) =>
    (!filters.remote || isRemote(modalidad)) && (!filters.myLevel || !seniority || level === seniority)

  const jobs = input.jobs.filter(job => keepJob(job.modalidad, job.seniority_level))
  const forYou = input.forYou.filter(item => keepJob(item.modalidad, item.seniorityLevel))

  switch (filters.view) {
    case 'forYou': return { articles: [], jobs: [], forYou }
    case 'jobs': return { articles: [], jobs, forYou }
    case 'posts': return { articles: vacancyFilters ? [] : input.articles, jobs: [], forYou: [] }
    default: return { articles: vacancyFilters ? [] : input.articles, jobs, forYou }
  }
}

interface ProfileLike {
  photo_url?: string | null
  role_category?: string | null
  seniority?: string | null
  location?: string | null
  work_modality?: string | null
  skills?: unknown
}

/** Qué tan completo está el perfil para sacarle provecho a "Para ti": los seis datos que alimentan la compatibilidad y el perfil público. */
export function profileProgress(user: ProfileLike | null | undefined): { percent: number; missing: string[] } {
  const skillCount = Array.isArray(user?.skills) ? (user!.skills as unknown[]).length : 0
  const checks: [string, boolean][] = [
    ['foto', !!user?.photo_url],
    ['puesto', !!user?.role_category],
    ['nivel', !!user?.seniority],
    ['ubicación', !!user?.location],
    ['modalidad', !!user?.work_modality],
    [`al menos ${RECOMMENDED_SKILLS} skills`, skillCount >= RECOMMENDED_SKILLS],
  ]
  return { percent: Math.round((checks.filter(([, ok]) => ok).length / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([name]) => name) }
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString('es-MX')} ${count === 1 ? one : many}`

/** "462 vacantes abiertas · 18 nuevas hoy · 12 encajan contigo". Solo lo que se sabe y es mayor a cero. */
export function feedSummary(input: { open?: number | null; newToday?: number | null; fit?: number | null }): string {
  return [
    input.open ? `${plural(input.open, 'vacante abierta', 'vacantes abiertas')}` : null,
    input.newToday ? `${plural(input.newToday, 'nueva hoy', 'nuevas hoy')}` : null,
    input.fit ? `${input.fit.toLocaleString('es-MX')} ${input.fit === 1 ? 'encaja' : 'encajan'} contigo` : null,
  ].filter(Boolean).join(' · ')
}
