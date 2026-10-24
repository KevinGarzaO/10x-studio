import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostCard, type FeedPost } from '@/components/community-hub'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/shell-context', () => ({
  useShell: () => ({ user: { username: 'kevin' }, requestAuth: vi.fn() }),
}))

const base: FeedPost = {
  id: 'p1',
  title: 'Título del post',
  content: 'Cuerpo del post con suficiente texto para el extracto.',
  type: 'discussion',
  author: { id: 'u1', username: 'kevin', display_name: 'Kevin Garza', photo_url: null },
  tags: [],
  votesCount: 12,
  commentsCount: 4,
  image_url: null,
  slug: 'titulo-del-post',
  word_count: 400,
  created_at: new Date().toISOString(),
}

const jobContent = [
  '**Empresa:** Stripe',
  '**Rol:** Backend Engineer',
  '**Ubicación:** Remoto',
  '**Presupuesto:** $8,000 USD',
  '**Modalidad:** Remoto',
  '### Descripción',
  'Construir la plataforma de pagos.',
  '### Beneficios',
  '- Seguro de gastos médicos',
  '- Presupuesto de equipo',
].join('\n')

const job: FeedPost = {
  ...base,
  id: 'j1',
  type: 'job',
  title: 'Backend Engineer',
  content: jobContent,
  company: 'Stripe',
  modalidad: 'Remoto',
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PostCard (rediseño del feed)', () => {
  it('shows the post type as a badge next to the author', () => {
    render(<PostCard post={base} />)

    const badge = screen.getByText('DISCUSIÓN')
    expect(badge.className).toContain('post-type-badge')
  })

  // El texto del tipo sale dos veces en estas tarjetas (badge y etiqueta del
  // placeholder), así que se consulta el badge por su clase.
  it('tints the badge differently for showcase and article', () => {
    const showcase = render(<PostCard post={{ ...base, type: 'showcase' }} />)
    const showcaseBadge = showcase.container.querySelector('.post-type-badge')
    expect(showcaseBadge?.textContent).toBe('SHOWCASE')
    expect(showcaseBadge?.className).toContain('is-showcase')
    showcase.unmount()

    const article = render(<PostCard post={{ ...base, type: 'editorial' }} />)
    const articleBadge = article.container.querySelector('.post-type-badge')
    expect(articleBadge?.textContent).toBe('ARTÍCULO')
    expect(articleBadge?.className).toContain('is-article')
  })

  // El diseño pide un placeholder rayado mientras el post no tiene imagen real.
  it('renders an image placeholder for an article without an image', () => {
    const { container } = render(<PostCard post={{ ...base, type: 'editorial' }} />)

    const media = container.querySelector('.post-media.is-placeholder')
    expect(media).toBeTruthy()
  })

  it('renders the real image when the post has one, without the placeholder', () => {
    const { container } = render(
      <PostCard post={{ ...base, type: 'editorial', image_url: 'https://example.com/a.png' }} />,
    )

    expect(container.querySelector('.post-media.is-placeholder')).toBeNull()
    expect(container.querySelector('.post-media img')?.getAttribute('src')).toBe(
      'https://example.com/a.png',
    )
  })

  it('does not put a placeholder on a plain discussion', () => {
    const { container } = render(<PostCard post={base} />)
    expect(container.querySelector('.post-media')).toBeNull()
  })

  it('shows a vacancy in one line of key facts: who, where, modality and salary', () => {
    const { container } = render(<PostCard post={job} />)

    expect(screen.getByText('VACANTE').className).toContain('post-type-badge')
    expect(container.querySelector('.jc-company-name')?.textContent).toBe('Stripe')
    const facts = container.querySelector('.jc-facts')?.textContent ?? ''
    expect(facts).toContain('Remoto')
    expect(facts).toContain('$8,000 USD')
    expect(container.querySelector('.jc-salary')).toBeTruthy()
  })

  it('keeps the card short: no benefits list or description, those live in the detail', () => {
    const { container } = render(<PostCard post={job} />)

    expect(container.querySelector('.job-perk')).toBeNull()
    expect(container.querySelector('.post-excerpt')).toBeNull()
  })

  it('has at most one action: apply, or unlock the contact when there is no session', () => {
    const { container } = render(<PostCard post={job} />)
    expect(container.querySelectorAll('.jc-cta').length).toBeLessThanOrEqual(1)
  })

  // Los votos no aplican a una vacante: el diseño quita ese botón de la tarjeta.
  it('has no vote button on a vacancy, but keeps it on a discussion', () => {
    const { container, unmount } = render(<PostCard post={job} />)
    expect(container.querySelector('.vote-button')).toBeNull()
    unmount()

    const plain = render(<PostCard post={base} />)
    expect(plain.container.querySelector('.vote-button')).toBeTruthy()
  })

  it('shows the seniority level in the chip once the data exists', () => {
    const { container } = render(<PostCard post={{ ...job, seniority_level: 'senior' }} />)

    expect(container.querySelector('.jc-facts')?.textContent).toContain('senior')
  })
})
