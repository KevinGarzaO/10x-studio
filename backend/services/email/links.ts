/** La dirección pública del sitio, de donde salen los enlaces de los correos. Nunca localhost. */
export function emailSiteUrl(): string {
  const url = process.env.COMMUNITY_APP_URL || ''
  return (url && !/localhost|127\.0\.0\.1/.test(url) ? url : 'https://avotalent.app').replace(/\/+$/, '')
}

/**
 * La línea con los enlaces legales para el pie de todos los correos (aviso de privacidad y términos), con la dirección pública del sitio.
 * Las páginas viven en /privacidad y /terminos y se abren sin iniciar sesión.
 */
export function legalFooterHtml(): string {
  const base = emailSiteUrl()
  return `<a href="${base}/privacidad" style="color: #9ca3af !important; text-decoration: underline;">Aviso de privacidad</a> · <a href="${base}/terminos" style="color: #9ca3af !important; text-decoration: underline;">Términos y condiciones</a>`
}

/** Un enlace del sitio marcado para saber, en el panel, cuánta gente llegó desde un correo. */
export function trackedLink(path: string, campaign: string, content?: string, medium: string = 'recordatorio'): string {
  const params = new URLSearchParams({ utm_source: 'email', utm_medium: medium, utm_campaign: campaign })
  if (content) params.set('utm_content', content)
  return `${emailSiteUrl()}${path}${path.includes('?') ? '&' : '?'}${params.toString()}`
}
