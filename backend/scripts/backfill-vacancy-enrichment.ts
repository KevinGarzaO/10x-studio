/**
 * Vuelve a ligar las vacantes que ya están guardadas: rol, nivel, skills, modalidad y
 * ubicación, con las reglas actuales.
 *
 *   npm run backfill-vacancies                  prueba: muestra qué cambiaría, no escribe
 *   npm run backfill-vacancies -- --apply       escribe los cambios
 *   npm run backfill-vacancies -- --refetch     además baja la descripción completa de
 *                                               Greenhouse y Lever (API pública, con pausa)
 *
 * Las vacantes en espera (scraper_posts) se vuelven a enriquecer solas en cada corrida del
 * scraper; esto sirve sobre todo para las YA PUBLICADAS (community_posts), que el
 * scraper no vuelve a tocar. Con el texto guardado (recortado) se gana poco en skills; con
 * --refetch se analiza la descripción completa.
 */
import { supabase } from '../services/supabase.service'
import { enrichVacancy, type VacancyEnrichment } from '../services/vacancies/enrich'
import { loadSkillMatchers } from '../services/vacancies/catalog'
import { MODALITY_LABEL } from '../services/vacancies/modality'
import { cleanVacancyText } from '../services/vacancies/text'

const apply = process.argv.includes('--apply')
const refetch = process.argv.includes('--refetch')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** La descripción completa de una vacante de Greenhouse o Lever, o null si no se puede. */
async function fullDescription(sourceName: string | null, sourceUrl: string | null): Promise<string | null> {
  if (!sourceName || !sourceUrl) return null
  try {
    const greenhouse = sourceUrl.match(/greenhouse\.io\/[^/]+\/jobs\/(\d+)/) || sourceUrl.match(/[?&]gh_jid=(\d+)/)
    if (greenhouse) {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${sourceName}/jobs/${greenhouse[1]}`, { headers: { 'User-Agent': 'AvoTalent/1.0' } })
      if (!res.ok) return null
      const job: any = await res.json()
      return job.content ?? null
    }
    const lever = sourceUrl.match(/lever\.co\/([^/]+)\/([a-f0-9-]+)/)
    if (lever) {
      const res = await fetch(`https://api.lever.co/v0/postings/${lever[1]}/${lever[2]}`, { headers: { 'User-Agent': 'AvoTalent/1.0' } })
      if (!res.ok) return null
      const job: any = await res.json()
      const lists = (job.lists || []).map((l: any) => `${l.text ?? ''}\n${cleanVacancyText(l.content ?? '')}`)
      return [job.descriptionPlain || cleanVacancyText(job.description ?? ''), ...lists, job.additionalPlain ?? ''].filter(Boolean).join('\n')
    }
  } catch {
    // sin red o API caída: se usa el texto guardado
  }
  return null
}

function header(text: string): string {
  // Título, departamento y ubicación: las primeras líneas con formato del texto guardado.
  return text.split('\n').filter((line) => /^(##|\*\*(Departamento|Ubicaci[oó]n|Empresa|Equipo):\*\*)/.test(line)).join('\n')
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

async function main() {
  const matchers = await loadSkillMatchers(true)
  console.log(`${apply ? 'APLICANDO' : 'PRUEBA (no se escribe nada)'} — ${matchers.length} skills en el catálogo${refetch ? ', bajando descripciones completas' : ''}\n`)

  const { data: posts, error } = await supabase
    .from('community_posts')
    .select('id, original_text, content, source_name, source_url, role_category, seniority_level, skills, modalidad')
    .eq('type', 'job')
    .eq('is_scraper_post', true)
    .limit(2000)
  if (error) throw error

  let changed = 0
  let withFull = 0
  const before = { role: 0, seniority: 0, skills: 0, modality: 0 }
  const after = { role: 0, seniority: 0, skills: 0, modality: 0 }

  for (const post of posts || []) {
    const stored = post.original_text || post.content || ''
    let text = stored
    if (refetch) {
      const full = await fullDescription(post.source_name, post.source_url)
      if (full) {
        text = `${header(stored)}\n${full}`
        withFull++
      }
      await sleep(250)
    }

    const found: VacancyEnrichment = enrichVacancy({ text, location: null, work_modality: null }, matchers)
    const modalidad = found.work_modality !== 'unknown' ? MODALITY_LABEL[found.work_modality] : post.modalidad
    const next = { role_category: found.role_category, seniority_level: found.seniority_level, skills: found.skills, modalidad }

    if (post.role_category) before.role++
    if (post.seniority_level) before.seniority++
    if (Array.isArray(post.skills) && post.skills.length) before.skills++
    if (post.modalidad && post.modalidad !== 'No especificado') before.modality++
    if (next.role_category) after.role++
    if (next.seniority_level) after.seniority++
    if (next.skills.length) after.skills++
    if (next.modalidad && next.modalidad !== 'No especificado') after.modality++

    const differs =
      !same(post.role_category, next.role_category) ||
      !same(post.seniority_level, next.seniority_level) ||
      !same(post.skills, next.skills) ||
      !same(post.modalidad, next.modalidad)
    if (!differs) continue
    changed++

    if (apply) {
      const { error: updateError } = await supabase.from('community_posts').update(next).eq('id', post.id)
      if (updateError) console.warn(`  No se pudo actualizar ${post.id}: ${updateError.message}`)
    }
  }

  const total = (posts || []).length
  const pct = (n: number) => `${n}/${total} (${Math.round((n * 100) / Math.max(1, total))}%)`
  console.log(`Vacantes publicadas revisadas: ${total}${refetch ? ` (descripción completa en ${withFull})` : ''}`)
  console.log(`Cambian: ${changed}\n`)
  console.table({
    rol: { antes: pct(before.role), después: pct(after.role) },
    nivel: { antes: pct(before.seniority), después: pct(after.seniority) },
    'al menos 1 skill': { antes: pct(before.skills), después: pct(after.skills) },
    modalidad: { antes: pct(before.modality), después: pct(after.modality) },
  })
  if (!apply) console.log('\nNo se escribió nada. Para aplicar: npm run backfill-vacancies -- --apply')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
