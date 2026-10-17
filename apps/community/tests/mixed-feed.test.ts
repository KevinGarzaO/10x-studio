import { describe, it, expect } from 'vitest'
import { buildFeed, type MatchedItem } from '@/lib/mixed-feed'

const post = (id: string, created_at: string) => ({ id, created_at })
const match = (id: string, postDate: string, sourceType: 'community' | 'scraper' = 'scraper'): MatchedItem => ({
  sourceType, id, title: `t${id}`, company: null, companyLogo: null, roleCategory: null,
  seniorityLevel: null, skills: [], url: '', postDate, matchingSkills: 1, historyId: '', isSaved: false,
})

const ids = (entries: ReturnType<typeof buildFeed>) =>
  entries.map(e => (e.kind === 'forYou' ? e.item.id : e.post.id))

const none = { moreArticles: false, moreJobs: false }

describe('buildFeed (newest first)', () => {
  it('orders articles, vacancies and Para ti together from newest to oldest', () => {
    const entries = buildFeed({
      articles: [post('a1', '2026-10-02T10:00:00Z'), post('a2', '2026-09-20T10:00:00Z')],
      jobs: [post('j1', '2026-10-03T10:00:00Z'), post('j2', '2026-09-25T10:00:00Z')],
      forYou: [match('m1', '2026-10-01T10:00:00Z')],
      ...none,
    })

    expect(ids(entries)).toEqual(['m1', 'j1', 'a1', 'j2', 'a2'])
  })

  it('never puts an older card above a newer one', () => {
    const entries = buildFeed({
      articles: [post('a1', '2026-09-05T00:00:00Z')],
      jobs: ['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30'].map((d, i) => post(`j${i}`, `${d}T10:00:00Z`)),
      forYou: [],
      ...none,
    })

    const dates = entries.map(e => new Date(e.kind === 'forYou' ? e.item.postDate! : e.post.created_at!).getTime())
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  it('keeps the arrival order of vacancies created at the same moment', () => {
    const same = '2026-10-03T10:00:00Z'
    const entries = buildFeed({ articles: [], jobs: [post('j1', same), post('j2', same), post('j3', same)], forYou: [], ...none })

    expect(ids(entries)).toEqual(['j1', 'j2', 'j3'])
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

  it('puts a card with no valid date last', () => {
    const entries = buildFeed({
      articles: [{ id: 'a1', created_at: null }, post('a2', '2026-09-01T00:00:00Z')],
      jobs: [], forYou: [], ...none,
    })

    expect(ids(entries)).toEqual(['a2', 'a1'])
  })

  it('returns nothing when there is nothing', () => {
    expect(buildFeed({ articles: [], jobs: [], forYou: [], ...none })).toEqual([])
  })
})

describe('buildFeed with pages still pending', () => {
  it('holds back what could still be outranked by an unloaded page', () => {
    // Las vacantes llegan hasta el 2 de octubre y tienen más páginas: una vacante
    // del 1 de octubre aún podría estar sin cargar, así que el artículo del
    // 30 de septiembre todavía no puede mostrarse.
    const entries = buildFeed({
      articles: [post('a1', '2026-09-30T10:00:00Z')],
      jobs: [post('j1', '2026-10-03T10:00:00Z'), post('j2', '2026-10-02T10:00:00Z')],
      forYou: [],
      moreArticles: false,
      moreJobs: true,
    })

    expect(ids(entries)).toEqual(['j1', 'j2'])
  })

  it('shows the held-back card once the next page proves nothing newer is missing', () => {
    const entries = buildFeed({
      articles: [post('a1', '2026-09-30T10:00:00Z')],
      jobs: [post('j1', '2026-10-03T10:00:00Z'), post('j2', '2026-10-02T10:00:00Z'), post('j3', '2026-09-29T10:00:00Z')],
      forYou: [],
      moreArticles: false,
      moreJobs: true,
    })

    expect(ids(entries)).toEqual(['j1', 'j2', 'a1', 'j3'])
  })

  it('never moves cards that were already shown when more content arrives', () => {
    const page1 = buildFeed({
      articles: [post('a1', '2026-10-02T10:00:00Z'), post('a2', '2026-09-20T10:00:00Z')],
      jobs: [post('j1', '2026-10-03T10:00:00Z'), post('j2', '2026-10-01T10:00:00Z')],
      forYou: [match('m1', '2026-10-02T12:00:00Z')],
      moreArticles: true,
      moreJobs: true,
    })
    const page2 = buildFeed({
      articles: [post('a1', '2026-10-02T10:00:00Z'), post('a2', '2026-09-20T10:00:00Z'), post('a3', '2026-09-10T10:00:00Z')],
      jobs: [post('j1', '2026-10-03T10:00:00Z'), post('j2', '2026-10-01T10:00:00Z'), post('j3', '2026-09-28T10:00:00Z'), post('j4', '2026-09-15T10:00:00Z')],
      forYou: [match('m1', '2026-10-02T12:00:00Z')],
      moreArticles: true,
      moreJobs: true,
    })

    expect(page1.length).toBeGreaterThan(0)
    expect(page2.slice(0, page1.length).map(e => e.key)).toEqual(page1.map(e => e.key))
  })

  it('shows nothing yet while a source that has pages pending has loaded nothing', () => {
    const entries = buildFeed({
      articles: [post('a1', '2026-09-30T10:00:00Z')], jobs: [], forYou: [], moreArticles: false, moreJobs: true,
    })

    expect(entries).toEqual([])
  })

  it('shows everything once every source is exhausted', () => {
    const entries = buildFeed({
      articles: [post('a1', '2026-08-01T00:00:00Z')], jobs: [post('j1', '2026-10-03T00:00:00Z')], forYou: [], ...none,
    })

    expect(ids(entries)).toEqual(['j1', 'a1'])
  })
})

describe('buildFeed: Para ti goes first, best match first', () => {
  it('puts Para ti on top ordered by match percentage, then the rest by date', () => {
    const entries = buildFeed({
      articles: [post('a1', '2026-10-03T10:00:00Z')],
      jobs: [post('j1', '2026-10-02T10:00:00Z')],
      forYou: [
        { ...match('low', '2026-10-03T00:00:00Z'), matchScore: 52 },
        { ...match('high', '2026-09-01T00:00:00Z'), matchScore: 91 },
        { ...match('mid-new', '2026-10-01T00:00:00Z'), matchScore: 70 },
        { ...match('mid-old', '2026-09-20T00:00:00Z'), matchScore: 70 },
      ],
      ...none,
    })
    expect(ids(entries)).toEqual(['high', 'mid-new', 'mid-old', 'low', 'a1', 'j1'])
  })
})
