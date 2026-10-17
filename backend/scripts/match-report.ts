/**
 * Dónde la oferta no alcanza a la gente, y a quién no le estamos mostrando buenas
 * vacantes.
 *
 *   npm run match-report          (desde backend/)
 *
 * Solo lee. Usa a las personas REALES (no cuentas de prueba ni perfiles del scraper) y
 * puntúa cada vacante contra cada una con el mismo motor que "Para ti". Muestra
 * usernames, nunca correos.
 */
import { supabase } from '../services/supabase.service'
import { buildMatchReport, type ReportCandidate, type ReportVacancy } from '../services/matching/report'

const asArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [])

async function main() {
  const [people, published, staged] = await Promise.all([
    supabase
      .from('users')
      .select('username, role_category, seniority, skills, work_modality')
      .eq('account_type', 'candidate')
      .eq('is_test_account', false)
      .not('is_scraper_profile', 'is', true)
      .not('role_category', 'is', null),
    supabase
      .from('community_posts')
      .select('role_category, seniority_level, skills, modalidad, created_at')
      .eq('type', 'job')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('scraper_posts')
      .select('role_category, seniority_level, skills, work_modality, post_date, created_at')
      .eq('post_type', 'vacancy')
      .eq('is_spam', false)
      .order('post_date', { ascending: false })
      .limit(1000),
  ])

  const failure = [people, published, staged].find((r) => r.error)?.error
  if (failure) {
    console.error(/is_test_account/.test(failure.message) ? 'Falta aplicar user-classification-migration.sql.' : `No se pudo leer: ${failure.message}`)
    process.exit(1)
  }

  const candidates: ReportCandidate[] = (people.data || []).map((row) => ({
    username: row.username,
    roleCategory: row.role_category,
    seniority: row.seniority,
    skills: asArray(row.skills).map((skill) => skill.toLowerCase()),
    workModality: row.work_modality,
  }))

  const vacancies: ReportVacancy[] = [
    ...(published.data || []).map((row) => ({
      roleCategory: row.role_category,
      seniority: row.seniority_level,
      skills: asArray(row.skills).map((skill) => skill.toLowerCase()),
      workModality: row.modalidad,
      createdAt: row.created_at,
    })),
    ...(staged.data || []).map((row) => ({
      roleCategory: row.role_category,
      seniority: row.seniority_level,
      skills: asArray(row.skills).map((skill) => skill.toLowerCase()),
      workModality: row.work_modality,
      createdAt: row.post_date || row.created_at,
    })),
  ]

  const report = buildMatchReport(candidates, vacancies)

  console.log(`\nPersonas reales con puesto: ${report.summary.candidates} | vacantes analizadas: ${report.summary.vacancies} (publicadas + en espera)\n`)

  console.log('ROLES — personas contra vacantes del último mes (lo urgente primero)')
  console.table(report.roles.map((r) => ({ rol: r.role, personas: r.candidates, 'vacantes 30d': r.vacancies30d, 'vacantes total': r.vacanciesTotal, 'días desde la última': r.daysSinceLast ?? '—', estado: r.state })))

  const skillGaps = report.skills.filter((s) => s.state !== 'ok')
  console.log('SKILLS — declarados sin oferta, u ofertados sin nadie que los tenga')
  console.table(skillGaps.slice(0, 25).map((s) => ({ skill: s.skill, personas: s.candidates, 'vacantes 30d': s.vacancies30d, estado: s.state })))
  if (skillGaps.length > 25) console.log(`  ... y ${skillGaps.length - 25} más`)

  console.log('PERSONAS — a quién no le estamos mostrando buenas ofertas (menos de 3)')
  const poorlyServed = report.candidates.filter((c) => c.state !== 'ok')
  if (poorlyServed.length === 0) console.log('  Todas las personas tienen al menos 3 ofertas buenas.')
  else console.table(poorlyServed.map((c) => ({ usuario: c.username, puesto: c.roleCategory, 'ofertas buenas': c.goodMatches, 'mejor puntaje': c.bestScore, estado: c.state })))

  console.log(
    `Resumen: ${report.summary.candidatesWithoutOffers} sin ninguna oferta buena, ${report.summary.candidatesWithFewOffers} con pocas. ` +
      `Roles con gente y sin vacantes este mes: ${report.summary.rolesWithoutVacancies.join(', ') || 'ninguno'}.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
