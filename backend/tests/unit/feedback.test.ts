import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const db = vi.hoisted(() => ({
  user: { created_at: '2026-10-28T18:00:00Z', user_kind: 'user', is_test_account: false, is_scraper_profile: false, profile_completed: true, signup_source: 'linkedin' } as Record<string, unknown> | null,
  days: [] as string[],
  recent: 0,
  applied: 0,
  inserted: [] as { table: string; row: any }[],
  noActivityTable: false,
}))

vi.mock('@avotalent/core/services/supabase.service', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {}
      for (const name of ['select', 'eq', 'in', 'gte', 'limit', 'not', 'order', 'range']) q[name] = () => q
      q.maybeSingle = async () => ({ data: table === 'users' ? db.user : null, error: null })
      q.insert = async (row: any) => { db.inserted.push({ table, row }); return { error: null } }
      q.then = (resolve: any) => {
        if (table === 'user_activity_daily') return Promise.resolve(db.noActivityTable ? { data: null, error: { message: 'relation user_activity_daily does not exist' } } : { data: db.days.map(day => ({ day })), error: null }).then(resolve)
        if (table === 'feedback_entries') return Promise.resolve({ data: null, count: db.recent, error: null }).then(resolve)
        if (table === 'vacancy_applications') return Promise.resolve({ data: null, count: db.applied, error: null }).then(resolve)
        return Promise.resolve({ data: [], count: 0, error: null }).then(resolve)
      }
      return q
    },
  },
}))
vi.mock('@avotalent/core/http/middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => { req.userId = 'ana'; next() },
}))

import feedbackRoutes from '../../src/routes/community/feedback.routes'
import { activeDaysAfterSignup, cleanCategory, cleanPage, cleanText, deviceOf, isEligible, signupWeek, MAX_TEXT } from '@avotalent/core/services/feedback/feedback'
import { buildFeedbackSummary, type EntryRow } from '@avotalent/core/services/analytics/feedback-summary'

describe('who sees the button', () => {
  it('counts distinct days AFTER the signup day, in Monterrey time (the signup day itself never counts)', () => {
    // registro el 28 de oct a las 18:00 UTC = 12:00 en Monterrey
    expect(activeDaysAfterSignup(['2026-10-28', '2026-10-28', '2026-10-29'], '2026-10-28T18:00:00Z')).toBe(1)
    expect(activeDaysAfterSignup(['2026-10-29', '2026-10-30', '2026-10-30'], '2026-10-28T18:00:00Z')).toBe(2)
    expect(activeDaysAfterSignup([], '2026-10-28T18:00:00Z')).toBe(0)
    // registro el 29 a las 03:00 UTC = 21:00 del 28 en Monterrey: el 28 es el día de registro
    expect(activeDaysAfterSignup(['2026-10-28', '2026-10-29'], '2026-10-29T03:00:00Z')).toBe(1)
  })
  it('needs a real account (no team, tests or scraper profiles) and at least 2 days of use', () => {
    const real = { user_kind: 'user', is_test_account: false, is_scraper_profile: false }
    expect(isEligible(real, 2)).toBe(true)
    expect(isEligible(real, 1)).toBe(false)
    expect(isEligible({ ...real, user_kind: 'superadmin' }, 5)).toBe(false)
    expect(isEligible({ ...real, is_test_account: true }, 5)).toBe(false)
    expect(isEligible({ ...real, is_scraper_profile: true }, 5)).toBe(false)
    expect(isEligible(null, 5)).toBe(false)
  })
})

describe('what is stored is data, cleaned and bounded', () => {
  it('cleans the text, trims it and refuses what is too short', () => {
    expect(cleanText('  Me faltó filtrar por país\u0000  ')).toBe('Me faltó filtrar por país')
    expect(cleanText('ab')).toBeNull()
    expect(cleanText(42)).toBeNull()
    expect(cleanText('x'.repeat(5000))).toHaveLength(MAX_TEXT)
    expect(cleanText('línea 1\r\nlínea 2')).toBe('línea 1\nlínea 2')
  })
  it('keeps only known categories, the path of the page and the week of signup', () => {
    expect(cleanCategory('vacantes')).toBe('vacantes')
    expect(cleanCategory('hackeame')).toBeNull()
    expect(cleanPage('/vacantes/x?token=secreto#a')).toBe('/vacantes/x')
    expect(cleanPage('https://evil.example/x')).toBeNull()
    expect(signupWeek('2026-11-04T18:00:00Z')).toBe('2026-11-02') // miércoles -> el lunes de esa semana
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('movil')
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0)')).toBe('escritorio')
  })
})

describe('feedback routes', () => {
  const app = () => { const server = express(); server.use(express.json()); server.use('/feedback', feedbackRoutes); return server }
  beforeEach(() => {
    db.user = { created_at: '2026-10-28T18:00:00Z', user_kind: 'user', is_test_account: false, is_scraper_profile: false, profile_completed: true, signup_source: 'linkedin' }
    db.days = ['2026-10-30', '2026-11-02']
    db.recent = 0; db.applied = 0; db.inserted = []; db.noActivityTable = false
  })

  it('tells an eligible account yes, and one with a single day of use no', async () => {
    expect((await request(app()).get('/feedback/eligibility')).body).toMatchObject({ eligible: true, activeDays: 2, ready: true })
    db.days = ['2026-10-30']
    expect((await request(app()).get('/feedback/eligibility')).body).toMatchObject({ eligible: false, activeDays: 1 })
  })

  it('saves the comment with its context (no email, no name) and notes that it was answered', async () => {
    db.applied = 1
    const res = await request(app()).post('/feedback').set('User-Agent', 'Mozilla/5.0 (iPhone)').send({ text: 'Me faltó filtrar por país', category: 'vacantes', page: '/vacantes/x?utm=1' })
    expect(res.status).toBe(200)
    const entry = db.inserted.find(item => item.table === 'feedback_entries')!.row
    expect(entry).toMatchObject({ user_id: 'ana', channel: 'boton', question_version: 1, category: 'vacantes', text: 'Me faltó filtrar por país', page: '/vacantes/x' })
    expect(entry.context).toEqual({ signupWeek: '2026-10-26', activeDays: 2, profileComplete: true, applied: true, source: 'linkedin', device: 'movil' })
    expect(JSON.stringify(entry)).not.toMatch(/@|email/)
    expect(db.inserted.find(item => item.table === 'feedback_events')!.row).toEqual({ user_id: 'ana', channel: 'boton', kind: 'answered' })
  })

  it('refuses an account that is not eligible yet, a text that is too short, and too many in a day', async () => {
    db.days = ['2026-10-30']
    expect((await request(app()).post('/feedback').send({ text: 'Me faltó algo' })).status).toBe(403)
    db.days = ['2026-10-30', '2026-11-02']
    expect((await request(app()).post('/feedback').send({ text: 'a' })).status).toBe(400)
    db.recent = 5
    expect((await request(app()).post('/feedback').send({ text: 'Me faltó algo más' })).status).toBe(429)
    expect(db.inserted.filter(item => item.table === 'feedback_entries')).toHaveLength(0)
  })

  it('says not ready (instead of failing) when the activity table does not exist yet', async () => {
    db.noActivityTable = true
    expect((await request(app()).get('/feedback/eligibility')).body).toMatchObject({ eligible: false, ready: false })
    expect((await request(app()).post('/feedback').send({ text: 'Me faltó algo' })).status).toBe(503)
  })

  it('records only shown / dismissed from the browser (answering is recorded by saving)', async () => {
    await request(app()).post('/feedback/event').send({ kind: 'shown' }).expect(200)
    await request(app()).post('/feedback/event').send({ kind: 'answered' }).expect(400)
    expect(db.inserted.map(item => item.row.kind)).toEqual(['shown'])
  })
})

describe('buildFeedbackSummary', () => {
  const entry = (category: string | null, user: string, daysAgo: number): EntryRow => ({
    category, text: `texto ${category}`, page: '/', context: { device: 'movil' }, theme: null, channel: 'boton', question_version: 1, user_id: user,
    created_at: new Date(Date.parse('2026-11-06T12:00:00Z') - daysAgo * 86_400_000).toISOString(),
  })
  it('counts by category, the funnel and the response rate, and leaves the account ids out of what it shows', () => {
    const summary = buildFeedbackSummary(
      [entry('vacantes', 'a', 1), entry('vacantes', 'b', 2), entry(null, 'a', 10)],
      [{ user_id: 'a', kind: 'shown', channel: 'boton' }, { user_id: 'b', kind: 'shown', channel: 'boton' }, { user_id: 'c', kind: 'dismissed', channel: 'boton' }, { user_id: 'a', kind: 'answered', channel: 'boton' }],
      8,
      new Date('2026-11-06T12:00:00Z'),
    )
    expect(summary).toMatchObject({ total: 3, last7Days: 2 })
    expect(summary.byCategory).toEqual([{ category: 'vacantes', label: 'Vacantes', count: 2 }, { category: 'sin_categoria', label: 'Sin categoría', count: 1 }])
    expect(summary.funnel).toEqual({ eligible: 8, shown: 2, dismissed: 1, answered: 1, peopleAnswered: 2, responseRatePct: 25 })
    expect(JSON.stringify(summary)).not.toContain('user_id')
    expect(summary.entries[0].createdAt > summary.entries[1].createdAt).toBe(true) // lo más nuevo primero
  })
})
