import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { normalizeTag, normalizeTags, validateMemberPost, POSTS_PER_DAY } from '../../services/community/post-rules'

const state = vi.hoisted(() => ({
  user: { profile_completed: true, is_superadmin: false } as { profile_completed: boolean; is_superadmin: boolean },
  postsToday: 0,
  inserted: [] as Record<string, unknown>[],
  updates: [] as { table: string; values: Record<string, unknown> }[],
  votes: new Set<string>(),
  postAuthor: 'u1',
  voteInsertFails: false,
  deleted: [] as string[],
}))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('no') }) },
    from: (table: string) => {
      const q: any = { _table: table, _head: false, _eq: {} as Record<string, unknown>, _op: 'select' as string }
      const chain = ['select', 'order', 'in', 'gte', 'range', 'limit', 'not', 'or', 'neq']
      for (const name of chain) q[name] = (_c?: unknown, opts?: { head?: boolean }) => { if (opts?.head) q._head = true; return q }
      q.eq = (column: string, value: unknown) => { q._eq[column] = value; return q }
      q.insert = (row: Record<string, unknown>) => {
        q._op = 'insert'
        if (table === 'community_posts') state.inserted.push(row)
        if (table === 'community_votes') {
          if (state.voteInsertFails) return Promise.resolve({ error: { message: 'fk' } })
          state.votes.add(`${row.user_id}:${row.post_id}`)
          return Promise.resolve({ error: null })
        }
        return q
      }
      q.update = (values: Record<string, unknown>) => { state.updates.push({ table, values }); q._op = 'update'; return q }
      q.delete = () => { q._op = 'delete'; return q }
      const result = () => {
        if (table === 'skills') return { data: [{ name: 'qa' }, { name: 'testing' }, { name: 'react' }], error: null }
        if (table === 'users') return { data: state.user, error: null }
        if (table === 'community_posts' && q._op === 'select' && q._head) return { data: null, count: state.postsToday, error: null }
        if (table === 'community_posts' && q._op === 'select') return { data: { id: 'p1', author_id: state.postAuthor }, error: null }
        if (table === 'community_votes' && q._op === 'select' && q._head) return { data: null, count: state.votes.size, error: null }
        if (table === 'community_votes' && q._op === 'select') {
          const has = state.votes.has(`${q._eq.user_id}:${q._eq.post_id}`)
          return { data: has ? { user_id: q._eq.user_id } : null, error: null }
        }
        if (table === 'community_votes' && q._op === 'delete') { state.votes.delete(`${q._eq.user_id}:${q._eq.post_id}`); return { error: null } }
        if (table === 'community_posts' && q._op === 'delete') { state.deleted.push(String(q._eq.id)); return { error: null } }
        return { data: [], error: null }
      }
      q.single = () => Promise.resolve(q._op === 'insert' && table === 'community_posts' ? { data: { id: 'new-post', ...state.inserted[state.inserted.length - 1] }, error: null } : result())
      q.maybeSingle = () => Promise.resolve(result())
      q.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject)
      return q
    },
  },
}))

vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => { req.userId = 'u1'; next() },
}))

import postsRouter from '../../src/routes/community/posts.routes'

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/posts', postsRouter)
  return a
}

const valid = { type: 'discussion', title: '¿Cómo estructuran sus pruebas?', content: 'Estoy armando la estrategia de pruebas de un equipo nuevo y quiero saber cómo lo hacen ustedes.', tags: ['QA', 'Testing'] }

beforeEach(() => {
  state.user = { profile_completed: true, is_superadmin: false }
  state.postsToday = 0
  state.inserted.length = 0
  state.updates.length = 0
  state.votes.clear()
  state.postAuthor = 'u1'
  state.voteInsertFails = false
  state.deleted.length = 0
})

describe('post rules', () => {
  it('normalizes a tag: lowercase, no accents, no symbols', () => {
    expect(normalizeTag('Node JS!')).toBe('node-js')
    expect(normalizeTag('#Diseño UX')).toBe('diseno-ux')
    expect(normalizeTag('C++')).toBe('c++')
    expect(normalizeTag(42)).toBe('')
  })

  it('keeps at most five different tags', () => {
    expect(normalizeTags(['a', 'A', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(normalizeTags('no es una lista')).toEqual([])
  })

  it('accepts a discussion, trimmed', () => {
    const result = validateMemberPost({ ...valid, title: '  Un título   con espacios  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.clean.title).toBe('Un título con espacios')
  })

  it.each(['job', 'editorial', 'showcase', 'admin', undefined])('does not let a member publish a %s (projects are paused)', type => {
    expect(validateMemberPost({ ...valid, type }).ok).toBe(false)
  })

  it('asks for a real title and content', () => {
    const result = validateMemberPost({ ...valid, title: 'corto', content: 'poco' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(2)
  })
})

describe('POST /posts for members', () => {
  it('publishes a discussion with the cleaned text and tags', async () => {
    const res = await request(app()).post('/posts').send(valid).expect(201)

    expect(res.body.post.id).toBe('new-post')
    expect(state.inserted[0]).toMatchObject({ type: 'discussion', title: valid.title, author_id: 'u1' })
  })

  it('accepts a role (puesto) and a skill as tags, and nothing else', async () => {
    await request(app()).post('/posts').send({ ...valid, tags: ['backend', 'ux-ui', 'react'] }).expect(201)
  })

  it('rejects a tag that is not a skill or a puesto, and says which one', async () => {
    const res = await request(app()).post('/posts').send({ ...valid, tags: ['react', 'mi-etiqueta-inventada'] }).expect(400)

    expect(res.body.error).toBe('invalid_tags')
    expect(res.body.invalid).toEqual(['mi-etiqueta-inventada'])
    expect(state.inserted).toHaveLength(0)
  })

  it('rejects text that is too short, with the reasons', async () => {
    const res = await request(app()).post('/posts').send({ ...valid, content: 'poco' }).expect(400)
    expect(res.body.error).toBe('invalid_post')
    expect(state.inserted).toHaveLength(0)
  })

  it('needs a complete profile', async () => {
    state.user.profile_completed = false
    const res = await request(app()).post('/posts').send(valid).expect(403)
    expect(res.body.error).toBe('profile_incomplete')
    expect(state.inserted).toHaveLength(0)
  })

  it('stops at the daily limit', async () => {
    state.postsToday = POSTS_PER_DAY
    const res = await request(app()).post('/posts').send(valid).expect(429)
    expect(res.body.error).toBe('daily_limit')
  })

  it('does not let a member create a vacancy while companies are paused', async () => {
    const res = await request(app()).post('/posts').send({ ...valid, type: 'job' }).expect(403)
    expect(res.body.error).toBe('jobs_paused')
    expect(state.inserted).toHaveLength(0)
  })
})

describe('votes are stored for real', () => {
  it('votes, then takes the vote back, and answers with the count', async () => {
    const first = await request(app()).post('/posts/p1/vote').expect(200)
    expect(first.body).toMatchObject({ voted: true, votesCount: 1 })

    const second = await request(app()).post('/posts/p1/vote').expect(200)
    expect(second.body).toMatchObject({ voted: false, votesCount: 0 })
  })

  it('keeps votes_count in sync, since there is no trigger', async () => {
    await request(app()).post('/posts/p1/vote')
    expect(state.updates.some(update => update.table === 'community_posts' && update.values.votes_count === 1)).toBe(true)
  })

  it('answers 404 when the post does not exist', async () => {
    state.voteInsertFails = true
    await request(app()).post('/posts/nada/vote').expect(404)
  })
})

describe('DELETE /posts/:id', () => {
  it('lets the author delete their own post', async () => {
    await request(app()).delete('/posts/p1').expect(200)
    expect(state.deleted).toEqual(['p1'])
  })

  it('does not let another member', async () => {
    state.postAuthor = 'otra'
    await request(app()).delete('/posts/p1').expect(403)
    expect(state.deleted).toEqual([])
  })

  it('lets the team moderate any post', async () => {
    state.postAuthor = 'otra'
    state.user.is_superadmin = true
    await request(app()).delete('/posts/p1').expect(200)
    expect(state.deleted).toEqual(['p1'])
  })
})
