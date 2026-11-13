import { Router, Request, Response } from 'express'
import { supabase } from '@avotalent/core/services/supabase.service'
import { recordChange } from '@avotalent/core/services/analytics/changes'
import { STAGES, STAGE_LABEL, isStage, type Stage } from '@avotalent/core/services/flags/evaluate'
import { clearFlagsCache, computeExposure, loadFlagRows, type FlagRow } from '@avotalent/core/services/flags/flags.service'

/**
 * Administración de los interruptores (solo el fundador: va detrás de la sesión de superadmin; ver index.ts). Se monta dentro de
 * /api/admin/analytics como /flags. `GET /flags/summary` es la única ruta que el agente puede leer con su llave de servicio: solo conteos.
 *
 * Cada cambio de paso queda en `feature_flag_log` y en la bitácora de cambios (`product_changes`), para que el antes/después del panel
 * sepa CUÁNDO se encendió algo y a quién.
 */
const router = Router()
const MAX_RETIRE_DAYS = 365
const notReady = (res: Response) => res.status(503).json({ ready: false, error: 'Falta correr backend/sql/feature-flags-migration.sql.' })
const missing = (message: string) => /does not exist|schema cache|relation|feature_flag|user_groups/i.test(message)
const actorOf = (req: Request) => ((req as Request & { userId?: string }).userId ?? null)

const handle = (name: string, run: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await run(req, res)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (missing(message)) return notReady(res)
    console.error(`[Interruptores] ${name}:`, error)
    res.status(500).json({ error: `No se pudo: ${name}` })
  }
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const todayIso = () => new Date().toISOString().slice(0, 10)
const daysFromNow = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000)

// Todos los interruptores, con a cuántas cuentas les aparecen hoy, su historial reciente y cuáles ya pasaron su fecha de retiro.
router.get('/', handle('lista de interruptores', async (_req, res) => {
  const rows = await loadFlagRows()
  if (!rows) return notReady(res)
  const [exposure, log, groups] = await Promise.all([
    computeExposure(rows),
    supabase.from('feature_flag_log').select('flag_key, changed_at, from_stage, to_stage, note').order('changed_at', { ascending: false }).limit(200),
    supabase.from('user_groups').select('group_key'),
  ])
  const logBy = new Map<string, unknown[]>()
  for (const entry of (log.data ?? []) as Array<{ flag_key: string }>) logBy.set(entry.flag_key, [...(logBy.get(entry.flag_key) ?? []), entry])
  const betaMembers = ((groups.data ?? []) as Array<{ group_key: string }>).filter((row) => row.group_key === 'beta').length
  res.json({
    ready: true,
    stages: STAGES.map((key) => ({ key, label: STAGE_LABEL[key] })),
    betaMembers,
    flags: rows.map((flag) => ({
      ...flag,
      stageLabel: STAGE_LABEL[flag.stage],
      daysToRetire: daysFromNow(flag.retire_by),
      overdue: daysFromNow(flag.retire_by) < 0,
      exposure: exposure.get(flag.key) ?? null,
      history: (logBy.get(flag.key) ?? []).slice(0, 10),
    })),
  })
}))

// Conteos para el agente: cuántos interruptores hay, en qué paso, a cuántas cuentas llegan y cuáles están vencidos. Sin personas.
router.get('/summary', handle('resumen de interruptores', async (_req, res) => {
  const rows = await loadFlagRows()
  if (!rows) return res.json({ ready: false })
  const exposure = await computeExposure(rows)
  res.json({
    ready: true,
    total: rows.length,
    overdue: rows.filter((flag) => daysFromNow(flag.retire_by) < 0).length,
    flags: rows.map((flag) => ({
      key: flag.key,
      stage: flag.stage,
      stageLabel: STAGE_LABEL[flag.stage],
      retireBy: flag.retire_by,
      overdue: daysFromNow(flag.retire_by) < 0,
      exposedAccounts: exposure.get(flag.key)?.total ?? 0,
      ofRealAccounts: exposure.get(flag.key)?.realAccounts ?? 0,
    })),
  })
}))

// Crear un interruptor: nace APAGADO y con fecha de retiro obligatoria (máximo un año).
router.post('/', handle('crear interruptor', async (req, res) => {
  const key = String(req.body?.key ?? '').trim()
  const description = String(req.body?.description ?? '').trim()
  const retireBy = req.body?.retire_by
  if (!/^[a-z][a-z0-9_]{2,48}$/.test(key)) return res.status(400).json({ error: 'El nombre va en minúsculas, números y guion bajo (3 a 49 letras), empezando con letra.' })
  if (description.length < 5 || description.length > 300) return res.status(400).json({ error: 'Describe para qué es (5 a 300 letras).' })
  if (!isDay(retireBy)) return res.status(400).json({ error: 'Pon la fecha de retiro (AAAA-MM-DD).' })
  const days = daysFromNow(retireBy)
  if (days < 1 || days > MAX_RETIRE_DAYS) return res.status(400).json({ error: `La fecha de retiro debe ser de mañana a ${MAX_RETIRE_DAYS} días.` })
  const { error } = await supabase.from('feature_flags').insert({ key, description, stage: 'off', retire_by: retireBy, updated_by: actorOf(req) })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: 'Ya existe un interruptor con ese nombre.' })
    throw new Error(error.message)
  }
  await supabase.from('feature_flag_log').insert({ flag_key: key, changed_by: actorOf(req), from_stage: null, to_stage: 'off', note: 'creado' })
  clearFlagsCache()
  res.status(201).json({ ok: true })
}))

// Cambiar el paso: sube o baja un escalón (o salta, p. ej. al apagado de emergencia). Queda en el historial y en la bitácora de cambios.
router.patch('/:key', handle('cambiar paso', async (req, res) => {
  const key = req.params.key
  const stage = req.body?.stage
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : null
  if (!isStage(stage)) return res.status(400).json({ error: `Paso inválido (usa ${STAGES.join(', ')}).` })
  const current = await supabase.from('feature_flags').select('key, stage').eq('key', key).maybeSingle()
  if (current.error) throw new Error(current.error.message)
  if (!current.data) return res.status(404).json({ error: 'Ese interruptor no existe.' })
  const from = current.data.stage as Stage
  if (from === stage) return res.json({ ok: true, unchanged: true })
  const { error } = await supabase.from('feature_flags').update({ stage, updated_at: new Date().toISOString(), updated_by: actorOf(req) }).eq('key', key)
  if (error) throw new Error(error.message)
  await supabase.from('feature_flag_log').insert({ flag_key: key, changed_by: actorOf(req), from_stage: from, to_stage: stage, note })
  clearFlagsCache()
  // Para el antes/después del panel: el paso de un interruptor es un cambio del producto con fecha exacta.
  await recordChange({
    title: `Interruptor ${key}: ${STAGE_LABEL[from]} → ${STAGE_LABEL[stage]}`,
    kind: 'config',
    area: 'interruptores',
    description: note,
    expectedMetric: null,
    source: 'manual',
  }).catch(() => undefined)
  res.json({ ok: true, from, to: stage })
}))

// Mover la fecha de retiro (prorrogar) con el mismo tope de un año.
router.patch('/:key/retire', handle('mover fecha de retiro', async (req, res) => {
  const retireBy = req.body?.retire_by
  if (!isDay(retireBy)) return res.status(400).json({ error: 'Pon la fecha de retiro (AAAA-MM-DD).' })
  const days = daysFromNow(retireBy)
  if (days < 1 || days > MAX_RETIRE_DAYS) return res.status(400).json({ error: `La fecha debe ser de mañana a ${MAX_RETIRE_DAYS} días.` })
  const { error } = await supabase.from('feature_flags').update({ retire_by: retireBy, updated_at: new Date().toISOString() }).eq('key', req.params.key)
  if (error) throw new Error(error.message)
  clearFlagsCache()
  res.json({ ok: true })
}))

// Borrar un interruptor ya retirado (el código que lo leía debe haberse quitado antes). Borra también sus excepciones.
router.delete('/:key', handle('borrar interruptor', async (req, res) => {
  const { data } = await supabase.from('feature_flags').select('stage').eq('key', req.params.key).maybeSingle()
  if (!data) return res.status(404).json({ error: 'Ese interruptor no existe.' })
  if (data.stage !== 'off' && data.stage !== 'todos') return res.status(409).json({ error: 'Solo se borra uno apagado o ya en «Todos»; primero llévalo a uno de esos pasos.' })
  const { error } = await supabase.from('feature_flags').delete().eq('key', req.params.key)
  if (error) throw new Error(error.message)
  await supabase.from('feature_flag_log').insert({ flag_key: req.params.key, changed_by: actorOf(req), from_stage: data.stage, to_stage: data.stage, note: 'borrado' })
  clearFlagsCache()
  res.json({ ok: true })
}))

// Excepciones por persona (se buscan por correo o usuario; el correo nunca sale en la respuesta).
async function findAccount(identifier: string): Promise<{ id: string; username: string | null } | null> {
  const clean = identifier.trim().toLowerCase()
  if (!clean) return null
  const column = clean.includes('@') ? 'email' : 'username'
  const { data, error } = await supabase.from('users').select('id, username').eq(column, clean).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { id: string; username: string | null } | null) ?? null
}

router.get('/:key/overrides', handle('excepciones', async (req, res) => {
  const { data, error } = await supabase.from('feature_flag_overrides').select('user_id, mode, note, created_at').eq('flag_key', req.params.key)
  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((row: { user_id: string }) => row.user_id)
  const names = ids.length ? await supabase.from('users').select('id, username').in('id', ids) : { data: [] as Array<{ id: string; username: string | null }> }
  const nameOf = new Map(((names.data ?? []) as Array<{ id: string; username: string | null }>).map((row) => [row.id, row.username]))
  res.json({ overrides: (data ?? []).map((row: { user_id: string; mode: string; note: string | null; created_at: string }) => ({ userId: row.user_id, username: nameOf.get(row.user_id) ?? null, mode: row.mode, note: row.note, createdAt: row.created_at })) })
}))

router.put('/:key/overrides', handle('poner excepción', async (req, res) => {
  const mode = req.body?.mode
  if (mode !== 'allow' && mode !== 'deny') return res.status(400).json({ error: 'El modo es allow o deny.' })
  const account = await findAccount(String(req.body?.who ?? ''))
  if (!account) return res.status(404).json({ error: 'No encontré esa cuenta (usa su correo o su usuario).' })
  const { error } = await supabase.from('feature_flag_overrides').upsert({ flag_key: req.params.key, user_id: account.id, mode, note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 200) : null }, { onConflict: 'flag_key,user_id' })
  if (error) throw new Error(error.message)
  clearFlagsCache()
  res.json({ ok: true, username: account.username })
}))

router.delete('/:key/overrides/:userId', handle('quitar excepción', async (req, res) => {
  const { error } = await supabase.from('feature_flag_overrides').delete().eq('flag_key', req.params.key).eq('user_id', req.params.userId)
  if (error) throw new Error(error.message)
  clearFlagsCache()
  res.json({ ok: true })
}))

// Lista beta: las personas invitadas que el fundador marca a mano.
router.get('/groups/beta', handle('lista beta', async (_req, res) => {
  const { data, error } = await supabase.from('user_groups').select('user_id, added_at').eq('group_key', 'beta').order('added_at', { ascending: false })
  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((row: { user_id: string }) => row.user_id)
  const names = ids.length ? await supabase.from('users').select('id, username').in('id', ids) : { data: [] as Array<{ id: string; username: string | null }> }
  const nameOf = new Map(((names.data ?? []) as Array<{ id: string; username: string | null }>).map((row) => [row.id, row.username]))
  res.json({ members: (data ?? []).map((row: { user_id: string; added_at: string }) => ({ userId: row.user_id, username: nameOf.get(row.user_id) ?? null, addedAt: row.added_at })) })
}))

router.put('/groups/beta', handle('agregar a beta', async (req, res) => {
  const account = await findAccount(String(req.body?.who ?? ''))
  if (!account) return res.status(404).json({ error: 'No encontré esa cuenta (usa su correo o su usuario).' })
  const { error } = await supabase.from('user_groups').upsert({ user_id: account.id, group_key: 'beta', added_by: actorOf(req) }, { onConflict: 'user_id,group_key' })
  if (error) throw new Error(error.message)
  clearFlagsCache()
  res.json({ ok: true, username: account.username })
}))

router.delete('/groups/beta/:userId', handle('quitar de beta', async (req, res) => {
  const { error } = await supabase.from('user_groups').delete().eq('user_id', req.params.userId).eq('group_key', 'beta')
  if (error) throw new Error(error.message)
  clearFlagsCache()
  res.json({ ok: true })
}))

export type { FlagRow }
export default router
