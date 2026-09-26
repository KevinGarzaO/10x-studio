/**
 * Sesiones reales de Supabase para los E2E, sin conocer contraseñas.
 *
 * El flujo es el de un enlace mágico, hecho server-side con la llave de
 * servicio: se genera el enlace, se toma su `token_hash` y se canjea por una
 * sesión. Los tokens resultantes son los mismos que emitiría un login normal,
 * así que la app los acepta sin ningún mock.
 *
 * Antes cada spec esperaba los tokens en variables de entorno que nada generaba,
 * lo que obligaba a prepararlos a mano antes de correr la suite.
 */
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') })

const url = process.env.SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''

export const admin = createClient(url, serviceKey)

export interface E2ESession {
  accessToken: string
  refreshToken: string
}

/** Una sesión válida para ese correo, o un error claro si no se pudo emitir. */
export async function createSessionFor(email: string): Promise<E2ESession> {
  // Variables de entorno siguen ganando, para no romper a quien ya las usa.
  if (process.env.E2E_ADMIN_ACCESS_TOKEN && process.env.E2E_ADMIN_REFRESH_TOKEN) {
    return {
      accessToken: process.env.E2E_ADMIN_ACCESS_TOKEN,
      refreshToken: process.env.E2E_ADMIN_REFRESH_TOKEN,
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !link?.properties?.hashed_token) {
    throw new Error(
      `No se pudo generar la sesión de ${email}: ${linkError?.message || 'sin hashed_token'}`,
    )
  }

  const anon = createClient(url, serviceKey)
  const { data, error } = await anon.auth.verifyOtp({
    type: 'email',
    token_hash: link.properties.hashed_token,
  })

  if (error || !data.session) {
    throw new Error(`No se pudo canjear la sesión de ${email}: ${error?.message || 'sin sesión'}`)
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  }
}
