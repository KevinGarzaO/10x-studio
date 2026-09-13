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
  render(<PublicProfileView profile={{ ...base, ...overrides }} isOwnProfile={false} />)
}

describe('PublicProfileView skill levels', () => {
  it('renders a validated skill differently from a declared one', () => {
    renderProfile({
      skillLevels: [{ skillName: 'react', level: 'intermedio', achievedAt: '2026-09-01T00:00:00Z' }],
    })

    const validated = screen.getByText('react').closest('span')
    const plain = screen.getByText('azure').closest('span')

    expect(validated?.className).toContain('is-validated')
    expect(plain?.className).not.toContain('is-validated')
    expect(screen.getByText('Intermedio')).toBeInTheDocument()
  })

  it('shows no level badge when nothing is validated', () => {
    renderProfile({ skillLevels: [] })
    expect(screen.queryByText('Intermedio')).not.toBeInTheDocument()
    expect(screen.getByText('react').closest('span')?.className).not.toContain('is-validated')
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
