import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingPage } from '@/components/onboarding'
import { SIGNUP_INTENT_KEY } from '@/lib/company-claim'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'

// Cuenta nueva: sin perfil capturado, así que onboarding sí tiene algo que pedir.
const NEW_USER = { username: 'kevin', photo_url: null, skills: [] }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/session', () => ({
  getToken: () => 'token',
  captureSessionFromUrl: () => false,
  fetchCurrentUser: vi.fn(async () => NEW_USER),
}))

beforeEach(() => {
  localStorage.clear()
  resetSkillCatalogCache()
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/community/skills')) {
      return Promise.resolve({ ok: true, json: async () => ({ skills: [], aliases: [] }) })
    }
    if (String(url).includes('company-claims/mine')) {
      return Promise.resolve({ ok: true, json: async () => ({ claim: null }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ proposals: [] }) })
  }) as unknown as typeof fetch
})

describe('OnboardingPage: candidato o empresa', () => {
  it('con la intención de empresa pide los documentos, no las skills', async () => {
    localStorage.setItem(SIGNUP_INTENT_KEY, 'company')
    render(<OnboardingPage />)

    expect(await screen.findByText('Verifica tu empresa')).toBeInTheDocument()
    expect(screen.getByLabelText('RFC')).toBeInTheDocument()
    expect(screen.queryByText('Completa tu perfil')).toBeNull()
  })

  it('con la intención de candidato va directo al perfil', async () => {
    localStorage.setItem(SIGNUP_INTENT_KEY, 'candidate')
    render(<OnboardingPage />)

    expect(await screen.findByText('Completa tu perfil')).toBeInTheDocument()
    expect(screen.queryByLabelText('RFC')).toBeNull()
  })

  it('sin intención guardada pregunta primero cómo se usará la cuenta', async () => {
    render(<OnboardingPage />)

    expect(await screen.findByText('¿Cómo vas a usar AvoTalent?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Represento a una empresa/ }))
    expect(await screen.findByText('Verifica tu empresa')).toBeInTheDocument()
  })

  it('quien ya mandó una solicitud ve su estado aunque no haya elegido nada', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('company-claims/mine')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            claim: {
              id: 'c1',
              companyName: 'Acme SA de CV',
              status: 'pending',
              rejectionReason: null,
              documents: [],
            },
          }),
        })
      }
      if (String(url).includes('/api/community/skills')) {
        return Promise.resolve({ ok: true, json: async () => ({ skills: [], aliases: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ proposals: [] }) })
    }) as unknown as typeof fetch

    render(<OnboardingPage />)

    await waitFor(() => expect(screen.getByText(/en revisión/)).toBeInTheDocument())
  })

  it('deja volver a candidato desde el alta de empresa', async () => {
    localStorage.setItem(SIGNUP_INTENT_KEY, 'company')
    render(<OnboardingPage />)

    await screen.findByText('Verifica tu empresa')
    await userEvent.click(screen.getByRole('button', { name: /En realidad busco trabajo/ }))
    expect(await screen.findByText('Completa tu perfil')).toBeInTheDocument()
  })
})
