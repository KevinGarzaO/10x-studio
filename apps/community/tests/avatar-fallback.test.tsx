import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfileMenu } from '@/components/community-hub'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

describe('a person\'s avatar', () => {
  const user = { display_name: 'Joede Fadel', username: 'joede', photo_url: 'https://media.licdn.com/expired.jpg' }

  it('shows the photo while it loads', () => {
    const { container } = render(<ProfileMenu user={user} />)
    expect(container.querySelector('img.avatar-photo')?.getAttribute('src')).toBe(user.photo_url)
  })

  it('falls back to the initials when the photo does not load, instead of leaving a blank', () => {
    const { container } = render(<ProfileMenu user={user} />)

    fireEvent.error(container.querySelector('img.avatar-photo')!)

    expect(container.querySelector('img.avatar-photo')).toBeNull()
    expect(screen.getByText('JO')).toBeTruthy()
  })

  it('shows the initials when there is no photo', () => {
    render(<ProfileMenu user={{ ...user, photo_url: null }} />)
    expect(screen.getByText('JO')).toBeTruthy()
  })
})
