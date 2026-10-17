/**
 * Muestra las próximas publicaciones de vacantes en LinkedIn, sin publicar nada.
 *
 *   npm run linkedin-vacancy-preview              las próximas 4 (dos días de publicaciones)
 *   npm run linkedin-vacancy-preview -- --count 12
 *   npm run linkedin-vacancy-preview -- --publish-now   publica UNA ahora (prueba real)
 *   npm run linkedin-vacancy-preview -- --publish-now --slug <slug>   publica esa vacante
 *
 * Sirve para revisar cómo se ven los textos antes de activar la publicación automática
 * (LINKEDIN_VACANCY_POSTS=on en Railway).
 */
import { loadPool, publishVacancyPost, siteUrl } from '../services/linkedin/vacancy-publisher'
import { buildPostText, pickVacancy, vacancyUrl, completeness, type PostedVacancy } from '../services/linkedin/vacancy-post'

const countFlag = process.argv.indexOf('--count')
const count = countFlag >= 0 ? Math.max(1, Number(process.argv[countFlag + 1]) || 4) : 4

async function main() {
  if (process.argv.includes('--publish-now')) {
    const slugFlag = process.argv.indexOf('--slug')
    const result = await publishVacancyPost({ slug: slugFlag >= 0 ? process.argv[slugFlag + 1] : undefined })
    console.log(result.status === 'published' ? `Publicado: ${result.linkedinPostId}\n\n${result.text}` : `No se publicó: ${result.reason}`)
    return
  }

  const base = siteUrl() ?? 'https://TU-DOMINIO'
  if (!siteUrl()) console.log('(COMMUNITY_APP_URL no está configurada con el sitio público: los enlaces de abajo son de ejemplo)\n')

  const { candidates, history, posted, skillLabels } = await loadPool()
  console.log(`${candidates.length} vacantes disponibles, ${posted} publicadas hasta ahora\n`)

  // Simula turnos seguidos: cada elegida cuenta como publicada para elegir la siguiente.
  const pool = [...candidates]
  const simulated: PostedVacancy[] = [...history]
  for (let turn = 0; turn < count; turn++) {
    const vacancy = pickVacancy(pool, simulated)
    if (!vacancy || !vacancy.slug) break
    pool.splice(pool.indexOf(vacancy), 1)
    simulated.push({ company: vacancy.company, role_category: vacancy.role_category, published_at: new Date().toISOString() })

    console.log(`──────── Publicación ${turn + 1} (completitud ${completeness(vacancy)}) ────────`)
    console.log(buildPostText(vacancy, vacancyUrl(base, vacancy.slug), posted + turn, skillLabels))
    console.log()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
