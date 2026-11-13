import { Router, Request, Response } from 'express'
import { supabase } from '@avotalent/core/services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '@avotalent/core/http/middleware/community-auth.middleware'
import { pushConfig, pushEnabled, pushWelcome } from '@avotalent/core/services/push/push'

/**
 * Avisos push: la llave pública, alta y baja de un dispositivo, y los eventos de la invitación (se mostró, lo negó, no quiso).
 * `POST /click` es la única ruta sin sesión: la llama el service worker del navegador al tocar un aviso, con el `nid` (un UUID que
 * solo conoce quien recibió ese aviso); es idempotente y solo guarda que se tocó. SQL: backend/sql/push-notifications-migration.sql.
 */
const router = Router()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENDPOINT = /^https:\/\/[^\s]{10,2000}$/
const KEY = /^[A-Za-z0-9_-]{10,200}$/
export const PROMPT_EVENTS = ['prompt_shown', 'prompt_dismissed', 'permission_granted', 'permission_denied'] as const
const SURFACES = ['application_answer', 'settings']

const missing = (message: string) => /does not exist|schema cache|push_/i.test(message)

router.get('/public-key', (_req: Request, res: Response) => {
  const config = pushConfig()
  if (!config || !pushEnabled()) return res.status(503).json({ code: 'not_ready' })
  res.json({ key: config.publicKey })
})

router.post('/click', async (req: Request, res: Response) => {
  const nid = String(req.body?.nid ?? '')
  if (!UUID.test(nid)) return res.status(400).json({ error: 'nid inválido' })
  try {
    // Solo cuenta si ese aviso existe (se mandó de verdad); el índice único evita contarlo dos veces.
    const { data: sent } = await supabase.from('push_events').select('user_id, subscription_id, notification_type').eq('nid', nid).eq('kind', 'sent').limit(1)
    const first = (sent ?? [])[0] as { user_id: string; subscription_id: string; notification_type: string } | undefined
    if (!first) return res.json({ ok: true })
    // Un solo clic por aviso: se mira antes, y el índice único cubre la carrera (un duplicado da error y se ignora).
    const { data: already } = await supabase.from('push_events').select('id').eq('nid', nid).eq('kind', 'click').limit(1)
    if ((already ?? []).length === 0) await supabase.from('push_events').insert({ user_id: first.user_id, subscription_id: first.subscription_id, kind: 'click', notification_type: first.notification_type, nid })
    res.json({ ok: true })
  } catch {
    res.json({ ok: true })
  }
})

router.use(communityAuthMiddleware)

router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  const subscription = req.body?.subscription
  const endpoint = String(subscription?.endpoint ?? '')
  const p256dh = String(subscription?.keys?.p256dh ?? '')
  const auth = String(subscription?.keys?.auth ?? '')
  if (!ENDPOINT.test(endpoint) || !KEY.test(p256dh) || !KEY.test(auth)) return res.status(400).json({ error: 'Suscripción inválida' })
  const surface = SURFACES.includes(String(req.body?.surface)) ? String(req.body.surface) : null
  try {
    const row = { user_id: req.userId, endpoint, p256dh, auth, user_agent: String(req.get('user-agent') ?? '').slice(0, 300), last_seen_at: new Date().toISOString(), revoked_at: null, revoked_reason: null }
    const { data, error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }).select('id').single()
    if (error) throw error
    const subscriptionId = (data as { id: string }).id
    await supabase.from('push_events').insert({ user_id: req.userId, subscription_id: subscriptionId, kind: 'permission_granted', surface })
    res.json({ ok: true })
    // La notificación de muestra: la persona ve en su dispositivo cómo llegarán los avisos. No espera ni rompe la respuesta.
    void pushWelcome({ userId: req.userId as string, subscription: { id: subscriptionId, endpoint, p256dh, auth } })
  } catch (error) {
    if (missing((error as Error)?.message ?? '')) return res.status(503).json({ code: 'not_ready' })
    console.error('Push subscribe error:', error)
    res.status(500).json({ error: 'No se pudo activar los avisos' })
  }
})

router.post('/unsubscribe', async (req: AuthRequest, res: Response) => {
  const endpoint = String(req.body?.endpoint ?? '')
  if (!ENDPOINT.test(endpoint)) return res.status(400).json({ error: 'Suscripción inválida' })
  try {
    await supabase.from('push_subscriptions').update({ revoked_at: new Date().toISOString(), revoked_reason: 'la persona lo apagó' }).eq('endpoint', endpoint).eq('user_id', req.userId)
    await supabase.from('push_events').insert({ user_id: req.userId, kind: 'unsubscribed' })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'No se pudo apagar los avisos' })
  }
})

// ¿Este dispositivo (endpoint) ya está activo para esta persona? Para pintar el interruptor de Ajustes.
router.get('/status', async (req: AuthRequest, res: Response) => {
  const endpoint = String(req.query.endpoint ?? '')
  const ready = pushEnabled()
  if (!ENDPOINT.test(endpoint)) return res.json({ ready, active: false })
  try {
    const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', endpoint).eq('user_id', req.userId).is('revoked_at', null).limit(1)
    res.json({ ready, active: (data ?? []).length > 0 })
  } catch {
    res.json({ ready, active: false })
  }
})

router.post('/event', async (req: AuthRequest, res: Response) => {
  const kind = String(req.body?.kind ?? '')
  if (!(PROMPT_EVENTS as readonly string[]).includes(kind) || kind === 'permission_granted') return res.status(400).json({ error: 'Evento inválido' })
  const surface = SURFACES.includes(String(req.body?.surface)) ? String(req.body.surface) : null
  try {
    await supabase.from('push_events').insert({ user_id: req.userId, kind, surface })
  } catch {
    // medir nunca debe estorbar
  }
  res.json({ ok: true })
})

export default router
