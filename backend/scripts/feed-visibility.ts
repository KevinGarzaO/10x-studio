/**
 * Vacantes ocultas del feed (services/vacancies/feed-visibility.ts).
 *
 *   npm run feed-visibility             prueba: cuenta qué se ocultaría y qué se volvería a mostrar; no cambia nada
 *   npm run feed-visibility -- --apply  lo aplica (reversible: se vuelve a mostrar sola cuando llega alguien a quien le sirva)
 */
import { refreshFeedVisibility } from '@avotalent/core/services/vacancies/feed-visibility'

async function main() {
  const apply = process.argv.includes('--apply')
  const outcome = await refreshFeedVisibility({ apply })
  if (outcome.status === 'skipped') return console.log(`Omitido: ${outcome.reason}`)
  console.log(`${outcome.open} vacantes abiertas, ${outcome.people} personas.`)
  console.log(`${apply ? 'Ocultadas' : 'Se ocultarían'}: ${outcome.hidden}. ${apply ? 'Vueltas a mostrar' : 'Se volverían a mostrar'}: ${outcome.shown}.`)
  if (!apply) console.log('Prueba: no se cambió nada. Usa -- --apply para aplicarlo.')
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
