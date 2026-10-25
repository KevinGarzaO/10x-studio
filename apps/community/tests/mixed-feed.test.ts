import { describe, it, expect } from 'vitest'
import { buildFeed, ARTICLE_EVERY, type MatchedItem } from '@/lib/mixed-feed'

const post = (id: string, created_at: string) => ({ id, created_at })
const match = (id: string, postDate: string, sourceType: 'community' | 'scraper' = 'scraper'): MatchedItem => ({
  sourceType, id, title: `t${id}`, company: null, companyLogo: null, roleCategory: null,
  seniorityLevel: null, skills: [], url: '', postDate, matchingSkills: 1, historyId: '', isSaved: false,
})

const ids = (entries: ReturnType<typeof buildFeed>) =>
  entries.map(e => (e.kind === 'forYou' ? e.item.id : e.post.id))

const none = { moreArticles: false, moreJobs: false }
const jobs = (n: number) => Array.from({ length: n }, (_, i) => post(`j${i + 1}`, `2026-10-${String(20 - i).padStart(2, '0')}T10:00:00Z`))

describe('buildFeed: vacancies keep the order the server gave (popularity)', () => {
  it('does not re-sort the vacancies by date', () => {
    // El servidor las manda por popularidad: la más vieja va primero porque es la más popular.
    const entries = buildFeed({
      articles: [],
      jobs: [post('popular-vieja', '2026-09-01T10:00:00Z'), post('nueva-sin-nadie', '2026-10-20T10:00:00Z')],
      forYou: [],
      ...none,
    })

    expect(ids(entries)).toEqual(['popular-vieja', 'nueva-sin-nadie'])
  })

  it('keeps the arrival order of vacancies created at the same moment', () => {
    const same = '2026-10-03T10:00:00Z'
    const entries = buildFeed({ articles: [], jobs: [post('j1', same), post('j2', same), post('j3', same)], forYou: [], ...none })
    expect(ids(entries)).toEqual(['j1', 'j2', 'j3'])
  })

  it('returns nothing when there is nothing', () => {
    expect(buildFeed({ articles: [], jobs: [], forYou: [], ...none })).toEqual([])
  })
})

describe('buildFeed: articles go between the vacancies', () => {
  it('puts one article after every few vacancies, the newest article first', () => {
    const entries = buildFeed({
      articles: [post('a-viejo', '2026-09-01T00:00:00Z'), post('a-nuevo', '2026-10-01T00:00:00Z')],
      jobs: jobs(ARTICLE_EVERY * 2),
      forYou: [],
      ...none,
    })

    expect(ids(entries)).toEqual(['j1', 'j2', 'j3', 'j4', 'a-nuevo', 'j5', 'j6', 'j7', 'j8', 'a-viejo'])
  })

  it('leaves the leftover articles at the end once no more vacancies are coming', () => {
    const entries = buildFeed({ articles: [post('a1', '2026-10-02T00:00:00Z'), post('a2', '2026-10-01T00:00:00Z')], jobs: jobs(2), forYou: [], ...none })
    expect(ids(entries)).toEqual(['j1', 'j2', 'a1', 'a2'])
  })

  it('holds the leftover articles back while more vacancies are pending, so nothing moves later', () => {
    const entries = buildFeed({ articles: [post('a1', '2026-10-02T00:00:00Z')], jobs: jobs(2), forYou: [], moreArticles: false, moreJobs: true })
    expect(ids(entries)).toEqual(['j1', 'j2'])
  })

  it('shows only the articles when there are no vacancies at all', () => {
    const entries = buildFeed({ articles: [post('a1', '2026-10-02T00:00:00Z')], jobs: [], forYou: [], ...none })
    expect(ids(entries)).toEqual(['a1'])
  })
})

describe('buildFeed: more content only adds cards at the end', () => {
  it('never moves the cards that were already shown when the next page arrives', () => {
    const articles1 = [post('a1', '2026-10-02T00:00:00Z'), post('a2', '2026-10-01T00:00:00Z')]
    const page1 = buildFeed({ articles: articles1, jobs: jobs(8), forYou: [match('m1', '2026-10-02T12:00:00Z')], moreArticles: true, moreJobs: true })
    const page2 = buildFeed({
      articles: [...articles1, post('a3', '2026-09-20T00:00:00Z')],
      jobs: jobs(16),
      forYou: [match('m1', '2026-10-02T12:00:00Z')],
      moreArticles: true,
      moreJobs: true,
    })

    expect(page1.length).toBeGreaterThan(0)
    expect(page2.slice(0, page1.length).map(e => e.key)).toEqual(page1.map(e => e.key))
  })

  it('does not show vacancies past the slot of an article that has not been loaded yet', () => {
    const entries = buildFeed({ articles: [post('a1', '2026-10-02T00:00:00Z')], jobs: jobs(20), forYou: [], moreArticles: true, moreJobs: true })

    // 1 artículo cargado: se muestran las vacantes hasta el hueco del siguiente artículo (aún no cargado).
    expect(entries.filter(e => e.kind === 'job')).toHaveLength((1 + 1) * ARTICLE_EVERY)
  })
})

describe('buildFeed: Para ti', () => {
  it('goes first, ordered by match percentage, then by date', () => {
    const entries = buildFeed({
      articles: [],
      jobs: [post('j1', '2026-10-02T10:00:00Z')],
      forYou: [
        { ...match('low', '2026-10-03T00:00:00Z'), matchScore: 52 },
        { ...match('high', '2026-09-01T00:00:00Z'), matchScore: 91 },
        { ...match('mid-new', '2026-10-01T00:00:00Z'), matchScore: 70 },
        { ...match('mid-old', '2026-09-20T00:00:00Z'), matchScore: 70 },
      ],
      ...none,
    })
    expect(ids(entries)).toEqual(['high', 'mid-new', 'mid-old', 'low', 'j1'])
  })

  it('does not repeat a vacancy that already appears as Para ti', () => {
    const entries = buildFeed({
      articles: [],
      jobs: [post('j1', '2026-10-03T10:00:00Z'), post('j2', '2026-10-02T10:00:00Z')],
      forYou: [match('j1', '2026-10-03T10:00:00Z', 'community')],
      ...none,
    })

    expect(entries.filter(e => (e.kind === 'forYou' ? e.item.id : e.post.id) === 'j1')).toHaveLength(1)
    expect(entries.find(e => e.kind === 'job' && e.post.id === 'j1')).toBeUndefined()
  })

  it('keeps keys unique even when ids repeat across kinds', () => {
    const entries = buildFeed({
      articles: [post('1', '2026-10-01T00:00:00Z')], jobs: [post('1', '2026-10-02T00:00:00Z')],
      forYou: [match('1', '2026-10-03T00:00:00Z')], ...none,
    })

    expect(new Set(entries.map(e => e.key)).size).toBe(entries.length)
  })
})
