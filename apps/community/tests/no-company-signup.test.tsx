import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingPage } from '@/components/onboarding'
import { AuthPage } from '@/components/account-pages'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'

// Por ahora AvoTalent solo ofrece algo a las personas: no hay alta de empresas.
const NEW_USER = { username: 'kevin', photo_url: null, skills: [] }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/signup',
}))

vi.mock('@/lib/session', () => ({
  getToken: () => 'token',
  captureSessionFromUrl: () => false,
  getCachedUser: () => null,
  fetchCurrentUser: vi.fn(async () => NEW_USER),
  saveSession: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  resetSkillCatalogCache()
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/community/skills')) return Promise.resolve({ ok: true, json: async () => ({ skills: [], aliases: [] }) })
    return Promise.resolve({ ok: true, json: async () => ({ proposals: [] }) })
  }) as unknown as typeof fetch
})

describe('signup without companies', () => {
  it('does not ask whether you represent a company', () => {
    render(<AuthPage mode="signup" />)

    expect(screen.queryByText(/represento una empresa/i)).toBeNull()
    expect(screen.queryByText(/cómo vas a usar avotalent/i)).toBeNull()
  })

  it('onboarding goes straight to the candidate profile, whatever was stored before', async () => {
    localStorage.setItem('avocado_signup_intent', 'company')
    render(<OnboardingPage />)

    expect(await screen.findByText('Completa tu perfil')).toBeInTheDocument()
    expect(screen.queryByText('Verifica tu empresa')).toBeNull()
    expect(screen.queryByText(/represento a una empresa/i)).toBeNull()
  })

  it('never asks the new account what kind it is', async () => {
    render(<OnboardingPage />)

    expect(await screen.findByText('Completa tu perfil')).toBeInTheDocument()
    expect(screen.queryByText('¿Cómo vas a usar AvoTalent?')).toBeNull()
  })

  it('does not call the company claim service', async () => {
    render(<OnboardingPage />)
    await screen.findByText('Completa tu perfil')

    const urls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(call => String(call[0]))
    expect(urls.some(url => url.includes('company-claims'))).toBe(false)
  })
})
