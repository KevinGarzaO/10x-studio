/**
 * Nivel 6 (bypass) del examen de skills — verificación manual.
 *
 * Envía al endpoint cosas que el formulario nunca construiría, para confirmar
 * que el backend se defiende solo, sin la UI delante (FR-007, FR-013, FR-015).
 *
 * Corre contra la instancia real de Supabase: guards reales, calificación real.
 * Lo único mockeado es la verificación del token de sesión (no tenemos las
 * contraseñas de estos usuarios) — mismo límite que los tests de integración.
 *
 * Ejecutar con:
 *   npx vitest run scripts/test-skill-exams-bypass.ts
 */
import { it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../services/supabase.service'

vi.mock('../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

import skillExamsRouter from '../src/routes/community/skill-exams.routes'

const OWNER = '8d73ccc4-a0dd-4c8d-ac88-f7418b8f091e' // exam-questions-e2e-admin
const INTRUDER = '00000000-0000-0000-0000-000000000001' // cuenta bot del sistema
const SKILL = 'react'

async function cleanup(userId: string) {
  const { data: attempts } = await supabase.from('skill_exam_attempts').select('id').eq('user_id', userId)
  for (const a of attempts || []) {
    await supabase.from('skill_exam_attempt_questions').delete().eq('attempt_id', a.id)
  }
  await supabase.from('user_skill_levels').delete().eq('user_id', userId)
  await supabase.from('skill_exam_attempts').delete().eq('user_id', userId)
}

it('defends the exam against payloads the UI would never send', async () => {
  await cleanup(OWNER)

  const app = express()
  app.use(express.json())
  app.use('/api/community/skill-exams', skillExamsRouter)

  const start = await request(app)
    .post('/api/community/skill-exams')
    .set('x-test-user-id', OWNER)
    .send({ skillName: SKILL })
  const attemptId = start.body.attemptId
  console.log('Intento creado:', attemptId)

  console.log('\n--- Caso 1: responder el intento de otro usuario ---')
  const foreign = await request(app)
    .post(`/api/community/skill-exams/${attemptId}/answers`)
    .set('x-test-user-id', INTRUDER)
    .send({ position: 0, selectedOptionIndex: 0 })
  console.log('status:', foreign.status, foreign.body)
  expect(foreign.status).toBe(403)

  console.log('\n--- Caso 2: indice de opcion inexistente ---')
  const badIndex = await request(app)
    .post(`/api/community/skill-exams/${attemptId}/answers`)
    .set('x-test-user-id', OWNER)
    .send({ position: 0, selectedOptionIndex: 99 })
  console.log('status:', badIndex.status, badIndex.body)
  expect(badIndex.status).toBe(400)

  console.log('\n--- Caso 3: campos forjados en el body (FR-007, FR-013) ---')
  const forged = await request(app)
    .post(`/api/community/skill-exams/${attemptId}/answers`)
    .set('x-test-user-id', OWNER)
    .send({ position: 0, selectedOptionIndex: 0, is_correct: true, isCorrect: true, level: 'avanzado' })
  console.log('status:', forged.status)
  expect(forged.status).toBe(200)

  // Lo que decide si la respuesta fue correcta es la comparación en el
  // servidor, no lo que venga en el body.
  const { data: row } = await supabase
    .from('skill_exam_attempt_questions')
    .select('exam_question_id, selected_option_index, is_correct')
    .eq('attempt_id', attemptId)
    .eq('position', 0)
    .single()
  const { data: q } = await supabase
    .from('exam_questions')
    .select('correct_answer_index')
    .eq('id', row!.exam_question_id)
    .single()
  const reallyCorrect = q!.correct_answer_index === row!.selected_option_index
  console.log(`is_correct guardado: ${row!.is_correct} | real: ${reallyCorrect}`)
  expect(row!.is_correct).toBe(reallyCorrect)

  console.log('\n--- Caso 4: reenviar una posicion ya contestada (FR-006) ---')
  const original = row!.selected_option_index
  const resend = await request(app)
    .post(`/api/community/skill-exams/${attemptId}/answers`)
    .set('x-test-user-id', OWNER)
    .send({ position: 0, selectedOptionIndex: (original + 1) % 4 })
  console.log('status:', resend.status, resend.body)
  expect(resend.status).toBe(409)

  const { data: unchanged } = await supabase
    .from('skill_exam_attempt_questions')
    .select('selected_option_index')
    .eq('attempt_id', attemptId)
    .eq('position', 0)
    .single()
  console.log(`respuesta original intacta: ${unchanged!.selected_option_index === original}`)
  expect(unchanged!.selected_option_index).toBe(original)

  console.log('\n--- Caso 5: responder un examen ya terminado (FR-015) ---')
  for (let position = 1; position < 10; position++) {
    await request(app)
      .post(`/api/community/skill-exams/${attemptId}/answers`)
      .set('x-test-user-id', OWNER)
      .send({ position, selectedOptionIndex: 0 })
  }

  const { data: finished } = await supabase
    .from('skill_exam_attempts')
    .select('status, level')
    .eq('id', attemptId)
    .single()
  console.log('intento cerrado:', finished)

  const afterDone = await request(app)
    .post(`/api/community/skill-exams/${attemptId}/answers`)
    .set('x-test-user-id', OWNER)
    .send({ position: 0, selectedOptionIndex: 0 })
  console.log('status:', afterDone.status, afterDone.body)
  expect(afterDone.status).toBe(409)

  const { data: stillSame } = await supabase
    .from('skill_exam_attempts')
    .select('level')
    .eq('id', attemptId)
    .single()
  console.log(`nivel sin recalcular: ${stillSame!.level === finished!.level}`)
  expect(stillSame!.level).toBe(finished!.level)

  await cleanup(OWNER)
  console.log('\nPASS: todos los intentos de bypass fueron rechazados.')
})
