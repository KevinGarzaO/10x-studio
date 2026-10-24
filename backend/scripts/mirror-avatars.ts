/**
 * Copia a nuestro almacenamiento las fotos de perfil que siguen apuntando a una red social (LinkedIn, GitHub,
 * Google). Esos enlaces están firmados y VENCEN: el de LinkedIn dura unas tres semanas. Cuando vencen, la
 * foto desaparece.
 *
 *   npm run mirror-avatars              (solo cuenta, no cambia nada)
 *   npm run mirror-avatars -- --apply   (copia y actualiza la foto de cada cuenta)
 *
 * Solo toca cuentas cuya foto está en una red social; las fotos que la persona subió no se tocan. Si un enlace
 * ya venció no se puede recuperar: esa cuenta se queda como está y la persona recupera la foto al volver a
 * entrar con su red social (el registro la copia en cada entrada) o al subir una.
 */
import { supabase } from '../services/supabase.service'
import { isProviderPhoto, mirrorProviderPhoto } from '../services/avatar'

async function main() {
  const apply = process.argv.includes('--apply')
  const { data, error } = await supabase.from('users').select('id, username, photo_url').not('photo_url', 'is', null)
  if (error) throw error

  const pending = (data ?? []).filter((user) => isProviderPhoto(user.photo_url))
  console.log(`Cuentas con foto de red social: ${pending.length} de ${(data ?? []).length} con foto`)

  let copied = 0
  let failed = 0
  for (const user of pending) {
    if (!apply) {
      console.log(`  - ${user.username ?? user.id}: ${new URL(user.photo_url as string).host}`)
      continue
    }
    const mirrored = await mirrorProviderPhoto(user.photo_url, user.id)
    if (!mirrored) {
      failed += 1
      console.log(`  x ${user.username ?? user.id}: no se pudo copiar (el enlace venció o no responde)`)
      continue
    }
    const { error: updateError } = await supabase.from('users').update({ photo_url: mirrored }).eq('id', user.id).eq('photo_url', user.photo_url as string)
    if (updateError) {
      failed += 1
      console.log(`  x ${user.username ?? user.id}: ${updateError.message}`)
    } else {
      copied += 1
      console.log(`  ✓ ${user.username ?? user.id}`)
    }
  }

  console.log(apply ? `Copiadas: ${copied} · sin copiar: ${failed}` : 'Es una simulación. Agrega --apply para copiarlas.')
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
