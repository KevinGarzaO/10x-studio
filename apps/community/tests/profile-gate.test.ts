import { describe, it, expect } from 'vitest'
import { profileGateReason } from '@/lib/profile-gate'

const catalog = {
  skills: [
    { name: 'react', label: 'React' },
    { name: 'nodejs', label: 'Node.js' },
  ],
  aliases: [],
}

const completeCandidate = {
  account_type: 'candidate',
  photo_url: 'https://example.com/foto.png',
  title: 'Backend Developer',
  role_category: 'backend',
  seniority: 'senior',
  skills: ['react'],
  location: 'Monterrey, MX',
  work_modality: 'Remoto',
}

describe('profileGateReason (T041)', () => {
  it('lets a complete candidate through', () => {
    expect(profileGateReason(completeCandidate, catalog)).toBeNull()
  })

  it('returns null when there is no user (logged out)', () => {
    expect(profileGateReason(null, catalog)).toBeNull()
  })

  // FR-024: la foto es obligatoria, y hasta ahora la verificación no la miraba.
  it.each([[null], [''], ['   ']])('asks for the photo when it is %j', (photo) => {
    expect(profileGateReason({ ...completeCandidate, photo_url: photo }, catalog)).toBe(
      'missing_photo',
    )
  })

  it.each(['title', 'role_category', 'seniority', 'location', 'work_modality'])(
    'asks for the missing %s',
    (field) => {
      expect(profileGateReason({ ...completeCandidate, [field]: null }, catalog)).toBe(
        'missing_fields',
      )
    },
  )

  it('asks for skills when there are none', () => {
    expect(profileGateReason({ ...completeCandidate, skills: [] }, catalog)).toBe('missing_fields')
  })

  // FR-015: un skill heredado fuera del catálogo hay que resolverlo.
  it('asks to resolve a skill outside the catalog', () => {
    expect(
      profileGateReason({ ...completeCandidate, skills: ['react', 'skill-viejo'] }, catalog),
    ).toBe('unresolved_skills')
  })

  // Si el catálogo no cargó no se sabe qué es válido: expulsar a alguien con el
  // perfil correcto sería peor que dejarlo pasar.
  it('does not report unresolved skills when the catalog is empty', () => {
    expect(
      profileGateReason(
        { ...completeCandidate, skills: ['react', 'skill-viejo'] },
        { skills: [], aliases: [] },
      ),
    ).toBeNull()
  })

  // FR-009: una cuenta de empresa solo necesita foto; los datos de candidato no
  // le aplican.
  it('only requires a photo from a company account', () => {
    const company = { account_type: 'company', photo_url: 'https://example.com/logo.png' }
    expect(profileGateReason(company, catalog)).toBeNull()
    expect(profileGateReason({ ...company, photo_url: null }, catalog)).toBe('missing_photo')
  })

  it('asks a former company account for its candidate fields (FR-009)', () => {
    const converted = {
      account_type: 'candidate',
      photo_url: 'https://example.com/logo.png',
      title: null,
      role_category: null,
      seniority: null,
      skills: [],
      location: null,
      work_modality: null,
    }

    expect(profileGateReason(converted, catalog)).toBe('missing_fields')
  })
})
