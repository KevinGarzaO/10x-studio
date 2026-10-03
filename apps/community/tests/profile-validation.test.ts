import { describe, it, expect } from 'vitest'
import { validateCandidateProfile } from '@/lib/profile-validation'

const CATALOG = {
  skills: [
    { name: 'react', label: 'React' },
    { name: 'python', label: 'Python' },
  ],
  aliases: [],
}

const profile = {
  title: 'Backend Developer',
  roleCategory: 'backend',
  seniority: 'senior',
  skills: ['react', 'legacy'],
  location: 'Monterrey, MX',
  workModality: 'Remoto',
}

describe('validateCandidateProfile', () => {
  it('rejects a skill outside the catalog', () => {
    expect(validateCandidateProfile(profile, CATALOG)?.field).toBe('skills')
  })

  it('accepts a skill the profile already had, even if the catalog does not list it', () => {
    expect(validateCandidateProfile(profile, CATALOG, ['legacy'])).toBeNull()
  })

  it('still rejects a NEW skill outside the catalog', () => {
    const withNew = { ...profile, skills: ['react', 'legacy', 'inventado'] }
    expect(validateCandidateProfile(withNew, CATALOG, ['legacy'])?.field).toBe('skills')
  })

  it('lets the profile be saved when the catalog failed to load but nothing changed', () => {
    const empty = { skills: [], aliases: [] }
    expect(validateCandidateProfile(profile, empty, ['react', 'legacy'])).toBeNull()
  })
})
