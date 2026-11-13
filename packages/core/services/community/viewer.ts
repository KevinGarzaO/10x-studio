import type { Request } from 'express'
import { supabase } from '../supabase.service'

/**
 * Quién mira, si hay una sesión válida; null si no hay o no sirve (vencida o inventada). Las rutas públicas lo usan para saber
 * si entregan todo o solo lo que puede ver un visitante (ver guest-view.ts).
 */
export async function getOptionalUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
