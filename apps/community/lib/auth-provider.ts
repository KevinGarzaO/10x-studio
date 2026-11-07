import { trackEvent } from './web-analytics'
import { currentInAppBrowser } from './in-app-browser'

/**
 * El registro con LinkedIn / GitHub, medido por proveedor (requirements: diagnóstico del registro, 6 nov 2026). El 41 % de los intentos de
 * registro se completaba y no había errores técnicos: la pérdida estaba en el paso por el proveedor, que no se veía. Aquí se anota
 *   - `auth_provider_click`: la persona tocó el botón de un proveedor (qué proveedor, desde qué pantalla, si es un navegador interno);
 *   - `auth_provider_return`: cómo volvió (con sesión, el proveedor negó o canceló, error, o no hubo sesión).
 * Quien toca y NUNCA vuelve es la pérdida que no deja rastro: se cuenta comparando clics con regresos.
 *
 * Del error solo se guarda un CÓDIGO de una lista cerrada, nunca el texto que trae el proveedor (puede incluir datos de la persona).
 */
export type AuthProvider = 'linkedin' | 'github' | 'google'
export type ProviderSurface = 'signup' | 'login' | 'wall'
export type ProviderOutcome = 'success' | 'denied' | 'error' | 'no_session' | 'sync_failed' | 'network'

const KEY = 'avo_oauth_provider'

/** Códigos que devuelve un proveedor OAuth (RFC 6749 y Supabase). Lo demás se guarda como `other`. */
const KNOWN_REASONS = ['access_denied', 'server_error', 'temporarily_unavailable', 'invalid_request', 'unauthorized_client', 'invalid_scope', 'bad_oauth_callback', 'bad_oauth_state', 'provider_email_needs_verification', 'user_already_exists'] as const

export function safeReason(code: unknown): string {
  const value = typeof code === 'string' ? code.toLowerCase().trim() : ''
  return (KNOWN_REASONS as readonly string[]).includes(value) ? value : 'other'
}

export function noteProviderClick(provider: AuthProvider, surface: ProviderSurface): void {
  try { sessionStorage.setItem(KEY, provider) } catch { /* sin almacenamiento: el regreso dirá «desconocido» */ }
  void trackEvent('auth_provider_click', { provider, surface, in_app: currentInAppBrowser() ?? 'no' })
}

export function rememberedProvider(): AuthProvider | 'desconocido' {
  try {
    const value = sessionStorage.getItem(KEY)
    return value === 'linkedin' || value === 'github' || value === 'google' ? value : 'desconocido'
  } catch {
    return 'desconocido'
  }
}

export function noteProviderReturn(outcome: ProviderOutcome, extra: { reason?: unknown; isNew?: boolean } = {}): void {
  const params: Record<string, string | boolean> = { provider: rememberedProvider(), outcome, in_app: currentInAppBrowser() ?? 'no' }
  if (extra.reason !== undefined) params.reason = safeReason(extra.reason)
  if (extra.isNew !== undefined) params.is_new = extra.isNew
  void trackEvent('auth_provider_return', params)
  if (outcome === 'success') { try { sessionStorage.removeItem(KEY) } catch { /* nada que borrar */ } }
}
