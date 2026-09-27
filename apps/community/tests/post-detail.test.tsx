import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailHeader } from '@/components/post-detail/DetailHeader'
import { DetailFooter } from '@/components/post-detail/DetailFooter'
import { DetailConversation } from '@/components/post-detail/DetailConversation'

const formatTime = () => 'hace 2h'

describe('DetailHeader', () => {
  const base = {
    onBack: vi.fn(),
    authorName: 'Kevin Garza',
    initials: 'KG',
    typeLabel: 'ARTÍCULO',
    time: 'hace 2h',
  }

  it('shows the author with the type and time, and goes back', () => {
    const onBack = vi.fn()
    render(<DetailHeader {...base} onBack={onBack} />)

    expect(screen.getByText('Kevin Garza')).toBeTruthy()
    expect(screen.getByText('ARTÍCULO · hace 2h')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /volver al feed/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('links to the profile when there is one, and stays static otherwise', () => {
    const withProfile = render(<DetailHeader {...base} profileHref="/users/kevin" />)
    expect(withProfile.container.querySelector('a[href="/users/kevin"]')).toBeTruthy()
    withProfile.unmount()

    const without = render(<DetailHeader {...base} />)
    expect(without.container.querySelector('.detail-identity-link.is-static')).toBeTruthy()
  })

  it('renders the primary action for a vacancy', () => {
    const onClick = vi.fn()
    render(<DetailHeader {...base} action={{ label: 'Postularse', onClick }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Postularse' }))
    expect(onClick).toHaveBeenCalled()
  })

  // "Seguir" no existe en el backend todavía: se muestra, pero apagado.
  it('renders a disabled action with its reason instead of pretending it works', () => {
    const onClick = vi.fn()
    render(
      <DetailHeader
        {...base}
        action={{ label: 'Seguir', variant: 'outline', onClick, disabledReason: 'Todavía no disponible' }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Seguir' })
    expect(button).toBeDisabled()
    expect(button.getAttribute('title')).toBe('Todavía no disponible')

    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders no action at all when there is none', () => {
    const { container } = render(<DetailHeader {...base} />)
    expect(container.querySelector('.detail-action')).toBeNull()
  })
})

describe('DetailFooter', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Una vacante no se vota: sin `votes` el botón no existe.
  it('omits the vote button when no votes are passed', () => {
    const { container } = render(
      <DetailFooter commentsCount={3} saved={false} onSave={vi.fn()} />,
    )

    expect(container.querySelectorAll('.detail-footer-action')).toHaveLength(1)
    expect(screen.getByText(/3 comentarios/)).toBeTruthy()
  })

  it('shows the vote count and toggles it', () => {
    const onVote = vi.fn()
    render(
      <DetailFooter
        votes={{ count: 12, voted: false, onVote }}
        commentsCount={0}
        saved={false}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('12'))
    expect(onVote).toHaveBeenCalled()
  })

  it('copies the link when sharing', () => {
    render(<DetailFooter commentsCount={0} saved={false} onSave={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('reports the saved state', () => {
    const { container } = render(
      <DetailFooter commentsCount={0} saved onSave={vi.fn()} />,
    )

    expect(container.querySelector('.detail-footer-icon.is-active')).toBeTruthy()
  })
})

describe('DetailConversation', () => {
  const comments = [
    {
      id: 'c1',
      content: 'Muy buen punto sobre el caché.',
      author: { display_name: 'Ana López', username: 'ana' },
      created_at: '2026-09-20T10:00:00Z',
    },
  ]

  it('lists the comments with their author and time', () => {
    render(
      <DetailConversation
        comments={comments}
        currentUserInitials="KG"
        onSubmit={vi.fn()}
        formatTime={formatTime}
      />,
    )

    expect(screen.getByText('1 comentarios')).toBeTruthy()
    expect(screen.getByText('Ana López')).toBeTruthy()
    expect(screen.getByText('Muy buen punto sobre el caché.')).toBeTruthy()
  })

  it('invites the first comment when there are none', () => {
    render(
      <DetailConversation comments={[]} currentUserInitials="KG" onSubmit={vi.fn()} formatTime={formatTime} />,
    )

    expect(screen.getByText(/sé la primera persona en comentar/i)).toBeTruthy()
  })

  it('submits a comment and clears the field', () => {
    const onSubmit = vi.fn()
    render(
      <DetailConversation comments={[]} currentUserInitials="KG" onSubmit={onSubmit} formatTime={formatTime} />,
    )

    const textarea = screen.getByLabelText(/escribe un comentario/i)
    fireEvent.change(textarea, { target: { value: '  Buen artículo  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(onSubmit).toHaveBeenCalledWith('Buen artículo')
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('does not submit an empty comment', () => {
    const onSubmit = vi.fn()
    render(
      <DetailConversation comments={[]} currentUserInitials="KG" onSubmit={onSubmit} formatTime={formatTime} />,
    )

    const button = screen.getByRole('button', { name: 'Comentar' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hides the composer for a visitor without a session', () => {
    render(
      <DetailConversation comments={comments} currentUserInitials={null} onSubmit={vi.fn()} formatTime={formatTime} />,
    )

    expect(screen.queryByLabelText(/escribe un comentario/i)).toBeNull()
    expect(screen.getByText('Ana López')).toBeTruthy()
  })
})
