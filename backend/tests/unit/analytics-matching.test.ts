import { describe, it, expect } from 'vitest'
import { buildMatchingOverview, FEW_OFFERS, GOOD_SCORE, type PanelCandidate, type PanelVacancy } from '../../services/analytics/matching'
import { MIN_SCORE, scoreMatch } from '../../services/matching/score'

const person = (patch: Partial<PanelCandidate> = {}): PanelCandidate => ({
  id: 'u1', name: 'Ana', photo: null, roleCategory: 'backend', seniority: 'senior', skills: ['python', 'aws', 'docker'], workModality: 'Remoto', validatedSkills: {}, ...patch,
})

let n = 0
const vacancy = (patch: Partial<PanelVacancy> = {}): PanelVacancy => ({
  slug: `vac-${++n}`, title: 'Backend Engineer', company: 'Stripe', roleCategory: 'backend', seniority: 'senior', skills: ['python', 'aws'], workModality: 'Remoto', ...patch,
})

describe('buildMatchingOverview uses the same engine as "Para ti"', () => {
  it('counts exactly the vacancies the engine says qualify', () => {
    const candidate = person()
    const vacancies = [vacancy(), vacancy({ skills: ['cobol'], roleCategory: 'marketing' }), vacancy({ skills: ['python'], roleCategory: 'frontend' })]

    const expected = vacancies.filter(v => scoreMatch(candidate, { roleCategory: v.roleCategory, seniority: v.seniority, skills: v.skills, workModality: v.workModality }).qualifies).length
    const overview = buildMatchingOverview({ candidates: [candidate], vacancies })

    expect(overview.people[0].matches).toBe(expected)
    expect(expected).toBeGreaterThan(0)
  })

  it('a vacancy with no skill in common does not count, whatever its role', () => {
    const overview = buildMatchingOverview({ candidates: [person()], vacancies: [vacancy({ skills: ['cobol', 'fortran'] })] })
    expect(overview.people[0]).toMatchObject({ matches: 0, goodMatches: 0, bestScore: null, state: 'sin_ofertas' })
  })

  it('skills validated by exam raise the score, as in "Para ti"', () => {
    const declared = buildMatchingOverview({ candidates: [person()], vacancies: [vacancy()] }).people[0].bestScore!
    const validated = buildMatchingOverview({ candidates: [person({ validatedSkills: { python: 'avanzado', aws: 'avanzado' } })], vacancies: [vacancy()] }).people[0].bestScore!
    expect(validated).toBeGreaterThan(declared)
  })
})

describe('good matches', () => {
  it('separates the vacancies that qualify from the good ones', () => {
    const vacancies = [
      vacancy(), // mismo puesto, nivel y modalidad: buena
      vacancy({ roleCategory: 'ux_ui', seniority: 'junior', workModality: 'Presencial', skills: ['python', 'a', 'b', 'c', 'd', 'e'] }), // comparte un skill: califica, pero floja
    ]
    const result = buildMatchingOverview({ candidates: [person()], vacancies }).people[0]

    expect(result.goodMatches).toBeGreaterThanOrEqual(1)
    expect(result.matches).toBeGreaterThanOrEqual(result.goodMatches)
  })

  it('flags a person who has fewer than FEW_OFFERS good vacancies', () => {
    const few = buildMatchingOverview({ candidates: [person()], vacancies: [vacancy(), vacancy()] }).people[0]
    expect(few.goodMatches).toBeLessThan(FEW_OFFERS)
    expect(few.state).toBe('pocas_ofertas')

    const many = buildMatchingOverview({ candidates: [person()], vacancies: Array.from({ length: FEW_OFFERS + 2 }, () => vacancy()) }).people[0]
    expect(many.state).toBe('ok')
  })

  it('has sensible thresholds', () => {
    expect(GOOD_SCORE).toBeGreaterThan(MIN_SCORE)
  })

  it('lists first the people with the fewest good vacancies, who need attention', () => {
    const rich = person({ id: 'rich', name: 'Rica' })
    const poor = person({ id: 'poor', name: 'Pobre', skills: ['cobol'], roleCategory: 'legal' })
    const overview = buildMatchingOverview({ candidates: [rich, poor], vacancies: Array.from({ length: 8 }, () => vacancy()) })

    expect(overview.people.map(p => p.name)).toEqual(['Pobre', 'Rica'])
  })
})

describe('the numbers around skills', () => {
  const candidates = [
    person({ id: 'a', skills: [] }),
    person({ id: 'b', skills: ['python'] }),
    person({ id: 'c', skills: ['python', 'aws', 'docker', 'react'] }),
    person({ id: 'd', skills: Array.from({ length: 12 }, (_, i) => `s${i}`) }),
  ]

  it('says how many skills people declare', () => {
    const { skillsPerCandidate } = buildMatchingOverview({ candidates, vacancies: [] })

    expect(skillsPerCandidate.withNone).toBe(1)
    expect(skillsPerCandidate.average).toBe(4.3)
    expect(skillsPerCandidate.median).toBe(2.5)
    expect(skillsPerCandidate.buckets).toEqual([
      { label: 'Ninguno', count: 1 },
      { label: '1–2', count: 1 },
      { label: '3–5', count: 1 },
      { label: '6–9', count: 0 },
      { label: '10 o más', count: 1 },
    ])
  })

  it('compares what people declare with what the vacancies ask for', () => {
    const { skills } = buildMatchingOverview({
      candidates: [person({ skills: ['python', 'angular'] }), person({ id: 'x', skills: ['python'] })],
      vacancies: [vacancy({ skills: ['python', 'kotlin'] }), vacancy({ skills: ['kotlin'] })],
    })

    expect(skills.declared[0]).toEqual({ skill: 'python', candidates: 2, vacancies: 1 })
    expect(skills.demandedWithoutSupply).toEqual([{ skill: 'kotlin', vacancies: 2 }])
    expect(skills.declaredWithoutDemand).toEqual([{ skill: 'angular', candidates: 1 }])
  })
})

describe('coverage', () => {
  it('says how many vacancies match nobody', () => {
    const overview = buildMatchingOverview({ candidates: [person()], vacancies: [vacancy(), vacancy({ skills: ['cobol'] }), vacancy({ skills: ['fortran'] })] })

    expect(overview.vacancyCoverage).toEqual({ withCandidates: 1, withCandidatesPct: 33.3, withNone: 2 })
  })

  it('lists the vacancies that match the most people', () => {
    const popular = vacancy({ title: 'Popular' })
    const overview = buildMatchingOverview({
      candidates: [person({ id: 'a' }), person({ id: 'b' }), person({ id: 'c', skills: ['cobol'], roleCategory: 'legal' })],
      vacancies: [popular, vacancy({ title: 'Solo para uno', skills: ['cobol'], roleCategory: 'legal' })],
    })

    expect(overview.topVacancies[0]).toMatchObject({ title: 'Popular', candidates: 2 })
  })

  it('reports the people covered and the average of good vacancies', () => {
    const overview = buildMatchingOverview({ candidates: [person({ id: 'a' }), person({ id: 'b', skills: ['cobol'], roleCategory: 'legal' })], vacancies: [vacancy(), vacancy()] })

    expect(overview.coverage.withMatch).toBe(1)
    expect(overview.coverage.withMatchPct).toBe(50)
    expect(overview.coverage.withGoodMatch).toBe(1)
  })

  it('groups roles with their people and vacancies, including the ones with no people', () => {
    const overview = buildMatchingOverview({ candidates: [person()], vacancies: [vacancy(), vacancy({ roleCategory: 'ventas', skills: ['sales'] })] })

    expect(overview.byRole.find(row => row.role === 'backend')).toMatchObject({ candidates: 1, vacancies: 1 })
    expect(overview.byRole.find(row => row.role === 'ventas')).toMatchObject({ candidates: 0, vacancies: 1, averageMatches: null })
  })
})

describe('with no data', () => {
  it('does not invent numbers', () => {
    const overview = buildMatchingOverview({ candidates: [], vacancies: [] })

    expect(overview).toMatchObject({ candidates: 0, vacancies: 0, people: [], topVacancies: [] })
    expect(overview.coverage.withMatchPct).toBeNull()
    expect(overview.bestScores.average).toBeNull()
    expect(overview.skillsPerCandidate.average).toBeNull()
  })
})
