import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkillExamRunner, type ExamQuestionView } from '@/components/exam/SkillExamRunner'

const Q0: ExamQuestionView = {
  position: 0,
  text: '¿Qué hook se usa para efectos secundarios?',
  options: [
    { index: 0, text: 'useState' },
    { index: 1, text: 'useEffect' },
  ],
}

const Q1: ExamQuestionView = {
  position: 1,
  text: '¿Qué prop identifica elementos de una lista?',
  options: [
    { index: 0, text: 'key' },
    { index: 1, text: 'id' },
  ],
}

function setup(overrides: Partial<Parameters<typeof SkillExamRunner>[0]> = {}) {
  const onAnswer = vi.fn()
  const onCompleted = vi.fn()
  render(
    <SkillExamRunner
      skillLabel="React"
      total={10}
      initialAnswered={0}
      initialQuestion={Q0}
      onAnswer={onAnswer}
      onCompleted={onCompleted}
      {...overrides}
    />,
  )
  return { onAnswer, onCompleted }
}

describe('SkillExamRunner', () => {
  it('shows one question at a time with its options', () => {
    setup()
    expect(screen.getByText(Q0.text)).toBeInTheDocument()
    expect(screen.getByText('useEffect')).toBeInTheDocument()
    expect(screen.queryByText(Q1.text)).not.toBeInTheDocument()
    expect(screen.getByText('Pregunta 1 de 10')).toBeInTheDocument()
  })

  it('refuses to submit without a selection', async () => {
    const user = userEvent.setup()
    const { onAnswer } = setup()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Selecciona una respuesta para continuar')).toBeInTheDocument()
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('sends the selected option and advances to the next question', async () => {
    const user = userEvent.setup()
    const { onAnswer } = setup()
    onAnswer.mockResolvedValue({ completed: false, answered: 1, total: 10, question: Q1 })

    await user.click(screen.getByLabelText('useEffect'))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(0, 1))
    expect(await screen.findByText(Q1.text)).toBeInTheDocument()
    expect(screen.getByText('Pregunta 2 de 10')).toBeInTheDocument()
  })

  // FR-006: una respuesta enviada es definitiva.
  it('offers no way back to the previous question', async () => {
    const user = userEvent.setup()
    const { onAnswer } = setup()
    onAnswer.mockResolvedValue({ completed: false, answered: 1, total: 10, question: Q1 })

    await user.click(screen.getByLabelText('useEffect'))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText(Q1.text)
    expect(screen.queryByRole('button', { name: /anterior|atrás|regresar|volver/i })).not.toBeInTheDocument()
    expect(screen.queryByText(Q0.text)).not.toBeInTheDocument()
  })

  it('clears the selection between questions so nothing is preselected', async () => {
    const user = userEvent.setup()
    const { onAnswer } = setup()
    onAnswer.mockResolvedValue({ completed: false, answered: 1, total: 10, question: Q1 })

    await user.click(screen.getByLabelText('useEffect'))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText(Q1.text)
    expect(screen.getByLabelText('key')).not.toBeChecked()
    expect(screen.getByLabelText('id')).not.toBeChecked()
  })

  it('labels the last question as the end of the exam', () => {
    setup({ initialAnswered: 9, total: 10 })
    expect(screen.getByRole('button', { name: 'Terminar examen' })).toBeInTheDocument()
  })

  it('hands the result to onCompleted when the exam closes', async () => {
    const user = userEvent.setup()
    const { onAnswer, onCompleted } = setup({ initialAnswered: 9 })
    const result = {
      completed: true as const,
      level: 'intermedio',
      correctCount: 8,
      total: 10,
      profileLevel: 'intermedio',
      improved: true,
      retryAvailableAt: '2026-10-13T00:00:00Z',
    }
    onAnswer.mockResolvedValue(result)

    await user.click(screen.getByLabelText('useEffect'))
    await user.click(screen.getByRole('button', { name: 'Terminar examen' }))

    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(result))
  })

  it('surfaces a server error without losing the question', async () => {
    const user = userEvent.setup()
    const { onAnswer } = setup()
    onAnswer.mockResolvedValue({ error: 'Ocurrió un error, intenta de nuevo' })

    await user.click(screen.getByLabelText('useEffect'))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Ocurrió un error, intenta de nuevo')).toBeInTheDocument()
    expect(screen.getByText(Q0.text)).toBeInTheDocument()
  })
})
