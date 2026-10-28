import { createHmac, timingSafeEqual } from 'crypto'

/** La dirección pública del sitio, de donde salen los enlaces de los correos. Nunca localhost. */
export function emailSiteUrl(): string {
  const url = process.env.COMMUNITY_APP_URL || ''
  return (url && !/localhost|127\.0\.0\.1/.test(url) ? url : 'https://avotalent.app').replace(/\/+$/, '')
}

/** Un enlace del sitio marcado para saber, en el panel, cuánta gente llegó desde un correo. */
export function trackedLink(path: string, campaign: string, content?: string): string {
  const params = new URLSearchParams({ utm_source: 'email', utm_medium: 'recordatorio', utm_campaign: campaign })
  if (content) params.set('utm_content', content)
  return `${emailSiteUrl()}${path}${path.includes('?') ? '&' : '?'}${params.toString()}`
}

/**
 * El enlace de baja lleva una firma de la persona: nadie puede dar de baja a otra adivinando su id.
 * Se firma con EMAIL_LINK_SECRET (una cadena larga y secreta del servidor).
 */
export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('hex').slice(0, 40)
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  if (!userId || !token || !secret) return false
  const expected = Buffer.from(unsubscribeToken(userId, secret))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** La dirección pública del backend (donde vive la baja). */
export function unsubscribeUrl(userId: string, secret: string, apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({ u: userId, t: unsubscribeToken(userId, secret) })
  return `${base}/api/community/email/unsubscribe?${params.toString()}`
}
