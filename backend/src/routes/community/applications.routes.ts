import { Router, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import {
  ANSWERS, PERSON_STATUSES, answerPatch, isUuid, pendingFor, publicApplication, recordClick, statusPatch,
  type Answer, type ApplicationRow, type ApplicationStatus,
} from '../../../services/applications/applications'

/**
 * Mis postulaciones. Todo es de la persona con sesión (nadie ve las de otra) y nada de esto rompe el resto del sitio: si falta la tabla
 * (migración sin correr) las rutas contestan 503 y la app sigue como siempre.
 */
const router = Router()
router.use(communityAuthMiddleware)

/** Una vacante cuenta como abierta 45 días (misma regla que las páginas públicas). */
const OPEN_DAYS = 45

const notReady = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  if (/vacancy_applications|relation|does not exist|schema cache/i.test(message)) return res.status(503).json({ error: 'not_ready' })
  console.error('[Postulaciones]', message)
  return res.status(500).json({ error: 'No se pudo completar la acción' })
}

/** La persona salió a postularse a una vacante: se guarda el intento (y su dominio) para preguntarle al volver. */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const vacancyId = req.body?.vacancyId
    if (!isUuid(vacancyId)) return res.status(400).json({ error: 'vacancyId no es válido' })
    const { data: vacancy } = await supabase.from('community_posts').select('id, slug, title, company, source_url, type').eq('id', vacancyId).maybeSingle()
    if (!vacancy || (vacancy as { type: string }).type !== 'job') return res.status(404).json({ error: 'Vacante no encontrada' })
    const row = await recordClick(req.userId as string, vacancy as never)
    res.status(201).json({ application: row ? publicApplication(row) : null })
  } catch (error) {
    notReady(res, error)
  }
})

/** El intento por el que toca preguntar «¿Ya te postulaste?» (o null). */
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const row = await pendingFor(req.userId as string)
    res.set('Cache-Control', 'no-store').json({ application: row ? publicApplication(row) : null })
  } catch (error) {
    notReady(res, error)
  }
})

/** Las mías, de la más reciente a la más vieja, con si la vacante sigue abierta. */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase.from('vacancy_applications').select('*').eq('user_id', req.userId).order('updated_at', { ascending: false }).limit(200)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as ApplicationRow[]
    const ids = rows.map((row) => row.vacancy_id)
    const { data: vacancies } = ids.length ? await supabase.from('community_posts').select('id, slug, created_at').in('id', ids) : { data: [] }
    const current = new Map(((vacancies ?? []) as { id: string; slug: string | null; created_at: string }[]).map((vacancy) => [vacancy.id, vacancy]))
    const limit = Date.now() - OPEN_DAYS * 86_400_000
    res.set('Cache-Control', 'no-store').json({
      applications: rows.map((row) => {
        const vacancy = current.get(row.vacancy_id)
        return { ...publicApplication(row), slug: vacancy?.slug ?? row.vacancy_slug, closed: !vacancy || Date.parse(vacancy.created_at) < limit }
      }),
    })
  } catch (error) {
    notReady(res, error)
  }
})

async function ownRow(req: AuthRequest, res: Response): Promise<ApplicationRow | null> {
  const id = req.params.id
  if (!isUuid(id)) { res.status(400).json({ error: 'id no es válido' }); return null }
  const { data } = await supabase.from('vacancy_applications').select('*').eq('id', id).eq('user_id', req.userId).maybeSingle()
  if (!data) { res.status(404).json({ error: 'Postulación no encontrada' }); return null }
  return data as ApplicationRow
}

/** La respuesta a la franja «¿Ya te postulaste?»: sí, todavía no o más tarde. */
router.post('/:id/answer', async (req: AuthRequest, res: Response) => {
  try {
    const answer = req.body?.answer as Answer
    if (!ANSWERS.includes(answer)) return res.status(400).json({ error: 'answer debe ser applied, not_yet o later' })
    const row = await ownRow(req, res)
    if (!row) return
    const { data, error } = await supabase.from('vacancy_applications').update(answerPatch(answer)).eq('id', row.id).select('*').single()
    if (error) throw new Error(error.message)
    res.json({ application: publicApplication(data as ApplicationRow) })
  } catch (error) {
    notReady(res, error)
  }
})

/** El estado que la persona pone desde «Mis postulaciones». */
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.body?.status as ApplicationStatus
    if (!PERSON_STATUSES.includes(status)) return res.status(400).json({ error: `status debe ser uno de: ${PERSON_STATUSES.join(', ')}` })
    const row = await ownRow(req, res)
    if (!row) return
    const { data, error } = await supabase.from('vacancy_applications').update(statusPatch(status, row)).eq('id', row.id).select('*').single()
    if (error) throw new Error(error.message)
    res.json({ application: publicApplication(data as ApplicationRow) })
  } catch (error) {
    notReady(res, error)
  }
})

/** Quitarla de la lista. */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const row = await ownRow(req, res)
    if (!row) return
    await supabase.from('vacancy_applications').delete().eq('id', row.id).eq('user_id', req.userId)
    res.status(204).end()
  } catch (error) {
    notReady(res, error)
  }
})

export default router
