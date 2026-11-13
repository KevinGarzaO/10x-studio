import { describe, it, expect, vi } from 'vitest'

vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: {} }))

import { buildCommunityParticipation } from '@avotalent/core/services/analytics/community-participation'

// Lunes 9 de noviembre de 2026, mediodía en Monterrey (= 18:00 UTC): la semana en curso empieza ese lunes.
const NOW = new Date('2026-11-09T18:00:00Z')
const ids = (n: number) => `u${n}`
const real = new Set(Array.from({ length: 12 }, (_, i) => ids(i + 1)))
const activeIn = (user: string, ...days: string[]) => days.map((day) => ({ user_id: user, day }))

describe('buildCommunityParticipation', () => {
  // Semana del 26 oct al 1 nov (W1): u1..u5 activos; u1 y u2 participaron. Semana del 2 al 8 nov (W2): vuelven u1, u3.
  const activity = [
    ...activeIn('u1', '2026-10-27', '2026-11-03'),
    ...activeIn('u2', '2026-10-28'),
    ...activeIn('u3', '2026-10-29', '2026-11-04'),
    ...activeIn('u4', '2026-10-30'),
    ...activeIn('u5', '2026-10-31'),
    ...activeIn('u99', '2026-10-27'), // no es una cuenta real: no cuenta
  ]
  const posts = [{ id: 'p1', author_id: 'u1', created_at: '2026-10-27T18:00:00Z' }, { id: 'p2', author_id: 'u1', created_at: '2026-10-28T18:00:00Z' }]
  const comments = [{ author_id: 'u2', post_id: 'p1', created_at: '2026-10-27T20:00:00Z' }, { author_id: 'u1', post_id: 'p2', created_at: '2026-10-28T19:00:00Z' }]
  const votes = [{ user_id: 'u2', created_at: '2026-10-29T18:00:00Z' }, { user_id: 'u77', created_at: '2026-10-29T18:00:00Z' }]
  const rows = buildCommunityParticipation({ posts, comments, votes, activity, realIds: real }, 3, NOW)
  const week = (start: string) => rows.find((row) => row.weekStart === start)!

  it('orders the weeks oldest first, Monday to Sunday, and marks the current one partial', () => {
    expect(rows.map((row) => row.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    expect(week('2026-11-09').partial).toBe(true)
    expect(week('2026-10-26').partial).toBe(false)
  })

  it('counts the people who create a discussion, a comment or a vote over the active real accounts, ignoring accounts that are not real', () => {
    expect(week('2026-10-26')).toMatchObject({ activeAccounts: 5, participants: 2, participantsPct: 40, discussions: 2, comments: 2, votes: 1 })
  })

  it('counts discussions nobody else answered in their first 24 hours', () => {
    // p1 la contestó u2 a las 2 horas; p2 solo la contestó su propio autor.
    expect(week('2026-10-26')).toMatchObject({ discussionsOldEnough: 2, unansweredAfter24h: 1 })
  })

  it('compares who came back the next week: those who took part against those who did not', () => {
    expect(week('2026-10-26').nextWeek).toEqual({
      participants: { active: 2, returned: 1, returnedPct: null }, // u1 vuelve, u2 no; menos de 3 personas: sin porcentaje
      others: { active: 3, returned: 1, returnedPct: 33.3 }, // u3 vuelve; u4 y u5 no
    })
  })

  it('does not judge the return of a week whose next week has not finished', () => {
    expect(week('2026-11-02').nextWeek).toBeNull()
    expect(week('2026-11-09').nextWeek).toBeNull()
  })

  it('a discussion younger than 24 hours is not counted as unanswered yet', () => {
    const fresh = buildCommunityParticipation({ posts: [{ id: 'p9', author_id: 'u1', created_at: '2026-11-09T10:00:00Z' }], comments: [], votes: [], activity: [], realIds: real }, 1, NOW)
    expect(fresh[0]).toMatchObject({ discussions: 1, discussionsOldEnough: 0, unansweredAfter24h: 0 })
  })

  it('returns zeros, not errors, when nobody has taken part', () => {
    const empty = buildCommunityParticipation({ posts: [], comments: [], votes: [], activity: [], realIds: real }, 2, NOW)
    expect(empty).toHaveLength(2)
    expect(empty[0]).toMatchObject({ activeAccounts: 0, participants: 0, participantsPct: null, unansweredAfter24h: 0 })
  })

  it('keeps what the team publishes apart: it never inflates the community participation', () => {
    const teamIds = new Set(['t1'])
    const withTeam = buildCommunityParticipation({
      posts: [{ id: 'pt', author_id: 't1', created_at: '2026-10-27T18:00:00Z' }, ...posts],
      comments: [{ author_id: 't1', post_id: 'pt', created_at: '2026-10-27T19:00:00Z' }, ...comments],
      votes: [{ user_id: 't1', created_at: '2026-10-29T18:00:00Z' }, ...votes],
      activity: [...activity, ...activeIn('t1', '2026-10-27')],
      realIds: real,
      teamIds,
    }, 3, NOW)
    const w1 = withTeam.find((row) => row.weekStart === '2026-10-26')!
    // Igual que sin el equipo: 2 personas, 2 discusiones, 2 comentarios, 1 voto, 5 cuentas activas.
    expect(w1).toMatchObject({ activeAccounts: 5, participants: 2, discussions: 2, comments: 2, votes: 1 })
    expect(w1.team).toEqual({ discussions: 1, comments: 1, votes: 1 })
  })
})
