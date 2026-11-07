import { describe, it, expect } from 'vitest'
import { wantsCommunityNews } from '../../services/email/community-news'

describe('wantsCommunityNews', () => {
  it('is on by default, also for people who never touched their preferences', () => {
    expect(wantsCommunityNews({})).toBe(true)
    expect(wantsCommunityNews({ email_prefs: null, email_opt_out: false })).toBe(true)
    expect(wantsCommunityNews({ email_prefs: { digest: false } as never })).toBe(true)
  })

  it('stops when the person turns the box off', () => {
    expect(wantsCommunityNews({ email_prefs: { community: false } })).toBe(false)
  })

  it('stops for anyone who asked for no more emails at all', () => {
    expect(wantsCommunityNews({ email_opt_out: true, email_prefs: { community: true } })).toBe(false)
  })
})
