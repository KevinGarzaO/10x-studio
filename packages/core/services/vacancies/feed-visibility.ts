import { supabase } from '../supabase.service'
import { readAll } from '../analytics/read'
import { loadPeopleProfiles, servesSomeone, type PersonProfile } from './serves-someone'

/**
 * Cambio B de «oferta de vacantes»: las vacantes ABIERTAS (45 días) que no le sirven a ninguna persona real se ocultan del feed, de las
 * listas y del conteo. No se borran: siguen abriendo por enlace directo y se vuelven a mostrar solas cuando alguien llega a quien le sirvan
 * (el trabajo corre cada día). Sin personas que puntuar no se oculta nada (la comunidad vacía no se queda sin feed).
 */
export interface OpenVacancy {
  id: string
  role_category: string | null
  seniority_level: string | null
  skills: unknown
  modalidad: string | null
  hidden_from_feed: boolean | null
}

export interface VisibilityPlan { hide: string[]; show: string[]; stay: number }

/** Pura: qué ocultar y qué volver a mostrar. */
export function planVisibility(vacancies: OpenVacancy[], people: PersonProfile[]): VisibilityPlan {
  const hide: string[] = []
  const show: string[] = []
  let stay = 0
  for (const vacancy of vacancies) {
    const serves = servesSomeone({ role_category: vacancy.role_category, seniority_level: vacancy.seniority_level, skills: vacancy.skills, work_modality: vacancy.modalidad }, people)
    const hidden = vacancy.hidden_from_feed === true
    if (!serves && !hidden) hide.push(vacancy.id)
    else if (serves && hidden) show.push(vacancy.id)
    else stay++
  }
  return { hide, show, stay }
}

const OPEN_DAYS = 45
const CHUNK = 100

/** ¿Existe la columna? (la migración se corre a mano): sin ella el feed sigue igual que antes. Se vuelve a preguntar cada 5 minutos. */
let readyCache: { value: boolean; at: number } | null = null
export async function feedVisibilityReady(): Promise<boolean> {
  if (readyCache && Date.now() - readyCache.at < 5 * 60_000) return readyCache.value
  let ready = false
  try {
    const { error } = await supabase.from('community_posts').select('hidden_from_feed').limit(1)
    ready = !error
  } catch {
    ready = false
  }
  readyCache = { value: ready, at: Date.now() }
  return ready
}

export interface RefreshOutcome { status: 'done' | 'skipped'; reason?: string; hidden: number; shown: number; open: number; people: number; applied: boolean }

export async function refreshFeedVisibility(options: { apply?: boolean } = {}): Promise<RefreshOutcome> {
  const apply = options.apply !== false
  if (!(await feedVisibilityReady())) return { status: 'skipped', reason: 'falta la migración feed-visibility-migration.sql', hidden: 0, shown: 0, open: 0, people: 0, applied: false }
  const people = await loadPeopleProfiles()
  const since = new Date(Date.now() - OPEN_DAYS * 86400000).toISOString()
  const open = await readAll<OpenVacancy>((from, to) =>
    supabase.from('community_posts').select('id, role_category, seniority_level, skills, modalidad, hidden_from_feed').eq('type', 'job').gte('created_at', since).range(from, to))
  const plan = planVisibility(open, people)
  if (people.length === 0 || !apply) return { status: 'done', hidden: plan.hide.length, shown: plan.show.length, open: open.length, people: people.length, applied: false }
  for (let i = 0; i < plan.hide.length; i += CHUNK) {
    const { error } = await supabase.from('community_posts').update({ hidden_from_feed: true, hidden_at: new Date().toISOString() }).in('id', plan.hide.slice(i, i + CHUNK))
    if (error) throw error
  }
  for (let i = 0; i < plan.show.length; i += CHUNK) {
    const { error } = await supabase.from('community_posts').update({ hidden_from_feed: false, hidden_at: null }).in('id', plan.show.slice(i, i + CHUNK))
    if (error) throw error
  }
  return { status: 'done', hidden: plan.hide.length, shown: plan.show.length, open: open.length, people: people.length, applied: true }
}
