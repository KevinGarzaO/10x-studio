import webpush from 'web-push'
import { randomUUID } from 'crypto'
import { supabase } from '../supabase.service'

/**
 * Avisos push (Web Push). La persona los activa en su navegador (una invitación después de contestar «¿Ya te postulaste?» o en Ajustes) y
 * desde aquí se mandan los mismos avisos que ya salen dentro de la app: seguimiento de postulaciones y coincidencias fuertes.
 *
 * Topes: como máximo 3 avisos push por persona en 24 horas, nada si lo apagó en Ajustes (`users.email_prefs.push === false`) y un
 * dispositivo que el navegador ya dio de baja (404/410) se marca como revocado. Un fallo de aquí NUNCA rompe lo que lo provocó.
 * Apagado hasta que PUSH_NOTIFICATIONS=on y las llaves VAPID estén en el servidor. SQL: backend/sql/push-notifications-migration.sql.
 */
export const PUSH_TYPES = ['application', 'match'] as const
export const MAX_PUSHES_PER_DAY = 3
export const PUSH_WINDOW_HOURS = 24

export interface PushConfig { publicKey: string; privateKey: string; subject: string }

export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  const subject = env.VAPID_SUBJECT?.trim() || 'mailto:hola@avotalent.app'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

export const pushEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.PUSH_NOTIFICATIONS === 'on' && pushConfig(env) !== null

export interface PushPayload { title: string; body: string; url: string; type: string; nid: string }

const TITLES: Record<string, string> = { application: 'Tu postulación', match: 'Una vacante para ti' }

/** Lo que se muestra en el dispositivo. La dirección lleva el origen `push` para que el panel de adquisición lo cuente como un canal más. */
export function buildPayload(input: { type: string; message: string; link: string }, nid: string = randomUUID()): PushPayload {
  const path = input.link.startsWith('/') ? input.link : '/'
  const url = `${path}${path.includes('?') ? '&' : '?'}utm_source=push&utm_medium=notificacion&utm_campaign=${encodeURIComponent(input.type)}`
  return { title: TITLES[input.type] ?? 'AvoTalent', body: input.message.slice(0, 140), url, type: input.type, nid }
}

/** ¿Se le puede mandar otro aviso? Pura: recibe cuántos se le mandaron en las últimas 24 horas y sus preferencias. */
export function canPush(sentLast24h: number, prefs: { push?: boolean } | null | undefined): boolean {
  if (prefs?.push === false) return false
  return sentLast24h < MAX_PUSHES_PER_DAY
}

export interface SubscriptionRow { id: string; endpoint: string; p256dh: string; auth: string }

export interface PushDeps {
  config: () => PushConfig | null
  enabled: () => boolean
  loadPrefs: (userId: string) => Promise<{ push?: boolean } | null>
  sentLast24h: (userId: string, now: Date) => Promise<number>
  subscriptions: (userId: string) => Promise<SubscriptionRow[]>
  send: (sub: SubscriptionRow, payload: PushPayload, config: PushConfig) => Promise<{ ok: true } | { ok: false; gone: boolean; reason: string }>
  revoke: (id: string, reason: string) => Promise<void>
  record: (event: { user_id: string; subscription_id: string; kind: 'sent' | 'failed'; notification_type: string; nid: string }) => Promise<void>
  now: () => Date
}

export const defaultPushDeps: PushDeps = {
  config: () => pushConfig(),
  enabled: () => pushEnabled(),
  loadPrefs: async (userId) => {
    const { data } = await supabase.from('users').select('email_prefs').eq('id', userId).maybeSingle()
    return ((data as { email_prefs?: { push?: boolean } } | null)?.email_prefs) ?? null
  },
  sentLast24h: async (userId, now) => {
    const since = new Date(now.getTime() - PUSH_WINDOW_HOURS * 3600_000).toISOString()
    const { count } = await supabase.from('push_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'sent').neq('notification_type', WELCOME_TYPE).neq('notification_type', TEST_TYPE).gte('created_at', since)
    return count ?? 0
  },
  subscriptions: async (userId) => {
    const { data } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId).is('revoked_at', null)
    return (data ?? []) as SubscriptionRow[]
  },
  send: async (sub, payload, config) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 24 * 3600,
      })
      return { ok: true }
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      const body = ((error as { body?: string }).body ?? (error as Error).message ?? '').toString().replace(/\s+/g, ' ').slice(0, 160)
      return { ok: false, gone: status === 404 || status === 410, reason: `${status ?? 'error'}${body ? `: ${body}` : ''}` }
    }
  },
  revoke: async (id, reason) => { await supabase.from('push_subscriptions').update({ revoked_at: new Date().toISOString(), revoked_reason: reason }).eq('id', id) },
  record: async (event) => { await supabase.from('push_events').insert(event) },
  now: () => new Date(),
}

/**
 * La notificación de muestra: justo al activar los avisos llega una para que la persona vea cómo se ven (y confirme que funcionan).
 * Va solo al dispositivo que se acaba de activar, no cuenta para el tope de 3 al día y no se repite (solo se manda al suscribir).
 */
export const WELCOME_TYPE = 'welcome'
export const welcomePayload = (nid: string = randomUUID()): PushPayload => ({
  title: 'AvoTalent',
  body: 'Listo, así te avisaremos: cuando toque dar seguimiento a tu postulación o aparezca una vacante para ti.',
  url: '/postulaciones?utm_source=push&utm_medium=notificacion&utm_campaign=welcome',
  type: WELCOME_TYPE,
  nid,
})

export async function pushWelcome(input: { userId: string; subscription: SubscriptionRow }, deps: PushDeps = defaultPushDeps): Promise<PushOutcome> {
  try {
    if (!deps.enabled()) return { status: 'skipped', reason: 'apagado' }
    const config = deps.config()
    if (!config) return { status: 'skipped', reason: 'faltan llaves' }
    const payload = welcomePayload()
    const result = await deps.send(input.subscription, payload, config)
    if (!result.ok && result.gone) await deps.revoke(input.subscription.id, 'dado de baja por el navegador')
    await deps.record({ user_id: input.userId, subscription_id: input.subscription.id, kind: result.ok ? 'sent' : 'failed', notification_type: WELCOME_TYPE, nid: payload.nid })
    return { status: 'done', sent: result.ok ? 1 : 0, failed: result.ok ? 0 : 1 }
  } catch (error) {
    console.error('[Push] No se pudo mandar la notificación de muestra:', error instanceof Error ? error.message : error)
    return { status: 'skipped', reason: 'error' }
  }
}

/**
 * Aviso de prueba para quien lo pide (el superadmin desde Telemetry): se manda a TODOS sus dispositivos activos y se devuelve el detalle
 * de cada uno (si salió o por qué falló), para diagnosticar sin entrar a los registros del servidor. No cuenta para el tope.
 */
export const TEST_TYPE = 'test'
export interface PushTestResult {
  enabled: boolean
  hasKeys: boolean
  devices: { id: string; ok: boolean; reason?: string }[]
}

export async function pushTest(userId: string, deps: PushDeps = defaultPushDeps): Promise<PushTestResult> {
  const config = deps.config()
  const result: PushTestResult = { enabled: deps.enabled(), hasKeys: config !== null, devices: [] }
  if (!config) return result
  const subs = await deps.subscriptions(userId)
  const nid = randomUUID()
  const payload: PushPayload = { title: 'AvoTalent', body: 'Aviso de prueba: si lo ves, los avisos funcionan en este dispositivo.', url: '/postulaciones?utm_source=push&utm_medium=notificacion&utm_campaign=test', type: TEST_TYPE, nid }
  for (const sub of subs) {
    const sent = await deps.send(sub, payload, config)
    if (!sent.ok && sent.gone) await deps.revoke(sub.id, 'dado de baja por el navegador')
    await deps.record({ user_id: userId, subscription_id: sub.id, kind: sent.ok ? 'sent' : 'failed', notification_type: TEST_TYPE, nid })
    result.devices.push(sent.ok ? { id: sub.id, ok: true } : { id: sub.id, ok: false, reason: sent.reason })
  }
  return result
}

export type PushOutcome = { status: 'skipped'; reason: string } | { status: 'done'; sent: number; failed: number }

/** Manda un aviso a todos los dispositivos activos de la persona. Nunca lanza. */
export async function pushToUser(input: { userId: string; type: string; message: string; link: string }, deps: PushDeps = defaultPushDeps): Promise<PushOutcome> {
  try {
    if (!deps.enabled()) return { status: 'skipped', reason: 'apagado' }
    if (!(PUSH_TYPES as readonly string[]).includes(input.type)) return { status: 'skipped', reason: 'tipo sin push' }
    const config = deps.config()
    if (!config) return { status: 'skipped', reason: 'faltan llaves' }
    const now = deps.now()
    const [prefs, sent, subs] = await Promise.all([deps.loadPrefs(input.userId), deps.sentLast24h(input.userId, now), deps.subscriptions(input.userId)])
    if (subs.length === 0) return { status: 'skipped', reason: 'sin dispositivos' }
    if (!canPush(sent, prefs)) return { status: 'skipped', reason: 'tope o apagado por la persona' }

    const nid = randomUUID()
    const payload = buildPayload(input, nid)
    let ok = 0
    let failed = 0
    for (const sub of subs) {
      const result = await deps.send(sub, payload, config)
      if (result.ok) {
        ok += 1
        await deps.record({ user_id: input.userId, subscription_id: sub.id, kind: 'sent', notification_type: input.type, nid })
      } else {
        failed += 1
        if (result.gone) await deps.revoke(sub.id, 'dado de baja por el navegador')
        await deps.record({ user_id: input.userId, subscription_id: sub.id, kind: 'failed', notification_type: input.type, nid })
      }
    }
    return { status: 'done', sent: ok, failed }
  } catch (error) {
    console.error('[Push] No se pudo mandar el aviso:', error instanceof Error ? error.message : error)
    return { status: 'skipped', reason: 'error' }
  }
}
