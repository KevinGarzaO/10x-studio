import { describe, it, expect } from 'vitest'
import { RECOMMENDED_SKILLS, shouldNudgeSkills, skillsMissing, skillsRecommendation } from '@/lib/skills-recommendation'

describe('skills recommendation', () => {
  it('recommends five skills', () => {
    expect(RECOMMENDED_SKILLS).toBe(5)
  })

  it('counts how many are missing, never below zero', () => {
    expect(skillsMissing(0)).toBe(5)
    expect(skillsMissing(3)).toBe(2)
    expect(skillsMissing(5)).toBe(0)
    expect(skillsMissing(9)).toBe(0)
  })

  it('says it is a recommendation, not a requirement, while below five', () => {
    const text = skillsRecommendation(2)
    expect(text).toContain('5')
    expect(text).toContain('llevas 2')
    expect(text).toContain('No es obligatorio')
  })

  it('is satisfied from five on', () => {
    expect(skillsRecommendation(5)).not.toContain('No es obligatorio')
  })

  describe('feed nudge', () => {
    it('shows to a candidate with fewer than five skills', () => {
      expect(shouldNudgeSkills({ account_type: 'candidate', skills: ['a', 'b'] })).toBe(true)
      expect(shouldNudgeSkills({ skills: [] })).toBe(true)
    })

    it('does not show with five or more, to companies, or to visitors', () => {
      expect(shouldNudgeSkills({ account_type: 'candidate', skills: ['a', 'b', 'c', 'd', 'e'] })).toBe(false)
      expect(shouldNudgeSkills({ account_type: 'company', skills: [] })).toBe(false)
      expect(shouldNudgeSkills(null)).toBe(false)
    })
  })
})
