import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { featuredScore, rankFeaturedUsers, type FeaturedCandidate } from '../../services/community/featured-users'
import { matchRoles, sanitizeQuery } from '../../services/community/search-text'

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, filters: [] as string[], user: null as string | null }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: { getUser: async () => (state.user ? { data: { user: { id: state.user } }, error: null } : { data: { user: null }, error: new Error('no') }) },
    from: (table: string) => ({
      select: () => {
        const q: any = {}
        for (const name of ['eq', 'not', 'gte', 'or', 'order', 'limit', 'in']) {
          q[name] = (...args: unknown[]) => { state.filters.push(`${table}:${name}:${args.join(',')}`); return q }
        }
        q.then = (resolve: any, reject: any) => Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(resolve, reject)
        return q
      },
    }),
  },
}))

import discoverRouter from '../../src/routes/community/discover.routes'

const app = () => {
  const a = express()
  a.use('/discover', discoverRouter)
  return a
}

const person = (id: string, patch: Partial<FeaturedCandidate> = {}): FeaturedCandidate => ({
  id, username: id, display_name: id.toUpperCase(), photo_url: 'https://cdn.test/x.jpg', role_category: 'backend', seniority: 'senior',
  skills: ['python', 'sql'], created_at: '2026-10-01T00:00:00Z', ...patch,
})

describe('featured users ranking', () => {
  it('weighs validated skills more than declared ones', () => {
    expect(featuredScore({ skills: 5, validated: 0, hasPhoto: false })).toBe(5)
    expect(featuredScore({ skills: 5, validated: 2, hasPhoto: false })).toBe(11)
  })

  it('does not reward listing dozens of skills', () => {
    expect(featuredScore({ skills: 40, validated: 0, hasPhoto: false })).toBe(featuredScore({ skills: 10, validated: 0, hasPhoto: false }))
  })

  it('puts the validated first, never shows the viewer, and skips people with no page', () => {
    const list = rankFeaturedUsers({
      candidates: [person('ana'), person('beto', { skills: ['a', 'b', 'c', 'd', 'e', 'f'] }), person('yo'), person('sin', { username: null })],
      validatedBy: new Map([['ana', 2]]),
      viewerId: 'yo',
      limit: 5,
    })

    expect(list.map(user => user.username)).toEqual(['ana', 'beto'])
    expect(list[0]).toMatchObject({ validatedSkills: 2, displayName: 'ANA' })
  })

  it('shows at most three skills and respects the limit', () => {
    const list = rankFeaturedUsers({ candidates: [person('a', { skills: ['1', '2', '3', '4', '5'] }), person('b'), person('c')], validatedBy: new Map(), limit: 2 })
    expect(list).toHaveLength(2)
    expect(list.find(user => user.username === 'a')?.skills).toEqual(['1', '2', '3'])
  })

  it('breaks ties with the newest', () => {
    const list = rankFeaturedUsers({ candidates: [person('vieja', { created_at: '2026-01-01T00:00:00Z' }), person('nueva', { created_at: '2026-10-20T00:00:00Z' })], validatedBy: new Map(), limit: 2 })
    expect(list.map(user => user.username)).toEqual(['nueva', 'vieja'])
  })
})

describe('search text', () => {
  it('removes what could change the query', () => {
    expect(sanitizeQuery('react,title.eq.x)(%*')).toBe('react title.eq.x')
    expect(sanitizeQuery(undefined)).toBe('')
    expect(sanitizeQuery('  full   stack ')).toBe('full stack')
  })

  it('finds roles without caring about accents', () => {
    const roles = [{ label: 'Diseño UX/UI' }, { label: 'Desarrollo Backend' }]
    expect(matchRoles(roles, 'diseno')).toEqual([{ label: 'Diseño UX/UI' }])
    expect(matchRoles(roles, 'd')).toEqual([])
  })
})

describe('GET /discover/featured-users', () => {
  beforeEach(() => {
    state.filters.length = 0
    state.user = 'me'
    state.tables = { users: [person('ana'), person('me')], user_skill_levels: [{ user_id: 'ana' }] }
  })

  it('is for members only', async () => {
    state.user = null
    await request(app()).get('/discover/featured-users').expect(401)
  })

  it('only looks at real, complete profiles', async () => {
    await request(app()).get('/discover/featured-users').set('Authorization', 'Bearer t').expect(200)

    expect(state.filters).toContain('users:eq:user_kind,user')
    expect(state.filters).toContain('users:eq:is_test_account,false')
    expect(state.filters).toContain('users:eq:profile_completed,true')
  })

  it('brings the person with their validated count, and not the viewer', async () => {
    const res = await request(app()).get('/discover/featured-users').set('Authorization', 'Bearer t').expect(200)

    expect(res.body.users).toHaveLength(1)
    expect(res.body.users[0]).toMatchObject({ username: 'ana', validatedSkills: 1 })
    expect(JSON.stringify(res.body)).not.toContain('email')
  })
})

describe('GET /discover/search', () => {
  beforeEach(() => {
    state.filters.length = 0
    state.user = null
    state.tables = {
      community_posts: [{ slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', company_logo: null, location: 'MX', modalidad: 'Remoto', seniority_level: 'senior' }],
      users: [{ username: 'ana', display_name: 'Ana', photo_url: null, role_category: 'backend', seniority: 'senior', company_slug: 'stripe', name: 'Stripe' }],
      skills: [{ name: 'python', label: 'Python' }],
    }
  })

  it('does nothing with fewer than two letters', async () => {
    const res = await request(app()).get('/discover/search?q=a').expect(200)
    expect(res.body.vacancies).toEqual([])
    expect(state.filters).toEqual([])
  })

  it('finds vacancies, companies, skills and roles, and no people for a visitor', async () => {
    const res = await request(app()).get('/discover/search?q=back').expect(200)

    expect(res.body.vacancies[0]).toMatchObject({ slug: 'backend-1', company: 'Stripe' })
    expect(res.body.skills).toEqual([{ name: 'python', label: 'Python' }])
    expect(res.body.roles.map((role: { slug: string }) => role.slug)).toContain('backend')
    expect(res.body.people).toEqual([])
  })

  it('adds people when there is a session', async () => {
    state.user = 'me'
    const res = await request(app()).get('/discover/search?q=ana').set('Authorization', 'Bearer t').expect(200)
    expect(res.body.people[0]).toMatchObject({ username: 'ana' })
  })

  it('looks only at open vacancies', async () => {
    await request(app()).get('/discover/search?q=back')
    expect(state.filters.some(filter => filter.startsWith('community_posts:gte:created_at,'))).toBe(true)
  })

  it('does not let the text alter the filter', async () => {
    await request(app()).get('/discover/search?q=' + encodeURIComponent('x,title.eq.1'))
    const filter = state.filters.find(item => item.startsWith('community_posts:or:'))!
    expect(filter).not.toContain('x,title')
  })
})
