/**
 * Nivel 6 (bypass) manual verification for POST /api/admin/exam-questions —
 * hits the real route handler with payloads the frontend would never send,
 * confirming the backend rejects them independently of the UI (FR-008).
 *
 * Uses the same real Supabase instance as production (not a mock DB): real
 * requireRole DB roles lookup, real Zod validation, real
 * insert_exam_question_with_options() RPC.
 *
 * communityAuthMiddleware verifies a real Supabase Auth session token, and
 * we don't have these test users' passwords, so it's mocked here to read
 * req.userId from a test-only header instead — same auth boundary the
 * automated integration tests use
 * (backend/tests/integration/exam-questions.routes.test.ts). Everything
 * downstream of "who is this user" is unmocked.
 *
 * This is a manual, one-off verification (not part of `npm test`/`npm run
 * test:integration`) — run it explicitly with:
 *   npx vitest run scripts/test-exam-questions-bypass.ts
 */
import { it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../services/supabase.service'
import examQuestionsRouter from '../src/routes/admin/exam-questions.routes'

vi.mock('../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

const ADMIN_USER_ID = 'e7c86261-578a-42cb-9eb8-c26f19917079'
const NON_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001'

async function countExamQuestions() {
  const { count } = await supabase.from('exam_questions').select('*', { count: 'exact', head: true })
  return count ?? 0
}

it('rejects bypass attempts the frontend would never send', async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/exam-questions', examQuestionsRouter)

  const before = await countExamQuestions()

  console.log('--- Case 1: non-admin, payload the frontend would never send ---')
  const case1 = await request(app)
    .post('/api/admin/exam-questions')
    .set('x-test-user-id', NON_ADMIN_USER_ID)
    .send({ question: '', skillName: 'react', options: ['a', 'a'], correctAnswerIndex: 9, difficultyLevel: 'experto' })
  console.log('status:', case1.status, 'body:', case1.body)
  expect(case1.status).toBe(403)

  console.log('\n--- Case 2: admin, every field invalid at once ---')
  const case2 = await request(app)
    .post('/api/admin/exam-questions')
    .set('x-test-user-id', ADMIN_USER_ID)
    .send({ question: '', skillName: 'skill-inexistente', options: ['a', 'a'], correctAnswerIndex: 9, difficultyLevel: 'experto' })
  console.log('status:', case2.status, 'body:', case2.body)
  expect(case2.status).toBe(400)

  const after = await countExamQuestions()
  console.log('\nexam_questions count before:', before, 'after:', after)
  expect(after).toBe(before)

  console.log('\nPASS: both bypass attempts were rejected and nothing was saved.')
})
