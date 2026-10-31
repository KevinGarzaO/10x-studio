import { supabase } from '../supabase.service'

/** La dirección del reproductor de Clarity: /player/<proyecto>/<usuario de Clarity>/<sesión de Clarity>. Nada más se guarda. */
export const CLARITY_PLAYER_URL = /^https:\/\/clarity\.microsoft\.com\/player\/[A-Za-z0-9]{1,32}\/[A-Za-z0-9]{1,64}\/[A-Za-z0-9]{1,64}$/

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Valida lo que manda el navegador. Devuelve null si algo no es lo esperado. */
export function parseClarityLink(body: unknown): { sessionId: string; url: string } | null {
  if (!body || typeof body !== 'object') return null
  const { session_id: sessionId, url } = body as { session_id?: unknown; url?: unknown }
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null
  if (typeof url !== 'string' || url.length > 200 || !CLARITY_PLAYER_URL.test(url)) return null
  return { sessionId: sessionId.toLowerCase(), url }
}

/** Liga la grabación de Clarity a la sesión de analítica. La base repite la validación y comprueba que la sesión sea de ese navegador. */
export async function saveClarityLink(body: unknown, clientId: string): Promise<boolean> {
  const link = parseClarityLink(body)
  if (!link) return false
  const { data, error } = await supabase.rpc('analytics_set_clarity_url', { p_session: link.sessionId, p_client: clientId, p_url: link.url })
  if (error) throw new Error(error.message)
  return data === true
}
