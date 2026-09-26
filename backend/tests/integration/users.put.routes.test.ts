import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'
import usersRouter from '../../src/routes/community/users.routes'

const TEST_USER_ID = '8d73ccc4-a0dd-4c8d-ac88-f7418b8f091e' // exam-questions-e2e-admin
const TEST_USERNAME = 'exam-questions-e2e-admin'

// Solo se suplanta "quién es este usuario" (no tenemos su contraseña). Todo lo
// demás —el catálogo real, el schema compartido, los triggers— corre sin mocks.
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/users', usersRouter)
  return app
}

const companyUsername = `t019-empresa-${Date.now().toString(36)}`
let companyUserId: string
let original: Record<string, unknown>

const validBody = {
  title: 'Backend Developer',
  roleCategory: 'backend',
  seniority: 'senior',
  skills: ['react', 'python'],
  location: 'Monterrey, MX',
  workModality: 'Remoto',
}

beforeAll(async () => {
  const { data } = await supabase
    .from('users')
    .select('title, role_category, seniority, skills, location, work_modality, photo_url, bio')
    .eq('id', TEST_USER_ID)
    .single()
  original = data as Record<string, unknown>

  if (!original.photo_url) {
    throw new Error(
      `El usuario de prueba ${TEST_USERNAME} no tiene photo_url, y la foto es obligatoria (FR-024). ` +
        'Asígnale una antes de correr este test.',
    )
  }

  // Una cuenta de empresa real para el caso de candidates_only. La crea el
  // scraper de esta forma, y así el INSERT no toca columnas privilegiadas.
  const { data: company, error } = await supabase
    .from('users')
    .insert({
      username: companyUsername,
      display_name: 'Empresa de prueba T019',
      account_type: 'company',
      company_slug: companyUsername,
      is_scraper_profile: true,
      scraper_source: 'company',
    })
    .select('id')
    .single()

  if (error) throw new Error(`no se pudo crear la empresa de prueba: ${error.message}`)
  companyUserId = company!.id
})

afterAll(async () => {
  await supabase
    .from('users')
    .update({
      title: original.title,
      role_category: original.role_category,
      seniority: original.seniority,
      skills: original.skills,
      location: original.location,
      work_modality: original.work_modality,
      bio: original.bio,
    })
    .eq('id', TEST_USER_ID)

  await supabase.from('users').delete().eq('id', companyUserId)
})

describe('PUT /api/community/users/:username (integration, T019)', () => {
  it('saves a valid profile and trims its free text', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', TEST_USER_ID)
      .send({ ...validBody, title: '  Backend Developer  ', bio: '  hola  ' })

    expect(res.status).toBe(200)
    expect(res.body.user.title).toBe('Backend Developer')
    expect(res.body.user.bio).toBe('hola')
    expect(res.body.user.skills).toEqual(['react', 'python'])
  })

  it('rejects a skill that is not in the approved catalog (FR-012)', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', TEST_USER_ID)
      .send({ ...validBody, skills: ['react', 'skill-inventado-t019'] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('skill_not_in_catalog')
    expect(res.body.skill).toBe('skill-inventado-t019')
  })

  it('rejects an empty skills list (FR-014)', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', TEST_USER_ID)
      .send({ ...validBody, skills: [] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
    expect(res.body.field).toBe('skills')
  })

  it.each([
    ['title', '   '],
    ['location', ''],
  ])('rejects a blank %s (FR-027)', async (field, value) => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', TEST_USER_ID)
      .send({ ...validBody, [field]: value })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
    expect(res.body.field).toBe(field)
  })

  it('rejects an invalid role category', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', TEST_USER_ID)
      .send({ ...validBody, roleCategory: 'inventada' })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('roleCategory')
  })

  // FR-004 y FR-005: aunque el body los traiga, Zod los descarta y el trigger
  // de la DB es la segunda barrera.
  it('ignores accountType, isSuperadmin and roles in the body', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', TEST_USER_ID)
      .send({ ...validBody, accountType: 'company', isSuperadmin: true, roles: ['admin'] })

    expect(res.status).toBe(200)

    const { data: after } = await supabase
      .from('users')
      .select('account_type, is_superadmin, roles')
      .eq('id', TEST_USER_ID)
      .single()

    expect(after!.account_type).toBe('candidate')
    expect(after!.is_superadmin).toBe(true) // ya lo era: el backfill lo hizo superadmin
    expect(after!.roles || []).not.toContain('admin')
  })

  it('rejects editing someone else profile', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .set('x-test-user-id', '00000000-0000-0000-0000-000000000001')
      .send(validBody)

    expect(res.status).toBe(403)
  })

  it('rejects a company account with candidates_only (FR-008)', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${companyUsername}`)
      .set('x-test-user-id', companyUserId)
      .send(validBody)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('candidates_only')
  })

  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp())
      .put(`/api/community/users/${TEST_USERNAME}`)
      .send(validBody)

    expect(res.status).toBe(401)
  })
})

describe('PUT /api/community/users/:username photo requirement (T019)', () => {
  // La foto es obligatoria para toda cuenta (FR-024). Se prueba con una cuenta
  // recién creada y sin foto: quitarle la suya a una cuenta que ya la tiene lo
  // impide el trigger de la DB, que es justo la otra mitad de la regla.
  it('rejects saving when the account would be left without a photo', async () => {
    const username = `t019-sinfoto-${Date.now().toString(36)}`
    const { data: fresh, error } = await supabase
      .from('users')
      .insert({ username, display_name: 'Sin foto T019' })
      .select('id')
      .single()
    expect(error).toBeNull()

    try {
      const res = await request(buildApp())
        .put(`/api/community/users/${username}`)
        .set('x-test-user-id', fresh!.id)
        .send(validBody)

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('photo_required')
    } finally {
      await supabase.from('users').delete().eq('id', fresh!.id)
    }
  })
})
