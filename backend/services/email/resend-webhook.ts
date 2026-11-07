import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from '../supabase.service'

/**
 * El webhook de Resend: guarda por persona lo que pasó con cada correo (entregado, rebote, queja, clic, apertura).
 *
 * - La firma sigue el estándar Svix que usa Resend: HMAC-SHA256 de `id.timestamp.cuerpo` con la llave `whsec_...` y un margen de 5 minutos.
 *   Sin `RESEND_WEBHOOK_SECRET` en el servidor, el webhook responde 503 y no guarda nada.
 * - Solo se guarda lo necesario: tipo de evento, id del correo de Resend, a qué persona se liga y, en un clic, la dirección SIN parámetros.
 *   Nunca el correo de la persona, su IP ni su navegador.
 * - Las aperturas se guardan pero NUNCA suman (no son confiables); los clics sí suman al valor de la persona.
 */
export const KNOWN_EVENTS = ['sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'] as const
export type EmailEventType = (typeof KNOWN_EVENTS)[number]
const TOLERANCE_S = 5 * 60

export interface ParsedEvent {
  svixId: string
  type: EmailEventType
  emailId: string | null
  occurredAt: string
  link: string | null
  bounceType: string | null
  /** Solo para saber a qué persona ligarlo; nunca se guarda. */
  recipient: string | null
}

/** Verifica la firma Svix. `secret` es la llave `whsec_...` de Resend; `now` en segundos. */
export function verifySignature(rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }, secret: string, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature || !secret) return false
  const sent = Number(timestamp)
  if (!Number.isFinite(sent) || Math.abs(nowSeconds - sent) > TOLERANCE_S) return false
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    const given = Buffer.from(value, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true
  }
  return false
}

/** La dirección de un clic sin parámetros ni fragmento (pueden traer códigos o datos de la persona). */
export function cleanLink(link: unknown): string | null {
  if (typeof link !== 'string' || !link) return null
  try {
    const url = new URL(link)
    return `${url.origin}${url.pathname}`.slice(0, 300)
  } catch {
    return null
  }
}

/** Entiende el cuerpo del aviso. Los tipos que no usamos (agendado, etc.) devuelven null: se ignoran sin error. */
export function parseEvent(body: unknown, svixId: string): ParsedEvent | null {
  if (!body || typeof body !== 'object') return null
  const input = body as { type?: unknown; created_at?: unknown; data?: Record<string, any> }
  const raw = typeof input.type === 'string' ? input.type.replace(/^email\./, '') : ''
  if (!(KNOWN_EVENTS as readonly string[]).includes(raw)) return null
  const data = input.data ?? {}
  const to = Array.isArray(data.to) ? data.to[0] : data.to
  const occurred = typeof (data.click?.timestamp ?? input.created_at) === 'string' ? Date.parse(String(data.click?.timestamp ?? input.created_at)) : NaN
  return {
    svixId,
    type: raw as EmailEventType,
    emailId: typeof data.email_id === 'string' ? data.email_id : null,
    occurredAt: new Date(Number.isNaN(occurred) ? Date.now() : occurred).toISOString(),
    link: raw === 'clicked' ? cleanLink(data.click?.link) : null,
    bounceType: raw === 'bounced' && typeof data.bounce?.type === 'string' ? String(data.bounce.type).slice(0, 40) : null,
    recipient: typeof to === 'string' ? to.trim().toLowerCase() : null,
  }
}

export interface WebhookDeps {
  findSend: (emailId: string) => Promise<{ user_id: string; kind: string } | null>
  findInvitation: (emailId: string) => Promise<{ invitation_id: string } | null>
  findUserByEmail: (email: string) => Promise<string | null>
  insert: (row: Record<string, unknown>) => Promise<{ duplicate: boolean }>
  suppressInvitation: (invitationId: string, reason: string) => Promise<void>
  optOutUser: (userId: string) => Promise<void>
}

export const realDeps: WebhookDeps = {
  async findSend(emailId) {
    const { data } = await supabase.from('email_sends').select('user_id, kind').eq('resend_id', emailId).limit(1)
    return ((data ?? [])[0] as { user_id: string; kind: string } | undefined) ?? null
  },
  async findInvitation(emailId) {
    const { data } = await supabase.from('invitation_sends').select('invitation_id').eq('resend_id', emailId).limit(1)
    return ((data ?? [])[0] as { invitation_id: string } | undefined) ?? null
  },
  async findUserByEmail(email) {
    const { data } = await supabase.from('users').select('id').ilike('email', email).limit(1)
    return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null
  },
  async insert(row) {
    const { error } = await supabase.from('email_events').insert(row)
    if (error && (error.code === '23505' || /duplicate key/i.test(error.message))) return { duplicate: true }
    if (error) throw new Error(error.message)
    return { duplicate: false }
  },
  async suppressInvitation(invitationId, reason) {
    await supabase.from('invitations').update({ suppressed: true, suppressed_reason: reason }).eq('id', invitationId)
  },
  async optOutUser(userId) {
    await supabase.from('users').update({ email_opt_out: true }).eq('id', userId)
  },
}

export type WebhookResult = { status: 'stored' | 'duplicate' | 'ignored' }

/** Guarda un aviso ya verificado y aplica su efecto (quitar de la lista a quien rebota o se queja). Lanza si no se pudo guardar: Resend reintenta. */
export async function recordEvent(event: ParsedEvent, deps: WebhookDeps = realDeps): Promise<WebhookResult> {
  let userId: string | null = null
  let invitationId: string | null = null
  let kind: string | null = null
  if (event.emailId) {
    const send = await deps.findSend(event.emailId)
    if (send) { userId = send.user_id; kind = send.kind }
    else {
      const invitation = await deps.findInvitation(event.emailId)
      if (invitation) { invitationId = invitation.invitation_id; kind = 'invitacion' }
    }
  }
  // Otros correos (alertas, resumen) no pasan por esas tablas: se liga por el destinatario, que luego se descarta.
  if (!userId && !invitationId && event.recipient) userId = await deps.findUserByEmail(event.recipient)

  const result = await deps.insert({
    svix_id: event.svixId, resend_email_id: event.emailId, event_type: event.type, occurred_at: event.occurredAt,
    user_id: userId, invitation_id: invitationId, kind, link: event.link, bounce_type: event.bounceType,
  })
  if (result.duplicate) return { status: 'duplicate' }

  if (event.type === 'bounced' || event.type === 'complained') {
    if (invitationId) await deps.suppressInvitation(invitationId, event.type)
    // Quien marca un correo como spam no debe recibir más: se apaga su correo (la baja general que ya respetan todos los envíos).
    if (event.type === 'complained' && userId) await deps.optOutUser(userId)
  }
  return { status: 'stored' }
}
