import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { servesSomeone, type PersonProfile } from '../../services/vacancies/serves-someone'

const ana: PersonProfile = { roleCategory: 'backend', seniority: 'senior', skills: ['python', 'docker'], workModality: 'Remoto' }
const vacancy = (patch = {}) => ({ role_category: 'backend', seniority_level: 'senior', skills: ['Python', 'sql'], work_modality: 'Remoto', ...patch })

describe('servesSomeone', () => {
  it('lets in a vacancy that fits at least one person (skills compared without caring about case)', () => {
    expect(servesSomeone(vacancy(), [ana])).toBe(true)
  })

  it('keeps out a vacancy that shares no skill with anybody', () => {
    expect(servesSomeone(vacancy({ skills: ['excel', 'sap'] }), [ana])).toBe(false)
  })

  it('keeps out a vacancy from a role nobody has', () => {
    expect(servesSomeone(vacancy({ role_category: 'ventas', skills: ['excel'] }), [ana])).toBe(false)
  })

  it('one person is enough, however many do not fit', () => {
    const nobody: PersonProfile = { roleCategory: 'ux_ui', seniority: 'junior', skills: ['figma'], workModality: null }
    expect(servesSomeone(vacancy(), [nobody, nobody, ana])).toBe(true)
  })

  it('does not apply the rule when there are no people to score, so the feed never goes empty', () => {
    expect(servesSomeone(vacancy({ skills: [] }), [])).toBe(true)
  })

  it('needs a skill in common even when the role, level and modality match', () => {
    expect(servesSomeone(vacancy({ skills: ['kotlin'] }), [ana])).toBe(false)
  })

  it('handles a vacancy without skills data', () => {
    expect(servesSomeone(vacancy({ skills: null }), [ana])).toBe(false)
  })
})
