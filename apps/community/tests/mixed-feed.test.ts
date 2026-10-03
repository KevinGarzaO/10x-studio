import { describe, it, expect } from 'vitest'
import { buildFeed, type MatchedItem } from '@/lib/mixed-feed'

const post = (id: string) => ({ id })
const match = (id: string, sourceType: 'community' | 'scraper' = 'scraper'): MatchedItem => ({
  sourceType, id, title: `t${id}`, company: null, companyLogo: null, roleCategory: null,
  seniorityLevel: null, skills: [], url: '', postDate: null, matchingSkills: 1, historyId: '', isSaved: false,
})

const kinds = (entries: { kind: string }[]) => entries.map(e => e.kind)

describe('buildFeed', () => {
  it('mixes the three kinds in a fixed rhythm with Para ti first', () => {
    const entries = buildFeed({
      articles: ['a1', 'a2', 'a3'].map(post),
      jobs: ['j1', 'j2'].map(post),
      forYou: [match('m1')],
      moreArticles: false,
      moreJobs: false,
    })

    expect(kinds(entries)).toEqual(['forYou', 'article', 'job', 'article', 'job', 'article'])
  })

  it('shows only articles and vacancies to a visitor', () => {
    const entries = buildFeed({
      articles: ['a1', 'a2'].map(post), jobs: ['j1'].map(post), forYou: [], moreArticles: false, moreJobs: false,
    })

    expect(kinds(entries)).toEqual(['article', 'job', 'article'])
  })

  it('does not repeat a vacancy that already appears as Para ti', () => {
    const entries = buildFeed({
      articles: [],
      jobs: ['j1', 'j2'].map(post),
      forYou: [match('j1', 'community')],
      moreArticles: false,
      moreJobs: false,
    })

    const ids = entries.map(e => (e.kind === 'forYou' ? e.item.id : e.post.id))
    expect(ids.filter(id => id === 'j1')).toHaveLength(1)
    expect(entries.find(e => e.kind === 'job' && e.post.id === 'j1')).toBeUndefined()
  })

  it('keeps keys unique even when ids repeat across kinds', () => {
    const entries = buildFeed({
      articles: [post('1')], jobs: [post('1')], forYou: [match('1')], moreArticles: false, moreJobs: false,
    })

    expect(new Set(entries.map(e => e.key)).size).toBe(entries.length)
  })

  it('skips a source that is truly exhausted and keeps going with the others', () => {
    const entries = buildFeed({
      articles: ['a1', 'a2', 'a3'].map(post), jobs: [], forYou: [], moreArticles: false, moreJobs: false,
    })

    expect(kinds(entries)).toEqual(['article', 'article', 'article'])
  })

  it('waits instead of skipping when a source still has pages to load', () => {
    const entries = buildFeed({
      articles: ['a1', 'a2', 'a3'].map(post), jobs: [], forYou: [], moreArticles: false, moreJobs: true,
    })

    // El primer hueco de vacante, con más por traer, detiene el feed ahí.
    expect(kinds(entries)).toEqual(['article'])
  })

  it('does not move earlier cards when more content arrives', () => {
    const before = buildFeed({
      articles: ['a1', 'a2', 'a3'].map(post), jobs: ['j1', 'j2'].map(post), forYou: [match('m1')],
      moreArticles: true, moreJobs: true,
    })
    const after = buildFeed({
      articles: ['a1', 'a2', 'a3', 'a4', 'a5'].map(post), jobs: ['j1', 'j2', 'j3'].map(post), forYou: [match('m1')],
      moreArticles: true, moreJobs: true,
    })

    expect(after.slice(0, before.length).map(e => e.key)).toEqual(before.map(e => e.key))
  })

  it('returns nothing when there is nothing', () => {
    expect(buildFeed({ articles: [], jobs: [], forYou: [], moreArticles: false, moreJobs: false })).toEqual([])
  })
})
