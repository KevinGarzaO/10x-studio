/**
 * Copia `picture` a `avatar_url` en la metadata de auth de los usuarios de
 * LinkedIn (y de quien traiga foto solo en `picture`).
 *
 *   npm run linkedin-avatar-metadata
 *
 * El dashboard de Supabase (Auth → Users) solo dibuja el avatar desde
 * `user_metadata.avatar_url`; LinkedIn OIDC entrega la foto en `picture`, por
 * eso esas cuentas se veían con silueta. La app ya usaba `picture` bien — esto
 * es solo para que la lista de Auth también muestre la cara.
 */
import { supabase } from '../services/supabase.service'

async function main() {
  let page = 1
  let scanned = 0
  let updated = 0

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error(`No se pudo listar usuarios: ${error.message}`)
      process.exit(1)
    }

    const users = data?.users || []
    for (const user of users) {
      const meta = (user.user_metadata || {}) as Record<string, string>
      if (!meta.picture || meta.avatar_url) continue

      const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, avatar_url: meta.picture },
      })
      if (updErr) {
        console.error(`  falló ${user.email}: ${updErr.message}`)
      } else {
        updated++
        console.log(`  ok ${user.email}`)
      }
    }

    scanned += users.length
    if (users.length < 200) break
    page++
  }

  console.log(`Revisados ${scanned} usuarios, ${updated} con avatar_url copiado.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
