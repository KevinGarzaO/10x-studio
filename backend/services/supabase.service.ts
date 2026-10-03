import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_KEY')
}

// Este cliente corre TODAS las consultas del backend con la llave de servicio
// (se salta RLS). Nunca debe iniciar sesión como una persona: supabase-js guarda
// la sesión en el cliente y, desde entonces, manda el token de esa persona en vez
// de la llave de servicio, así que RLS empezaría a aplicarse a todo el servidor.
// Para login, registro y refresco se usa createAuthClient().
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

export const supabase = createClient(supabaseUrl, supabaseKey, clientOptions)

/**
 * Un cliente desechable para las operaciones de Auth que guardan sesión
 * (signUp, signInWithPassword, refreshSession). Se crea uno por petición, así la
 * sesión de una persona no puede filtrarse a las consultas de otra ni al cliente
 * principal.
 */
export function createAuthClient() {
  return createClient(supabaseUrl, supabaseKey, clientOptions)
}
