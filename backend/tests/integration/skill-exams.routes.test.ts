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

  // Regresión: un intento vencido seguía siendo 'in_progress' para la base, así
  // que ocupaba el índice único parcial de FR-017 para siempre. Pasado el
  // periodo de espera el candidato quedaba encerrado sin poder examinarse nunca
  // más. El periodo de espera lo enmascaraba 30 días, por eso ningún otro test
  // lo veía.
  it('lets the candidate start again once an expired attempt is past its cooldown', async () => {
    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    expect(start.status).toBe(201)

    // Venció hace 40 días: expirado Y fuera de la ventana de espera.
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('skill_exam_attempts')
      .update({ started_at: longAgo, expires_at: longAgo })
      .eq('id', start.body.attemptId)

    const retry = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    expect(retry.status).toBe(201)
    expect(retry.body.attemptId).not.toBe(start.body.attemptId)

    // El intento viejo se conserva para auditoría (FR-012), marcado como
    // vencido para liberar el índice.
    const { data: old } = await supabase
      .from('skill_exam_attempts')
      .select('status')
      .eq('id', start.body.attemptId)
      .single()
    expect(old!.status).toBe('expired')
  })

  // ---------------- T027: periodo de espera tras completar ----------------

  it('blocks a retry inside the waiting period and creates nothing (T027)', async () => {
    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    await answerAll(app, ADMIN_USER_ID, start.body.attemptId, 1)

    const { count: before } = await supabase
      .from('skill_exam_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ADMIN_USER_ID)

    const retry = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    expect(retry.status).toBe(409)
    expect(retry.body.error).toBe('waiting_period')
    expect(new Date(retry.body.retryAvailableAt).getTime()).toBeGreaterThan(Date.now())

    const { count: after } = await supabase
      .from('skill_exam_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ADMIN_USER_ID)
    expect(after).toBe(before)
  })

  // ---------------- T028: un reintento peor no baja el nivel ----------------

  it('keeps the better historical level when a retry scores lower (T028)', async () => {
    // Primer intento: 10/10 -> avanzado.
    const first = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    await answerAll(app, ADMIN_USER_ID, first.body.attemptId, 1)

    const { data: afterFirst } = await supabase
      .from('user_skill_levels')
      .select('level, achieved_at')
      .eq('user_id', ADMIN_USER_ID)
      .eq('skill_name', SKILL)
      .single()
    expect(afterFirst!.level).toBe('avanzado')

    // Empujar el fin del intento fuera de la ventana de 30 días.
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('skill_exam_attempts')
      .update({ finished_at: longAgo })
      .eq('id', first.body.attemptId)

    // Segundo intento: 0/10 -> basico.
    const second = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })
    expect(second.status).toBe(201)

    const final = await answerAll(app, ADMIN_USER_ID, second.body.attemptId, 0)

    expect(final.body.level).toBe('basico')
    expect(final.body.improved).toBe(false)
    expect(final.body.profileLevel).toBe('avanzado')

    // El intento nuevo guarda su resultado real...
    const { data: secondAttempt } = await supabase
      .from('skill_exam_attempts')
      .select('level')
      .eq('id', second.body.attemptId)
      .single()
    expect(secondAttempt!.level).toBe('basico')

    // ...pero el perfil conserva el mejor, con su fecha original (FR-021).
    const { data: afterSecond } = await supabase
      .from('user_skill_levels')
      .select('level, achieved_at')
      .eq('user_id', ADMIN_USER_ID)
      .eq('skill_name', SKILL)
      .single()
    expect(afterSecond!.level).toBe('avanzado')
    expect(afterSecond!.achieved_at).toBe(afterFirst!.achieved_at)
  })

  // ---------------- T033: guards de elegibilidad ----------------

  it('rejects a skill the candidate has not declared (T033)', async () => {
    const res = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: 'kubernetes' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('skill_not_declared')

    const { count } = await supabase
      .from('skill_exam_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ADMIN_USER_ID)
    expect(count).toBe(0)
  })

  it('rejects a declared skill whose bank is too small (T033)', async () => {
    const { data: before } = await supabase.from('users').select('skills').eq('id', ADMIN_USER_ID).single()
    const original = before!.skills as string[]

    // 'python' está en el catálogo pero sin preguntas capturadas.
    await supabase.from('users').update({ skills: [...original, 'python'] }).eq('id', ADMIN_USER_ID)

    try {
      const res = await request(app)
        .post('/api/community/skill-exams')
        .set('x-test-user-id', ADMIN_USER_ID)
        .send({ skillName: 'python' })

      expect(res.status).toBe(422)
      expect(res.body.error).toBe('insufficient_bank')

      const { count } = await supabase
        .from('skill_exam_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', ADMIN_USER_ID)
      expect(count).toBe(0)
    } finally {
      await supabase.from('users').update({ skills: original }).eq('id', ADMIN_USER_ID)
    }
  })

  it('rejects starting a second exam while one is open (T033)', async () => {
    await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    const second = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    expect(second.status).toBe(409)
    expect(second.body.error).toBe('exam_in_progress')
  })

  it('refuses to answer an attempt that belongs to someone else (T033)', async () => {
    const start = await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    const res = await request(app)
      .post(`/api/community/skill-exams/${start.body.attemptId}/answers`)
      .set('x-test-user-id', '00000000-0000-0000-0000-000000000001')
      .send({ position: 0, selectedOptionIndex: 0 })

    expect(res.status).toBe(403)
  })

  // ---------------- T035: el índice único parcial (FR-017) ----------------

  it('lets the database refuse a second in-progress attempt (T035)', async () => {
    // Se verifica el constraint en sí, no una carrera real: dos peticiones HTTP
    // concurrentes no son deterministas y darían falsos verdes.
    await request(app)
      .post('/api/community/skill-exams')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ skillName: SKILL })

    const now = new Date()
    const { error } = await supabase.from('skill_exam_attempts').insert({
      user_id: ADMIN_USER_ID,
      skill_name: SKILL,
      status: 'in_progress',
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3600_000).toISOString(),
      question_count: 10,
    })

    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('duplicate')
  })

  // ---------------- Elegibilidad (US4) ----------------

  it('reports per-skill eligibility with a reason when blocked', async () => {
    const res = await request(app)
      .get('/api/community/skill-exams/eligibility')
      .set('x-test-user-id', ADMIN_USER_ID)

    expect(res.status).toBe(200)
    const react = res.body.skills.find((s: { skillName: string }) => s.skillName === SKILL)
    expect(react).toBeDefined()
    expect(react.canStart).toBe(true)
    expect(react.reason).toBeNull()
    expect(react.validatedLevel).toBeNull()
    expect(res.body.inProgress).toBeNull()
  })
})
