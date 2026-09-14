import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkillExamResult } from '@/components/exam/SkillExamResult'
import type { ExamCompletedResult } from '@/components/exam/SkillExamRunner'

const base: ExamCompletedResult = {
  completed: true,
  level: 'intermedio',
  correctCount: 8,
  total: 10,
  profileLevel: 'intermedio',
  improved: true,
  retryAvailableAt: '2026-10-13T00:00:00Z',
}

describe('SkillExamResult', () => {
  it('shows the level reached and the score', () => {
    render(<SkillExamResult skillLabel="React" result={base} />)
    expect(screen.getByText('Intermedio')).toBeInTheDocument()
    expect(screen.getByText('8 de 10 respuestas correctas')).toBeInTheDocument()
  })

  it('confirms the level is live on the profile when it improved', () => {
    render(<SkillExamResult skillLabel="React" result={base} />)
    expect(screen.getByText('Este nivel ya es visible en tu perfil.')).toBeInTheDocument()
  })

  // FR-021: sin este mensaje el candidato cree que bajó de nivel.
  it('explains the profile keeps the better previous level when the retry was worse', () => {
    render(
      <SkillExamResult
        skillLabel="React"
        result={{ ...base, level: 'basico', correctCount: 5, profileLevel: 'avanzado', improved: false }}
      />,
    )

    expect(screen.getByText('Básico')).toBeInTheDocument()
    expect(screen.getByText(/conserva el nivel/)).toBeInTheDocument()
    expect(screen.getByText('Avanzado')).toBeInTheDocument()
    expect(screen.queryByText('Este nivel ya es visible en tu perfil.')).not.toBeInTheDocument()
  })

  it('tells the candidate when they can retry', () => {
    render(<SkillExamResult skillLabel="React" result={base} />)
    expect(screen.getByText(/Podrás volver a presentar este examen a partir del/)).toBeInTheDocument()
  })

  it('omits the retry line when there is no date', () => {
    render(<SkillExamResult skillLabel="React" result={{ ...base, retryAvailableAt: null }} />)
    expect(screen.queryByText(/Podrás volver a presentar/)).not.toBeInTheDocument()
  })
})
