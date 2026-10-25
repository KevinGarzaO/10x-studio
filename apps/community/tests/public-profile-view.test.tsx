import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicProfileView, type PublicProfile } from '@/components/public-profile-view'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

const base: PublicProfile = {
  id: 'u1',
  username: 'kevin',
  display_name: 'Kevin Garza',
  bio: null,
  photo_url: null,
  website: null,
  github_url: null,
  created_at: '2026-01-01T00:00:00Z',
  title: 'Desarrollador Senior',
  seniority: 'senior',
  skills: ['react', 'azure'],
  location: 'Monterrey',
  work_modality: 'Híbrido',
  skillLevels: [],
  community_posts: [],
}

function renderProfile(overrides: Partial<PublicProfile> = {}) {
  return render(<PublicProfileView profile={{ ...base, ...overrides }} isOwnProfile={false} />)
}

describe('PublicProfileView skill levels', () => {
  // Los validados son la señal que las empresas vienen a ver: van en su propia
  // sección, separados de los que el candidato solo declaró.
  it('separates a validated skill from a merely declared one', () => {
    const { container } = renderProfile({
      skillLevels: [{ skillName: 'react', level: 'intermedio', achievedAt: '2026-09-01T00:00:00Z' }],
    })

    const badge = container.querySelector('.skill-badge')
    expect(badge?.textContent).toContain('react')
    expect(screen.getByText('Intermedio')).toBeInTheDocument()

    // El que no está validado queda como chip simple, fuera de esa sección.
    const plain = screen.getByText('azure').closest('span')
    expect(plain?.className).toContain('skill-chip-plain')
    expect(container.querySelectorAll('.skill-badge')).toHaveLength(1)
  })

  it.each([
    ['basico', 'Básico'],
    ['intermedio', 'Intermedio'],
    ['avanzado', 'Avanzado'],
  ])('gives %s its own colour class', (level, label) => {
    const { container } = renderProfile({
      skillLevels: [{ skillName: 'react', level, achievedAt: '2026-09-01T00:00:00Z' }],
    })

    const badge = container.querySelector('.skill-badge')
    expect(badge?.className).toContain(`is-${level}`)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('shows no validated section when nothing is validated', () => {
    const { container } = renderProfile({ skillLevels: [] })

    expect(container.querySelector('.skill-badge')).toBeNull()
    expect(screen.queryByText(/skills validados/i)).not.toBeInTheDocument()
    expect(screen.getByText('react').closest('span')?.className).toContain('skill-chip-plain')
  })

  // El backend ya filtra, pero el render no debe depender de ello: parte de
  // profile.skills y cruza contra skillLevels, no al revés.
  it('ignores a level for a skill the candidate no longer declares', () => {
    renderProfile({
      skills: ['react'],
      skillLevels: [
        { skillName: 'react', level: 'basico', achievedAt: '2026-09-01T00:00:00Z' },
        { skillName: 'python', level: 'avanzado', achievedAt: '2026-09-01T00:00:00Z' },
      ],
    })

    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.queryByText('python')).not.toBeInTheDocument()
    expect(screen.queryByText('Avanzado')).not.toBeInTheDocument()
  })

  it('survives a profile with no skillLevels field at all', () => {
    renderProfile({ skillLevels: undefined })
    expect(screen.getByText('react')).toBeInTheDocument()
  })
})

describe('PublicProfileView actions', () => {
  // Seguir y mensajería no existen: no se muestran botones apagados que no hacen nada.
  it('shows no follow or message buttons, not even disabled', () => {
    renderProfile()

    expect(screen.queryByRole('button', { name: 'Seguir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mensaje' })).not.toBeInTheDocument()
  })

  it('lets you share the profile of someone else', () => {
    renderProfile()
    expect(screen.getByRole('button', { name: /compartir/i })).toBeEnabled()
  })

  it('offers editing instead of sharing on your own profile', () => {
    render(<PublicProfileView profile={base} isOwnProfile />)

    expect(screen.getByRole('link', { name: /editar perfil/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /compartir/i })).not.toBeInTheDocument()
  })
})

describe('PublicProfileView content', () => {
  it('shows what matters for a vacancy: level, place and modality', () => {
    renderProfile()

    expect(screen.getByText('Senior')).toBeInTheDocument()
    expect(screen.getByText('Monterrey')).toBeInTheDocument()
    expect(screen.getByText('Híbrido')).toBeInTheDocument()
  })

  it('counts the skills and how many are validated', () => {
    renderProfile({ skillLevels: [{ skillName: 'react', level: 'basico', achievedAt: '2026-09-01T00:00:00Z' }] })
    expect(screen.getByText('2 skills · 1 validado')).toBeInTheDocument()
  })

  it('no longer shows the empty 0 / 0 / 0 counters', () => {
    renderProfile()

    expect(screen.queryByText('votos recibidos')).not.toBeInTheDocument()
    expect(screen.queryByText(/todavía no ha publicado/i)).not.toBeInTheDocument()
  })

  it('shows the publications section only when there are publications', () => {
    const post = {
      id: 'p1', type: 'discussion', title: 'Hola', content: 'x', tags: [], votesCount: 0, commentsCount: 0, votes_count: 0,
      comments_count: 0, created_at: '2026-10-01T00:00:00Z', author: { id: 'u1', username: 'kevin', display_name: 'Kevin', photo_url: null },
    }
    const { rerender } = renderProfile()
    expect(screen.queryByRole('heading', { name: 'Publicaciones' })).not.toBeInTheDocument()

    rerender(<PublicProfileView profile={{ ...base, community_posts: [post as never] }} isOwnProfile={false} />)
    expect(screen.getByRole('heading', { name: 'Publicaciones' })).toBeInTheDocument()
  })
})
