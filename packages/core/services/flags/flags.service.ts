import { supabase } from '../supabase.service'
import { readAll } from '../analytics/read'
import { ANONYMOUS, evaluate, type Stage, type Subject } from './evaluate'

/**
 * Lo que decide, para una persona, qué funciones ve (ver evaluate.ts para la regla). Dos principios:
 *  - Ante la duda, APAGADO. Si las tablas no existen (migración sin correr), si la base falla o si la función no existe, nadie la ve. Un
 *    sistema de interruptores que se cae jamás debe encender algo a medio probar ni tumbar la aplicación: nunca lanza.
 *  - La decisión se toma AQUÍ, en el servidor. La pantalla solo recibe el resultado: ocultar un botón no es un permiso.
 */
export interface FlagRow { key: string; description: string; stage: Stage; retire_by: string; updated_at: string }

const FLAGS_TTL_MS = 15_000
const SUBJECT_TTL_MS = 30_000
const cacheOn = () => process.env.NODE_ENV !== 'test'

let flagsCache: { at: number; rows: FlagRow[] | null } | null = null
const subjectCache = new Map<string, { at: number; subject: Subject; overrides: Map<string, 'allow' | 'deny'> }>()

/** Se llama al cambiar un interruptor para que el cambio se vea ya (en este proceso; en los demás, a los 15 s). */
export function clearFlagsCache() {
  flagsCache = null
  subjectCache.clear()
}

/** Todos los interruptores, o null si las tablas todavía no existen. */
export async function loadFlagRows(): Promise<FlagRow[] | null> {
  if (cacheOn() && flagsCache && Date.now() - flagsCache.at < FLAGS_TTL_MS) return flagsCache.rows
  let rows: FlagRow[] | null
  try {
    const { data, error } = await supabase.from('feature_flags').select('key, description, stage, retire_by, updated_at')
    rows = error ? null : ((data ?? []) as FlagRow[])
  } catch {
    rows = null
  }
  if (cacheOn()) flagsCache = { at: Date.now(), rows }
  return rows
}

/** Quién es esta persona para los interruptores: si es del equipo, a qué grupos pertenece y sus excepciones. */
export async function loadSubject(userId: string): Promise<{ subject: Subject; overrides: Map<string, 'allow' | 'deny'> }> {
  const hit = subjectCache.get(userId)
  if (cacheOn() && hit && Date.now() - hit.at < SUBJECT_TTL_MS) return hit
  const [user, groups, overrides] = await Promise.all([
    supabase.from('users').select('user_kind, is_test_account').eq('id', userId).maybeSingle(),
    supabase.from('user_groups').select('group_key').eq('user_id', userId),
    supabase.from('feature_flag_overrides').select('flag_key, mode').eq('user_id', userId),
  ])
  const memberOf = new Set(((groups.error ? [] : groups.data) ?? []).map((row: { group_key: string }) => row.group_key))
  const row = user.data as { user_kind?: string; is_test_account?: boolean } | null
  const isTeam = row?.user_kind === 'superadmin' || row?.is_test_account === true || memberOf.has('equipo')
  const result = {
    at: Date.now(),
    subject: { userId, isTeam, groups: memberOf } as Subject,
    overrides: new Map(((overrides.error ? [] : overrides.data) ?? []).map((item: { flag_key: string; mode: 'allow' | 'deny' }) => [item.flag_key, item.mode] as const)),
  }
  if (cacheOn()) subjectCache.set(userId, result)
  return result
}

/** Las funciones encendidas para esta persona: `{ seguir_personas: true, ... }`. Solo trae las encendidas; lo que falta está apagado. */
export async function flagsFor(userId: string | null): Promise<Record<string, boolean>> {
  try {
    const rows = await loadFlagRows()
    if (!rows || rows.length === 0) return {}
    const { subject, overrides } = userId ? await loadSubject(userId) : { subject: ANONYMOUS, overrides: new Map<string, 'allow' | 'deny'>() }
    const enabled: Record<string, boolean> = {}
    for (const flag of rows) if (evaluate(flag, subject, overrides.get(flag.key) ?? null).enabled) enabled[flag.key] = true
    return enabled
  } catch (error) {
    console.error('[Interruptores] No se pudieron evaluar; todo queda apagado:', error instanceof Error ? error.message : error)
    return {}
  }
}

/** ¿Ve esta persona esta función? Una función que no existe está apagada. */
export async function isEnabled(key: string, userId: string | null): Promise<boolean> {
  return (await flagsFor(userId))[key] === true
}

// ---------------------------------------------------------------------------------------------------------------------
// Administración (solo el fundador, desde el panel)
// ---------------------------------------------------------------------------------------------------------------------
export interface Exposure { total: number; team: number; beta: number; others: number; realAccounts: number }

interface Account { id: string; user_kind: string; is_test_account: boolean | null; is_scraper_profile: boolean | null }

/** A cuántas cuentas les aparece hoy cada función: se evalúa a CADA cuenta real y del equipo con la misma regla que la aplicación. */
export async function computeExposure(flags: FlagRow[]): Promise<Map<string, Exposure>> {
  const [accounts, groups, overrides] = await Promise.all([
    readAll<Account>((from, to) => supabase.from('users').select('id, user_kind, is_test_account, is_scraper_profile').range(from, to)),
    readAll<{ user_id: string; group_key: string }>((from, to) => supabase.from('user_groups').select('user_id, group_key').range(from, to)).catch(() => []),
    readAll<{ flag_key: string; user_id: string; mode: 'allow' | 'deny' }>((from, to) => supabase.from('feature_flag_overrides').select('flag_key, user_id, mode').range(from, to)).catch(() => []),
  ])
  const groupsBy = new Map<string, Set<string>>()
  for (const row of groups) groupsBy.set(row.user_id, (groupsBy.get(row.user_id) ?? new Set()).add(row.group_key))
  const overrideBy = new Map<string, 'allow' | 'deny'>(overrides.map((row) => [`${row.flag_key}|${row.user_id}`, row.mode]))
  const people = accounts.filter((account) => account.is_scraper_profile !== true && (account.user_kind === 'user' || account.user_kind === 'superadmin' || account.is_test_account === true))
  const realAccounts = people.filter((account) => account.user_kind === 'user' && account.is_test_account !== true).length

  const out = new Map<string, Exposure>()
  for (const flag of flags) {
    const exposure: Exposure = { total: 0, team: 0, beta: 0, others: 0, realAccounts }
    for (const account of people) {
      const memberOf = groupsBy.get(account.id) ?? new Set<string>()
      const isTeam = account.user_kind === 'superadmin' || account.is_test_account === true || memberOf.has('equipo')
      const result = evaluate(flag, { userId: account.id, isTeam, groups: memberOf }, overrideBy.get(`${flag.key}|${account.id}`) ?? null)
      if (!result.enabled) continue
      exposure.total++
      if (result.reason === 'equipo') exposure.team++
      else if (result.reason === 'beta') exposure.beta++
      else exposure.others++
    }
    out.set(flag.key, exposure)
  }
  return out
}
