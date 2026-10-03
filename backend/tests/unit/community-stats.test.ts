import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Cada llamada a from(tabla).select(...) devuelve un "query" que registra los
// filtros que se le encadenan y, al esperarse, responde según el escenario.
const calls = vi.hoisted(() => [] as { table: string; filters: string[] }[])
const scenario = vi.hoisted(() => ({ legacyOnly: false }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const entry = { table, filters: [] as string[] }
        calls.push(entry)
        const q: any = {}
        for (const name of ['in', 'eq', 'neq', 'not']) {
          q[name] = (...args: unknown[]) => { entry.filters.push(`${name}:${args.join(',')}`); return q }
        }
        q.then = (resolve: any, reject: any) => {
          const usesNewColumns = entry.filters.some(f => /user_kind|is_test_account/.test(f))
          if (scenario.legacyOnly && usesNewColumns) {
            return Promise.resolve({ count: null, error: { message: 'column users.user_kind does not exist' } }).then(resolve, reject)
          }
          const count = table === 'users'
            ? (entry.filters.some(f => f.startsWith('in:user_kind')) ? 3 : entry.filters.some(f => f.includes('user_kind,company')) ? 15 : entry.filters.some(f => f.includes('neq:account_type')) ? 6 : 15)
            : (entry.filters.some(f => f.includes('type,job')) ? 40 : 495)
          return Promise.resolve({ count, error: null }).then(resolve, reject)
        }
        return q
      },
    }),
  },
}))

import statsRouter from '../../src/routes/community/stats.routes'

const app = () => {
  const a = express()
  a.use('/api/community/stats', statsRouter)
  return a
}

beforeEach(() => {
  calls.length = 0
  scenario.legacyOnly = false
})

describe('GET /stats', () => {
  it('splits real members, companies and vacancies', async () => {
    const res = await request(app()).get('/api/community/stats').expect(200)

    expect(res.body).toEqual({ members: 3, companies: 15, vacancies: 40, posts: 495 })
  })

  it('counts only real accounts: no test accounts and no scraper profiles', async () => {
    await request(app()).get('/api/community/stats').expect(200)

    const people = calls.find(c => c.table === 'users' && c.filters.some(f => f.startsWith('in:user_kind')))!
    expect(people.filters).toContain('in:user_kind,user,superadmin')
    expect(people.filters).toContain('eq:is_test_account,false')
    expect(people.filters).toContain('not:is_scraper_profile,is,true')

    const companies = calls.find(c => c.filters.includes('eq:user_kind,company'))!
    expect(companies.filters).toContain('eq:is_test_account,false')
  })

  it('counts vacancies as published job posts', async () => {
    await request(app()).get('/api/community/stats').expect(200)

    expect(calls.some(c => c.table === 'community_posts' && c.filters.includes('eq:type,job'))).toBe(true)
  })

  it('still answers when the classification migration is not applied yet', async () => {
    scenario.legacyOnly = true

    const res = await request(app()).get('/api/community/stats').expect(200)

    expect(res.body.members).toBe(6)
    expect(res.body.companies).toBe(15)
    expect(res.body.vacancies).toBe(40)
  })
})
