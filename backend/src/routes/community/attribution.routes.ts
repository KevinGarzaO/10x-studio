import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { sanitizeAttribution, sanitizeVisitorId } from '../../../services/attribution'
import { isBotUserAgent } from '../../../services/analytics/bots'
import { clearPopularityCache } from '../../../services/vacancies/popularity'

const router = Router()

/** Tope por dirección: son endpoints públicos que escriben en la base. */
function makeLimiter(maxPerHour: number) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return (req: Request): boolean => {
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
    return entry.count <= maxPerHour
  }
}

const allowedVisit = makeLimiter(60)
// Quien recorre vacantes genera un evento por página: el tope es mayor que el de las visitas.
const allowedEvent = makeLimiter(400)

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
    // Los robots no son visitantes: no se anotan.
    if (!visitorId || isBotUserAgent(req.headers['user-agent']) || !allowedVisit(req)) return res.status(204).end()

    const since = new Date(Date.now() - SESSION_WINDOW_MS).toISOString()
    let recentQuery = supabase
      .from('landing_visits')
      .select('id')
      .eq('visitor_id', visitorId)
      .gte('created_at', since)
    for (const field of ['source', 'medium', 'campaign', 'content'] as const) {
      const value = attribution?.[field] ?? null
      recentQuery = value === null ? recentQuery.is(field, null) : recentQuery.eq(field, value)
    }
    const { data: recent, error: recentError } = await recentQuery.limit(1)
    if (recentError) throw recentError
    if (recent && recent.length > 0) return res.status(204).end()

    const { error: insertError } = await supabase.from('landing_visits').insert({
      visitor_id: visitorId,
      source: attribution?.source ?? null,
      medium: attribution?.medium ?? null,
      campaign: attribution?.campaign ?? null,
      content: attribution?.content ?? null,
      referrer: attribution?.referrer ?? null,
      landing_path: attribution?.landingPath ?? null,
    })
    if (insertError) throw insertError
  } catch (error) {
    // Medir no debe romper nada: se registra y se sigue.
    console.warn('[Attribution] No se pudo guardar la visita:', (error as Error).message)
  }
  res.status(204).end()
})

const VACANCY_EVENTS = ['view', 'apply'] as const
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/i

/**
 * Alguien abrió una vacante ('view') o pulsó "Postularse" ('apply'). Pública por la misma razón
 * que las visitas: quien mira una vacante todavía puede no tener cuenta. Siempre responde 204.
 * Si trae sesión, se anota quién fue; si no, queda anónimo.
 */
router.post('/event', async (req: Request, res: Response) => {
  try {
    const visitorId = sanitizeVisitorId(req.body?.visitorId)
    const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : ''
    const event = req.body?.event
    if (!visitorId || isBotUserAgent(req.headers['user-agent']) || !SLUG.test(slug) || !(VACANCY_EVENTS as readonly unknown[]).includes(event) || !allowedEvent(req)) {
      return res.status(204).end()
    }

    // Lo mismo dos veces seguidas es la misma acción (recargar la página, doble clic).
    const since = new Date(Date.now() - SESSION_WINDOW_MS).toISOString()
    const { data: recent, error: recentError } = await supabase
      .from('vacancy_events')
      .select('id')
      .eq('visitor_id', visitorId)
      .eq('vacancy_slug', slug)
      .eq('event', event)
      .gte('created_at', since)
      .limit(1)
    if (recentError) throw recentError
    if (recent && recent.length > 0) return res.status(204).end()

    // La persona, si trae sesión. Si el token no sirve, el evento se guarda igual, sin persona.
    let userId: string | null = null
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (token) {
      const { data } = await supabase.auth.getUser(token)
      userId = data.user?.id ?? null
    }

    // El equipo (administradores) y las cuentas de prueba no cuentan como interés en una vacante.
    if (userId) {
      const { data: account } = await supabase.from('users').select('user_kind, is_test_account').eq('id', userId).maybeSingle()
      if (account && (account.is_test_account || account.user_kind === 'superadmin')) return res.status(204).end()
    }

    const attribution = sanitizeAttribution(req.body)
    const { error: insertError } = await supabase.from('vacancy_events').insert({
      vacancy_slug: slug,
      event,
      visitor_id: visitorId,
      user_id: userId,
      source: attribution?.source ?? null,
    })
    if (insertError) throw insertError
    // Las cifras de la vacante (y su lugar en el feed) cambiaron: que la siguiente lectura las recalcule.
    clearPopularityCache()
  } catch (error) {
    console.warn('[Attribution] No se pudo guardar el evento de vacante:', (error as Error).message)
  }
  res.status(204).end()
})

export default router
