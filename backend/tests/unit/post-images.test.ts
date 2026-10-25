import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

process.env.SUPABASE_URL = 'https://project.supabase.co'

const state = vi.hoisted(() => ({ profileCompleted: true, uploads: [] as { path: string; type: string; size: number }[], uploadError: false, inserted: [] as Record<string, unknown>[], failFirstInsertOnImage: false }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('no') }) },
    storage: {
      from: () => ({
        upload: async (path: string, buffer: Buffer, options: { contentType: string }) => {
          if (state.uploadError) return { error: { message: 'boom' } }
          state.uploads.push({ path, type: options.contentType, size: buffer.length })
          return { error: null }
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/images/${path}` } }),
      }),
    },
    from: (table: string) => {
      const q: any = { _op: 'select' }
      for (const name of ['select', 'order', 'in', 'gte', 'eq', 'limit', 'not', 'or']) q[name] = () => q
      q.insert = (row: Record<string, unknown>) => {
        q._op = 'insert'
        if (table === 'community_posts') {
          if (state.failFirstInsertOnImage && row.image_url) { q._fail = true; return q }
          state.inserted.push(row)
        }
        return q
      }
      q.update = () => q
      q.single = () => Promise.resolve(q._fail ? { data: null, error: { message: 'column "image_url" of relation "community_posts" does not exist' } } : { data: { id: 'new-post', ...state.inserted[state.inserted.length - 1] }, error: null })
      q.maybeSingle = () => Promise.resolve(table === 'users' ? { data: { profile_completed: state.profileCompleted, is_superadmin: false }, error: null } : { data: null, error: null })
      q.then = (resolve: any) => Promise.resolve(q._op === 'select' && table === 'community_posts' ? { data: null, count: 0, error: null } : { data: [], error: null }).then(resolve)
      return q
    },
  },
}))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => { req.userId = 'u1'; next() },
}))

import postsRouter from '../../src/routes/community/posts.routes'
import { isCommunityImageUrl, parseImageDataUrl, MAX_IMAGE_BYTES } from '../../services/community/post-images'

const app = () => {
  const a = express()
  a.use(express.json({ limit: '15mb' }))
  a.use('/posts', postsRouter)
  return a
}

const png = (bytes = 100) => `data:image/png;base64,${Buffer.alloc(bytes, 1).toString('base64')}`
const OWN = 'https://project.supabase.co/storage/v1/object/public/images/community/u1-1.png'
const valid = { type: 'discussion', title: '¿Cómo estructuran sus pruebas?', content: 'Estoy armando la estrategia de pruebas de un equipo nuevo y quiero saber cómo lo hacen.' }

beforeEach(() => {
  state.profileCompleted = true
  state.uploads.length = 0
  state.uploadError = false
  state.inserted.length = 0
  state.failFirstInsertOnImage = false
})

describe('parseImageDataUrl', () => {
  it('accepts png, jpg, webp and gif', () => {
    for (const type of ['png', 'jpeg', 'webp', 'gif']) {
      expect(parseImageDataUrl(`data:image/${type};base64,AAAA`).ok).toBe(true)
    }
  })

  it('rejects svg (it can carry scripts), other files and garbage', () => {
    expect(parseImageDataUrl('data:image/svg+xml;base64,AAAA').ok).toBe(false)
    expect(parseImageDataUrl('data:text/html;base64,AAAA').ok).toBe(false)
    expect(parseImageDataUrl('https://evil.test/a.png').ok).toBe(false)
    expect(parseImageDataUrl(undefined).ok).toBe(false)
  })

  it('rejects an empty image and one over 5 MB', () => {
    expect(parseImageDataUrl('data:image/png;base64,').ok).toBe(false)
    expect(parseImageDataUrl(png(MAX_IMAGE_BYTES + 10)).ok).toBe(false)
  })
})

describe('isCommunityImageUrl', () => {
  it('only accepts images from our own community folder', () => {
    expect(isCommunityImageUrl(OWN)).toBe(true)
    expect(isCommunityImageUrl('https://evil.test/a.png')).toBe(false)
    expect(isCommunityImageUrl('https://project.supabase.co/storage/v1/object/public/avatars/a.png')).toBe(false)
    expect(isCommunityImageUrl('https://project.supabase.co/storage/v1/object/public/images/community/../private/a.png')).toBe(false)
    expect(isCommunityImageUrl(null)).toBe(false)
  })
})

describe('POST /posts/upload-image', () => {
  it('stores the image and answers with its address', async () => {
    const res = await request(app()).post('/posts/upload-image').send({ dataUrl: png() }).expect(201)

    expect(res.body.url).toMatch(/\/images\/community\/u1-\d+\.png$/)
    expect(state.uploads[0]).toMatchObject({ type: 'image/png', size: 100 })
  })

  it('refuses a file that is not an image', async () => {
    const res = await request(app()).post('/posts/upload-image').send({ dataUrl: 'data:text/html;base64,AAAA' }).expect(400)
    expect(res.body.error).toBe('invalid_image')
    expect(state.uploads).toHaveLength(0)
  })

  it('needs a complete profile', async () => {
    state.profileCompleted = false
    await request(app()).post('/posts/upload-image').send({ dataUrl: png() }).expect(403)
  })

  it('says so when the storage fails', async () => {
    state.uploadError = true
    await request(app()).post('/posts/upload-image').send({ dataUrl: png() }).expect(400)
  })
})

describe('the cover of a post', () => {
  it('is saved when it is one of our own images', async () => {
    await request(app()).post('/posts').send({ ...valid, imageUrl: OWN }).expect(201)
    expect(state.inserted[0]).toMatchObject({ image_url: OWN })
  })

  it('is ignored when it points anywhere else', async () => {
    await request(app()).post('/posts').send({ ...valid, imageUrl: 'https://evil.test/a.png' }).expect(201)
    expect(state.inserted[0]).not.toHaveProperty('image_url')
  })

  it('does not lose the post when the image column does not exist yet', async () => {
    state.failFirstInsertOnImage = true
    await request(app()).post('/posts').send({ ...valid, imageUrl: OWN }).expect(201)

    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).not.toHaveProperty('image_url')
  })
})
