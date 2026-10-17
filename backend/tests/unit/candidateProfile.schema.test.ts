import { describe, it, expect } from 'vitest'
import { buildCandidateProfileSchema, firstUnapprovedSkill } from '@avocado/schemas'

const approved = ['react', 'nodejs', 'postgresql']
const schema = buildCandidateProfileSchema(approved)

const valid = {
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
      location: '  Monterrey, MX ',
      bio: '  hola  ',
    })
    expect(parsed.location).toBe('Monterrey, MX')
    expect(parsed.bio).toBe('hola')
  })

  it('stores an empty optional field as null instead of an empty string', () => {
    const parsed = schema.parse({ ...valid, bio: '   ', website: '' })
    expect(parsed.bio).toBeNull()
    expect(parsed.website).toBeNull()
  })

  // El puesto se elige de un listado: no se captura un título libre. Se deriva del
  // rol, así perfiles y vacantes hablan el mismo idioma y el match no depende de
  // cómo escribió cada quien.
  it('derives the title from the chosen role category, in Spanish', () => {
    expect(schema.parse(valid).title).toBe('Desarrollo Backend')
    expect(schema.parse({ ...valid, roleCategory: 'finanzas' }).title).toBe('Finanzas y Contabilidad')
    expect(schema.parse({ ...valid, roleCategory: 'recursos_humanos' }).title).toBe('Recursos Humanos')
  })

  it('ignores a title sent by a client: the role decides', () => {
    expect(schema.parse({ ...valid, title: 'Ninja Rockstar' }).title).toBe('Desarrollo Backend')
  })

  it('accepts the administration, finance and human resources roles', () => {
    for (const roleCategory of ['recursos_humanos', 'administracion', 'finanzas']) {
      expect(schema.safeParse({ ...valid, roleCategory }).success).toBe(true)
    }
  })

  it.each(['location'])('rejects a blank %s', (field) => {
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
