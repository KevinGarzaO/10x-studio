import { Router, Response } from 'express'
import { buildStartSkillExamSchema, submitAnswerSchema } from '@avocado/schemas'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import {
  levelFor,
  isBetterLevel,
  pickQuestions,
  isExpired,
  retryAvailableAt,
  expiresAtFrom,
  EXAM_QUESTION_COUNT,
  MIN_BANK_SIZE,
  type SkillLevel,
} from '../../services/skill-exam.service'

const router = Router()

interface PresentedQuestion {
  position: number
  text: string
  options: { index: number; text: string }[]
}

/**
 * FR-005: esta es la única función que arma una pregunta para el cliente, y
 * selecciona columnas explícitamente. NO usar select('*') aquí: traería
 * correct_answer_index y lo filtraría al navegador, dejando el examen sin valor.
 */
async function presentQuestion(examQuestionId: string, position: number): Promise<PresentedQuestion> {
  const { data: question, error: qError } = await supabase
    .from('exam_questions')
    .select('question')
    .eq('id', examQuestionId)
    .single()
  if (qError) throw qError

  const { data: options, error: oError } = await supabase
    .from('question_options')
    .select('text, order_index')
    .eq('exam_question_id', examQuestionId)
    .order('order_index')
  if (oError) throw oError

  return {
    position,
    text: question!.question,
    options: (options || []).map((o) => ({ index: o.order_index, text: o.text })),
  }
}

/** Los skills que el candidato declaró en su perfil (FR-002). */
async function declaredSkills(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('users').select('skills').eq('id', userId).maybeSingle()
  if (error) throw error
  return (data?.skills as string[] | null) || []
}

/** El intento abierto del candidato, si lo hay (sin importar el skill). */
async function openAttempt(userId: string) {
  const { data, error } = await supabase
    .from('skill_exam_attempts')
    .select('id, skill_name, status, expires_at, finished_at, question_count')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .maybeSingle()
  if (error) throw error
  return data
}

/** El intento más reciente de ese skill, para calcular el periodo de espera. */
async function lastAttemptFor(userId: string, skillName: string) {
  const { data, error } = await supabase
    .from('skill_exam_attempts')
    .select('id, status, expires_at, finished_at')
    .eq('user_id', userId)
    .eq('skill_name', skillName)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function answeredCount(attemptId: string): Promise<number> {
  const { count, error } = await supabase
    .from('skill_exam_attempt_questions')
    .select('*', { count: 'exact', head: true })
    .eq('attempt_id', attemptId)
    .not('answered_at', 'is', null)
  if (error) throw error
  return count ?? 0
}

async function nextUnanswered(attemptId: string) {
  const { data, error } = await supabase
    .from('skill_exam_attempt_questions')
    .select('exam_question_id, position')
    .eq('attempt_id', attemptId)
    .is('answered_at', null)
    .order('position')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// GET /eligibility — de qué skills puede examinarse y por qué no (US4)
// ---------------------------------------------------------------------------
router.get('/eligibility', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const skills = await declaredSkills(userId)
    const open = await openAttempt(userId)
    const openAndAlive = open && !isExpired(open) ? open : null

    const { data: levels } = await supabase
      .from('user_skill_levels')
      .select('skill_name, level, achieved_at')
      .eq('user_id', userId)

    const { data: catalog } = await supabase.from('skills').select('name, label').in('name', skills)

    const result = []
    for (const skillName of skills) {
      const validated = (levels || []).find((l) => l.skill_name === skillName)
      const label = (catalog || []).find((c) => c.name === skillName)?.label ?? skillName

      const { count: bank } = await supabase
        .from('exam_questions')
        .select('*', { count: 'exact', head: true })
        .eq('skill_name', skillName)

      const last = await lastAttemptFor(userId, skillName)
      const retryAt = last ? retryAvailableAt(last) : null
      const waiting = retryAt !== null && retryAt > new Date()

      let reason: string | null = null
      if (openAndAlive) reason = 'exam_in_progress'
      else if ((bank ?? 0) < MIN_BANK_SIZE) reason = 'insufficient_bank'
      else if (waiting) reason = 'waiting_period'

      result.push({
        skillName,
        label,
        validatedLevel: validated?.level ?? null,
        achievedAt: validated?.achieved_at ?? null,
        canStart: reason === null,
        reason,
        retryAvailableAt: reason === 'waiting_period' ? retryAt!.toISOString() : null,
      })
    }

    res.json({
      skills: result,
      inProgress: openAndAlive
        ? {
            attemptId: openAndAlive.id,
            skillName: openAndAlive.skill_name,
            expiresAt: openAndAlive.expires_at,
            answered: await answeredCount(openAndAlive.id),
            total: openAndAlive.question_count,
          }
        : null,
    })
  } catch (error) {
    console.error('Skill exam eligibility error:', error)
    res.status(500).json({ error: 'internal_error', message: 'Ocurrió un error, intenta de nuevo' })
  }
})

// ---------------------------------------------------------------------------
// GET /current — retomar el examen interrumpido (FR-018, FR-019)
// ---------------------------------------------------------------------------
router.get('/current', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const attempt = await openAttempt(req.userId!)
    if (!attempt) {
      return res.status(404).json({ error: 'no_exam_in_progress' })
    }

    if (isExpired(attempt)) {
      const retryAt = retryAvailableAt(attempt)
      return res.status(410).json({
        error: 'exam_expired',
        retryAvailableAt: retryAt?.toISOString() ?? null,
      })
    }

    const next = await nextUnanswered(attempt.id)
    res.json({
      attemptId: attempt.id,
      skillName: attempt.skill_name,
      expiresAt: attempt.expires_at,
      total: attempt.question_count,
      answered: await answeredCount(attempt.id),
      question: next ? await presentQuestion(next.exam_question_id, next.position) : null,
    })
  } catch (error) {
    console.error('Skill exam current error:', error)
    res.status(500).json({ error: 'internal_error', message: 'Ocurrió un error, intenta de nuevo' })
  }
})

// ---------------------------------------------------------------------------
// POST / — iniciar un intento
// ---------------------------------------------------------------------------
router.post('/', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!

    // El candidato solo puede examinarse de lo que declaró (FR-002). Se valida
    // contra su propio perfil, no contra el catálogo completo.
    const skills = await declaredSkills(userId)
    const schema = buildStartSkillExamSchema(skills)
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const declaredButInvalid = typeof req.body?.skillName === 'string' && req.body.skillName.length > 0
      if (declaredButInvalid) {
        return res.status(403).json({
          error: 'skill_not_declared',
          message: 'Solo puedes presentar examen de un skill que tengas en tu perfil',
        })
      }
      return res.status(400).json({ error: 'validation_error', field: issue.path[0] ?? null, message: issue.message })
    }

    const { skillName } = parsed.data

    // FR-017: un examen a la vez. El índice único parcial es la defensa real
    // contra dos peticiones simultáneas; esto solo da un error legible.
    const open = await openAttempt(userId)
    if (open && !isExpired(open)) {
      return res.status(409).json({ error: 'exam_in_progress', attemptId: open.id })
    }

    // FR-011: periodo de espera desde el último intento (completado o vencido).
    const last = await lastAttemptFor(userId, skillName)
    if (last) {
      const retryAt = retryAvailableAt(last)
      if (retryAt && retryAt > new Date()) {
        return res.status(409).json({ error: 'waiting_period', retryAvailableAt: retryAt.toISOString() })
      }
    }

    // FR-003: banco suficiente, o el candidato quemaría su intento en un examen
    // que no valida nada.
    const { data: bank, error: bankError } = await supabase
      .from('exam_questions')
      .select('id')
      .eq('skill_name', skillName)
    if (bankError) throw bankError
    if ((bank || []).length < MIN_BANK_SIZE) {
      return res.status(422).json({
        error: 'insufficient_bank',
        message: 'Este examen aún no está disponible: faltan preguntas en el banco',
      })
    }

    // FR-014: no repetir el conjunto del intento inmediatamente anterior.
    let previousIds: string[] = []
    if (last) {
      const { data: prev } = await supabase
        .from('skill_exam_attempt_questions')
        .select('exam_question_id')
        .eq('attempt_id', last.id)
      previousIds = (prev || []).map((r) => r.exam_question_id)
    }

    const chosen = pickQuestions(
      (bank || []).map((q) => q.id),
      previousIds,
      EXAM_QUESTION_COUNT,
    )

    const startedAt = new Date()
    const { data: attempt, error: attemptError } = await supabase
      .from('skill_exam_attempts')
      .insert({
        user_id: userId,
        skill_name: skillName,
        status: 'in_progress',
        started_at: startedAt.toISOString(),
        expires_at: expiresAtFrom(startedAt).toISOString(),
        question_count: chosen.length,
      })
      .select('id, expires_at, question_count')
      .single()
    if (attemptError) throw attemptError

    const { error: questionsError } = await supabase.from('skill_exam_attempt_questions').insert(
      chosen.map((examQuestionId, position) => ({
        attempt_id: attempt!.id,
        exam_question_id: examQuestionId,
        position,
      })),
    )
    // Si las preguntas no entran, el intento quedaría vacío bloqueando el índice
    // único parcial y el candidato no podría iniciar ningún examen nunca más.
    if (questionsError) {
      await supabase.from('skill_exam_attempts').delete().eq('id', attempt!.id)
      throw questionsError
    }

    res.status(201).json({
      attemptId: attempt!.id,
      skillName,
      expiresAt: attempt!.expires_at,
      total: attempt!.question_count,
      answered: 0,
      question: await presentQuestion(chosen[0], 0),
    })
  } catch (error) {
    console.error('Skill exam start error:', error)
    res.status(500).json({ error: 'internal_error', message: 'Ocurrió un error, intenta de nuevo' })
  }
})

// ---------------------------------------------------------------------------
// POST /:attemptId/answers — responder; la última respuesta cierra y califica
// ---------------------------------------------------------------------------
router.post('/:attemptId/answers', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const attemptId = req.params.attemptId

    const parsed = submitAnswerSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return res.status(400).json({ error: 'validation_error', field: issue.path[0] ?? null, message: issue.message })
    }
    const { position, selectedOptionIndex } = parsed.data

    const { data: attempt, error: attemptError } = await supabase
      .from('skill_exam_attempts')
      .select('id, user_id, skill_name, status, expires_at, finished_at, question_count')
      .eq('id', attemptId)
      .maybeSingle()
    if (attemptError) throw attemptError
    if (!attempt) return res.status(404).json({ error: 'attempt_not_found' })
    if (attempt.user_id !== userId) return res.status(403).json({ error: 'forbidden' })
    if (attempt.status === 'completed') return res.status(409).json({ error: 'attempt_completed' })

    if (isExpired(attempt)) {
      const retryAt = retryAvailableAt(attempt)
      return res.status(410).json({ error: 'exam_expired', retryAvailableAt: retryAt?.toISOString() ?? null })
    }

    const { data: row, error: rowError } = await supabase
      .from('skill_exam_attempt_questions')
      .select('id, exam_question_id, answered_at')
      .eq('attempt_id', attemptId)
      .eq('position', position)
      .maybeSingle()
    if (rowError) throw rowError
    if (!row) {
      return res.status(400).json({ error: 'validation_error', field: 'position', message: 'Posición inexistente' })
    }
    // FR-006: una respuesta enviada es definitiva.
    if (row.answered_at) return res.status(409).json({ error: 'already_answered' })

    // El índice debe existir entre las opciones de ESTA pregunta — el schema
    // solo acota el rango 0-5, no sabe cuántas opciones tiene cada una.
    const { data: options, error: optError } = await supabase
      .from('question_options')
      .select('order_index')
      .eq('exam_question_id', row.exam_question_id)
    if (optError) throw optError
    if (!(options || []).some((o) => o.order_index === selectedOptionIndex)) {
      return res
        .status(400)
        .json({ error: 'validation_error', field: 'selectedOptionIndex', message: 'Opción inexistente' })
    }

    // FR-007: la corrección se calcula aquí, nunca se acepta del cliente.
    const { data: question, error: qError } = await supabase
      .from('exam_questions')
      .select('correct_answer_index')
      .eq('id', row.exam_question_id)
      .single()
    if (qError) throw qError

    const isCorrect = question!.correct_answer_index === selectedOptionIndex

    const { error: updateError } = await supabase
      .from('skill_exam_attempt_questions')
      .update({
        selected_option_index: selectedOptionIndex,
        is_correct: isCorrect,
        answered_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (updateError) throw updateError

    const answered = await answeredCount(attemptId)
    if (answered < attempt.question_count) {
      const next = await nextUnanswered(attemptId)
      return res.json({
        completed: false,
        answered,
        total: attempt.question_count,
        question: next ? await presentQuestion(next.exam_question_id, next.position) : null,
      })
    }

    // Era la última: cerrar y calificar en esta misma petición (research.md R6).
    const { count: correctCount } = await supabase
      .from('skill_exam_attempt_questions')
      .select('*', { count: 'exact', head: true })
      .eq('attempt_id', attemptId)
      .eq('is_correct', true)

    const level = levelFor(correctCount ?? 0, attempt.question_count)
    const finishedAt = new Date()

    const { error: finishError } = await supabase
      .from('skill_exam_attempts')
      .update({
        status: 'completed',
        finished_at: finishedAt.toISOString(),
        correct_count: correctCount ?? 0,
        level,
      })
      .eq('id', attemptId)
    if (finishError) throw finishError

    // FR-021: el perfil conserva el mejor nivel; un reintento peor no lo baja.
    const { data: existing } = await supabase
      .from('user_skill_levels')
      .select('level, achieved_at')
      .eq('user_id', userId)
      .eq('skill_name', attempt.skill_name)
      .maybeSingle()

    const currentLevel = (existing?.level as SkillLevel | undefined) ?? null
    const improved = isBetterLevel(level, currentLevel)

    if (improved) {
      const { error: levelError } = await supabase.from('user_skill_levels').upsert(
        {
          user_id: userId,
          skill_name: attempt.skill_name,
          level,
          achieved_at: finishedAt.toISOString(),
          source_attempt_id: attemptId,
          updated_at: finishedAt.toISOString(),
        },
        { onConflict: 'user_id,skill_name' },
      )
      if (levelError) throw levelError
    }

    const retryAt = retryAvailableAt({
      status: 'completed',
      expires_at: attempt.expires_at,
      finished_at: finishedAt.toISOString(),
    })

    res.json({
      completed: true,
      level,
      correctCount: correctCount ?? 0,
      total: attempt.question_count,
      profileLevel: improved ? level : currentLevel,
      improved,
      retryAvailableAt: retryAt?.toISOString() ?? null,
    })
  } catch (error) {
    console.error('Skill exam answer error:', error)
    res.status(500).json({ error: 'internal_error', message: 'Ocurrió un error, intenta de nuevo' })
  }
})

export default router
