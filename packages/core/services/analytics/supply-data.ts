import { supabase } from '../supabase.service'
import { modalityFromLabel } from '../vacancies/modality'
import { loadPeopleProfiles } from '../vacancies/serves-someone'
import { nextBatchFrom } from '../scraper/quota'
import { readAll } from './read'
import { buildSupply, type OpenVacancy, type QueuedVacancy } from './supply'

const OPEN_DAYS = 45

/** Lee a las personas, las vacantes abiertas, la cola del scraper y lo ya publicado en LinkedIn, y arma la oferta por puesto. */
export async function loadSupply(now: Date = new Date()) {
  const since = new Date(now.getTime() - OPEN_DAYS * 86_400_000).toISOString()

  const [people, openRows, used, queuedRows, cycle] = await Promise.all([
    loadPeopleProfiles(),
    readAll<{ id: string; slug: string | null; company: string | null; role_category: string | null; seniority_level: string | null; skills: unknown; modalidad: string | null }>((from, to) =>
      supabase.from('community_posts').select('id, slug, company, role_category, seniority_level, skills, modalidad').eq('type', 'job').gte('created_at', since).range(from, to)),
    readAll<{ vacancy_id: string | null }>((from, to) =>
      supabase.from('linkedin_vacancy_posts').select('vacancy_id').in('status', ['pending', 'published']).range(from, to)),
    // La cola: lo que el scraper trajo y todavía no sale al feed (mismos filtros que la sincronización diaria).
    readAll<{ role_category: string | null; seniority_level: string | null; skills: unknown; work_modality: string | null }>((from, to) =>
      supabase.from('scraper_posts').select('role_category, seniority_level, skills, work_modality').eq('post_type', 'vacancy').eq('synced_to_community', false).eq('is_spam', false).gte('post_date', since).not('role_category', 'is', null).range(from, to)),
    supabase.from('scraper_cycle_state').select('cycle_started_at').eq('id', 1).limit(1),
  ])

  const open: OpenVacancy[] = openRows.map((row) => ({
    id: row.id, slug: row.slug, company: row.company, role_category: row.role_category, seniority_level: row.seniority_level, skills: row.skills,
    // Las vacantes del feed guardan la modalidad escrita («Remoto»); el motor de match espera el código (remote / hybrid / onsite).
    work_modality: modalityFromLabel(row.modalidad),
  }))
  const queued: QueuedVacancy[] = queuedRows.map((row) => ({ role_category: row.role_category, seniority_level: row.seniority_level, skills: row.skills, work_modality: row.work_modality }))
  const started = ((cycle.data ?? [])[0] as { cycle_started_at: string } | undefined)?.cycle_started_at
  return buildSupply({
    people,
    open,
    usedInLinkedin: new Set(used.map((row) => row.vacancy_id).filter((id): id is string => !!id)),
    queued,
    nextBatchAt: nextBatchFrom(started ? new Date(started) : null),
    now,
  })
}
