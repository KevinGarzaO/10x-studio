/** La dirección pública del sitio, de donde salen los enlaces de los correos. Nunca localhost. */
export function emailSiteUrl(): string {
  const url = process.env.COMMUNITY_APP_URL || ''
  return (url && !/localhost|127\.0\.0\.1/.test(url) ? url : 'https://avotalent.app').replace(/\/+$/, '')
}

/** La página de AvoTalent en LinkedIn (la misma que el sitio): los correos invitan a seguirla. */
export const LINKEDIN_COMPANY_URL = 'https://www.linkedin.com/company/avotalent'

/**
 * La línea de enlaces para el pie de todos los correos: seguir a AvoTalent en LinkedIn y los legales (aviso de privacidad y términos), con la dirección pública del sitio.
 * Las páginas viven en /privacidad y /terminos y se abren sin iniciar sesión.
 */
export function footerLinksHtml(): string {
  const base = emailSiteUrl()
  return `<a href="${LINKEDIN_COMPANY_URL}" style="color: #9ca3af !important; text-decoration: underline;">Síguenos en LinkedIn</a> · <a href="${base}/privacidad" style="color: #9ca3af !important; text-decoration: underline;">Aviso de privacidad</a> · <a href="${base}/terminos" style="color: #9ca3af !important; text-decoration: underline;">Términos y condiciones</a>`
}

/** Un enlace del sitio marcado para saber, en el panel, cuánta gente llegó desde un correo. */
export function trackedLink(path: string, campaign: string, content?: string, medium: string = 'recordatorio'): string {
  const params = new URLSearchParams({ utm_source: 'email', utm_medium: medium, utm_campaign: campaign })
  if (content) params.set('utm_content', content)
  return `${emailSiteUrl()}${path}${path.includes('?') ? '&' : '?'}${params.toString()}`
}
