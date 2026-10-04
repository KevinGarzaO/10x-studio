/**
 * Aplica la regla de negocio de vacantes (services/vacancies/publish-rule.ts) a lo que ya
 * existe: elimina las vacantes que no están ligadas a los catálogos, tanto las publicadas
 * en el feed (community_posts) como las que esperan en el área de paso (scraper_posts).
 *
 *   npm run clean-vacancies                prueba: cuenta qué se eliminaría, no borra nada
 *   npm run clean-vacancies -- --apply     elimina
 *   npm run clean-vacancies -- --keep-invalid   no elimina las publicadas, solo reporta
 *
 * Las publicadas con comentarios o guardados NO se eliminan (se llevarían la conversación
 * de personas reales): se dejan y se listan.
 */
import { supabase } from '../services/supabase.service'
import { loadSkillMatchers } from '../services/vacancies/catalog'
import { planCleanup, type PublishedVacancy } from '../services/vacancies/cleanup'
import { describeRejections, evaluateVacancy, tallyRejections } from '../services/vacancies/publish-rule'
import { vacancyTitle } from '../services/vacancies/text'

const apply = process.argv.includes('--apply')
const keepInvalid = process.argv.includes('--keep-invalid')
const CHUNK = 100

async function idsWithInteraction(table: 'community_comments' | 'community_saved_posts', ids: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from(table).select('post_id').in('post_id', ids.slice(i, i + CHUNK))
    if (error) throw error
    for (const row of data || []) found.add(row.post_id as string)
  }
  return found
}

async function deleteIn(table: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase.from(table).delete().in('id', ids.slice(i, i + CHUNK))
    if (error) throw error
  }
}

async function main() {
  const matchers = await loadSkillMatchers(true)
  const catalog = new Set(matchers.map((matcher) => matcher.name))
  console.log(`${apply ? 'APLICANDO' : 'PRUEBA (no se borra nada)'} — ${catalog.size} skills en el catálogo\n`)

  // 1. Publicadas en el feed
  const { data: published, error } = await supabase
    .from('community_posts')
    .select('id, title, company, source_url, role_category, skills')
    .eq('type', 'job')
    .limit(5000)
  if (error) throw error

  const vacancies = (published || []) as PublishedVacancy[]
  const ids = vacancies.map((vacancy) => vacancy.id)
  const interacted = new Set([...(await idsWithInteraction('community_comments', ids)), ...(await idsWithInteraction('community_saved_posts', ids))])
  const plan = planCleanup(vacancies, catalog, interacted, { keepInvalid })

  console.log(`Publicadas en el feed: ${vacancies.length}`)
  console.log(`  cumplen la regla:            ${plan.keep.length}`)
  console.log(`  se eliminan:                 ${plan.remove.length}  (${describeRejections(plan.rejections)})`)
  console.log(`  no cumplen pero se dejan:    ${plan.protectedInvalid.length}  (con comentarios/guardados${keepInvalid ? ' o --keep-invalid' : ''})\n`)

  // 2. En espera en el área de paso
  const { data: staged, error: stagedError } = await supabase
    .from('scraper_posts')
    .select('id, text, url, company, contacts, skills, role_category')
    .eq('post_type', 'vacancy')
    .limit(10000)
  if (stagedError) throw stagedError

  const stagedInvalid: string[] = []
  const stagedVerdicts = []
  for (const row of staged || []) {
    const verdict = evaluateVacancy(
      {
        title: vacancyTitle(row.text ?? ''),
        company: row.company,
        applyUrl: row.url ?? row.contacts?.applyUrl,
        roleCategory: row.role_category,
        skills: Array.isArray(row.skills) ? row.skills : [],
      },
      catalog,
    )
    if (!verdict.valid) {
      stagedInvalid.push(row.id)
      stagedVerdicts.push(verdict)
    }
  }
  console.log(`En espera (scraper_posts): ${(staged || []).length}`)
  console.log(`  se eliminan:                 ${stagedInvalid.length}  (${describeRejections(tallyRejections(stagedVerdicts))})\n`)

  if (!apply) {
    console.log('No se borró nada. Para aplicar: npm run clean-vacancies -- --apply')
    return
  }

  await deleteIn('community_posts', plan.remove)
  await deleteIn('scraper_posts', stagedInvalid)
  console.log(`Eliminadas: ${plan.remove.length} publicadas y ${stagedInvalid.length} en espera.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
