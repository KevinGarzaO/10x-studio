import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../services/supabase.service', () => ({ supabase: { rpc, from: () => { throw new Error('no se usa') } } }))

import router from '../../src/routes/admin/analytics.routes'

const app = () => {
  const a = express()
  a.use('/analytics', router)
  return a
}

const data: Record<string, unknown[]> = {}

beforeEach(() => {
  rpc.mockReset()
  data.analytics_active_users = [
    { day: '2026-10-29', dau: 4, wau: 9, mau: 20 },
    { day: '2026-10-30', dau: 6, wau: 11, mau: 22 },
  ]
  data.analytics_funnel = [
    { step: 1, label: 'Entraron', people: 100, from_previous_pct: null, dropoff_pct: null, from_start_pct: 100 },
    { step: 2, label: 'Vieron una vacante', people: 40, from_previous_pct: 40, dropoff_pct: 60, from_start_pct: 40 },
  ]
  data.analytics_landing_performance = [
    { entry_path: '/vacantes/react', sessions: 80, active_users: 30, engagement_rate: 50, conversions: 8, conversion_rate: 10 },
    { entry_path: '/', sessions: 20, active_users: 10, engagement_rate: 60, conversions: 2, conversion_rate: 10 },
  ]
  data.analytics_channels = [{ source: 'linkedin', medium: 'social', campaign: 'vacante-auto', referrer_host: 'linkedin.com', sessions: 60, active_users: 25, conversions: 6, conversion_rate: 10 }]
  data.analytics_retention_cohorts = [
    { cohort_week: '2026-10-19', cohort_size: 10, week_offset: 0, retained: 10, retained_pct: 100 },
    { cohort_week: '2026-10-19', cohort_size: 10, week_offset: 1, retained: 3, retained_pct: 30 },
    { cohort_week: '2026-10-26', cohort_size: 5, week_offset: 0, retained: 5, retained_pct: 100 },
  ]
  rpc.mockImplementation(async (name: string) => ({ data: data[name] ?? [], error: null }))
})

describe('GET /analytics/web', () => {
  it('answers with the active users, the funnel, the entry pages, the channels and the cohorts', async () => {
    const res = await request(app()).get('/analytics/web?days=7').expect(200)

    expect(res.body.ready).toBe(true)
    expect(res.body.days).toBe(7)
    expect(res.body.summary).toMatchObject({ dau: 6, wau: 11, mau: 22, sessions: 100, conversions: 10, conversionRatePct: 10 })
    expect(res.body.funnel).toHaveLength(2)
    expect(res.body.landingPages[0].entry_path).toBe('/vacantes/react')
    expect(res.body.channels[0].source).toBe('linkedin')
    expect(rpc).toHaveBeenCalledWith('analytics_active_users', { p_days: 7 })
  })

  it('computes the engagement rate over all sessions, not an average of rates', async () => {
    const res = await request(app()).get('/analytics/web').expect(200)
    // 80 * 50 % = 40 y 20 * 60 % = 12 sesiones activas de 100.
    expect(res.body.summary.engagementRatePct).toBe(52)
  })

  it('builds the cohort matrix: one row per acquisition week with its weeks after', async () => {
    const res = await request(app()).get('/analytics/web').expect(200)

    expect(res.body.cohorts).toEqual([
      { week: '2026-10-19', size: 10, retained: [{ offset: 0, count: 10, pct: 100 }, { offset: 1, count: 3, pct: 30 }] },
      { week: '2026-10-26', size: 5, retained: [{ offset: 0, count: 5, pct: 100 }] },
    ])
  })

  it('falls back to 30 days for a period that is not offered', async () => {
    const res = await request(app()).get('/analytics/web?days=9999').expect(200)
    expect(res.body.days).toBe(30)
  })

  it('says it is not ready when the SQL functions do not exist yet, instead of showing zeros', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.analytics_active_users(p_days) in the schema cache' } })
    const res = await request(app()).get('/analytics/web').expect(200)
    expect(res.body).toEqual({ ready: false })
  })

  it('a real database error is a 500, not a silent empty answer', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to timeout' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await request(app()).get('/analytics/web').expect(500)
  })

  it('has no data yet: zeros are real zeros, with no division by zero', async () => {
    rpc.mockImplementation(async () => ({ data: [], error: null }))
    const res = await request(app()).get('/analytics/web').expect(200)
    expect(res.body.summary).toMatchObject({ dau: 0, sessions: 0, engagementRatePct: null, conversionRatePct: null })
  })
})
