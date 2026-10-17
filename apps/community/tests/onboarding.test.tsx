import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingPage } from '@/components/onboarding'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'

const CATALOG = {
  skills: [
    { name: 'react', label: 'React' },
    { name: 'nodejs', label: 'Node.js' },
  ],
  aliases: [],
}

// Un candidato que ya capturó todo: volver a onboarding no debe pedirle nada de
// nuevo (FR-026).
const EXISTING_USER = {
  username: 'kevin',
  photo_url: 'https://example.com/foto.png',
  title: 'Backend Developer',
  role_category: 'backend',
  seniority: 'senior',
  skills: ['react'],
  location: 'Monterrey, MX',
  work_modality: 'Remoto',
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/session', () => ({
  getToken: () => 'token',
  captureSessionFromUrl: () => false,
  fetchCurrentUser: vi.fn(async () => EXISTING_USER),
}))

beforeEach(() => {
  resetSkillCatalogCache()
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/community/skills')) {
      return Promise.resolve({ ok: true, json: async () => CATALOG })
    }
    // Propuestas del usuario: ninguna.
    return Promise.resolve({ ok: true, json: async () => ({ proposals: [] }) })
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OnboardingPage (T042)', () => {
  it('preloads every field the account already has, not just the photo', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)

    // Paso 1: el título capturado y la foto existente se muestran sin pedirlas.
    await waitFor(() => {
      expect(screen.getByLabelText(/título profesional/i)).toHaveValue('Backend Developer')
    })
    const photo = document.querySelector('img')
    expect(photo?.getAttribute('src')).toBe('https://example.com/foto.png')

    // Paso 2: la categoría, el nivel y la modalidad quedan seleccionados.
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByLabelText(/categoría de rol/i)).toHaveValue('backend')
    expect(screen.getByRole('button', { name: 'Senior' }).className).toContain('active')
    expect(screen.getByRole('button', { name: 'Remoto' }).className).toContain('active')

    // Paso 3: el skill ya declarado sigue como chip y la ubicación capturada.
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('React')).toBeTruthy()
    expect(screen.getByLabelText(/ubicación/i)).toHaveValue('Monterrey, MX')
    expect(screen.queryByText(/fuera del catálogo/i)).toBeNull()
  })
})
