import 'dotenv/config'
import { syncClarity } from '../services/analytics/clarity'

/**
 * Trae de Clarity las métricas de frustración de las últimas 24 h y las guarda (gasta 1 de las 10 llamadas diarias).
 *   npm run clarity-sync            guarda en analytics_clarity_metrics
 *   npm run clarity-sync -- --raw   además imprime lo que respondió Clarity (para comprobar los nombres de los campos)
 */
async function main() {
  const raw = process.argv.includes('--raw')
  const outcome = await syncClarity({
    onRaw: raw ? (json) => console.log(JSON.stringify(Array.isArray(json) ? json.map((metric: any) => ({ ...metric, information: Array.isArray(metric?.information) ? metric.information.slice(0, 3) : metric?.information })) : json, null, 2)) : undefined,
  })
  console.log(`Clarity: ${outcome.status}${outcome.reason ? ` — ${outcome.reason}` : ''} (páginas: ${outcome.paths})`)
  process.exit(outcome.status === 'error' ? 1 : 0)
}

main()
