import { supabase } from '../supabase.service'
import { isMissingMigration, loadSegments, trackingSince } from '../analytics/segments'
import { readAll } from '../analytics/read'
import { buildExperiment, type ExperimentPost, type ExperimentSummary } from './experiment'

/** Lee lo publicado con su formato y cuánta gente midió AvoTalent por publicación, y arma el resumen del experimento. */
export async function loadExperiment(now: Date = new Date()): Promise<{ ready: false; reason: string } | (ExperimentSummary & { ready: true; measuredSince: string | null; recent: { slug: string | null; format: string | null; publishedAt: string | null; arrivals: number | null; registrations: number | null }[] })> {
  let posts: ExperimentPost[]
  try {
    const rows = await readAll<Omit<ExperimentPost, 'post_key'>>((from, to) =>
      supabase.from('linkedin_vacancy_posts').select('vacancy_slug, format, experiment, published_at').eq('status', 'published').eq('experiment', 'gancho_slot4').order('published_at', { ascending: false }).range(from, to))
    posts = rows.map((row) => ({ ...row, post_key: '' }))
  } catch (error) {
    if (isMissingMigration((error as Error).message) || /format|experiment|column/i.test((error as Error).message)) return { ready: false, reason: 'Falta correr linkedin-experiments-migration.sql en Supabase.' }
    throw error
  }

  const since = await trackingSince()
  let visits: Map<string, { people: number; registered: number }> | null = null
  if (since) {
    const segments = await loadSegments('linkedin_post', new Date(since), new Date(now.getTime() + 1), 500)
    if (segments) visits = new Map(segments.map((segment) => [segment.label, { people: segment.people, registered: segment.registeredNew }]))
  }
  const summary = buildExperiment(posts, visits, since)
  return {
    ready: true,
    ...summary,
    measuredSince: since,
    recent: posts.slice(0, 12).map((post) => ({
      slug: post.vacancy_slug, format: post.format, publishedAt: post.published_at,
      arrivals: post.vacancy_slug && visits ? visits.get(post.vacancy_slug)?.people ?? 0 : null,
      registrations: post.vacancy_slug && visits ? visits.get(post.vacancy_slug)?.registered ?? 0 : null,
    })),
  }
}
