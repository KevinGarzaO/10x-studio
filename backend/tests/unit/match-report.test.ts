import { describe, it, expect } from 'vitest'
import { buildMatchReport, type ReportCandidate, type ReportVacancy } from '../../services/matching/report'

const NOW = new Date('2026-10-04T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const person = (username: string, patch: Partial<ReportCandidate> = {}): ReportCandidate => ({
  username, roleCategory: 'backend', seniority: 'senior', skills: ['python'], workModality: 'Remoto', ...patch,
})
const vacancy = (patch: Partial<ReportVacancy> = {}): ReportVacancy => ({
  roleCategory: 'backend', seniority: 'senior', skills: ['python'], workModality: 'remote', createdAt: daysAgo(2), ...patch,
})

const report = (candidates: ReportCandidate[], vacancies: ReportVacancy[]) => buildMatchReport(candidates, vacancies, { now: NOW })

describe('roles', () => {
  it('flags a role that has people and no vacancies this month', () => {
    const result = report([person('ana', { roleCategory: 'finanzas' })], [vacancy({ roleCategory: 'backend' })])

    const finanzas = result.roles.find(r => r.role === 'finanzas')!
    expect(finanzas.state).toBe('sin_vacantes')
    expect(finanzas.candidates).toBe(1)
    expect(finanzas.daysSinceLast).toBeNull()
    expect(result.summary.rolesWithoutVacancies).toEqual(['finanzas'])
  })

  it('counts only the last 30 days as current supply, and says how long ago the last one was', () => {
    const result = report([person('ana')], [vacancy({ createdAt: daysAgo(5) }), vacancy({ createdAt: daysAgo(45) })])
    const backend = result.roles.find(r => r.role === 'backend')!

    expect(backend.vacanciesTotal).toBe(2)
    expect(backend.vacancies30d).toBe(1)
    expect(backend.daysSinceLast).toBe(5)
  })

  it('calls "few" a role with less than three vacancies a month per person', () => {
    const people = [person('a'), person('b'), person('c')]
    expect(report(people, [vacancy(), vacancy()]).roles[0].state).toBe('pocas_vacantes')
    expect(report(people, Array.from({ length: 9 }, () => vacancy())).roles[0].state).toBe('ok')
  })

  it('shows a role that has vacancies and nobody yet', () => {
    const result = report([person('ana')], [vacancy({ roleCategory: 'qa' })])
    expect(result.roles.find(r => r.role === 'qa')!.state).toBe('sin_candidatos')
  })

  it('puts the most urgent first: people with nothing to see, the biggest group first', () => {
    const result = report(
      [person('a', { roleCategory: 'finanzas' }), person('b', { roleCategory: 'finanzas' }), person('c', { roleCategory: 'product' }), person('d')],
      [vacancy({ roleCategory: 'backend' })],
    )

    expect(result.roles.map(r => r.role).slice(0, 2)).toEqual(['finanzas', 'product'])
  })
})

describe('skills', () => {
  it('finds skills people declare and no recent vacancy asks for', () => {
    const result = report([person('ana', { skills: ['python', 'cobol'] })], [vacancy({ skills: ['python'] })])

    expect(result.skills.find(s => s.skill === 'cobol')).toMatchObject({ candidates: 1, vacancies30d: 0, state: 'candidatos_sin_oferta' })
    expect(result.skills.find(s => s.skill === 'python')!.state).toBe('ok')
  })

  it('finds skills vacancies ask for that nobody has', () => {
    const result = report([person('ana')], [vacancy({ skills: ['python', 'rust'] })])

    expect(result.skills.find(s => s.skill === 'rust')).toMatchObject({ candidates: 0, vacancies30d: 1, state: 'oferta_sin_candidatos' })
  })

  it('lists the skills without offers first', () => {
    const result = report([person('ana', { skills: ['cobol'] })], [vacancy({ skills: ['rust'] })])
    expect(result.skills[0].skill).toBe('cobol')
  })

  it('does not count an old vacancy as current demand', () => {
    const result = report([person('ana')], [vacancy({ createdAt: daysAgo(60) })])
    expect(result.skills.find(s => s.skill === 'python')!.state).toBe('candidatos_sin_oferta')
  })
})

describe('candidates', () => {
  it('finds the people we are not showing any good offer', () => {
    const result = report(
      [person('con-ofertas'), person('sin-ofertas', { roleCategory: 'finanzas', skills: ['accounting'] })],
      Array.from({ length: 4 }, () => vacancy()),
    )

    const sin = result.candidates.find(c => c.username === 'sin-ofertas')!
    expect(sin.state).toBe('sin_ofertas')
    expect(sin.goodMatches).toBe(0)
    expect(result.candidates.find(c => c.username === 'con-ofertas')!.state).toBe('ok')
    expect(result.summary.candidatesWithoutOffers).toBe(1)
  })

  it('separates "few" offers from "none"', () => {
    const result = report([person('ana')], [vacancy(), vacancy()])

    expect(result.candidates[0]).toMatchObject({ goodMatches: 2, state: 'pocas_ofertas' })
    expect(result.summary.candidatesWithFewOffers).toBe(1)
  })

  it('lists the worst served first and reports their best score', () => {
    const result = report(
      [person('bien'), person('mal', { skills: ['cobol'] })],
      Array.from({ length: 5 }, () => vacancy()),
    )

    expect(result.candidates.map(c => c.username)).toEqual(['mal', 'bien'])
    expect(result.candidates[0].bestScore).toBeGreaterThan(0)
  })

  it('uses the same rule as "Para ti": a vacancy with no shared skill is not a good offer', () => {
    const result = report([person('ana', { skills: ['python'] })], [vacancy({ skills: ['java'] })])
    expect(result.candidates[0].goodMatches).toBe(0)
  })
})

describe('summary', () => {
  it('totals the people and the vacancies', () => {
    const result = report([person('a'), person('b')], [vacancy(), vacancy(), vacancy()])
    expect(result.summary).toMatchObject({ candidates: 2, vacancies: 3 })
  })

  it('is safe with no data at all', () => {
    const result = report([], [])
    expect(result.roles).toEqual([])
    expect(result.skills).toEqual([])
    expect(result.candidates).toEqual([])
    expect(result.summary).toMatchObject({ candidates: 0, vacancies: 0, rolesWithoutVacancies: [] })
  })
})
