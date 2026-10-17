import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { sanitizeAttribution, sanitizeVisitorId } from '../../../services/attribution'

const router = Router()

/** Tope por dirección: es un endpoint público que escribe en la base. */
const MAX_VISITS_PER_HOUR = 60
const hits = new Map<string, { count: number; resetAt: number }>()

function allowed(req: Request): boolean {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  const key = forwarded || req.ip || 'desconocida'
  const now = Date.now()
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)

  const entry = hits.get(key)
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + 3600000 })
    return true
  }
  entry.count += 1
  return entry.count <= MAX_VISITS_PER_HOUR
}

/** Misma persona, misma visita: dentro de esta ventana no se vuelve a contar. */
const SESSION_WINDOW_MS = 30 * 60 * 1000

/**
 * Una visita al sitio (el navegador la manda una vez por sesión).
 *
 * Es pública a propósito: la visita llega antes de que la persona tenga cuenta. Siempre
 * responde 204: quien manda no necesita saber si se guardó, y así tampoco se le dice
 * nada a quien la use para probar cosas.
 */
router.post('/visit', async (req: Request, res: Response) => {
  try {
    const visitorId = sanitizeVisitorId(req.body?.visitorId)
    const attribution = sanitizeAttribution(req.body)
    if (!visitorId || !allowed(req)) return res.status(204).end()

    const since = new Date(Date.now() - SESSION_WINDOW_MS).toISOString()
    const { data: recent } = await supabase
      .from('landing_visits')
      .select('id')
      .eq('visitor_id', visitorId)
      .gte('created_at', since)
      .limit(1)
    if (recent && recent.length > 0) return res.status(204).end()

    await supabase.from('landing_visits').insert({
      visitor_id: visitorId,
      source: attribution?.source ?? null,
      medium: attribution?.medium ?? null,
      campaign: attribution?.campaign ?? null,
      content: attribution?.content ?? null,
      referrer: attribution?.referrer ?? null,
      landing_path: attribution?.landingPath ?? null,
    })
  } catch (error) {
    // Medir no debe romper nada: se registra y se sigue.
    console.warn('[Attribution] No se pudo guardar la visita:', (error as Error).message)
  }
  res.status(204).end()
})

export default router
