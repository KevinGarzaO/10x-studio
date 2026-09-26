import { describe, it, expect } from 'vitest'
import { buildCandidateProfileSchema, firstUnapprovedSkill } from '@avocado/schemas'

const approved = ['react', 'nodejs', 'postgresql']
const schema = buildCandidateProfileSchema(approved)

const valid = {
  title: 'Backend Developer',
  roleCategory: 'backend',
  seniority: 'senior',
  skills: ['nodejs', 'postgresql'],
  location: 'Monterrey, MX',
  workModality: 'Remoto',
}

describe('buildCandidateProfileSchema (T005)', () => {
  it('accepts a complete profile', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('trims the free-text fields', () => {
    const parsed = schema.parse({
      ...valid,
      title: '  Backend Developer  ',
      location: '  Monterrey, MX ',
      bio: '  hola  ',
    })
    expect(parsed.title).toBe('Backend Developer')
    expect(parsed.location).toBe('Monterrey, MX')
    expect(parsed.bio).toBe('hola')
  })

  it('stores an empty optional field as null instead of an empty string', () => {
    const parsed = schema.parse({ ...valid, bio: '   ', website: '' })
    expect(parsed.bio).toBeNull()
    expect(parsed.website).toBeNull()
  })

  it.each(['title', 'location'])('rejects a blank %s', (field) => {
    expect(schema.safeParse({ ...valid, [field]: '   ' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, [field]: undefined }).success).toBe(false)
  })

  it.each(['roleCategory', 'seniority', 'workModality'])('rejects an invalid %s', (field) => {
    expect(schema.safeParse({ ...valid, [field]: 'inventado' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, [field]: undefined }).success).toBe(false)
  })

  it('requires at least one skill', () => {
    expect(schema.safeParse({ ...valid, skills: [] }).success).toBe(false)
  })

  it('rejects a skill that is not approved', () => {
    const result = schema.safeParse({ ...valid, skills: ['nodejs', 'rust'] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('skills')
    }
  })

  it('rejects repeated skills', () => {
    expect(schema.safeParse({ ...valid, skills: ['nodejs', 'nodejs'] }).success).toBe(false)
  })

  // Las columnas privilegiadas no pueden viajar por este schema (FR-004, FR-005).
  it('drops privileged fields instead of passing them through', () => {
    const parsed = schema.parse({
      ...valid,
      accountType: 'company',
      isSuperadmin: true,
      roles: ['admin'],
      companySlug: 'acme',
    }) as Record<string, unknown>
    expect(parsed.accountType).toBeUndefined()
    expect(parsed.isSuperadmin).toBeUndefined()
    expect(parsed.roles).toBeUndefined()
    expect(parsed.companySlug).toBeUndefined()
  })
})

describe('firstUnapprovedSkill (T005)', () => {
  it('finds the first skill outside the catalog', () => {
    expect(firstUnapprovedSkill(['nodejs', 'rust', 'zig'], approved)).toBe('rust')
  })

  it('returns null when every skill is approved', () => {
    expect(firstUnapprovedSkill(['nodejs', 'react'], approved)).toBeNull()
  })
})
