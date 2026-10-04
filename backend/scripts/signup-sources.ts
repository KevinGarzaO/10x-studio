/**
 * De dónde llegan las visitas y los registros, y cuánto convierte cada origen.
 *
 *   npm run signup-sources
 *
 * Lee la vista acquisition_by_source (linkedin-vacancies-attribution-migration.sql).
 * Un "visitante" es un navegador distinto; un "registro" es una cuenta real (sin las de
 * prueba). La conversión es registros entre visitantes.
 */
import { supabase } from '../services/supabase.service'

async function main() {
  const { data, error } = await supabase.from('acquisition_by_source').select('*')
  if (error) {
    console.error(`No se pudo leer el reporte (¿se aplicó linkedin-vacancies-attribution-migration.sql?): ${error.message}`)
    process.exit(1)
  }

  const rows = data || []
  if (rows.length === 0) {
    console.log('Todavía no hay visitas ni registros con origen.')
    return
  }

  console.table(
    rows.map((row: any) => ({
      origen: row.source,
      medio: row.medium,
      campaña: row.campaign,
      visitantes: row.visitors,
      registros: row.signups,
      'conversión %': row.conversion_pct ?? '-',
    })),
  )

  const total = rows.reduce((sum: number, row: any) => sum + Number(row.signups), 0)
  const linkedin = rows.filter((row: any) => row.source === 'linkedin').reduce((sum: number, row: any) => sum + Number(row.signups), 0)
  console.log(`\nRegistros: ${total}. De LinkedIn: ${linkedin} (${total ? Math.round((linkedin * 100) / total) : 0}%).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
