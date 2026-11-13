import { supabase } from '../supabase.service'
import { isMissingMigration, loadSegments, trackingSince } from './segments'
import { buildLinkedInReport, postKeyFromUrn, type OurPostRow, type OurVisits, type ParsedReport, type StoredPost } from './linkedin-report'
import { readAll } from './read'

/** Guarda lo que se leyó del Excel y arma el reporte que muestra Telemetry (backend/sql/linkedin-report-migration.sql). */
export type SaveResult = { ready: false } | { ready: true; duplicate: boolean; uploadId: string; posts: number; days: number }

export async function saveLinkedInReport(parsed: ParsedReport, meta: { fileName: string | null; userId: string | null }): Promise<SaveResult> {
  const existing = await supabase.from('linkedin_report_uploads').select('id').eq('file_hash', parsed.fileHash).maybeSingle()
  if (existing.error) {
    if (isMissingMigration(existing.error.message)) return { ready: false }
    throw new Error(existing.error.message)
  }
  if (existing.data) return { ready: true, duplicate: true, uploadId: (existing.data as { id: string }).id, posts: parsed.posts.length, days: parsed.daily.length }

  const inserted = await supabase.from('linkedin_report_uploads').insert({
    uploaded_by: meta.userId, file_name: meta.fileName?.slice(0, 200) ?? null, file_hash: parsed.fileHash, period_start: parsed.periodStart, period_end: parsed.periodEnd,
    impressions: parsed.impressions, members_reached: parsed.membersReached, followers_total: parsed.followersTotal, posts: parsed.posts.length,
  }).select('id').single()
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'No se pudo guardar la subida')
  const uploadId = (inserted.data as { id: string }).id

  // Lo más nuevo sustituye a lo anterior en las series por día.
  const stamp = new Date().toISOString()
  for (let i = 0; i < parsed.daily.length; i += 400) {
    const { error } = await supabase.from('linkedin_daily').upsert(
      parsed.daily.slice(i, i + 400).map((row) => ({ day: row.day, impressions: row.impressions, interactions: row.interactions, new_followers: row.newFollowers, upload_id: uploadId, updated_at: stamp })),
      { onConflict: 'day' },
    )
    if (error) throw new Error(error.message)
  }
  if (parsed.posts.length > 0) {
    const { error } = await supabase.from('linkedin_post_stats').insert(parsed.posts.map((post) => ({
      post_key: post.postKey, upload_id: uploadId, url: post.url, published_on: post.publishedOn, post_type: post.postType, impressions: post.impressions,
      impressions_network_pct: post.impressionsNetworkPct, impressions_outside_pct: post.impressionsOutsidePct, members_reached: post.membersReached,
      followers_gained: post.followersGained, profile_views: post.profileViews, reactions: post.reactions, comments: post.comments, shares: post.shares, saves: post.saves,
      sends: post.sends, custom_button: post.customButton, link_clicks: post.linkClicks, interactions: post.interactions,
    })))
    if (error) throw new Error(error.message)
  }
  if (parsed.audience.length > 0) {
    const { error } = await supabase.from('linkedin_audience').insert(parsed.audience.map((row) => ({ upload_id: uploadId, source: row.source, category: row.category, value: row.value, pct: row.pct, rank: row.rank })))
    if (error) throw new Error(error.message)
  }
  return { ready: true, duplicate: false, uploadId, posts: parsed.posts.length, days: parsed.daily.length }
}

type Upload = NonNullable<Parameters<typeof buildLinkedInReport>[0]['upload']>

export async function loadLinkedInReport(now: Date = new Date()) {
  const uploads = await supabase.from('linkedin_report_uploads').select('id, uploaded_at, file_name, period_start, period_end, impressions, members_reached, followers_total, posts').order('uploaded_at', { ascending: false }).limit(4)
  if (uploads.error) {
    if (isMissingMigration(uploads.error.message)) return { ready: false as const }
    throw new Error(uploads.error.message)
  }
  const list = (uploads.data ?? []) as Upload[]
  if (list.length === 0) return buildLinkedInReport({ upload: null, previousUpload: null, daily: [], posts: [], ours: [], visits: null, trackingSince: null, audience: [], today: now.toISOString().slice(0, 10) })
  const [latest, previous] = list

  const daily = await readAll<{ day: string; impressions: number | null; interactions: number | null; new_followers: number | null }>((from, to) =>
    supabase.from('linkedin_daily').select('day, impressions, interactions, new_followers').order('day', { ascending: true }).range(from, to))

  // Lo último que LinkedIn dijo de cada publicación: la subida más nueva que la trajo.
  const stats = await supabase.from('linkedin_post_stats').select('post_key, upload_id, url, published_on, impressions, members_reached, link_clicks, reactions, comments, shares, saves, interactions, followers_gained').in('upload_id', list.map((upload) => upload.id))
  const rank = new Map(list.map((upload, index) => [upload.id, index]))
  const newest = new Map<string, StoredPost & { upload_id: string }>()
  for (const row of ((stats.data ?? []) as (StoredPost & { upload_id: string })[]).sort((a, b) => (rank.get(b.upload_id) ?? 0) - (rank.get(a.upload_id) ?? 0))) newest.set(row.post_key, row)

  const audience = await supabase.from('linkedin_audience').select('source, category, value, pct, rank').eq('upload_id', latest.id).order('rank', { ascending: true })

  const published = await readAll<{ linkedin_post_id: string | null; vacancy_slug: string | null; company: string | null; role_category: string | null; published_at: string | null }>((from, to) =>
    supabase.from('linkedin_vacancy_posts').select('linkedin_post_id, vacancy_slug, company, role_category, published_at').eq('status', 'published').not('linkedin_post_id', 'is', null).order('published_at', { ascending: false }).range(from, to))
  const ours: OurPostRow[] = published.flatMap((row) => {
    const key = postKeyFromUrn(row.linkedin_post_id)
    return key ? [{ post_key: key, vacancy_slug: row.vacancy_slug, company: row.company, role_category: row.role_category, published_at: row.published_at }] : []
  })

  const since = await trackingSince()
  let visits: Map<string, OurVisits> | null = null
  if (since) {
    const segments = await loadSegments('linkedin_post', new Date(since), new Date(now.getTime() + 1), 500)
    if (segments) visits = new Map(segments.map((segment) => [segment.label, { people: segment.people, active: segment.active, registered: segment.registeredNew }]))
  }

  return buildLinkedInReport({
    upload: latest, previousUpload: previous ? { followers_total: previous.followers_total, impressions: previous.impressions } : null, daily, posts: [...newest.values()],
    ours, visits, trackingSince: since, audience: (audience.data ?? []) as { source: string; category: string; value: string; pct: number | null; rank: number }[], today: now.toISOString().slice(0, 10),
  })
}
