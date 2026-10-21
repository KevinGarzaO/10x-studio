import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Estado del "Postgaster" falso: choques por consulta, inserts recibidos y si la
// columna provider existe aún en la BD (migración no aplicada).
const db = vi.hoisted(() => ({
  nameClash: null as any,
  emailClash: null as any,
  existing: null as any,
  inserts: [] as any[],
  queries: [] as any[],
  insertError: null as any,
  providerColumnMissing: false,
  authUser: null as any,
  adminUpdates: [] as any[],
}))

vi.mock('../../services/supabase.service', () => {
  const errorFor = (payload: any) => {
    if (db.providerColumnMissing && payload && 'provider' in payload) {
      return {
        code: 'PGRST204',
        message: "Could not find the 'provider' column of 'users' in the schema cache",
      }
    }
    return db.insertError
  }

  const builder = () => {
    const state = { conds: {} as Record<string, any>, isInsert: false, payload: null as any }
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { state.conds[k] = v; return q },
      or: () => q,
      insert: (p: any) => { state.isInsert = true; state.payload = p; db.inserts.push(p); return q },
      maybeSingle: () => {
        if (!state.isInsert) db.queries.push({ ...state.conds })
        return Promise.resolve({ data: lookup(state.conds), error: null })
      },
      single: () => {
        if (!state.isInsert) return Promise.resolve({ data: lookup(state.conds), error: null })
        const error = errorFor(state.payload)
        return Promise.resolve({ data: error ? null : { ...state.payload }, error })
      },
      then: (resolve: any, reject: any) => {
        const result = state.isInsert
          ? { data: null, error: errorFor(state.payload) }
          : { data: [], error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return q
  }

  const lookup = (conds: Record<string, any>) => {
    if ('id' in conds) return db.existing
    if ('username' in conds) return db.nameClash
    if ('email' in conds) return db.emailClash
    return null
  }

  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: db.authUser }, error: null }),
        admin: {
          updateUserById: async (id: string, payload: any) => {
            db.adminUpdates.push({ id, ...payload })
            return { data: {}, error: null }
          },
        },
      },
      from: () => builder(),
    },
    createAuthClient: () => ({
      auth: {
        signUp: async () => ({ data: { user: { id: 'auth-new' }, session: null }, error: null }),
      },
    }),
  }
})

vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => {
    req.userId = 'auth-1'
    next()
  },
}))

import authRouter from '../../src/routes/community/auth.routes'

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/community/auth', authRouter)
  return a
}

beforeEach(() => {
  db.nameClash = null
  db.emailClash = null
  db.existing = null
  db.inserts = []
  db.queries = []
  db.insertError = null
  db.providerColumnMissing = false
  db.authUser = null
  db.adminUpdates = []
})

describe('users.provider', () => {
  it('marks an email signup as provider "email"', async () => {
    await request(app())
      .post('/api/community/auth/signup')
      .send({ email: 'ana@correo.com', password: 'x', username: 'ana' })
      .expect(201)

    expect(db.inserts[0]).toMatchObject({ email: 'ana@correo.com', provider: 'email' })
  })

  it('scopes the email clash check to email-provider accounts', async () => {
    // El chequeo por correo lleva provider = 'email': una cuenta de GitHub o
    // LinkedIn con el mismo correo no bloquea el registro por correo.
    await request(app())
      .post('/api/community/auth/signup')
      .send({ email: 'x@correo.com', password: 'x', username: 'nuevo' })
      .expect(201)

    expect(db.queries).toContainEqual({ email: 'x@correo.com', provider: 'email' })
    expect(db.queries).toContainEqual({ username: 'nuevo' })
  })

  it('blocks email signup only when the email is already owned by the email provider', async () => {
    db.emailClash = { id: 'other' }

    const res = await request(app())
      .post('/api/community/auth/signup')
      .send({ email: 'ocupado@correo.com', password: 'x', username: 'otro' })

    expect(res.status).toBe(409)
    expect(db.inserts).toHaveLength(0)
  })

  it('still creates the account if the provider column is not migrated yet', async () => {
    db.providerColumnMissing = true

    await request(app())
      .post('/api/community/auth/signup')
      .send({ email: 'ana@correo.com', password: 'x', username: 'ana' })
      .expect(201)

    expect(db.inserts).toHaveLength(2)
    expect(db.inserts[0].provider).toBe('email')
    expect(db.inserts[1]).not.toHaveProperty('provider')
  })

  it.each([
    ['github', 'github'],
    ['linkedin_oidc', 'linkedin'],
    ['linkedin', 'linkedin'],
    [undefined, 'email'],
  ])('sync-user stores provider %s as %s', async (raw, expected) => {
    db.authUser = {
      email: 'k@correo.com',
      app_metadata: raw ? { provider: raw } : {},
      user_metadata: { avatar_url: 'https://avatars.example/x.png' },
    }

    const res = await request(app())
      .post('/api/community/auth/sync-user')
      .set('Authorization', 'Bearer t')

    expect(res.status).toBe(200)
    expect(db.inserts[0]).toMatchObject({
      id: 'auth-1',
      provider: expected,
      photo_url: 'https://avatars.example/x.png',
    })
  })

  it('sync-user still creates the account if the provider column is not migrated yet', async () => {
    db.providerColumnMissing = true
    db.authUser = {
      email: 'k@correo.com',
      app_metadata: { provider: 'github' },
      user_metadata: {},
    }

    const res = await request(app())
      .post('/api/community/auth/sync-user')
      .set('Authorization', 'Bearer t')

    expect(res.status).toBe(200)
    expect(db.inserts).toHaveLength(2)
    expect(db.inserts[1]).not.toHaveProperty('provider')
  })

  it('sync-user copies the LinkedIn picture into avatar_url for the Supabase dashboard', async () => {
    // LinkedIn OIDC trae la foto en `picture`; el dashboard de Auth solo dibuja
    // `avatar_url`, así que sync-user la copia (y la usa para photo_url).
    const picture = 'https://media.licdn.com/dms/photo.jpg'
    db.authUser = {
      email: 'li@correo.com',
      app_metadata: { provider: 'linkedin_oidc' },
      user_metadata: { picture, name: 'Li' },
    }

    const res = await request(app())
      .post('/api/community/auth/sync-user')
      .set('Authorization', 'Bearer t')

    expect(res.status).toBe(200)
    expect(db.inserts[0]).toMatchObject({ photo_url: picture })
    expect(db.adminUpdates).toHaveLength(1)
    expect(db.adminUpdates[0]).toMatchObject({
      id: 'auth-1',
      user_metadata: { picture, name: 'Li', avatar_url: picture },
    })
  })

  it('sync-user does not touch auth metadata when avatar_url already exists', async () => {
    db.authUser = {
      email: 'gh@correo.com',
      app_metadata: { provider: 'github' },
      user_metadata: { avatar_url: 'https://avatars.example/gh.png' },
    }

    await request(app())
      .post('/api/community/auth/sync-user')
      .set('Authorization', 'Bearer t')
      .expect(200)

    expect(db.adminUpdates).toHaveLength(0)
  })
})
