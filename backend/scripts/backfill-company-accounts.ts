import { supabase } from '../services/supabase.service'
import { getOrCreateCompanyUser } from '../services/scraper/sync'
import { companySlug } from '../services/company'

const SCRAPER_BOT_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  const { data: jobs, error } = await supabase
    .from('community_posts')
    .select('id, company, company_logo, author_id')
    .eq('type', 'job')
    .not('company', 'is', null)

  if (error) {
    console.error(error)
    process.exit(1)
  }

  console.log(`Found ${jobs?.length || 0} job posts with a company name`)

  const bySlugIds = new Map<string, { name: string; logo: string | null; ids: string[] }>()

  for (const j of jobs || []) {
    if (j.author_id && j.author_id !== SCRAPER_BOT_ID) continue // already linked
    const slug = companySlug(j.company)
    if (!slug) continue
    if (!bySlugIds.has(slug)) bySlugIds.set(slug, { name: j.company, logo: j.company_logo, ids: [] })
    const entry = bySlugIds.get(slug)!
    entry.ids.push(j.id)
    if (!entry.logo && j.company_logo) entry.logo = j.company_logo
  }

  console.log(`${bySlugIds.size} distinct companies to create/link`)

  let linked = 0
  for (const [slug, entry] of bySlugIds) {
    const userId = await getOrCreateCompanyUser(entry.name, entry.logo)
    if (!userId) {
      console.error(`  Skipped "${entry.name}" (${slug}) — could not create/find user`)
      continue
    }
    const { error: updErr } = await supabase
      .from('community_posts')
      .update({ author_id: userId })
      .in('id', entry.ids)
    if (updErr) {
      console.error(`  Error linking ${entry.ids.length} posts for "${entry.name}":`, updErr.message)
      continue
    }
    linked += entry.ids.length
    console.log(`  ${entry.name} -> /empresas/${slug} (${entry.ids.length} vacantes)`)
  }

  console.log(`\nDone. ${linked} job posts linked to a company account.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
