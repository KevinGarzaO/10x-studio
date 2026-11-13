import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Base falsa: cada tabla devuelve lo que se le ponga en `db`.
const db: Record<string, { data: unknown; error: { message: string } | null }> = {}
vi.mock('../../services/supabase.service', () => {
  const chain = (table: string) => {
    const result = () => db[table] ?? { data: [], error: null }
    const q: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'in', 'order', 'limit', 'range']) q[name] = () => q
    q.maybeSingle = () => Promise.resolve({ data: Array.isArray(result().data) ? (result().data as unknown[])[0] ?? null : result().data, error: result().error })
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return q
  }
  return { supabase: { from: (table: string) => chain(table), auth: { getUser: async (token: string) => (token === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) } } }
})

import { flagsFor, isEnabled, clearFlagsCache } from '../../services/flags/flags.service'
import { requireFlag } from '../../middleware/require-flag.middleware'
import flagsRoutes from '../../src/routes/community/flags.routes'

const flag = (key: string, stage: string) => ({ key, description: 'prueba', stage, retire_by: '2027-01-01', updated_at: '2026-11-13' })

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  clearFlagsCache()
})

describe('flagsFor', () => {
  it('without the tables (migration not run) everything is off and nothing throws', async () => {
    db.feature_flags = { data: null, error: { message: 'relation "feature_flags" does not exist' } }
    expect(await flagsFor('u1')).toEqual({})
    expect(await isEnabled('x', 'u1')).toBe(false)
  })

  it('returns only the enabled ones, by the ladder', async () => {
    db.feature_flags = { data: [flag('solo_equipo', 'equipo'), flag('para_todos', 'todos'), flag('apagada', 'off')], error: null }
    db.users = { data: [{ user_kind: 'user', is_test_account: false }], error: null }
    expect(await flagsFor('u1')).toEqual({ para_todos: true })
    db.users = { data: [{ user_kind: 'superadmin', is_test_account: false }], error: null }
    clearFlagsCache()
    expect(await flagsFor('u1')).toEqual({ solo_equipo: true, para_todos: true })
  })

  it('a beta person sees the beta step but not the equipo one', async () => {
    db.feature_flags = { data: [flag('f_equipo', 'equipo'), flag('f_beta', 'beta')], error: null }
    db.users = { data: [{ user_kind: 'user', is_test_account: false }], error: null }
    db.user_groups = { data: [{ group_key: 'beta' }], error: null }
    expect(await flagsFor('u1')).toEqual({ f_beta: true })
  })

  it('an override by hand wins; deny hides even a todos flag', async () => {
    db.feature_flags = { data: [flag('f_equipo', 'equipo'), flag('f_todos', 'todos')], error: null }
    db.users = { data: [{ user_kind: 'user', is_test_account: false }], error: null }
    db.feature_flag_overrides = { data: [{ flag_key: 'f_equipo', mode: 'allow' }, { flag_key: 'f_todos', mode: 'deny' }], error: null }
    expect(await flagsFor('u1')).toEqual({ f_equipo: true })
  })

  it('a visitor without session only gets the todos ones', async () => {
    db.feature_flags = { data: [flag('f_beta', 'beta'), flag('f_todos', 'todos')], error: null }
    expect(await flagsFor(null)).toEqual({ f_todos: true })
  })
})

describe('public route and guard', () => {
  const app = () => {
    const server = express()
    server.use('/api/community/flags', flagsRoutes)
    server.get('/nueva', requireFlag('nueva'), (_req, res) => res.json({ ok: true }))
    return server
  }

  it('answers only enabled flags, never cached', async () => {
    db.feature_flags = { data: [flag('nueva', 'todos'), flag('oculta', 'equipo')], error: null }
    const res = await request(app()).get('/api/community/flags')
    expect(res.body).toEqual({ flags: { nueva: true } })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('answers an empty list, not an error, when the tables are missing', async () => {
    db.feature_flags = { data: null, error: { message: 'does not exist' } }
    const res = await request(app()).get('/api/community/flags')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ flags: {} })
  })

  it('the guard makes a route look like it does not exist for someone without the function', async () => {
    db.feature_flags = { data: [flag('nueva', 'equipo')], error: null }
    db.users = { data: [{ user_kind: 'user', is_test_account: false }], error: null }
    expect((await request(app()).get('/nueva')).status).toBe(404)
    expect((await request(app()).get('/nueva').set('Authorization', 'Bearer good')).status).toBe(404)
    db.users = { data: [{ user_kind: 'superadmin', is_test_account: false }], error: null }
    clearFlagsCache()
    expect((await request(app()).get('/nueva').set('Authorization', 'Bearer good')).status).toBe(200)
  })
})
