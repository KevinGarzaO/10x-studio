import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkillEligibilityList, type SkillEligibility } from '@/components/exam/SkillEligibilityList'

function skill(overrides: Partial<SkillEligibility> = {}): SkillEligibility {
  return {
    skillName: 'react',
    label: 'React',
    validatedLevel: null,
    achievedAt: null,
    canStart: true,
    reason: null,
    retryAvailableAt: null,
    ...overrides,
  }
}

describe('SkillEligibilityList', () => {
  it('offers the exam for an eligible skill', () => {
    render(<SkillEligibilityList skills={[skill()]} />)

    const link = screen.getByRole('link', { name: 'Presentar examen' })
    expect(link).toHaveAttribute('href', '/examenes/react')
    expect(screen.getByText('Sin validar')).toBeInTheDocument()
  })

  // FR-003: sin esto el candidato quema su unico intento en un examen imposible.
  it('shows a skill with too small a bank as unavailable and offers no exam', () => {
    render(<SkillEligibilityList skills={[skill({ canStart: false, reason: 'insufficient_bank' })]} />)

    expect(screen.getByText('Aún no disponible')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /examen/i })).not.toBeInTheDocument()
  })

  it('shows the retry date for a skill inside the waiting period', () => {
    render(
      <SkillEligibilityList
        skills={[
          skill({
            canStart: false,
            reason: 'waiting_period',
            validatedLevel: 'intermedio',
            retryAvailableAt: '2026-10-13T00:00:00Z',
          }),
        ]}
      />,
    )

    expect(screen.getByText(/Disponible el/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /examen/i })).not.toBeInTheDocument()
  })

  it('shows the validated level and offers to improve it', () => {
    render(<SkillEligibilityList skills={[skill({ validatedLevel: 'basico' })]} />)

    expect(screen.getByText('Básico')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mejorar nivel' })).toBeInTheDocument()
  })

  it('explains an exam already in progress', () => {
    render(<SkillEligibilityList skills={[skill({ canStart: false, reason: 'exam_in_progress' })]} />)
    expect(screen.getByText('Tienes otro examen en curso')).toBeInTheDocument()
  })

  it('points a candidate with no skills at their settings', () => {
    render(<SkillEligibilityList skills={[]} />)
    expect(screen.getByRole('link', { name: 'tu configuración' })).toHaveAttribute('href', '/settings')
  })
})
