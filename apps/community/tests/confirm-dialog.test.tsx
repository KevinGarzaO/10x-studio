import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '@/components/confirm-dialog'

const setup = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<ConfirmDialog title="¿Eliminar esta publicación?" message="No se puede deshacer." confirmLabel="Eliminar" onConfirm={onConfirm} onCancel={onCancel} {...props} />)
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('is an accessible dialog with the question and both answers', () => {
    setup()

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAccessibleName('¿Eliminar esta publicación?')
    expect(dialog).toHaveAccessibleDescription('No se puede deshacer.')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('starts on "Cancelar", so a stray Enter does not delete anything', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('closes when you click outside', () => {
    const { onCancel } = setup()
    fireEvent.mouseDown(document.querySelector('.modal-backdrop')!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('cannot be closed while it is working, and says what it is doing', () => {
    const { onCancel } = setup({ busy: true, busyLabel: 'Eliminando…' })

    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows the warning icon only for dangerous actions', () => {
    setup({ danger: true })
    expect(document.querySelector('.confirm-icon')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveClass('is-danger')
  })
})
