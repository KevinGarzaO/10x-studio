/**
 * ¿La página se abrió dentro de otra app (el navegador interno de LinkedIn, Facebook, Instagram...)? Esos navegadores no comparten las
 * sesiones ni las contraseñas guardadas del navegador de la persona, y el inicio de sesión con LinkedIn o GitHub suele atorarse ahí.
 * Es lo que se ve en los datos: casi toda la gente que llega desde la app de LinkedIn en el teléfono se pierde en el aviso de registro.
 *
 * Se detecta por el User-Agent (iOS lo trae marcado) o por el sitio de referencia (`android-app://com.linkedin.android`).
 */
export type InAppBrowser = 'linkedin' | 'facebook' | 'instagram' | 'other'

export function detectInAppBrowser(userAgent: string, referrer = ''): InAppBrowser | null {
  const ua = userAgent || ''
  if (/LinkedInApp/i.test(ua) || /^android-app:\/\/com\.linkedin\.android/i.test(referrer)) return 'linkedin'
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook'
  if (/Instagram/i.test(ua)) return 'instagram'
  // Android WebView genérico: «; wv)» en el User-Agent.
  if (/; wv\)/i.test(ua)) return 'other'
  return null
}

export function currentInAppBrowser(): InAppBrowser | null {
  if (typeof navigator === 'undefined') return null
  return detectInAppBrowser(navigator.userAgent, typeof document !== 'undefined' ? document.referrer : '')
}
