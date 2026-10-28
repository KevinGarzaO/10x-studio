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
