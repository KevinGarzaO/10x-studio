import { describe, it, expect } from 'vitest'
import { sameSkills } from '../../lib/same-skills'

describe('sameSkills', () => {
  it('is true for the same skills in the same order', () => {
    expect(sameSkills(['react', 'python'], ['react', 'python'])).toBe(true)
  })

  it('is false when a skill is added, removed or reordered', () => {
    expect(sameSkills(['react', 'python'], ['react'])).toBe(false)
    expect(sameSkills(['react'], ['react', 'python'])).toBe(false)
    expect(sameSkills(['python', 'react'], ['react', 'python'])).toBe(false)
  })

  it('is false when nothing is stored yet', () => {
    expect(sameSkills(['react'], null)).toBe(false)
    expect(sameSkills(['react'], undefined)).toBe(false)
  })
})
