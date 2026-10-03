/**
 * Cuántos usuarios hay, por tipo y separando cuentas reales de pruebas.
 *
 *   npm run user-stats        (desde backend/)
 *
 * Solo lee y solo trae conteos: no muestra correos ni datos personales. Necesita
 * que `user-classification-migration.sql` ya esté aplicada.
 */
import { supabase } from '../services/supabase.service'

const KINDS = ['user', 'company', 'superadmin'] as const
const LABELS: Record<(typeof KINDS)[number], string> = {
  user: 'Candidatos',
  company: 'Empresas',
  superadmin: 'Superadmins',
}

async function main() {
  const { data, error } = await supabase
    .from('users')
    .select('user_kind, is_test_account, is_scraper_profile, claimed_by, account_type, is_superadmin')

  if (error) {
    const missing = /user_kind|is_test_account/.test(error.message)
    console.error(
      missing
        ? 'Faltan las columnas nuevas: aplica backend/sql/user-classification-migration.sql en Supabase.'
        : `No se pudo leer users: ${error.message}`,
    )
    process.exit(1)
  }

  const rows = data || []

  // El campo derivado debe coincidir siempre con las columnas de las que sale.
  const expected = (r: (typeof rows)[number]) =>
    r.is_superadmin ? 'superadmin' : r.account_type === 'company' ? 'company' : 'user'
  const drifted = rows.filter(r => r.user_kind !== expected(r))
  if (drifted.length > 0) {
    console.error(`user_kind no coincide con is_superadmin/account_type en ${drifted.length} fila(s).`)
    process.exit(1)
  }

  const table: Record<string, { real: number; prueba: number; total: number }> = {}
  for (const kind of KINDS) table[LABELS[kind]] = { real: 0, prueba: 0, total: 0 }

  for (const row of rows) {
    const bucket = table[LABELS[row.user_kind as (typeof KINDS)[number]]]
    if (!bucket) continue
    bucket[row.is_test_account ? 'prueba' : 'real']++
    bucket.total++
  }

  console.table(table)
  console.log(`Total: ${rows.length} (reales: ${rows.filter(r => !r.is_test_account).length}, de prueba: ${rows.filter(r => r.is_test_account).length})`)

  const unclaimed = rows.filter(r => r.user_kind === 'company' && !r.claimed_by).length
  console.log(`Empresas sin dueño (creadas por el scraper): ${unclaimed}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
