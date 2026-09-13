import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'
import examQuestionsRouter from '../../src/routes/admin/exam-questions.routes'

const ADMIN_USER_ID = 'e7c86261-578a-42cb-9eb8-c26f19917079'
const NON_ADMIN_USER_ID = '2ee098fb-48ac-4c45-9574-262ae1148611'

// Real integration test against the actual Supabase instance: real
// requireRole DB lookup, real Zod validation, real
// insert_exam_question_with_options() RPC. The only thing mocked is
// communityAuthMiddleware's Supabase Auth token verification (we don't have
// these test users' passwords) — everything downstream of "who is this
// user" runs unmocked. userId is supplied via a test-only header.
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, res: any, next: any) => {
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/exam-questions', examQuestionsRouter)
  return app
}

async function countExamQuestions() {
  const { count } = await supabase.from('exam_questions').select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function deleteQuestion(id: string) {
  await supabase.from('exam_questions').delete().eq('id', id)
}

const validPayload = {
  question: 'Pregunta de integración suficientemente larga',
  skillName: 'react',
  options: ['useEffect', 'useState'],
  correctAnswerIndex: 0,
  difficultyLevel: 'basico',
}

describe('POST /api/admin/exam-questions (integration)', () => {
  let app: express.Express
  const createdIds: string[] = []

  beforeAll(() => {
    app = buildApp()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteQuestion(id)
    }
  })

  it('creates a question end-to-end and round-trips the exact data (T011)', async () => {
    const res = await request(app)
      .post('/api/admin/exam-questions')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send(validPayload)

    expect(res.status).toBe(201)
    expect(res.body.question).toBe(validPayload.question)
    createdIds.push(res.body.id)

    const { data: row } = await supabase
      .from('exam_questions')
      .select('question, skill_name, correct_answer_index, difficulty_level')
      .eq('id', res.body.id)
      .single()

    expect(row?.question).toBe(validPayload.question)
    expect(row?.skill_name).toBe(validPayload.skillName)
    expect(row?.correct_answer_index).toBe(validPayload.correctAnswerIndex)
    expect(row?.difficulty_level).toBe(validPayload.difficultyLevel)

    const { data: options } = await supabase
      .from('question_options')
      .select('text, order_index')
      .eq('exam_question_id', res.body.id)
      .order('order_index')

    expect(options?.map((o) => o.text)).toEqual(validPayload.options)
  })

  it('rejects a non-admin with 403 and saves nothing (T018)', async () => {
    const before = await countExamQuestions()

    const res = await request(app)
      .post('/api/admin/exam-questions')
      .set('x-test-user-id', NON_ADMIN_USER_ID)
      .send(validPayload)

    expect(res.status).toBe(403)

    const after = await countExamQuestions()
    expect(after).toBe(before)
  })

  it.each([
    ['question', { ...validPayload, question: '' }],
    ['options', { ...validPayload, options: ['useEffect'] }],
    ['options', { ...validPayload, options: ['Sí', 'sí'] }],
    ['correctAnswerIndex', { ...validPayload, correctAnswerIndex: 9 }],
  ])('rejects invalid %s with 400 and a matching field (T024)', async (expectedField, payload) => {
    const before = await countExamQuestions()

    const res = await request(app)
      .post('/api/admin/exam-questions')
      .set('x-test-user-id', ADMIN_USER_ID)
      .send(payload)

    expect(res.status).toBe(400)
    expect(res.body.field).toBe(expectedField)

    const after = await countExamQuestions()
    expect(after).toBe(before)
  })
})
