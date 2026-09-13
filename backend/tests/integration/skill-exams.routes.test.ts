import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'

const ADMIN_USER_ID = '8d73ccc4-a0dd-4c8d-ac88-f7418b8f091e' // exam-questions-e2e-admin, tiene 'react' declarado
const SKILL = 'react'

// Mismo límite que los tests de 001: solo se mockea la verificación del token de
// sesión de Supabase (no tenemos la contraseña de estos usuarios). Todo lo que
// hay después de "quién es este usuario" corre sin mocks contra la base real:
// el guard de skill declarado, la selección de preguntas, la calificación.
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

import skillExamsRouter from '../../src/routes/community/skill-exams.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/skill-exams', skillExamsRouter)
  return app
}

/** Borra todo rastro del usuario de prueba para dejar la base como estaba. */
async function cleanup(userId: string) {
  const { data: attempts } = await supabase.from('skill_exam_attempts').select('id').eq('user_id', userId)
  for (const a of attempts || []) {
    await supabase.from('skill_exam_attempt_questions').delete().eq('attempt_id', a.id)
  }
  await supabase.from('user_skill_levels').delete().eq('user_id', userId)
  await supabase.from('skill_exam_attempts').delete().eq('user_id', userId)
}

/** Responde el examen completo. `correctRatio` decide cuántas se aciertan. */
async function answerAll(
  app: express.Express,
  userId: string,
  attemptId: string,
  correctRatio: number,
  total = 10,
) {
  let last: request.Response | null = null
  const wanted = Math.round(total * correctRatio)

  for (let position = 0; position < total; position++) {
    // Para acertar hay que consultar la respuesta correcta por fuera del API,
    // justamente porque el endpoint nunca la revela (FR-005).
    const { data: aq } = await supabase
      .from('skill_exam_attempt_questions')
      .select('exam_question_id')
      .eq('attempt_id', attemptId)
      .eq('position', position)
      .single()

    const { data: q } = await supabase
      .from('exam_questions')
      .select('correct_answer_index')
      .eq('id', aq!.exam_question_id)
      .single()

    const shouldBeCorrect = position < wanted
    const selectedOptionIndex = shouldBeCorrect
      ? q!.correct_answer_index
      : (q!.correct_answer_index + 1) % 4

    last = await request(app)
      .post(`/api/community/skill-exams/${attemptId}/answers`)
      .set('x-test-user-id', userId)
      .send({ position, selectedOptionIndex })
  }

  return last!
}

describe('skill exams (integration)', () => {
  let app: express.Express

  beforeAll(() => {
    app = buildApp()
  })

  beforeEach(async () => {
    await cleanup(ADMIN_USER_ID)
  })

  afterAll(async () => {
    await cleanup(ADMIN_USER_ID)
  })

  // ---------------- T008: flujo completo + retención auditable ----------------

  it('runs a full exam and stores an auditable record of it (T008)', async () => {
    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    expect(start.status).toBe(201)
    expect(start.body.total).toBe(10)
    expect(start.body.answered).toBe(0)
    expect(start.body.question.position).toBe(0)
    expect(start.body.question.options.length).toBeGreaterThanOrEqual(2)

    const attemptId = start.body.attemptId
    const final = await answerAll(app, ADMIN_USER_ID, attemptId, 1)

    expect(final.status).toBe(200)
    expect(final.body.completed).toBe(true)
    expect(final.body.correctCount).toBe(10)
    expect(final.body.level).toBe('avanzado')

    const { data: attempt } = await supabase
      .from('skill_exam_attempts')
      .select('status, correct_count, level, question_count, finished_at')
      .eq('id', attemptId)
      .single()

    expect(attempt!.status).toBe('completed')
    expect(attempt!.correct_count).toBe(10)
    expect(attempt!.level).toBe('avanzado')
    expect(attempt!.question_count).toBe(10)
    expect(attempt!.finished_at).not.toBeNull()

    // FR-012 / SC-005: el intento tiene que poder reconstruirse después.
    const { data: rows } = await supabase
      .from('skill_exam_attempt_questions')
      .select('position, selected_option_index, is_correct, answered_at')
      .eq('attempt_id', attemptId)
      .order('position')

    expect(rows).toHaveLength(10)
    expect(rows!.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const r of rows!) {
      expect(r.selected_option_index).not.toBeNull()
      expect(r.is_correct).toBe(true)
      expect(r.answered_at).not.toBeNull()
    }
  })

  // ---------------- T009: la respuesta correcta nunca sale ----------------

  it('never leaks the correct answer in any response of the flow (T009)', async () => {
    const responses: unknown[] = []

    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    responses.push(start.body)

    const attemptId = start.body.attemptId

    const current = await request(app)
      .get('/api/community/skill-exams/current')
      .set('x-test-user-id', ADMIN_USER_ID)
    responses.push(current.body)

    for (let position = 0; position < 10; position++) {
      const res = await request(app)
        .post(`/api/community/skill-exams/${attemptId}/answers`)
        .set('x-test-user-id', ADMIN_USER_ID)
        .send({ position, selectedOptionIndex: 0 })
      responses.push(res.body)
    }

    // Es la red de seguridad contra que alguien cambie el select() explícito por
    // un select('*') y filtre correct_answer_index sin que nada más falle.
    const serialized = JSON.stringify(responses)
    expect(serialized).not.toContain('correct_answer_index')
    expect(serialized).not.toContain('correctAnswerIndex')
    expect(serialized).not.toContain('is_correct')
    expect(serialized).not.toContain('isCorrect')
  })

  // ---------------- T010: retomar un examen interrumpido ----------------

  it('resumes an interrupted exam where it left off (T010)', async () => {
    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    const attemptId = start.body.attemptId

    for (let position = 0; position < 3; position++) {
      await request(app)
        .post(`/api/community/skill-exams/${attemptId}/answers`)
        .set('x-test-user-id', ADMIN_USER_ID)
        .send({ position, selectedOptionIndex: 0 })
    }

    const resumed = await request(app)
      .get('/api/community/skill-exams/current')
      .set('x-test-user-id', ADMIN_USER_ID)

    expect(resumed.status).toBe(200)
    expect(resumed.body.attemptId).toBe(attemptId)
    expect(resumed.body.answered).toBe(3)
    expect(resumed.body.question.position).toBe(3)

    // Las respuestas previas siguen intactas (FR-006).
    const { data: answered } = await supabase
      .from('skill_exam_attempt_questions')
      .select('position, answered_at')
      .eq('attempt_id', attemptId)
      .not('answered_at', 'is', null)
      .order('position')

    expect(answered).toHaveLength(3)
    expect(answered!.map((r) => r.position)).toEqual([0, 1, 2])
  })

  // ---------------- T011: expiración a las 24h ----------------

  it('expires an unfinished attempt and starts the cooldown (T011)', async () => {
    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    const attemptId = start.body.attemptId

    // Empujar expires_at al pasado simula que pasaron las 24 horas.
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await supabase.from('skill_exam_attempts').update({ expires_at: past }).eq('id', attemptId)

    const current = await request(app)
      .get('/api/community/skill-exams/current')
      .set('x-test-user-id', ADMIN_USER_ID)

    expect(current.status).toBe(410)
    expect(current.body.error).toBe('exam_expired')
    expect(current.body.retryAvailableAt).toBeTruthy()

    // El intento se consumió: arranca el periodo de espera.
    const retry = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    expect(retry.status).toBe(409)
    expect(retry.body.error).toBe('waiting_period')
    expect(retry.body.retryAvailableAt).toBeTruthy()
  })
})
