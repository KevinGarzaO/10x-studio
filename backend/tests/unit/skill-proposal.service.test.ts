import { describe, it, expect } from 'vitest'
import { decideProposalOutcome } from '../../src/services/skill-proposal.service'

const base = {
  approvedSkillName: null,
  existing: null,
  pendingCount: 0,
  maxPending: 5,
}

const pending = {
  id: 'proposal-1',
  status: 'pending' as const,
  resulting_skill_name: null,
  rejection_reason: null,
}

describe('decideProposalOutcome (T028)', () => {
  it('resolves to the approved skill when the text already is one', () => {
    expect(decideProposalOutcome({ ...base, approvedSkillName: 'react' })).toEqual({
      kind: 'resolve',
      skillName: 'react',
    })
  })

  // Un skill aprobado gana sobre cualquier propuesta con la misma clave: si no,
  // un skill ya vigente quedaría bloqueado por una propuesta vieja.
  it('prefers the approved skill over an existing proposal', () => {
    expect(
      decideProposalOutcome({
        ...base,
        approvedSkillName: 'react',
        existing: { ...pending, status: 'rejected', rejection_reason: 'No' },
      }),
    ).toEqual({ kind: 'resolve', skillName: 'react' })
  })

  it('joins an existing pending proposal (FR-017)', () => {
    expect(decideProposalOutcome({ ...base, existing: pending })).toEqual({
      kind: 'join',
      proposalId: 'proposal-1',
    })
  })

  it('reports a rejected proposal with its reason instead of creating another', () => {
    expect(
      decideProposalOutcome({
        ...base,
        existing: { ...pending, status: 'rejected', rejection_reason: 'No es un skill' },
      }),
    ).toEqual({ kind: 'reject', reason: 'No es un skill' })
  })

  it('falls back to a generic reason when a rejected proposal has none', () => {
    const decision = decideProposalOutcome({
      ...base,
      existing: { ...pending, status: 'rejected', rejection_reason: null },
    })

    expect(decision).toEqual({ kind: 'reject', reason: 'No fue aprobado' })
  })

  it.each([['approved'], ['merged']] as const)(
    'resolves to the resulting skill of a %s proposal',
    (status) => {
      expect(
        decideProposalOutcome({
          ...base,
          existing: { ...pending, status, resulting_skill_name: 'rust' },
        }),
      ).toEqual({ kind: 'resolve', skillName: 'rust' })
    },
  )

  it('creates a proposal when nothing matches and there is room', () => {
    expect(decideProposalOutcome({ ...base, pendingCount: 4 })).toEqual({ kind: 'create' })
  })

  it('stops at the pending limit (FR-019)', () => {
    expect(decideProposalOutcome({ ...base, pendingCount: 5 })).toEqual({ kind: 'limit' })
  })

  // El límite es para crear, no para sumarse: sumarse no agrega trabajo de
  // revisión al superadmin.
  it('lets someone at the limit still join an existing proposal', () => {
    expect(decideProposalOutcome({ ...base, existing: pending, pendingCount: 99 })).toEqual({
      kind: 'join',
      proposalId: 'proposal-1',
    })
  })
})
