import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'
import usersRouter from '../../src/routes/community/users.routes'

const TEST_USER_ID = '8d73ccc4-a0dd-4c8d-ac88-f7418b8f091e' // exam-questions-e2e-admin
const TEST_USERNAME = 'exam-questions-e2e-admin'
const SKILL = 'react'

// Sin mock de auth: GET /:username es publico por diseño (US2), y eso mismo
// se verifica aqui.
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/users', usersRouter)
  return app
}

async function cleanup() {
  await supabase.from('user_skill_levels').delete().eq('user_id', TEST_USER_ID)
  const { data: attempts } = await supabase.from('skill_exam_attempts').select('id').eq('user_id', TEST_USER_ID)
  for (const a of attempts || []) {
    await supabase.from('skill_exam_attempt_questions').delete().eq('attempt_id', a.id)
  }
  await supabase.from('skill_exam_attempts').delete().eq('user_id', TEST_USER_ID)
}

/** Crea un intento completado y su nivel validado, sin pasar por el examen. */
async function seedLevel(skillName: string, level: string) {
  const now = new Date()
  const { data: attempt } = await supabase
    .from('skill_exam_attempts')
    .insert({
      user_id: TEST_USER_ID,
      skill_name: skillName,
      status: 'completed',
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3600_000).toISOString(),
      finished_at: now.toISOString(),
      correct_count: 8,
      question_count: 10,
      level,
    })
    .select('id')
    .single()

  await supabase.from('user_skill_levels').insert({
    user_id: TEST_USER_ID,
    skill_name: skillName,
    level,
    achieved_at: now.toISOString(),
    source_attempt_id: attempt!.id,
  })
}

describe('GET /api/community/users/:username skillLevels (integration)', () => {
  let app: express.Express

  beforeAll(() => {
    app = buildApp()
  })

  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('exposes validated levels without requiring authentication (T022)', async () => {
    await seedLevel(SKILL, 'intermedio')

    // Sin cabecera Authorization: el perfil es publico.
    const res = await request(app).get(`/api/community/users/${TEST_USERNAME}`)

    expect(res.status).toBe(200)
    expect(res.body.user.skillLevels).toEqual([
      expect.objectContaining({ skillName: SKILL, level: 'intermedio' }),
    ])
    expect(res.body.user.skillLevels[0].achievedAt).toBeTruthy()
  })

  it('returns an empty list when nothing is validated', async () => {
    const res = await request(app).get(`/api/community/users/${TEST_USERNAME}`)

    expect(res.status).toBe(200)
    expect(res.body.user.skillLevels).toEqual([])
  })

  // Edge case de spec.md: el nivel deja de mostrarse, pero la fila se conserva.
  it('hides the level of a skill the candidate no longer declares', async () => {
    const { data: before } = await supabase.from('users').select('skills').eq('id', TEST_USER_ID).single()
    const original = before!.skills as string[]

    await seedLevel(SKILL, 'avanzado')
    await supabase.from('users').update({ skills: ['python'] }).eq('id', TEST_USER_ID)

    try {
      const res = await request(app).get(`/api/community/users/${TEST_USERNAME}`)
      expect(res.body.user.skillLevels).toEqual([])

      // La fila sigue ahi: si vuelve a declarar el skill, el nivel reaparece.
      const { count } = await supabase
        .from('user_skill_levels')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', TEST_USER_ID)
        .eq('skill_name', SKILL)
      expect(count).toBe(1)
    } finally {
      await supabase.from('users').update({ skills: original }).eq('id', TEST_USER_ID)
    }
  })
})
