import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  evaluateVacancy,
  tallyRejections,
  describeRejections,
  VACANCY_ROLES,
  type VacancyCandidate,
} from '../../services/vacancies/publish-rule'
import { planCleanup, type PublishedVacancy } from '../../services/vacancies/cleanup'

const catalog = new Set(['react', 'python', 'sql'])

const good: VacancyCandidate = {
  title: 'Senior Backend Engineer',
  company: 'Acme',
  applyUrl: 'https://acme.com/jobs/1',
  roleCategory: 'backend',
  skills: ['python'],
}

describe('evaluateVacancy', () => {
  it('accepts a vacancy linked to a role and a catalog skill', () => {
    expect(evaluateVacancy(good, catalog)).toEqual({ valid: true, reasons: [] })
  })

  it('does not require seniority, modality or location', () => {
    expect(evaluateVacancy({ ...good, seniority: null, modality: 'unknown' }, catalog).valid).toBe(true)
  })

  it.each([
    [{ title: '  ' }, 'no_title'],
    [{ company: null }, 'no_company'],
    [{ applyUrl: '' }, 'no_apply_url'],
    [{ roleCategory: null }, 'no_role'],
    [{ roleCategory: 'otro' }, 'unknown_role'],
    [{ roleCategory: 'ventas' }, 'unknown_role'],
    [{ skills: [] }, 'no_skills'],
    [{ skills: ['cobol'] }, 'unknown_skill'],
  ] as const)('rejects %j with %s', (patch, reason) => {
    const verdict = evaluateVacancy({ ...good, ...patch }, catalog)
    expect(verdict.valid).toBe(false)
    expect(verdict.reasons).toContain(reason)
  })

  it('reports every reason, not just the first', () => {
    const verdict = evaluateVacancy({ ...good, roleCategory: null, skills: [] }, catalog)
    expect(verdict.reasons).toEqual(['no_role', 'no_skills'])
  })

  it('never accepts "otro" as a role', () => {
    expect(VACANCY_ROLES).not.toContain('otro')
  })
})

describe('tallyRejections / describeRejections', () => {
  it('counts the first reason of each rejected vacancy', () => {
    const counts = tallyRejections([
      { valid: false, reasons: ['no_role', 'no_skills'] },
      { valid: false, reasons: ['no_role'] },
      { valid: false, reasons: ['no_skills'] },
      { valid: true, reasons: [] },
    ])
    expect(counts).toEqual({ no_role: 2, no_skills: 1 })
    expect(describeRejections(counts)).toBe('sin rol: 2, sin skills: 1')
    expect(describeRejections({})).toBe('ninguna')
  })
})

describe('planCleanup', () => {
  const vacancy = (id: string, patch: Partial<PublishedVacancy> = {}): PublishedVacancy => ({
    id,
    title: 'Backend Engineer',
    company: 'Acme',
    source_url: 'https://acme.com/1',
    role_category: 'backend',
    skills: ['python'],
    ...patch,
  })

  const vacancies = [
    vacancy('ok'),
    vacancy('no-role', { role_category: null }),
    vacancy('no-skills', { skills: [] }),
    vacancy('commented', { role_category: null }),
  ]

  it('keeps valid ones and removes the rest', () => {
    const plan = planCleanup(vacancies, catalog, new Set())
    expect(plan.keep).toEqual(['ok'])
    expect(plan.remove.sort()).toEqual(['commented', 'no-role', 'no-skills'])
    expect(plan.rejections).toEqual({ no_role: 2, no_skills: 1 })
  })

  it('never removes an invalid vacancy that has comments or saves', () => {
    const plan = planCleanup(vacancies, catalog, new Set(['commented']))
    expect(plan.remove).not.toContain('commented')
    expect(plan.protectedInvalid).toEqual(['commented'])
  })

  it('removes nothing with keepInvalid', () => {
    const plan = planCleanup(vacancies, catalog, new Set(), { keepInvalid: true })
    expect(plan.remove).toEqual([])
    expect(plan.protectedInvalid).toHaveLength(3)
  })

  it('treats malformed skills as no skills', () => {
    expect(planCleanup([vacancy('x', { skills: null })], catalog, new Set()).remove).toEqual(['x'])
  })
})

describe('vacancy-publish-rule-migration.sql stays in step with the rule', () => {
  const sql = readFileSync(join(__dirname, '../../sql/vacancy-publish-rule-migration.sql'), 'utf8').replace(/\r\n/g, '\n')

  it('lists exactly the roles the code accepts', () => {
    const list = sql.match(/role_category NOT IN \(([\s\S]*?)\)/)![1]
    const roles = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(roles.sort()).toEqual([...VACANCY_ROLES].sort())
  })

  it('is a BEFORE INSERT trigger only, so published vacancies keep working', () => {
    expect(sql).toMatch(/BEFORE INSERT ON community_posts/)
    expect(sql).not.toMatch(/BEFORE (INSERT OR UPDATE|UPDATE)/)
  })

  it('raises the error the code recognises', () => {
    expect(sql).toContain('vacancy_not_linked')
  })

  it('checks every field the rule checks', () => {
    for (const reason of ['no_title', 'no_company', 'no_apply_url', 'no_role', 'unknown_role', 'no_skills', 'unknown_skill']) {
      expect(sql).toContain(reason)
    }
  })
})
