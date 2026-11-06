import { createHash } from 'crypto'
import { supabase } from '../supabase.service'
import { parseUserAgent } from './user-agent'

/**
 * Telemetría: errores y flujos críticos. Ver backend/sql/telemetry-migration.sql.
 *
 * Lo que manda el navegador se trata como NO confiable: se valida, se acota y se limpia de datos personales ANTES de guardarlo
 * (un mensaje de error puede traer un correo, un token o una dirección con parámetros). La cuenta y la huella del error las
 * calcula el servidor; el navegador no puede hacerse pasar por otra persona ni inventar grupos de errores.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ------------------------------------------------------------------------------------------------
// Limpieza
// ------------------------------------------------------------------------------------------------

/** Quita lo que no debe guardarse de un texto de error: correos, tokens, JWT y los parámetros de las direcciones. */
export function scrub(text: string, max: number): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{3,}/g, '[jwt]')
    .replace(/\b(bearer|token|apikey|api_key|access_token|refresh_token|password|secret)(["'\s:=]+)[^\s"',;&)]{4,}/gi, '$1$2[redactado]')
    .replace(/(https?:\/\/[^\s"'<>?#)]+)[?#][^\s"'<>)]*/g, '$1?…')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[token]')
    .slice(0, max)
}

/** Solo la ruta de una dirección (sin dominio, sin parámetros, sin #). */
export function pathOnly(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '/'
  let path = value.trim()
  try {
    path = new URL(path, 'https://x.invalid').pathname
  } catch {
    path = path.split(/[?#]/)[0]
  }
  return path.slice(0, 300) || '/'
}

export interface Frame { file: string; fn: string | null; line: number | null; col: number | null }

/** El stack separado en archivo, función y línea (formatos de Chrome/Edge y de Firefox/Safari). Máximo 30 marcos. */
export function parseStack(stack: unknown): Frame[] {
  if (typeof stack !== 'string') return []
  const frames: Frame[] = []
  for (const raw of stack.split('\n')) {
    const line = raw.trim()
    let match = /^at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/.exec(line) // Chrome: "at fn (url:1:2)" o "at url:1:2"
    let fn: string | null = null
    let file: string | null = null
    let ln: string | null = null
    let col: string | null = null
    if (match) {
      ;[, fn, file, ln, col] = match as unknown as string[]
    } else if ((match = /^(.*?)@(.*?):(\d+):(\d+)$/.exec(line))) {
      ;[, fn, file, ln, col] = match as unknown as string[] // Firefox/Safari: "fn@url:1:2"
    }
    if (!file) continue
    if (/^(native|<anonymous>)/.test(file)) continue
    frames.push({ file: pathOnly(file), fn: fn ? fn.slice(0, 100) : null, line: Number(ln), col: Number(col) })
    if (frames.length >= 30) break
  }
  return frames
}

/** "El mismo error": nombre + mensaje sin números, ids ni textos entre comillas + el primer lugar del stack. */
export function fingerprintOf(name: string, message: string, frames: Frame[]): string {
  const normalized = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'ID')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, 'S')
    .replace(/\d+/g, 'N')
    .trim()
    .slice(0, 200)
  const top = frames[0] ? `${frames[0].file}:${frames[0].line}` : ''
  return createHash('sha1').update(`${name}|${normalized}|${top}`).digest('hex').slice(0, 16)
}

const SENSITIVE_KEY = /pass|token|secret|auth|cookie|email|phone|key|authorization/i

/** El contexto que manda el navegador, acotado: texto corto, números y booleanos, sin nada que parezca un secreto. */
export function cleanContext(value: unknown): Record<string, string | number | boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string | number | boolean> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (SENSITIVE_KEY.test(key) || !/^[\w.-]{1,40}$/.test(key)) continue
    if (typeof item === 'string') out[key] = scrub(item, 200)
    else if (typeof item === 'number' && Number.isFinite(item)) out[key] = item
    else if (typeof item === 'boolean') out[key] = item
  }
  return Object.keys(out).length ? out : null
}

// ------------------------------------------------------------------------------------------------
// Errores
// ------------------------------------------------------------------------------------------------

export interface ErrorRecord {
  session_id: string | null
  path: string
  name: string
  message: string
  stack: string | null
  frames: Frame[]
  fingerprint: string
  source: 'frontend' | 'api' | 'backend'
  context: Record<string, string | number | boolean> | null
}

/** Valida el reporte que manda el navegador. Devuelve null si no es un error utilizable. */
export function parseErrorPayload(body: unknown): ErrorRecord | null {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  if (typeof raw.message !== 'string' || !raw.message.trim()) return null
  const name = typeof raw.name === 'string' && /^[\w$.:\- ]{1,150}$/.test(raw.name) ? raw.name : 'Error'
  const message = scrub(raw.message, 2000)
  const stack = typeof raw.stack === 'string' ? scrub(raw.stack, 8000) : null
  const frames = parseStack(raw.stack)
  const sessionId = typeof raw.session_id === 'string' && UUID.test(raw.session_id) ? raw.session_id.toLowerCase() : null
  return {
    session_id: sessionId,
    path: pathOnly(raw.path),
    name,
    message,
    stack,
    frames,
    fingerprint: fingerprintOf(name, message, frames),
    // El navegador solo puede decir "frontend" o "api" (un fallo al llamar al servidor); "backend" es solo del servidor.
    source: raw.source === 'api' ? 'api' : 'frontend',
    context: cleanContext(raw.context),
  }
}

export interface ErrorContext { clientId: string | null; userAgent: string | null }

/** "Chrome 130 · Windows 10/11 · desktop" */
export function browserInfoOf(userAgent: string | null): string {
  const ua = parseUserAgent(userAgent)
  return [[ua.browser, ua.browserVersion].filter(Boolean).join(' '), [ua.operatingSystem, ua.osVersion].filter(Boolean).join(' '), ua.deviceCategory].filter(Boolean).join(' · ')
}

export async function recordError(record: ErrorRecord, context: ErrorContext): Promise<boolean> {
  const { data, error } = await supabase.rpc('analytics_record_error', {
    p: {
      session_id: record.session_id,
      client_id: context.clientId,
      path: record.path,
      name: record.name,
      message: record.message,
      stack: record.stack,
      frames: record.frames,
      fingerprint: record.fingerprint,
      source: record.source,
      browser_info: browserInfoOf(context.userAgent),
      context: record.context,
    },
  })
  if (error) throw new Error(error.message)
  return data === true
}

// --- errores del servidor (Express): mismo almacén, con tope para que una avería no llene la tabla ---
const seen = new Map<string, number>()
let windowStart = 0
let inWindow = 0

/** Guarda un error del servidor. Nunca lanza ni espera: reportar un error no debe causar otro. */
export function captureServerError(error: unknown, info: { path?: string; userId?: string | null; source?: 'backend' | 'api' } = {}): void {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error desconocido')
    const now = Date.now()
    if (now - windowStart > 60_000) { windowStart = now; inWindow = 0 }
    if (++inWindow > 30) return
    const frames = parseStack((err.stack ?? '').split('\n').map((l) => l.trim()).join('\n'))
    const name = (err.name || 'Error').slice(0, 150)
    const message = scrub(err.message || 'Error', 2000)
    const fingerprint = fingerprintOf(name, message, frames)
    if ((seen.get(fingerprint) ?? 0) > now - 60_000) return
    seen.set(fingerprint, now)
    if (seen.size > 500) for (const [key, at] of seen) if (at < now - 60_000) seen.delete(key)

    void Promise.resolve(
      supabase.rpc('analytics_record_error', {
        p: { path: pathOnly(info.path), name, message, stack: scrub(err.stack ?? '', 8000), frames, fingerprint, source: info.source ?? 'backend', server_user_id: info.userId ?? null, browser_info: 'servidor' },
      }),
    ).catch(() => undefined)
  } catch {
    // reportar un error no debe causar otro
  }
}

// ------------------------------------------------------------------------------------------------
// Flujos
// ------------------------------------------------------------------------------------------------

/** Los flujos que se miden hoy. Una lista cerrada: un navegador no puede inventar flujos nuevos. */
export const FLOWS = ['auth_login', 'auth_register', 'job_search_filter', 'job_application', 'view_feed', 'view_vacancy', 'profile_setup'] as const
export type FlowName = (typeof FLOWS)[number]

export interface FlowRecord {
  flow_id: string
  session_id: string | null
  flow_name: FlowName
  step_name: string
  step_order: number
  path: string | null
  duration_ms: number
  load_time_ms: number
  status: 'completed' | 'dropped_off' | 'error'
  is_final: boolean
  rage_clicks: number
  error_message: string | null
}

const whole = (value: unknown, max: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(Math.round(value), max)) : 0)

/** Valida un paso de flujo que manda el navegador. */
export function parseFlowPayload(body: unknown): FlowRecord | null {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  if (typeof raw.flow_id !== 'string' || !UUID.test(raw.flow_id)) return null
  if (!(FLOWS as readonly string[]).includes(String(raw.flow_name))) return null
  if (typeof raw.step_name !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(raw.step_name)) return null
  return {
    flow_id: raw.flow_id.toLowerCase(),
    session_id: typeof raw.session_id === 'string' && UUID.test(raw.session_id) ? raw.session_id.toLowerCase() : null,
    flow_name: raw.flow_name as FlowName,
    step_name: raw.step_name,
    step_order: whole(raw.step_order, 50),
    path: typeof raw.path === 'string' ? pathOnly(raw.path) : null,
    duration_ms: whole(raw.duration_ms, 86_400_000),
    load_time_ms: whole(raw.load_time_ms, 600_000),
    status: raw.status === 'error' || raw.status === 'dropped_off' ? raw.status : 'completed',
    is_final: raw.is_final === true,
    rage_clicks: whole(raw.rage_clicks, 1000),
    error_message: typeof raw.error_message === 'string' ? scrub(raw.error_message, 500) : null,
  }
}

export async function recordFlowStep(record: FlowRecord, clientId: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('analytics_record_flow_step', { p: { ...record, client_id: clientId } })
  if (error) throw new Error(error.message)
  return data === true
}
