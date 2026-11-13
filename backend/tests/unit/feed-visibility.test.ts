import { describe, it, expect, vi } from 'vitest'

vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: {} }))

import { planVisibility, type OpenVacancy } from '@avotalent/core/services/vacancies/feed-visibility'
import type { PersonProfile } from '@avotalent/core/services/vacancies/serves-someone'

const ana: PersonProfile = { roleCategory: 'desarrollo_backend', seniority: 'mid', skills: ['node', 'sql'], workModality: 'remoto' }
let n = 0
const vac = (patch: Partial<OpenVacancy> = {}): OpenVacancy => ({ id: `v${++n}`, role_category: 'desarrollo_backend', seniority_level: 'mid', skills: ['node'], modalidad: 'remoto', hidden_from_feed: false, ...patch })

describe('planVisibility', () => {
  it('hides a vacancy that serves nobody and keeps the one that serves someone', () => {
    const serves = vac()
    const useless = vac({ role_category: 'ventas', skills: ['excel'] })
    expect(planVisibility([serves, useless], [ana])).toEqual({ hide: [useless.id], show: [], stay: 1 })
  })

  it('shows again (reversible) a hidden vacancy once someone it serves appears', () => {
    const hidden = vac({ hidden_from_feed: true })
    expect(planVisibility([hidden], [ana])).toEqual({ hide: [], show: [hidden.id], stay: 0 })
  })

  it('leaves an already hidden useless vacancy alone', () => {
    const hidden = vac({ role_category: 'ventas', skills: ['excel'], hidden_from_feed: true })
    expect(planVisibility([hidden], [ana])).toEqual({ hide: [], show: [], stay: 1 })
  })

  it('hides nothing when there are no people to score (the feed never goes empty)', () => {
    expect(planVisibility([vac({ skills: [] })], []).hide).toEqual([])
  })
})
