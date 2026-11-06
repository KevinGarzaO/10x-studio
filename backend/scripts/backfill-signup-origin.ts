import 'dotenv/config'
import { supabase } from '../services/supabase.service'
import { pickSignupOrigin, type OriginSession } from '../services/analytics/signup-origin'

/**
 * Recupera el origen de registro de las cuentas que lo perdieron al volver del inicio de sesión con LinkedIn o GitHub.
 *   npm run backfill-signup-origin             muestra qué cambiaría (no guarda nada)
 *   npm run backfill-signup-origin -- --apply  lo guarda
 *
 * Solo toca cuentas reales SIN origen (`signup_source` vacío) y solo les pone uno cuando las sesiones de analítica (desde el 30 de octubre
 * de 2026) muestran un enlace marcado antes de registrarse. Nunca cambia un origen que ya existe. Las cuentas anteriores a la medición no
 * se pueden recuperar.
 */
async function main() {
  const apply = process.argv.includes('--apply')

  const { data: users, error } = await supabase
    .from('users')
    .select('id, created_at, signup_source')
    .eq('is_test_account', false)
    .not('is_scraper_profile', 'is', true)
    .eq('user_kind', 'user')
    .is('signup_source', null)
    .limit(5000)
  if (error) throw new Error(error.message)
  const orphans = (users ?? []) as { id: string; created_at: string }[]
  console.log(`${orphans.length} cuentas reales sin origen de registro.`)

  const found: { id: string; origin: ReturnType<typeof pickSignupOrigin> }[] = []
  for (let i = 0; i < orphans.length; i += 100) {
    const chunk = orphans.slice(i, i + 100)
    const { data: sessions, error: sessionError } = await supabase
      .from('analytics_sessions')
      .select('user_id, utm_source, utm_medium, utm_campaign, utm_content, referrer_host, entry_path, created_at')
      .in('user_id', chunk.map((user) => user.id))
      .not('utm_source', 'is', null)
    if (sessionError) throw new Error(sessionError.message)
    const byUser = new Map<string, OriginSession[]>()
    for (const row of (sessions ?? []) as (OriginSession & { user_id: string })[]) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])
    for (const user of chunk) {
      const origin = pickSignupOrigin(byUser.get(user.id) ?? [], user.created_at)
      if (origin) found.push({ id: user.id, origin })
    }
  }

  const counts: Record<string, number> = {}
  for (const item of found) { const key = `${item.origin!.signup_source} / ${item.origin!.signup_medium ?? '-'}`; counts[key] = (counts[key] ?? 0) + 1 }
  console.log(`Se pueden recuperar ${found.length} de ${orphans.length}:`)
  console.table(counts)
  console.log(`${orphans.length - found.length} no tienen sesión con enlace marcado (llegaron directo o antes de que se midiera).`)

  if (!apply) { console.log('\nNada guardado. Usa -- --apply para guardar.'); return }
  let saved = 0
  for (const item of found) {
    // Solo donde sigue sin origen: nunca se pisa uno que ya exista.
    const { error: updateError } = await supabase.from('users').update(item.origin!).eq('id', item.id).is('signup_source', null)
    if (updateError) { console.error(updateError.message); process.exit(1) }
    saved += 1
  }
  console.log(`\nListo: ${saved} cuentas actualizadas.`)
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
