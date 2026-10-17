import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Una "tabla users" mínima: la fila que devuelve el SELECT y lo que recibe el UPDATE.
const state = vi.hoisted(() => ({
  row: null as any,
  viewerId: null as string | null,
  updates: [] as any[],
  updateError: null as any,
}))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: {
      getUser: async (token: string) =>
        state.viewerId && token === 'good'
          ? { data: { user: { id: state.viewerId } }, error: null }
          : { data: { user: null }, error: new Error('invalid') },
    },
    from: (table: string) => {
      const q: any = {}
      let isUpdate = false
      q.select = () => q
      q.update = (values: any) => { isUpdate = true; state.updates.push({ table, values }); return q }
      q.eq = () => q
      q.order = () => q
      q.maybeSingle = () => Promise.resolve({ data: state.row, error: null })
      q.single = () => Promise.resolve({ data: state.row, error: state.row ? null : { message: 'no row' } })
      q.then = (resolve: any, reject: any) =>
        Promise.resolve(isUpdate ? { error: state.updateError } : { data: [], error: null }).then(resolve, reject)
      return q
    },
  },
}))

vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, res: any, next: any) => {
    if (!req.headers['x-test-user-id']) return res.status(401).json({ error: 'No autorizado' })
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

vi.mock('../../src/middleware/require-account-type.middleware', () => ({
  requireAccountType: (type: string) => (req: any, res: any, next: any) =>
    req.headers['x-test-account-type'] === type ? next() : res.status(403).json({ error: 'candidates_only' }),
}))

import usersRouter from '../../src/routes/community/users.routes'

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/api/community/users', usersRouter)
  return a
}

const owner = {
  id: 'u1', username: 'ana', display_name: 'Ana Pérez', photo_url: 'https://x/a.png', title: 'Desarrollo Backend',
  role_category: 'backend', seniority: 'senior', location: 'Monterrey, MX', work_modality: 'Remoto',
  skills: ['nodejs'], website: null, github_url: null, bio: 'hola', account_type: 'candidate',
  cv: { summary: 'Ingeniera con 6 años', contactEmail: 'ana@correo.com', phone: '+52 81 1234', experience: [] },
  cv_public: false,
}

const asOwner = (r: request.Test) => r.set('x-test-user-id', 'u1').set('x-test-account-type', 'candidate').set('Authorization', 'Bearer good')

beforeEach(() => {
  state.row = { ...owner }
  state.viewerId = null
  state.updates = []
  state.updateError = null
})

describe('GET /users/:username/cv', () => {
  it('hides a private CV from everyone but its owner, as if it did not exist', async () => {
    const stranger = await request(app()).get('/api/community/users/ana/cv')
    expect(stranger.status).toBe(404)

    state.row = null
    const missing = await request(app()).get('/api/community/users/nadie/cv')
    expect(missing.status).toBe(404)
    // No se puede distinguir "privado" de "no existe".
    expect(stranger.body).toEqual(missing.body)
  })

  it('shows a published CV to anyone, with no email of the account', async () => {
    state.row = { ...owner, cv_public: true }

    const res = await request(app()).get('/api/community/users/ana/cv').expect(200)

    expect(res.body.isPublic).toBe(true)
    expect(res.body.isOwner).toBe(false)
    expect(res.body.profile.display_name).toBe('Ana Pérez')
    expect(res.body.cv.summary).toBe('Ingeniera con 6 años')
    expect(res.body.profile).not.toHaveProperty('email')
    expect(res.body.profile).not.toHaveProperty('cv')
  })

  it('lets the owner see their own private CV, and says so', async () => {
    state.viewerId = 'u1'

    const res = await request(app()).get('/api/community/users/ana/cv').set('Authorization', 'Bearer good').expect(200)

    expect(res.body.isOwner).toBe(true)
    expect(res.body.isPublic).toBe(false)
  })

  it('does not let someone else with a session see a private CV', async () => {
    state.viewerId = 'otra-persona'

    await request(app()).get('/api/community/users/ana/cv').set('Authorization', 'Bearer good').expect(404)
  })

  it('has no CV for a company account', async () => {
    state.row = { ...owner, account_type: 'company', cv_public: true }

    await request(app()).get('/api/community/users/ana/cv').expect(404)
  })

  it('serves a safe empty CV when the account never wrote one', async () => {
    state.row = { ...owner, cv: {}, cv_public: true }

    const res = await request(app()).get('/api/community/users/ana/cv').expect(200)

    expect(res.body.cv.experience).toEqual([])
    expect(res.body.cv.summary).toBe('')
  })
})

describe('PUT /users/:username/cv', () => {
  const body = {
    cv: {
      summary: '  Ingeniera  ',
      experience: [{ company: 'Stripe', position: 'Backend', startDate: '2022-03', endDate: null }],
    },
    public: true,
  }

  it('requires a session', async () => {
    await request(app()).put('/api/community/users/ana/cv').send(body).expect(401)
  })

  it('is for candidates only', async () => {
    await request(app()).put('/api/community/users/ana/cv').set('x-test-user-id', 'u1').set('x-test-account-type', 'company').send(body).expect(403)
  })

  it('does not let one person edit another one’s CV', async () => {
    const res = await request(app())
      .put('/api/community/users/ana/cv')
      .set('x-test-user-id', 'otra-persona')
      .set('x-test-account-type', 'candidate')
      .send(body)

    expect(res.status).toBe(403)
    expect(state.updates).toEqual([])
  })

  it('saves the validated CV and whether it is public', async () => {
    const res = await asOwner(request(app()).put('/api/community/users/ana/cv').send(body)).expect(200)

    expect(res.body.isPublic).toBe(true)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].values.cv.summary).toBe('Ingeniera')
    expect(state.updates[0].values.cv.experience[0].endDate).toBeNull()
    expect(state.updates[0].values.cv_public).toBe(true)
  })

  it('keeps the CV private unless it is made public on purpose', async () => {
    await asOwner(request(app()).put('/api/community/users/ana/cv').send({ cv: {} })).expect(200)

    expect(state.updates[0].values.cv_public).toBe(false)
  })

  it('reports which field is wrong instead of saving a bad CV', async () => {
    const res = await asOwner(
      request(app()).put('/api/community/users/ana/cv').send({
        cv: { experience: [{ company: 'X', position: 'Y', startDate: 'marzo' }] },
      }),
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
    expect(res.body.field).toContain('experience')
    expect(state.updates).toEqual([])
  })

  it('does not store fields it does not know about', async () => {
    await asOwner(request(app()).put('/api/community/users/ana/cv').send({ cv: { summary: 'hola', isAdmin: true } })).expect(200)

    expect(state.updates[0].values.cv).not.toHaveProperty('isAdmin')
  })

  it('answers 500 when the database refuses the save', async () => {
    state.updateError = { message: 'boom' }

    await asOwner(request(app()).put('/api/community/users/ana/cv').send(body)).expect(500)
  })
})

describe('the public profile never exposes private columns', () => {
  it('drops the email, internal ids, admin and test flags and the CV', async () => {
    state.row = {
      ...owner,
      email: 'ana@correo.com',
      substack_user_id: 'sub-1',
      is_superadmin: true,
      is_test_account: false,
      claimed_by: 'x',
      company_id: 'y',
      community_posts: [],
    }

    const res = await request(app()).get('/api/community/users/ana').expect(200)

    for (const field of ['email', 'substack_user_id', 'is_superadmin', 'is_test_account', 'claimed_by', 'company_id', 'cv', 'cv_public']) {
      expect(res.body.user).not.toHaveProperty(field)
    }
    // Lo público sigue ahí.
    expect(res.body.user.display_name).toBe('Ana Pérez')
    expect(res.body.user.skills).toEqual(['nodejs'])
  })
})
