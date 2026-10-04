import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ROLE_CATEGORY } from '@avocado/schemas'
import { ROLE_RULES, classifyRole, titleOf } from '../../services/scraper/role-rules'

const post = (title: string, body = '') => `## ${title}\n\n${body}`

describe('classifyRole: the new categories', () => {
  it.each([
    ['Business Recruiter', 'recursos_humanos'],
    ['Talent Acquisition Lead', 'recursos_humanos'],
    ['People Partner, APJ', 'recursos_humanos'],
    ['Compensation Manager - Twilio', 'recursos_humanos'],
    ['Analista de Nómina', 'recursos_humanos'],
    ['Reclutador/a IT', 'recursos_humanos'],
    ['Senior Accountant', 'finanzas'],
    ['Head of Technical Revenue Accounting', 'finanzas'],
    ['Contador Público Senior', 'finanzas'],
    ['Tax Manager', 'finanzas'],
    ['Manager, Executive Assistant', 'administracion'],
    ['Asistente Administrativo', 'administracion'],
    ['Senior Procurement Analyst', 'administracion'],
    ['Legal Operations Specialist - Palantir', 'administracion'],
  ])('puts "%s" in %s', (title, role) => {
    expect(classifyRole(post(title))).toBe(role)
  })
})

describe('classifyRole: the defects of the old classifier', () => {
  it('no longer reads "ios" inside "positions"', () => {
    // Un Senior Accountant salía como mobile porque su texto decía "positions".
    const text = post('Senior Accountant', 'We have open positions across the team.')
    expect(classifyRole(text)).toBe('finanzas')
    expect(classifyRole(post('Office Coordinator', 'Several positions available'))).not.toBe('mobile')
  })

  it('does not take a word out of the middle of another one', () => {
    expect(classifyRole(post('Plumber'))).toBeNull() // "ux" dentro de otra cosa, "ui" en "guide"
    expect(classifyRole(post('Fluid Dynamics Specialist'))).toBeNull()
    expect(classifyRole(post('Syntax Editor'))).toBeNull() // "tax" dentro de "syntax"
  })

  it('goes by the title, not by whatever the body mentions', () => {
    const text = post('Senior Accountant', 'You will work with our marketing, design and product teams on figma and ios.')
    expect(classifyRole(text)).toBe('finanzas')
  })

  it('uses the body only for unmistakable technical roles when the title says nothing', () => {
    expect(classifyRole(post('Member of Technical Staff', 'Join our devops team'))).toBe('devops')
    // El cuerpo no sirve para etiquetar puestos de negocio.
    expect(classifyRole(post('Member of Technical Staff', 'You will collaborate with marketing and recruiting'))).toBeNull()
  })

  it('leaves a role it does not know unclassified instead of guessing', () => {
    expect(classifyRole(post('Account Executive - Italy'))).toBeNull()
    expect(classifyRole(post('Enterprise Sales Executive'))).toBeNull()
  })
})

describe('classifyRole: the existing technical categories', () => {
  it.each([
    ['Senior Full Stack Engineer', 'fullstack'],
    ['Backend Engineer', 'backend'],
    ['Frontend Developer', 'frontend'],
    ['iOS Engineer', 'mobile'],
    ['DevOps Engineer', 'devops'],
    ['Data Engineer', 'data_engineer'],
    ['Data Scientist', 'data_scientist'],
    ['QA Engineer', 'qa'],
    ['Product Designer', 'ux_ui'],
    ['Product Design Manager, Payroll', 'ux_ui'],
    ['Principal Product Manager: Talent Acquisition & Management', 'product'],
    ['Growth Marketing Manager', 'marketing'],
    ['Technical Support Engineer 2', 'customer_support'],
    ['Customer Success Manager', 'customer_support'],
    ['Senior Software Engineer', 'fullstack'],
    ['Software Engineer, Backend', 'backend'],
    ['Desarrollador Java - Spring Boot', 'fullstack'],
    ['Ingeniero de Calidad', 'qa'],
  ])('puts "%s" in %s', (title, role) => {
    expect(classifyRole(post(title))).toBe(role)
  })

  it('lets the more specific category win over the generic software rule', () => {
    expect(classifyRole(post('Software Engineer, Accounting Systems'))).toBe('finanzas')
  })
})

describe('titleOf', () => {
  it('takes the first line without the markdown hashes', () => {
    expect(titleOf('## Senior Accountant\n\nbody')).toBe('senior accountant')
    expect(titleOf('# QA Engineer')).toBe('qa engineer')
    expect(titleOf('')).toBe('')
  })
})

describe('the rules and the schema', () => {
  it('only assigns categories that exist', () => {
    const valid = new Set<string>(ROLE_CATEGORY)
    expect(ROLE_RULES.filter(rule => !valid.has(rule.role))).toEqual([])
  })

  it('covers every category except "otro"', () => {
    const covered = new Set(ROLE_RULES.map(rule => rule.role))
    expect(ROLE_CATEGORY.filter(role => role !== 'otro' && !covered.has(role))).toEqual([])
  })
})

describe('role-categories-migration.sql stays in step with the rules', () => {
  const sql = readFileSync(join(__dirname, '../../sql/role-categories-migration.sql'), 'utf8').replace(/\r\n/g, '\n')
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION classify_role_category'), sql.indexOf('$$ LANGUAGE plpgsql IMMUTABLE;'))

  const checks = (variable: string) =>
    [...fn.matchAll(new RegExp(`IF ${variable} ~ \\$re\\$([\\s\\S]*?)\\$re\\$ THEN\\s+RETURN '([a-z_]+)';`, 'g'))].map(m => ({ regex: m[1], role: m[2] }))

  it('has every title rule, in the same order', () => {
    expect(checks('v_title')).toEqual(ROLE_RULES.map(rule => ({ regex: rule.title, role: rule.role })))
  })

  it('has every body rule, in the same order', () => {
    expect(checks('v_body')).toEqual(ROLE_RULES.filter(rule => rule.body).map(rule => ({ regex: rule.body!, role: rule.role })))
  })

  it('makes the scraper trigger use the function instead of its own keyword list', () => {
    expect(sql).toContain('NEW.role_category := classify_role_category(NEW.text);')
    expect(sql).not.toMatch(/NEW\.text ILIKE '%ios%'/)
  })

  it('reclassifies what already exists and only touches role_category', () => {
    expect(sql).toMatch(/UPDATE scraper_posts\s+SET role_category = classify_role_category\(text\)/)
    expect(sql).toMatch(/UPDATE community_posts\s+SET role_category = classify_role_category\(/)
    expect(sql).toMatch(/is_scraper_post = true/)
  })

  it('is safe to run twice', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION classify_role_category/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION classify_scraper_post/)
  })
})
