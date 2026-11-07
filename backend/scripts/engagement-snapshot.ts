/**
 * Fotos del historial de compromiso (services/analytics/engagement-history.ts). Solo AGREGAN filas: nunca sobrescriben una foto que ya existe.
 *
 *   npm run engagement-snapshot -- --baseline   la foto BASE de hoy (valor, enganche y temperatura de este momento; solo tiene sentido una vez)
 *   npm run engagement-snapshot -- --backfill   reconstruye las semanas ya cerradas desde el 19 de oct con lo que sí tiene fecha
 *   npm run engagement-snapshot -- --weekly     la foto de la semana que acaba de terminar (la hace sola el cron cada lunes)
 *
 * Sin opción no hace nada y muestra esta ayuda.
 */
import { backfillHistory, takeBaseline, takeWeeklySnapshot } from '../services/analytics/engagement-history'

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--baseline')) return console.log(JSON.stringify(await takeBaseline()))
  if (args.includes('--backfill')) return console.log(JSON.stringify(await backfillHistory()))
  if (args.includes('--weekly')) return console.log(JSON.stringify(await takeWeeklySnapshot()))
  console.log('Usa --baseline, --backfill o --weekly. Mira el encabezado de scripts/engagement-snapshot.ts.')
}
main().then(() => process.exit(0)).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
