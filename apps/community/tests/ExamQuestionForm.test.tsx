import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExamQuestionForm } from '@/components/admin/ExamQuestionForm'

function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  return async () => {
    await user.type(screen.getByLabelText('Pregunta'), 'Pregunta suficientemente larga')
    await user.tab()
    await user.type(screen.getByLabelText('Opción 1'), 'useEffect')
    await user.type(screen.getByLabelText('Opción 2'), 'useState')
    await user.click(screen.getByLabelText('Marcar opción 1 como correcta'))
  }
}

describe('ExamQuestionForm', () => {
  it('shows "La pregunta es obligatoria" on blur when empty, without calling onSubmit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ExamQuestionForm onSubmit={onSubmit} />)

    await user.click(screen.getByLabelText('Pregunta'))
    await user.tab()

    expect(await screen.findByText('La pregunta es obligatoria')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables submit with fewer than 2 filled options and shows the message', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ExamQuestionForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Pregunta'), 'Pregunta suficientemente larga')
    await user.type(screen.getByLabelText('Opción 1'), 'useEffect')
    // Opción 2 stays blank, so only 1 option is actually filled in.

    expect(screen.getByText('Se requieren al menos 2 opciones')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar pregunta' })).toBeDisabled()
  })

  it('blocks submit with "Selecciona la respuesta correcta" when nothing is marked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ExamQuestionForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Pregunta'), 'Pregunta suficientemente larga')
    await user.type(screen.getByLabelText('Opción 1'), 'useEffect')
    await user.type(screen.getByLabelText('Opción 2'), 'useState')
    await user.click(screen.getByRole('button', { name: 'Guardar pregunta' }))

    expect(await screen.findByText('Selecciona la respuesta correcta')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks submit with "Las opciones no pueden repetirse" for case-insensitive duplicates', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ExamQuestionForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Pregunta'), 'Pregunta suficientemente larga')
    await user.type(screen.getByLabelText('Opción 1'), 'Sí')
    await user.type(screen.getByLabelText('Opción 2'), 'sí')
    await user.click(screen.getByLabelText('Marcar opción 1 como correcta'))
    await user.click(screen.getByRole('button', { name: 'Guardar pregunta' }))

    expect(await screen.findByText('Las opciones no pueden repetirse')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the exact payload and clears the form on success', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue({ ok: true })
    render(<ExamQuestionForm onSubmit={onSubmit} />)

    await fillValidForm(user)()
    await user.click(screen.getByRole('button', { name: 'Guardar pregunta' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Pregunta suficientemente larga',
        options: ['useEffect', 'useState'],
        correctAnswerIndex: 0,
        difficultyLevel: 'basico',
      }),
    )
    expect(await screen.findByText('Pregunta guardada correctamente.')).toBeInTheDocument()
    expect(screen.getByLabelText('Pregunta')).toHaveValue('')
  })

  it('keeps captured data and shows a generic message when onSubmit reports a server failure', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, field: null, message: 'Ocurrió un error, intenta de nuevo' })
    render(<ExamQuestionForm onSubmit={onSubmit} />)

    await fillValidForm(user)()
    await user.click(screen.getByRole('button', { name: 'Guardar pregunta' }))

    expect(await screen.findByText('Ocurrió un error, intenta de nuevo')).toBeInTheDocument()
    expect(screen.getByLabelText('Pregunta')).toHaveValue('Pregunta suficientemente larga')
  })
})
