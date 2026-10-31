import { supabase } from '../supabase.service'
import { parseUserAgent } from './user-agent'
import { languageFromHeader, type CollectPayload } from './payload'

/** Lo que el servidor sabe del visitante y el navegador no puede falsear tan fácil: viene del intermediario de la comunidad. */
export interface RequestContext {
  clientId: string
  userAgent: string | null
  acceptLanguage: string | null
  country: string | null
  region: string | null
  city: string | null
}

const clip = (value: string | null | undefined, max: number): string | null => (value ? value.slice(0, max) : null)

/**
 * Aplica un envío del navegador a la base. Cada tipo es UNA función SQL (una transacción): la regla de "sesión activa"
 * (10 s, 2 vistas o un evento clave) vive ahí para que nunca quede a medias. Quien la llama decide qué hacer con un
 * fallo: medir no debe romper la página de nadie.
 */
export async function applyCollect(payload: CollectPayload, context: RequestContext): Promise<void> {
  switch (payload.type) {
    case 'session_start': {
      const ua = parseUserAgent(context.userAgent, { brave: payload.brave })
      const { error } = await supabase.rpc('analytics_start_session', {
        p: {
          session_id: payload.sessionId,
          client_id: context.clientId,
          entry_path: payload.entryPath,
          query_params: payload.queryParams,
          country: clip(context.country, 100),
          region: clip(context.region, 100),
          city: clip(context.city, 100),
          device_category: ua.deviceCategory,
          operating_system: ua.operatingSystem,
          os_version: ua.osVersion,
          browser: ua.browser,
          browser_version: ua.browserVersion,
          language: payload.language ?? languageFromHeader(context.acceptLanguage),
          screen_resolution: payload.screenResolution,
          timezone: payload.timezone,
          utm_source: payload.utm.source,
          utm_medium: payload.utm.medium,
          utm_campaign: payload.utm.campaign,
          utm_term: payload.utm.term,
          utm_content: payload.utm.content,
          referrer_host: payload.referrerHost,
        },
      })
      if (error) throw new Error(error.message)
      return
    }
    case 'heartbeat': {
      const { error } = await supabase.rpc('analytics_heartbeat', { p_session_id: payload.sessionId, p_client_id: context.clientId, p_seconds: payload.seconds })
      if (error) throw new Error(error.message)
      return
    }
    case 'page_view': {
      const { error } = await supabase.rpc('analytics_record_page_view', { p_session_id: payload.sessionId, p_client_id: context.clientId, p_path: payload.path, p_query: payload.queryParams })
      if (error) throw new Error(error.message)
      return
    }
    case 'event': {
      const { error } = await supabase.rpc('analytics_record_event', {
        p_session_id: payload.sessionId,
        p_client_id: context.clientId,
        p_name: payload.name,
        p_params: payload.params,
        p_is_conversion: payload.isConversion,
      })
      if (error) throw new Error(error.message)
      return
    }
  }
}

/**
 * User stitching: une TODAS las sesiones y eventos anónimos de este navegador con la persona que acaba de registrarse o
 * iniciar sesión, en una sola transacción SQL (`analytics_stitch_user`). Solo toca filas sin dueño. Devuelve cuántas
 * sesiones se unieron.
 *
 * `userId` tiene que venir de una sesión verificada por el servidor, nunca de lo que diga el navegador.
 */
export async function executeUserStitching(clientId: string, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('analytics_stitch_user', { p_client_id: clientId, p_user_id: userId })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}
