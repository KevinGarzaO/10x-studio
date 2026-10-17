import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  evaluateVacancy,
  MANUAL_PUBLISH_RULE,
  locationFromText,
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
  location: 'Remoto',
  roleCategory: 'backend',
  skills: ['python'],
}

describe('evaluateVacancy', () => {
  it('accepts a vacancy linked to a role and a catalog skill', () => {
    expect(evaluateVacancy(good, catalog)).toEqual({ valid: true, reasons: [] })
  })

  it('does not require seniority or modality for what the scraper brings', () => {
    expect(evaluateVacancy({ ...good, seniority: null, modality: 'unknown' }, catalog).valid).toBe(true)
  })

  it('requires a location for every vacancy', () => {
    expect(evaluateVacancy({ ...good, location: '  ' }, catalog).reasons).toEqual(['no_location'])
    expect(evaluateVacancy({ ...good, location: null }, catalog).valid).toBe(false)
  })

  it.each([
    [{ title: '  ' }, 'no_title'],
    [{ location: '' }, 'no_location'],
    [{ company: null }, 'no_company'],
    [{ applyUrl: '' }, 'no_apply_url'],
    [{ roleCategory: null }, 'no_role'],
    [{ roleCategory: 'otro' }, 'unknown_role'],
    [{ roleCategory: 'astronauta' }, 'unknown_role'],
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

  it('accepts the sales and legal roles', () => {
    expect(VACANCY_ROLES).toEqual(expect.arrayContaining(['ventas', 'legal']))
  })

  it('never accepts "otro" as a role', () => {
    expect(VACANCY_ROLES).not.toContain('otro')
  })
})

describe('MANUAL_PUBLISH_RULE (vacancies a company creates by hand)', () => {
  const manual = { ...good, seniority: 'senior', modality: 'Remoto' }

  it('accepts a complete vacancy', () => {
    expect(evaluateVacancy(manual, catalog, MANUAL_PUBLISH_RULE).valid).toBe(true)
  })

  it.each([
    [{ seniority: null }, 'no_seniority'],
    [{ seniority: 'experto' }, 'no_seniority'],
    [{ modality: null }, 'no_modality'],
    [{ modality: 'No especificado' }, 'no_modality'],
    [{ modality: 'unknown' }, 'no_modality'],
  ] as const)('requires level and modality: %j -> %s', (patch, reason) => {
    expect(evaluateVacancy({ ...manual, ...patch }, catalog, MANUAL_PUBLISH_RULE).reasons).toEqual([reason])
  })

  it('accepts the three modalities and the three levels', () => {
    for (const modality of ['Remoto', 'Híbrido', 'Presencial']) {
      expect(evaluateVacancy({ ...manual, modality }, catalog, MANUAL_PUBLISH_RULE).valid).toBe(true)
    }
    for (const seniority of ['junior', 'semi_senior', 'senior']) {
      expect(evaluateVacancy({ ...manual, seniority }, catalog, MANUAL_PUBLISH_RULE).valid).toBe(true)
    }
  })
})

describe('locationFromText', () => {
  it('reads the location out of the stored text', () => {
    expect(locationFromText('## T\n**Ubicación:** Austin, TX\n**Modalidad:** Remoto')).toBe('Austin, TX')
    expect(locationFromText('## T\nsin ubicación')).toBeNull()
    expect(locationFromText(null)).toBeNull()
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
    location: 'Remoto',
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
    for (const reason of ['no_title', 'no_company', 'no_apply_url', 'no_location', 'no_role', 'unknown_role', 'no_skills', 'unknown_skill']) {
      expect(sql).toContain(reason)
    }
  })

  it('demands level and modality only from vacancies that do not come from the scraper', () => {
    const manual = sql.slice(sql.indexOf('IF NOT coalesce(NEW.is_scraper_post, false) THEN'))
    expect(manual).toContain('no_seniority')
    expect(manual).toContain('no_modality')
    // ...y no antes de ese bloque: el scraper no los necesita.
    const before = sql.slice(0, sql.indexOf('IF NOT coalesce(NEW.is_scraper_post, false) THEN'))
    expect(before).not.toContain('no_seniority')
    expect(before).not.toContain('no_modality')
  })

  it('is repeated, up to date, in the sales and legal migration', () => {
    const salesLegal = readFileSync(join(__dirname, '../../sql/sales-legal-roles-migration.sql'), 'utf8').replace(/\r\n/g, '\n')
    const fn = (text: string) => text.slice(text.indexOf('CREATE OR REPLACE FUNCTION enforce_vacancy_linkage'), text.indexOf('$$ LANGUAGE plpgsql;'))
    expect(fn(salesLegal)).toBe(fn(sql))
  })
})
