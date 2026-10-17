import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const inserted = vi.hoisted(() => [] as Record<string, unknown>[])
const state = vi.hoisted(() => ({ recent: false }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const q: any = {}
        for (const name of ['eq', 'gte', 'limit']) q[name] = () => q
        q.then = (resolve: any) => Promise.resolve({ data: state.recent ? [{ id: 'x' }] : [] }).then(resolve)
        return q
      },
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

import { sanitizeAttribution, sanitizeVisitorId } from '../../services/attribution'
import attributionRouter from '../../src/routes/community/attribution.routes'

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/attribution', attributionRouter)
  return a
}

describe('sanitizeAttribution', () => {
  it('keeps the UTM values, lowercasing the source and medium', () => {
    expect(
      sanitizeAttribution({ source: 'LinkedIn', medium: 'Social', campaign: 'vacante-auto', content: 'mi-vacante', landingPath: '/vacantes/mi-vacante?utm_source=x' }),
    ).toEqual({
      source: 'linkedin', medium: 'social', campaign: 'vacante-auto', content: 'mi-vacante', referrer: null, landingPath: '/vacantes/mi-vacante',
    })
  })

  it('keeps only the host of a referrer, never its query', () => {
    expect(sanitizeAttribution({ referrer: 'https://www.google.com/search?q=mi+nombre&token=abc' })?.referrer).toBe('www.google.com')
  })

  it('is null when nothing useful arrived (a direct visit)', () => {
    expect(sanitizeAttribution({})).toBeNull()
    expect(sanitizeAttribution(null)).toBeNull()
    expect(sanitizeAttribution('linkedin')).toBeNull()
    expect(sanitizeAttribution({ source: '   ', medium: 5 })).toBeNull()
  })

  it('cuts long values and strips control characters', () => {
    const result = sanitizeAttribution({ source: 'x'.repeat(500), campaign: 'a\u0000b\nc' })
    expect(result?.source).toHaveLength(60)
    expect(result?.campaign).toBe('abc')
  })
})

describe('sanitizeVisitorId', () => {
  it('accepts a short random id and nothing else', () => {
    expect(sanitizeVisitorId('abcd1234-EFGH')).toBe('abcd1234-EFGH')
    expect(sanitizeVisitorId('short')).toBeNull()
    expect(sanitizeVisitorId('has spaces in it!')).toBeNull()
    expect(sanitizeVisitorId('x'.repeat(100))).toBeNull()
    expect(sanitizeVisitorId(42)).toBeNull()
  })
})

describe('POST /attribution/visit', () => {
  beforeEach(() => {
    inserted.length = 0
    state.recent = false
  })

  it('stores the visit and always answers 204', async () => {
    const res = await request(app()).post('/attribution/visit').send({ visitorId: 'visitor-0001', source: 'linkedin', medium: 'social', landingPath: '/vacantes/x' })

    expect(res.status).toBe(204)
    expect(inserted).toEqual([
      expect.objectContaining({ visitor_id: 'visitor-0001', source: 'linkedin', medium: 'social', landing_path: '/vacantes/x' }),
    ])
  })

  it('stores a direct visit too, with no source', async () => {
    await request(app()).post('/attribution/visit').send({ visitorId: 'visitor-0002' })
    expect(inserted).toEqual([expect.objectContaining({ visitor_id: 'visitor-0002', source: null })])
  })

  it('ignores a visit with no valid visitor id', async () => {
    const res = await request(app()).post('/attribution/visit').send({ visitorId: 'no valido', source: 'linkedin' })
    expect(res.status).toBe(204)
    expect(inserted).toEqual([])
  })

  it('does not count the same visitor twice in the same session', async () => {
    state.recent = true
    const res = await request(app()).post('/attribution/visit').send({ visitorId: 'visitor-0003', source: 'linkedin' })
    expect(res.status).toBe(204)
    expect(inserted).toEqual([])
  })
})
