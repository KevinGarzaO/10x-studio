import { supabase } from '../services/supabase.service'

// Cleans up job postings that got inserted more than once for the same
// source_url — almost certainly caused by two scraper cron instances briefly
// overlapping (this session restarted the backend many times) and both
// winning the "does this exist yet?" race at once. Keeps the most complete
// copy of each job (the one with a real description), deletes the rest, and
// clears the way for the DB-level unique constraint in
// sql/dedupe-constraint-migration.sql so it can't happen again.

function isBetter(a: { content: string | null; created_at: string }, b: { content: string | null; created_at: string }): boolean {
  const aHasDesc = /###\s*Descripci/i.test(a.content || '')
  const bHasDesc = /###\s*Descripci/i.test(b.content || '')
  if (aHasDesc !== bHasDesc) return aHasDesc
  const aLen = a.content?.length || 0
  const bLen = b.content?.length || 0
  if (aLen !== bLen) return aLen > bLen
  return new Date(a.created_at).getTime() < new Date(b.created_at).getTime()
}

async function deleteCommunityPost(id: string) {
  await supabase.from('scraper_posts').delete().eq('community_post_id', id)
  await supabase.from('community_post_tags').delete().eq('post_id', id)
  await supabase.from('community_votes').delete().eq('post_id', id)
  await supabase.from('community_comments').delete().eq('post_id', id)
  await supabase.from('community_saved_posts').delete().eq('post_id', id)
  const { error } = await supabase.from('community_posts').delete().eq('id', id)
  if (error) throw error
}

async function main() {
  const { data: jobs, error } = await supabase
    .from('community_posts')
    .select('id, title, source_url, content, created_at')
    .eq('type', 'job')
    .not('source_url', 'is', null)

  if (error) throw error

  const byUrl = new Map<string, typeof jobs>()
  for (const j of jobs || []) {
    if (!byUrl.has(j.source_url)) byUrl.set(j.source_url, [])
    byUrl.get(j.source_url)!.push(j)
  }

  const dupeGroups = [...byUrl.entries()].filter(([, rows]) => rows.length > 1)
  console.log(`${dupeGroups.length} duplicate job URLs to resolve`)

  let deleted = 0
  for (const [url, rows] of dupeGroups) {
    let winner = rows[0]
    for (const r of rows.slice(1)) {
      if (isBetter(r, winner)) winner = r
    }
    const losers = rows.filter(r => r.id !== winner.id)
    console.log(`${url}: keeping ${winner.id}, removing ${losers.length}`)
    for (const loser of losers) {
      await deleteCommunityPost(loser.id)
      deleted++
    }
  }

  console.log(`\nDone. Removed ${deleted} duplicate job posts.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
