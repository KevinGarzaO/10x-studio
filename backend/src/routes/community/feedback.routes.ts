import { Router, Response } from 'express'
import { supabase } from '@avotalent/core/services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '@avotalent/core/http/middleware/community-auth.middleware'
import { MAX_PER_DAY, QUESTION_VERSION, cleanCategory, cleanPage, cleanText, deviceOf, loadEligibility, signupWeek, type FeedbackContext } from '@avotalent/core/services/feedback/feedback'

/**
 * Feedback dentro de la app: el botón «¿Qué te faltó?». Todo con sesión; quien no es elegible (cuenta real con 2 o más días de uso después de
 * registrarse) no puede mandar. Lo que se escribe es dato, nunca una instrucción. SQL: backend/sql/feedback-migration.sql.
 */
const router = Router()
router.use(communityAuthMiddleware)

const missing = (message: string) => /does not exist|schema cache|feedback_|user_activity_daily/i.test(message)

// ¿Esta persona ve el botón? Solo dice sí o no y cuántos días lleva (nada más).
router.get('/eligibility', async (req: AuthRequest, res: Response) => {
  try {
    const result = await loadEligibility(req.userId as string)
    if (!result) return res.json({ eligible: false, ready: false })
    res.json({ eligible: result.eligible, activeDays: result.activeDays, ready: true })
  } catch {
    res.json({ eligible: false, ready: false })
  }
})

// Se mostró la hoja o se descartó sin contestar (para medir la tasa de respuesta: quien ve algo y no responde también cuenta).
router.post('/event', async (req: AuthRequest, res: Response) => {
  const kind = String(req.body?.kind ?? '')
  if (kind !== 'shown' && kind !== 'dismissed') return res.status(400).json({ error: 'Evento inválido' })
  try {
    await supabase.from('feedback_events').insert({ user_id: req.userId, channel: 'boton', kind })
  } catch {
    // medir nunca debe estorbar
  }
  res.json({ ok: true })
})

router.post('/', async (req: AuthRequest, res: Response) => {
  const text = cleanText(req.body?.text)
  if (!text) return res.status(400).json({ error: 'Cuéntanos un poco más: escribe al menos unas palabras.' })
  const category = cleanCategory(req.body?.category)
  const page = cleanPage(req.body?.page)

  try {
    const eligibility = await loadEligibility(req.userId as string)
    if (!eligibility) return res.status(503).json({ code: 'not_ready' })
    if (!eligibility.eligible) return res.status(403).json({ error: 'Todavía no está disponible para tu cuenta.' })

    // Contra abuso: unas pocas respuestas por día. El botón no insiste, pero tampoco se deja inundar.
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const recent = await supabase.from('feedback_entries').select('id', { count: 'exact', head: true }).eq('user_id', req.userId).gte('created_at', since)
    if (recent.error) throw recent.error
    if ((recent.count ?? 0) >= MAX_PER_DAY) return res.status(429).json({ error: 'Ya nos mandaste varias hoy: gracias. Puedes seguir mañana.' })

    // El contexto: con qué perfil y uso respondió (sin correo ni nombre).
    const { data: user } = await supabase.from('users').select('created_at, profile_completed, signup_source').eq('id', req.userId).maybeSingle()
    const applied = await supabase.from('vacancy_applications').select('id', { count: 'exact', head: true }).eq('user_id', req.userId).in('status', ['applied', 'interview', 'offer', 'rejected'])
    const context: FeedbackContext = {
      signupWeek: signupWeek(String(user?.created_at ?? eligibility.createdAt)),
      activeDays: eligibility.activeDays,
      profileComplete: !!user?.profile_completed,
      applied: !applied.error && (applied.count ?? 0) > 0,
      source: String(user?.signup_source ?? 'directo'),
      device: deviceOf(req.get('user-agent')),
    }

    const { error } = await supabase.from('feedback_entries').insert({ user_id: req.userId, channel: 'boton', question_version: QUESTION_VERSION, category, text, page, context })
    if (error) throw error
    await supabase.from('feedback_events').insert({ user_id: req.userId, channel: 'boton', kind: 'answered' })
    res.json({ ok: true })
  } catch (error) {
    if (missing((error as Error)?.message ?? '')) return res.status(503).json({ code: 'not_ready' })
    console.error('Feedback error:', error)
    res.status(500).json({ error: 'No pudimos guardar tu comentario. Intenta de nuevo.' })
  }
})

export default router
