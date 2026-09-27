import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SkillProposalsList, type SkillProposal } from '@/components/skill-proposals-list'

const pending: SkillProposal = {
  id: '1',
  text: 'Rust',
  status: 'pending',
  skill: null,
  rejectionReason: null,
}

describe('SkillProposalsList (T030)', () => {
  it('renders nothing when there are no proposals', () => {
    const { container } = render(<SkillProposalsList proposals={[]} />)
    expect(container.textContent).toBe('')
  })

  it('shows a pending proposal as under review', () => {
    render(<SkillProposalsList proposals={[pending]} />)

    expect(screen.getByText('Rust')).toBeTruthy()
    expect(screen.getByText(/en revisión/i)).toBeTruthy()
  })

  // FR-018: el candidato ve el motivo del rechazo, no solo que fue rechazado.
  it('shows the rejection reason', () => {
    render(
      <SkillProposalsList
        proposals={[
          { ...pending, status: 'rejected', rejectionReason: 'Ya existe como Node.js' },
        ]}
      />,
    )

    expect(screen.getByText(/no aprobado: Ya existe como Node.js/i)).toBeTruthy()
  })

  it('offers to add the skill once the proposal is approved', () => {
    const onAddSkill = vi.fn()
    render(
      <SkillProposalsList
        proposals={[{ ...pending, status: 'approved', skill: { name: 'rust', label: 'Rust' } }]}
        onAddSkill={onAddSkill}
      />,
    )

    expect(screen.getByText(/aprobado como Rust/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /agregarlo/i }))
    expect(onAddSkill).toHaveBeenCalledWith('rust')
  })

  it('explains a merged proposal points at an existing skill', () => {
    const onAddSkill = vi.fn()
    render(
      <SkillProposalsList
        proposals={[{ ...pending, text: 'nodejs', status: 'merged', skill: { name: 'nodejs', label: 'Node.js' } }]}
        onAddSkill={onAddSkill}
      />,
    )

    expect(screen.getByText(/ya existía como Node.js/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /agregarlo/i }))
    expect(onAddSkill).toHaveBeenCalledWith('nodejs')
  })
})
