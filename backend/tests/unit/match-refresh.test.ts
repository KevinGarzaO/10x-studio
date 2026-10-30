import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, { data?: any; error?: { message: string } | null }>,
  calls: [] as string[],
}))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => {
      const c: any = {}
      for (const m of ['select', 'eq', 'not', 'order', 'limit', 'range', 'lt', 'delete', 'upsert', 'insert']) {
        c[m] = (...args: unknown[]) => { db.calls.push(`${table}.${m}`); return c }
      }
      const result = () => ({ data: null, error: null, ...(db.tables[table] ?? {}) })
      c.maybeSingle = () => Promise.resolve(result())
      c.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject)
      return c
    },
  },
}))

import { readStoredMatches, storeMatches, refreshAllMatches } from '../../services/matching/refresh'
import { scoreAgainstPool, type PoolItem } from '../../services/matching/compute'

const vacancy = (id: string, patch: Partial<PoolItem> = {}): PoolItem => ({
  sourceType: 'community', id, title: `Vacante ${id}`, company: 'Acme', companyLogo: null, roleCategory: 'backend',
  seniorityLevel: 'senior', skills: ['python'], url: `/vacantes/${id}`, postDate: '2026-10-01', modalidad: 'Remoto', ...patch,
})
const person = { id: 'u1', role_category: 'backend', seniority: 'senior', skills: ['python', 'docker'], work_modality: 'Remoto' }

beforeEach(() => { db.tables = {}; db.calls = [] })

describe('readStoredMatches', () => {
  it('returns null when nothing was calculated for the person yet (so the route calculates once)', async () => {
    db.tables.vacancy_match_state = { data: null }
    expect(await readStoredMatches('u1')).toBeNull()
  })

  it('returns null when the migration is not applied', async () => {
    db.tables.vacancy_match_state = { data: null, error: { message: 'relation does not exist' } }
    expect(await readStoredMatches('u1')).toBeNull()
  })

  it('returns what was stored, in order, without touching the vacancies', async () => {
    const item = scoreAgainstPool(person, {}, [vacancy('a')])[0]
    db.tables.vacancy_match_state = { data: { computed_at: 'x' } }
    db.tables.vacancy_matches = { data: [{ item }] }
    expect(await readStoredMatches('u1')).toEqual([item])
    expect(db.calls.some((c) => c.startsWith('scraper_posts') || c.startsWith('community_posts'))).toBe(false)
  })

  it('an empty stored list is a real answer: "calculated, nothing fits"', async () => {
    db.tables.vacancy_match_state = { data: { computed_at: 'x' } }
    db.tables.vacancy_matches = { data: [] }
    expect(await readStoredMatches('u1')).toEqual([])
  })
})

describe('storeMatches', () => {
  it('never throws, even if the tables are missing', async () => {
    db.tables.vacancy_matches = { error: { message: 'relation does not exist' } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(storeMatches('u1', scoreAgainstPool(person, {}, [vacancy('a')]))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('keeps at most 50 per person and marks the person as calculated', async () => {
    const items = scoreAgainstPool(person, {}, Array.from({ length: 80 }, (_, i) => vacancy(`v${i}`)))
    await storeMatches('u1', items)
    expect(db.calls).toContain('vacancy_matches.upsert')
    expect(db.calls).toContain('vacancy_match_state.upsert')
  })
})

describe('scoreAgainstPool', () => {
  it('only keeps vacancies that fit, best first', () => {
    const result = scoreAgainstPool(person, {}, [vacancy('far', { roleCategory: 'ventas', skills: ['excel'] }), vacancy('good')])
    expect(result.map((r) => r.id)).toEqual(['good'])
  })

  it('returns nothing for a profile without a role', () => {
    expect(scoreAgainstPool({ ...person, role_category: null }, {}, [vacancy('a')])).toEqual([])
  })
})

describe('refreshAllMatches', () => {
  it('reads the vacancies ONCE for everybody', async () => {
    db.tables.users = { data: [person, { ...person, id: 'u2' }, { ...person, id: 'u3' }] }
    db.tables.scraper_posts = { data: [] }
    db.tables.community_posts = { data: [] }
    const result = await refreshAllMatches()
    expect(result.people).toBe(3)
    expect(db.calls.filter((c) => c === 'community_posts.select')).toHaveLength(1)
    expect(db.calls.filter((c) => c === 'vacancy_match_state.upsert')).toHaveLength(3)
  })
})
