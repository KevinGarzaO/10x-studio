import { describe, it, expect } from 'vitest'
import { scoreMatch, WEIGHTS, MIN_SCORE, type MatchCandidate, type MatchVacancy } from '../../services/matching/score'

const person: MatchCandidate = {
  roleCategory: 'backend',
  seniority: 'senior',
  skills: ['python', 'postgresql', 'docker'],
  workModality: 'Remoto',
}

const vacancy = (patch: Partial<MatchVacancy> = {}): MatchVacancy => ({
  roleCategory: 'backend',
  seniority: 'senior',
  skills: ['python', 'postgresql', 'aws'],
  workModality: 'remote',
  ...patch,
})

describe('skills validated by exam', () => {
  const same = vacancy({ skills: ['python', 'postgresql', 'aws'] })

  it('scores higher the same skills when they were validated', () => {
    const declared = scoreMatch(person, same)
    const validated = scoreMatch({ ...person, validatedSkills: { python: 'intermedio', postgresql: 'avanzado' } }, same)

    expect(validated.score).toBeGreaterThan(declared.score)
    expect(validated.validatedSkills).toEqual([
      { skill: 'python', level: 'intermedio' },
      { skill: 'postgresql', level: 'avanzado' },
    ])
    expect(declared.validatedSkills).toEqual([])
  })

  it('weighs a higher level more', () => {
    const basic = scoreMatch({ ...person, validatedSkills: { python: 'basico' } }, same)
    const advanced = scoreMatch({ ...person, validatedSkills: { python: 'avanzado' } }, same)
    expect(advanced.score).toBeGreaterThan(basic.score)
  })

  it('ignores a validated skill the vacancy does not ask for', () => {
    const result = scoreMatch({ ...person, validatedSkills: { docker: 'avanzado' } }, same)
    expect(result.validatedSkills).toEqual([])
    expect(result.score).toBe(scoreMatch(person, same).score)
  })

  it('never goes over 100', () => {
    const all = { python: 'avanzado', postgresql: 'avanzado', docker: 'avanzado' } as const
    expect(scoreMatch({ ...person, validatedSkills: all }, vacancy({ skills: ['python'] })).score).toBeLessThanOrEqual(100)
  })
})

describe('scoreMatch', () => {
  it('weights add up to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('gives the top score only to the same role, level, modality and skills validated by exam', () => {
    const validated = { ...person, validatedSkills: { python: 'avanzado', postgresql: 'avanzado' } as const }
    expect(scoreMatch(validated, vacancy({ skills: ['python', 'postgresql'] })).score).toBe(100)

    const result = scoreMatch(person, vacancy({ skills: ['python', 'postgresql'] }))

    expect(result.score).toBe(WEIGHTS.role + WEIGHTS.skills + WEIGHTS.seniority + WEIGHTS.modality)
    expect(result.role).toBe('exact')
    expect(result.seniority).toBe('exact')
    expect(result.modality).toBe('match')
    expect(result.sharedSkills).toEqual(['python', 'postgresql'])
    expect(result.qualifies).toBe(true)
  })

  it('explains the match: which skills are shared and how the rest fits', () => {
    const result = scoreMatch(person, vacancy())

    expect(result.sharedSkills).toEqual(['python', 'postgresql'])
    expect(result.vacancySkills).toBe(3)
  })

  describe('role', () => {
    it('lets a close role match with fewer points', () => {
      const exact = scoreMatch({ ...person, roleCategory: 'fullstack' }, vacancy({ roleCategory: 'fullstack' }))
      const close = scoreMatch({ ...person, roleCategory: 'fullstack' }, vacancy({ roleCategory: 'backend' }))

      expect(close.role).toBe('adjacent')
      expect(close.score).toBeLessThan(exact.score)
      expect(close.qualifies).toBe(true)
    })

    it('does not offer a vacancy of an unrelated role, even with a shared skill', () => {
      const result = scoreMatch(person, vacancy({ roleCategory: 'marketing', skills: ['python'] }))

      expect(result.role).toBe('none')
      expect(result.qualifies).toBe(false)
    })

    it('treats an unclassified vacancy as unknown, not as a mismatch', () => {
      const result = scoreMatch(person, vacancy({ roleCategory: null }))

      expect(result.role).toBe('unknown')
      expect(result.qualifies).toBe(true)
    })

    it('knows the new business roles are neighbours', () => {
      const hr = { ...person, roleCategory: 'recursos_humanos', skills: ['payroll'] }
      expect(scoreMatch(hr, vacancy({ roleCategory: 'administracion', skills: ['payroll'] })).role).toBe('adjacent')
      expect(scoreMatch(hr, vacancy({ roleCategory: 'backend', skills: ['payroll'] })).role).toBe('none')
    })
  })

  describe('skills', () => {
    it('does not show a vacancy that shares no skill with the person', () => {
      const result = scoreMatch(person, vacancy({ skills: ['java', 'spring'] }))

      expect(result.sharedSkills).toEqual([])
      expect(result.qualifies).toBe(false)
    })

    it('scores more the more of the requested skills the person has', () => {
      const one = scoreMatch(person, vacancy({ skills: ['python', 'a', 'b', 'c'] }))
      const three = scoreMatch(person, vacancy({ skills: ['python', 'postgresql', 'docker', 'c'] }))

      expect(three.score).toBeGreaterThan(one.score)
    })

    it('does not punish a vacancy that lists many skills the person partly has', () => {
      const many = scoreMatch(person, vacancy({ skills: ['python', 'postgresql', 'docker', 'a', 'b', 'c', 'd'] }))
      const few = scoreMatch(person, vacancy({ skills: ['python', 'postgresql', 'docker', 'a'] }))

      expect(many.score).toBe(few.score)
    })

    it('shows a vacancy with no detected skills only when the role is exactly the same', () => {
      expect(scoreMatch(person, vacancy({ skills: [] })).qualifies).toBe(true)
      expect(scoreMatch(person, vacancy({ skills: [], roleCategory: 'fullstack' })).qualifies).toBe(false)
      expect(scoreMatch(person, vacancy({ skills: [], roleCategory: null })).qualifies).toBe(false)
    })

    it('gives nothing for skills to someone who declared none', () => {
      const result = scoreMatch({ ...person, skills: [] }, vacancy({ skills: [] }))
      expect(result.sharedSkills).toEqual([])
    })
  })

  describe('seniority', () => {
    it('keeps a one-level gap close and a two-level gap far', () => {
      expect(scoreMatch(person, vacancy({ seniority: 'semi_senior' })).seniority).toBe('near')
      expect(scoreMatch(person, vacancy({ seniority: 'junior' })).seniority).toBe('far')
    })

    it('does not count an unknown level against the vacancy', () => {
      const unknown = scoreMatch(person, vacancy({ seniority: null }))
      const far = scoreMatch(person, vacancy({ seniority: 'junior' }))

      expect(unknown.seniority).toBe('unknown')
      expect(unknown.score).toBeGreaterThan(far.score)
    })
  })

  describe('modality', () => {
    it.each([
      ['Remoto', 'remote', 'match'],
      ['Remoto', 'hybrid', 'compatible'],
      ['Remoto', 'onsite', 'mismatch'],
      ['Híbrido', 'onsite', 'compatible'],
      ['Presencial', 'remote', 'mismatch'],
      ['Presencial', 'onsite', 'match'],
    ])('someone who wants %s facing a %s vacancy is a %s', (wanted, offered, fit) => {
      expect(scoreMatch({ ...person, workModality: wanted }, vacancy({ workModality: offered })).modality).toBe(fit)
    })

    it('understands the label a published vacancy stores', () => {
      expect(scoreMatch(person, vacancy({ workModality: 'Remoto' })).modality).toBe('match')
      expect(scoreMatch(person, vacancy({ workModality: 'No especificado' })).modality).toBe('unknown')
    })

    it('stays neutral when either side does not say', () => {
      expect(scoreMatch({ ...person, workModality: null }, vacancy()).modality).toBe('unknown')
      expect(scoreMatch(person, vacancy({ workModality: null })).modality).toBe('unknown')
    })
  })

  it('does not show a weak match even if it shares a skill', () => {
    const weak = scoreMatch(
      { roleCategory: 'backend', seniority: 'senior', skills: ['python'], workModality: 'Remoto' },
      { roleCategory: 'devops', seniority: 'junior', skills: ['python', 'a', 'b', 'c'], workModality: 'onsite' },
    )

    expect(weak.score).toBeLessThan(MIN_SCORE)
    expect(weak.qualifies).toBe(false)
  })

  it('always returns a score between 0 and 100', () => {
    const worst = scoreMatch(
      { roleCategory: 'backend', seniority: 'senior', skills: [], workModality: 'Remoto' },
      { roleCategory: 'marketing', seniority: 'junior', skills: ['x'], workModality: 'onsite' },
    )
    const best = scoreMatch(person, vacancy({ skills: ['python'] }))

    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(best.score).toBeLessThanOrEqual(100)
  })
})
