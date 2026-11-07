import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Eventos de la comunidad (medición): discusión creada, comentario creado, voto dado y discusión vista. Solo el identificador, nunca el texto,
 * y medir jamás rompe la acción.
 */
const track = vi.fn()
vi.mock('@/lib/web-analytics', () => ({ trackEvent: (...args: unknown[]) => track(...args) }))
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session')
  return { ...actual, getToken: () => 'token' }
})

import { trackCommentCreated, trackDiscussionCreated, trackDiscussionViewed, trackVoteGiven } from '@/lib/community-events'
import { createComment } from '@/lib/post-comments'

beforeEach(() => track.mockClear())

describe('community events', () => {
  it('sends the four events with only the id of the discussion', () => {
    trackDiscussionCreated('p1'); trackCommentCreated('p1'); trackVoteGiven('p1'); trackDiscussionViewed('p1')
    expect(track.mock.calls).toEqual([
      ['discussion_created', { post_id: 'p1' }], ['comment_created', { post_id: 'p1' }], ['vote_given', { post_id: 'p1' }], ['discussion_viewed', { post_id: 'p1' }],
    ])
  })

  it('sends no params when there is no id, and never throws when measuring fails', () => {
    trackVoteGiven(undefined)
    expect(track).toHaveBeenCalledWith('vote_given', {})
    track.mockImplementationOnce(() => { throw new Error('boom') })
    expect(() => trackCommentCreated('p2')).not.toThrow()
  })

  it('a comment that was saved is recorded, with the id of the discussion and not its text', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ comment: { id: 'c1', content: 'texto privado' } }) })) as unknown as typeof fetch
    const result = await createComment('p7', 'texto privado')
    expect(result).toHaveProperty('comment')
    expect(track).toHaveBeenCalledWith('comment_created', { post_id: 'p7' })
    expect(JSON.stringify(track.mock.calls)).not.toContain('texto privado')
  })

  it('a comment the server refused is not recorded', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'no' }) })) as unknown as typeof fetch
    const result = await createComment('p7', 'hola')
    expect(result).toHaveProperty('error')
    expect(track).not.toHaveBeenCalled()
  })
})
