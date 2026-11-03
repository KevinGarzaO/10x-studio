import { supabase } from '../supabase.service'
import { isMissingMigration } from './segments'

/**
 * Bitácora de cambios del producto: qué se cambió y cuándo, para medir ANTES y DESPUÉS (SQL en backend/sql/product-changes-migration.sql).
 *
 * Los números suben y bajan solos, así que sin la fecha exacta de cada cambio no hay con qué compararlos. Aquí viven las reglas de
 * qué commits cuentan como "cambio" (los que la gente ve: feat / fix / perf), cómo se anotan y cómo se lee el antes/después con
 * honestidad: nunca se dice que un cambio "causó" algo, solo qué se movió y qué tan confiable es la comparación.
 */
export const CHANGE_KINDS = ['feature', 'fix', 'experiment', 'config', 'content', 'chore'] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]
export const CHANGE_SOURCES = ['manual', 'git', 'deploy'] as const
export type ChangeSource = (typeof CHANGE_SOURCES)[number]

export interface ChangeInput {
  title: string
  description?: string | null
  kind?: ChangeKind
  area?: string
  expectedMetric?: string | null
  commitSha?: string | null
  source?: ChangeSource
  shippedAt?: Date
}

/** Los tipos de commit que cambian lo que ve o vive la gente; docs, pruebas, refactors y demás no mueven los números. */
const COMMIT_KIND: Record<string, ChangeKind> = { feat: 'feature', fix: 'fix', perf: 'feature' }

export const slugArea = (scope: string | undefined): string => {
  const slug = (scope ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
  return /^[a-z]/.test(slug) && slug.length >= 2 ? slug : 'general'
}

/** "fix(feed): algo" -> { kind: 'fix', area: 'feed', title: 'algo' }. Null si no es un cambio que se mida (docs, test, chore, merges...). */
export function parseCommitSubject(subject: string): { kind: ChangeKind; area: string; title: string } | null {
  const match = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(subject.trim())
  if (!match) return null
  const kind = COMMIT_KIND[match[1].toLowerCase()]
  if (!kind) return null
  const title = match[4].trim().slice(0, 300)
  return title.length >= 3 ? { kind, area: slugArea(match[2]), title } : null
}

/**
 * La métrica que se espera mover, escrita en el cuerpo del commit con una línea `Expects: <qué métrica y hacia dónde>`
 * (también vale `Espera:` o `Esperado:`). Sin esa línea el cambio queda sin métrica esperada y la bitácora lo marca.
 */
export function parseExpectedMetric(message: string | null | undefined): string | null {
  if (!message) return null
  const body = message.split('\n').slice(1).join('\n')
  const found = /^\s*(?:expects|espera|esperado)\s*:\s*(.+?)\s*$/im.exec(body)
  const value = found?.[1]?.trim().slice(0, 300)
  return value && value.length >= 3 ? value : null
}

const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)

const MISSING = 'Falta correr product-changes-migration.sql.'

/** Anota un cambio. Un commit que ya estaba (misma sha) no se duplica. Devuelve si se guardó. */
export async function recordChange(input: ChangeInput): Promise<{ saved: boolean; reason?: string }> {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 300) return { saved: false, reason: 'El título debe tener entre 3 y 300 letras.' }
  if (input.kind && !CHANGE_KINDS.includes(input.kind)) return { saved: false, reason: `Tipo inválido (usa ${CHANGE_KINDS.join(', ')}).` }
  const row = {
    title,
    description: clean(input.description),
    kind: input.kind ?? 'feature',
    area: slugArea(input.area),
    expected_metric: clean(input.expectedMetric),
    commit_sha: clean(input.commitSha),
    source: input.source ?? 'manual',
    shipped_at: (input.shippedAt ?? new Date()).toISOString(),
  }
  const { error } = row.commit_sha
    ? await supabase.from('product_changes').upsert(row, { onConflict: 'commit_sha', ignoreDuplicates: true })
    : await supabase.from('product_changes').insert(row)
  if (error) return { saved: false, reason: isMissingMigration(error.message) ? MISSING : error.message }
  return { saved: true }
}

/**
 * Al arrancar tras un despliegue de Railway: anota el commit desplegado con la hora REAL del despliegue.
 * Si ese commit ya estaba traído de git (con la hora del commit) se corrige a la hora en que de verdad salió. Nunca lanza.
 */
export async function recordDeployFromEnv(env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): Promise<{ saved: boolean; reason?: string }> {
  const sha = clean(env.RAILWAY_GIT_COMMIT_SHA)
  const message = clean(env.RAILWAY_GIT_COMMIT_MESSAGE)
  if (!sha || !message) return { saved: false, reason: 'no es un despliegue de Railway' }
  const parsed = parseCommitSubject(message.split('\n')[0])
  if (!parsed) return { saved: false, reason: 'el commit no es un cambio que se mida' }
  const expectedMetric = parseExpectedMetric(message)
  try {
    const existing = await supabase.from('product_changes').select('id, source').eq('commit_sha', sha).maybeSingle()
    if (existing.error) return { saved: false, reason: isMissingMigration(existing.error.message) ? MISSING : existing.error.message }
    if (existing.data) {
      if (existing.data.source !== 'git') return { saved: false, reason: 'ya estaba anotado' }
      const { error } = await supabase.from('product_changes').update({ shipped_at: now.toISOString(), source: 'deploy', ...(expectedMetric ? { expected_metric: expectedMetric } : {}) }).eq('id', existing.data.id)
      return error ? { saved: false, reason: error.message } : { saved: true }
    }
    return await recordChange({ ...parsed, expectedMetric, commitSha: sha, source: 'deploy', shippedAt: now })
  } catch (error) {
    return { saved: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

// ---------- Lectura del antes/después ----------

export interface ImpactRow {
  id: string; shipped_at: string; title: string; description: string | null; kind: ChangeKind; area: string; expected_metric: string | null; source: ChangeSource; commit_sha: string | null
  before_sessions: number; before_active_person_days: number; before_new_active: number; before_registrations: number; before_errors: number; before_tracked_days: number | string; before_calendar_days: number | string
  after_sessions: number; after_active_person_days: number; after_new_active: number; after_registrations: number; after_errors: number; after_tracked_days: number | string; after_calendar_days: number | string
  after_complete: boolean; nearby_changes: number
}

export interface MetricShift { before: number | null; after: number | null; changePct: number | null }

/**
 * Qué tan lejos se puede llegar con la comparación:
 *  - pendiente: aún no pasa ni un día de medición después del cambio.
 *  - sin_base: antes del cambio hay menos de 2 días medidos (la medición nueva empezó el 30 de octubre de 2026).
 *  - mezclado: 3 o más otros cambios cayeron en la misma ventana; no se puede atribuir a este.
 *  - comparable: hay base, hay después y no hay mucho ruido (sigue sin probar causa).
 */
export type Confidence = 'pendiente' | 'sin_base' | 'mezclado' | 'comparable'

export interface ChangeImpact {
  id: string; shippedAt: string; title: string; description: string | null; kind: ChangeKind; area: string; expectedMetric: string | null; source: ChangeSource; commitSha: string | null
  windowDays: number
  /** Promedios por día medido (personas activas por día, nuevas activas por día, sesiones por día, errores por día) y registros por día de calendario. */
  activePeoplePerDay: MetricShift
  newActivePerDay: MetricShift
  sessionsPerDay: MetricShift
  registrationsPerDay: MetricShift
  errorsPerDay: MetricShift
  beforeTrackedDays: number
  afterTrackedDays: number
  afterComplete: boolean
  nearbyChanges: number
  confidence: Confidence
}

const num = (value: number | string | null | undefined) => (value == null ? 0 : Number(value))
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

/** Total / días; null si no hay días con qué dividir (no se inventa un cero). */
export function perDay(total: number, days: number): number | null {
  return days >= 0.25 ? round(total / days) : null
}

export function shift(before: number | null, after: number | null): MetricShift {
  const changePct = before != null && after != null && before > 0 ? round(((after - before) / before) * 100, 0) : null
  return { before, after, changePct }
}

export function confidenceOf(row: Pick<ImpactRow, 'before_tracked_days' | 'after_tracked_days' | 'nearby_changes'>): Confidence {
  if (num(row.after_tracked_days) < 1) return 'pendiente'
  if (num(row.before_tracked_days) < 2) return 'sin_base'
  if (row.nearby_changes >= 3) return 'mezclado'
  return 'comparable'
}

export function describeImpact(row: ImpactRow, windowDays: number): ChangeImpact {
  const beforeDays = num(row.before_tracked_days)
  const afterDays = num(row.after_tracked_days)
  return {
    id: row.id, shippedAt: row.shipped_at, title: row.title, description: row.description, kind: row.kind, area: row.area,
    expectedMetric: row.expected_metric, source: row.source, commitSha: row.commit_sha, windowDays,
    activePeoplePerDay: shift(perDay(row.before_active_person_days, beforeDays), perDay(row.after_active_person_days, afterDays)),
    newActivePerDay: shift(perDay(row.before_new_active, beforeDays), perDay(row.after_new_active, afterDays)),
    sessionsPerDay: shift(perDay(row.before_sessions, beforeDays), perDay(row.after_sessions, afterDays)),
    // Los registros salen de `users`, que tiene historia más larga que la medición: se dividen entre los días de calendario.
    registrationsPerDay: shift(perDay(row.before_registrations, num(row.before_calendar_days)), perDay(row.after_registrations, num(row.after_calendar_days))),
    errorsPerDay: shift(perDay(row.before_errors, beforeDays), perDay(row.after_errors, afterDays)),
    beforeTrackedDays: round(beforeDays), afterTrackedDays: round(afterDays),
    afterComplete: row.after_complete, nearbyChanges: row.nearby_changes, confidence: confidenceOf(row),
  }
}

export const IMPACT_WINDOWS = [3, 7, 14] as const

/** El antes/después de los últimos cambios. `{ ready: false }` si falta la migración. */
export async function loadChangeImpact(windowDays: number, limit: number, since?: Date): Promise<{ ready: false } | { ready: true; windowDays: number; changes: ChangeImpact[]; withoutExpectedMetric: number }> {
  const { data, error } = await supabase.rpc('analytics_change_impact', { p_window_days: windowDays, p_limit: limit, p_since: since ? since.toISOString() : null })
  if (error) {
    if (isMissingMigration(error.message)) return { ready: false }
    throw new Error(error.message)
  }
  const changes = ((data ?? []) as ImpactRow[]).map((row) => describeImpact(row, windowDays))
  // Sin métrica esperada la bitácora no puede evaluar si el cambio sirvió: se cuenta cuántos (de los que la gente ve) quedaron así.
  return { ready: true, windowDays, changes, withoutExpectedMetric: changes.filter((change) => !change.expectedMetric && (change.kind === 'feature' || change.kind === 'fix')).length }
}
