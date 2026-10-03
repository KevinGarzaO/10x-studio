/**
 * Cuántos usuarios hay, por tipo, separando cuentas reales de pruebas y viendo
 * quién ya completó su perfil.
 *
 *   npm run user-stats        (desde backend/)
 *
 * Solo lee y solo trae conteos: no muestra correos ni datos personales. Necesita
 * que `user-classification-migration.sql` y `profile-completion-migration.sql`
 * ya estén aplicadas.
 */
import { supabase } from '../services/supabase.service'

const KINDS = ['user', 'company', 'superadmin'] as const
type Kind = (typeof KINDS)[number]

const LABELS: Record<Kind, string> = {
  user: 'Candidatos',
  company: 'Empresas',
  superadmin: 'Superadmins',
}

interface Row {
  user_kind: Kind
  is_test_account: boolean
  profile_completed: boolean
  claimed_by: string | null
  account_type: string
  is_superadmin: boolean
}

async function main() {
  const { data, error } = await supabase
    .from('users')
    .select('user_kind, is_test_account, profile_completed, claimed_by, account_type, is_superadmin')

  if (error) {
    const missing = /user_kind|is_test_account|profile_completed/.test(error.message)
    console.error(
      missing
        ? 'Faltan columnas: aplica backend/sql/user-classification-migration.sql y profile-completion-migration.sql en Supabase.'
        : `No se pudo leer users: ${error.message}`,
    )
    process.exit(1)
  }

  const rows = (data || []) as Row[]

  // El campo derivado debe coincidir siempre con las columnas de las que sale.
  const expected = (r: Row): Kind => (r.is_superadmin ? 'superadmin' : r.account_type === 'company' ? 'company' : 'user')
  const drifted = rows.filter(r => r.user_kind !== expected(r))
  if (drifted.length > 0) {
    console.error(`user_kind no coincide con is_superadmin/account_type en ${drifted.length} fila(s).`)
    process.exit(1)
  }

  // Las empresas del scraper no son usuarios: son empresas reales que nadie ha
  // reclamado, y no tienen perfil que completar. Se cuentan aparte.
  const scraperCompanies = rows.filter(r => r.user_kind === 'company' && !r.claimed_by)
  const accounts = rows.filter(r => !(r.user_kind === 'company' && !r.claimed_by))

  const table: Record<string, Record<string, number>> = {}
  for (const kind of KINDS) {
    const ofKind = accounts.filter(r => r.user_kind === kind)
    const real = ofKind.filter(r => !r.is_test_account)
    table[LABELS[kind]] = {
      'reales completos': real.filter(r => r.profile_completed).length,
      'reales incompletos': real.filter(r => !r.profile_completed).length,
      'de prueba': ofKind.filter(r => r.is_test_account).length,
      total: ofKind.length,
    }
  }

  console.table(table)

  const real = accounts.filter(r => !r.is_test_account)
  console.log(
    `Cuentas: ${accounts.length}. Reales: ${real.length} ` +
      `(${real.filter(r => r.profile_completed).length} con perfil completo, ` +
      `${real.filter(r => !r.profile_completed).length} sin completar). ` +
      `De prueba: ${accounts.length - real.length}.`,
  )
  console.log(`Empresas del scraper sin dueño: ${scraperCompanies.length}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
