import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commentsOf, createComment } from '@/lib/post-comments'

const older = { id: 'c1', content: 'primero', author: { username: 'ana' }, created_at: '2026-10-01T10:00:00Z' }
const newer = { id: 'c2', content: 'segundo', author: { username: 'luis' }, created_at: '2026-10-02T10:00:00Z' }

describe('commentsOf', () => {
  it('reads the comments the API returns as community_comments, newest first', () => {
    expect(commentsOf({ community_comments: [older, newer] }).map(c => c.id)).toEqual(['c2', 'c1'])
  })

  it('prefers a comments field when the API provides one', () => {
    expect(commentsOf({ comments: [older], community_comments: [newer] }).map(c => c.id)).toEqual(['c1'])
  })

  it('is empty when there are none', () => {
    expect(commentsOf({})).toEqual([])
  })
})

describe('createComment', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('refuses without a session and never calls the API', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await createComment('p1', 'hola')

    expect(result).toEqual({ error: 'Inicia sesión para comentar' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts to the comments endpoint with the token and returns the saved comment', async () => {
    localStorage.setItem('avocado_token', 'tok')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ comment: newer }) })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await createComment('p1', 'hola')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/community\/posts\/p1\/comments$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({ content: 'hola' })
    expect(result).toEqual({ comment: newer })
  })

  it('reports the API error instead of pretending it was published', async () => {
    localStorage.setItem('avocado_token', 'tok')
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'El contenido es requerido' }) }) as unknown as typeof fetch

    expect(await createComment('p1', 'x')).toEqual({ error: 'El contenido es requerido' })
  })

  it('reports a connection failure', async () => {
    localStorage.setItem('avocado_token', 'tok')
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch

    const result = await createComment('p1', 'x')
    expect('error' in result).toBe(true)
  })
})
