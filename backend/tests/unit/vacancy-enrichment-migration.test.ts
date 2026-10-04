import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SKILL_TERMS } from '../../services/vacancies/skill-terms'

const read = (file: string) => readFileSync(join(__dirname, '../../sql', file), 'utf8').replace(/\r\n/g, '\n')
const names = (sql: string) => [...sql.matchAll(/^\s*\('([a-z0-9-]+)',\s*'/gm)].map(m => m[1])

const enrichment = read('vacancy-enrichment-migration.sql')
const analytics = read('vacancy-analytics-migration.sql')

const catalog = [
  ...names(read('seed-skills-catalog.sql').split('INSERT INTO skill_aliases')[0]),
  ...names(read('skills-catalog-expansion.sql').split('INSERT INTO skill_aliases')[0]),
]

/** Los términos que la migración le da a cada skill. */
const sqlTerms = new Map<string, string[]>(
  [...enrichment.matchAll(/^\s*\('([a-z0-9-]+)', ARRAY\[([^\]]*)\]::text\[\]\)/gm)].map(m => [
    m[1],
    [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map(t => t[1].replace(/''/g, "'")),
  ]),
)

describe('vacancy-enrichment-migration.sql', () => {
  it('gives every skill of the catalog its detection terms', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(82)
    expect(catalog.filter(name => !sqlTerms.get(name)?.length)).toEqual([])
  })

  it('carries exactly the terms the code defines, in the same order', () => {
    for (const [name, terms] of Object.entries(SKILL_TERMS)) {
      expect(sqlTerms.get(name), name).toEqual(terms)
    }
  })

  it('does not mention a skill the catalog does not have', () => {
    expect([...sqlTerms.keys()].filter(name => !catalog.includes(name))).toEqual([])
  })

  it('only fills the skills that have no terms yet, so manual adjustments survive', () => {
    expect(enrichment).toMatch(/AND s\.detect_terms = '\{\}'/)
  })

  it('adds the columns safely, to run twice', () => {
    expect(enrichment).toMatch(/ADD COLUMN IF NOT EXISTS detect_terms TEXT\[\] NOT NULL DEFAULT '\{\}'/)
    expect(enrichment).toMatch(/ADD COLUMN IF NOT EXISTS location TEXT/)
  })

  it('stops the trigger from guessing level and skills, and only falls back for the role', () => {
    const trigger = enrichment.slice(enrichment.indexOf('CREATE OR REPLACE FUNCTION classify_scraper_post'))
    expect(trigger).toContain('COALESCE(NEW.role_category, classify_role_category(NEW.text))')
    expect(trigger).not.toMatch(/seniority_level/)
    expect(trigger).not.toMatch(/NEW\.skills/)
    expect(trigger).not.toMatch(/semi_senior/)
  })

  it('keeps the spam rule of the old trigger', () => {
    expect(enrichment).toMatch(/NEW\.is_spam := COALESCE\(NEW\.is_spam, false\)/)
  })

  it('reads the location out of the stored text for vacancies already published', () => {
    expect(enrichment).toMatch(/UPDATE community_posts\s+SET location = /)
    expect(enrichment).toMatch(/AND location IS NULL/)
  })

  it('asks for the migrations it depends on', () => {
    expect(enrichment).toMatch(/role-categories-migration\.sql/)
    expect(enrichment).toMatch(/skills-role-categories-migration\.sql/)
  })
})

describe('vacancy-analytics-migration.sql', () => {
  it('defines the three reports', () => {
    for (const view of ['role_supply_demand', 'skill_supply_demand', 'vacancy_enrichment_coverage']) {
      expect(analytics).toMatch(new RegExp(`CREATE OR REPLACE VIEW ${view} AS`))
    }
  })

  it('counts only real people: no test accounts, no scraper profiles', () => {
    expect(analytics).toMatch(/NOT coalesce\(is_test_account, false\)/)
    expect(analytics).toMatch(/NOT coalesce\(is_scraper_profile, false\)/)
  })

  it('knows every role category, the new business roles included', () => {
    for (const role of ['frontend', 'backend', 'recursos_humanos', 'administracion', 'finanzas', 'otro']) {
      expect(analytics).toContain(`'${role}'`)
    }
  })

  it('does not expose the reports to the public keys', () => {
    expect(analytics).toMatch(/REVOKE ALL ON role_supply_demand, skill_supply_demand, vacancy_enrichment_coverage FROM anon/)
    expect(analytics).toMatch(/REVOKE ALL ON role_supply_demand, skill_supply_demand, vacancy_enrichment_coverage FROM authenticated/)
  })
})
