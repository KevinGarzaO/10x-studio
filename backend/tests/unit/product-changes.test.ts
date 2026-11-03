import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const rpc = vi.hoisted(() => vi.fn())
const db = vi.hoisted(() => ({
  existing: null as null | { id: string; source: string },
  inserted: [] as any[],
  upserted: [] as any[],
  updated: [] as any[],
  error: null as null | string,
}))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    rpc,
    from: () => ({
      insert: async (row: any) => { db.inserted.push(row); return { error: db.error ? { message: db.error } : null } },
      upsert: async (row: any, options: any) => { db.upserted.push({ row, options }); return { error: db.error ? { message: db.error } : null } },
      update: (patch: any) => ({ eq: async () => { db.updated.push(patch); return { error: null } } }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.existing, error: db.error ? { message: db.error } : null }) }) }),
    }),
  },
}))

import { confidenceOf, describeImpact, parseCommitSubject, parseExpectedMetric, perDay, recordChange, recordDeployFromEnv, shift, slugArea, type ImpactRow } from '../../services/analytics/changes'
import router from '../../src/routes/admin/analytics.routes'

beforeEach(() => {
  rpc.mockReset()
  db.existing = null
  db.inserted = []
  db.upserted = []
  db.updated = []
  db.error = null
})

describe('parseCommitSubject', () => {
  it('keeps feat, fix and perf, with their area', () => {
    expect(parseCommitSubject('fix(feed): Discusiones y Vacantes arman su lista solo con lo que se ve')).toEqual({ kind: 'fix', area: 'feed', title: 'Discusiones y Vacantes arman su lista solo con lo que se ve' })
    expect(parseCommitSubject('feat(panel)!: nueva pantalla')).toMatchObject({ kind: 'feature', area: 'panel' })
    expect(parseCommitSubject('perf(feed): más rápido')).toMatchObject({ kind: 'feature' })
  })
  it('ignores what does not move the numbers', () => {
    for (const subject of ['docs(backlog): algo', 'chore(community): quitar', 'test: algo', 'refactor(x): y', 'Merge branch main', 'sin formato', 'fix(feed): ab']) {
      expect(parseCommitSubject(subject)).toBeNull()
    }
  })
  it('turns the scope into a safe area', () => {
    expect(slugArea('Auth/Sesión')).toBe('auth_sesion')
    expect(slugArea(undefined)).toBe('general')
    expect(slugArea('1')).toBe('general')
  })
})

describe('recordChange', () => {
  it('saves a manual change', async () => {
    const result = await recordChange({ title: 'Se prendió la bienvenida', kind: 'config', area: 'email', expectedMetric: 'perfiles completos' })
    expect(result.saved).toBe(true)
    expect(db.inserted[0]).toMatchObject({ title: 'Se prendió la bienvenida', kind: 'config', area: 'email', expected_metric: 'perfiles completos', source: 'manual' })
  })
  it('does not duplicate a commit that is already there', async () => {
    await recordChange({ title: 'Un arreglo', commitSha: 'abc', source: 'git' })
    expect(db.upserted[0].options).toEqual({ onConflict: 'commit_sha', ignoreDuplicates: true })
  })
  it('refuses a bad title or kind, and says when the migration is missing', async () => {
    expect((await recordChange({ title: 'a' })).saved).toBe(false)
    expect((await recordChange({ title: 'Título bueno', kind: 'otra' as any })).saved).toBe(false)
    db.error = 'relation "product_changes" does not exist'
    expect((await recordChange({ title: 'Título bueno' })).reason).toContain('product-changes-migration.sql')
  })
})

describe('recordDeployFromEnv', () => {
  const env = { RAILWAY_GIT_COMMIT_SHA: 'sha1', RAILWAY_GIT_COMMIT_MESSAGE: 'fix(feed): algo que importa\n\ncuerpo' } as NodeJS.ProcessEnv
  const now = new Date('2026-11-01T15:00:00Z')

  it('does nothing outside Railway or for a commit that is not a change', async () => {
    expect((await recordDeployFromEnv({} as NodeJS.ProcessEnv)).saved).toBe(false)
    expect((await recordDeployFromEnv({ RAILWAY_GIT_COMMIT_SHA: 'x', RAILWAY_GIT_COMMIT_MESSAGE: 'docs: algo' } as NodeJS.ProcessEnv)).saved).toBe(false)
    expect(db.upserted).toHaveLength(0)
  })
  it('records the deployed commit with the real deploy time', async () => {
    expect((await recordDeployFromEnv(env, now)).saved).toBe(true)
    expect(db.upserted[0].row).toMatchObject({ commit_sha: 'sha1', source: 'deploy', shipped_at: now.toISOString(), area: 'feed' })
  })
  it('corrects the hour of a commit that was brought from git, and leaves a recorded deploy alone', async () => {
    db.existing = { id: 'row1', source: 'git' }
    expect((await recordDeployFromEnv(env, now)).saved).toBe(true)
    expect(db.updated[0]).toEqual({ shipped_at: now.toISOString(), source: 'deploy' })
    db.existing = { id: 'row1', source: 'deploy' }
    expect((await recordDeployFromEnv(env, now)).saved).toBe(false)
  })
  it('keeps the expected metric written in the commit body (Expects:)', async () => {
    const withMetric = { ...env, RAILWAY_GIT_COMMIT_MESSAGE: 'feat(apply): embudo por dispositivo\n\ncuerpo\nExpects: clic en Postularse en móvil sube' } as NodeJS.ProcessEnv
    await recordDeployFromEnv(withMetric, now)
    expect(db.upserted.at(-1)!.row.expected_metric).toBe('clic en Postularse en móvil sube')
    db.existing = { id: 'row1', source: 'git' }
    await recordDeployFromEnv(withMetric, now)
    expect(db.updated.at(-1)).toMatchObject({ source: 'deploy', expected_metric: 'clic en Postularse en móvil sube' })
  })
  it('never throws', async () => {
    db.error = 'boom'
    await expect(recordDeployFromEnv(env, now)).resolves.toMatchObject({ saved: false })
  })
})

const row = (patch: Partial<ImpactRow> = {}): ImpactRow => ({
  id: 'c1', shipped_at: '2026-10-31T12:00:00Z', title: 'Nuevo feed', description: null, kind: 'feature', area: 'feed', expected_metric: null, source: 'git', commit_sha: 'abc',
  before_sessions: 20, before_active_person_days: 10, before_new_active: 4, before_registrations: 2, before_errors: 6, before_tracked_days: '5', before_calendar_days: '7',
  after_sessions: 30, after_active_person_days: 20, after_new_active: 8, after_registrations: 4, after_errors: 3, after_tracked_days: '5', after_calendar_days: '5',
  after_complete: false, nearby_changes: 0, ...patch,
})

describe('describeImpact', () => {
  it('turns totals into per-day averages and the percentage change', () => {
    const impact = describeImpact(row(), 7)
    expect(impact.activePeoplePerDay).toEqual({ before: 2, after: 4, changePct: 100 })
    expect(impact.sessionsPerDay).toEqual({ before: 4, after: 6, changePct: 50 })
    expect(impact.errorsPerDay.changePct).toBe(-50)
    // los registros se dividen entre días de calendario (7 antes, 5 después)
    expect(impact.registrationsPerDay.before).toBeCloseTo(0.29, 2)
    expect(impact.registrationsPerDay.after).toBe(0.8)
    expect(impact.confidence).toBe('comparable')
  })
  it('does not invent a number when there are no days to divide by, or no base to compare with', () => {
    expect(perDay(5, 0)).toBeNull()
    expect(shift(null, 3).changePct).toBeNull()
    expect(shift(0, 3).changePct).toBeNull()
  })
  it('says how far the comparison can go', () => {
    expect(confidenceOf({ before_tracked_days: 5, after_tracked_days: 0.4, nearby_changes: 0 })).toBe('pendiente')
    expect(confidenceOf({ before_tracked_days: 1, after_tracked_days: 5, nearby_changes: 0 })).toBe('sin_base')
    expect(confidenceOf({ before_tracked_days: 5, after_tracked_days: 5, nearby_changes: 3 })).toBe('mezclado')
    expect(confidenceOf({ before_tracked_days: 5, after_tracked_days: 5, nearby_changes: 2 })).toBe('comparable')
  })
})

describe('GET /changes', () => {
  const app = () => { const a = express(); a.use('/analytics', router); return a }

  it('answers with the impact of the changes and keeps the window inside the allowed ones', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null })
    const res = await request(app()).get('/analytics/changes?window=99&limit=5')
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('analytics_change_impact', { p_window_days: 7, p_limit: 5, p_since: null })
    expect(res.body).toMatchObject({ ready: true, windowDays: 7 })
    expect(res.body.changes[0]).toMatchObject({ title: 'Nuevo feed', confidence: 'comparable' })
  })
  it('says the migration is not ready instead of showing an empty list', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function analytics_change_impact does not exist' } })
    const res = await request(app()).get('/analytics/changes?window=14')
    expect(res.body).toEqual({ ready: false })
  })
})

describe('parseExpectedMetric', () => {
  it('reads Expects / Espera / Esperado from the body, never from the subject, and ignores empty ones', () => {
    expect(parseExpectedMetric('feat: algo\n\nExpects: registros suben')).toBe('registros suben')
    expect(parseExpectedMetric('feat: algo\n\nEspera:   menos abandono  ')).toBe('menos abandono')
    expect(parseExpectedMetric('feat: algo\nEsperado: más clics')).toBe('más clics')
    expect(parseExpectedMetric('Expects: en el titulo no cuenta')).toBeNull()
    expect(parseExpectedMetric('feat: algo\n\nExpects:')).toBeNull()
    expect(parseExpectedMetric('feat: algo')).toBeNull()
    expect(parseExpectedMetric(null)).toBeNull()
  })
})
