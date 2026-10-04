import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    render(<OnboardingPage />)

    // La ubicación vuelve a aparecer capturada.
    await waitFor(() => {
      expect(screen.getByLabelText(/ubicación/i)).toHaveValue('Monterrey, MX')
    })

    // El puesto se elige de un listado (ya no hay un título escrito aparte), y el
    // nivel y la modalidad quedan seleccionados.
    expect(screen.queryByLabelText(/título profesional/i)).toBeNull()
    expect(screen.getByLabelText(/puesto/i)).toHaveValue('backend')
    expect(screen.getByRole('button', { name: 'Senior' }).className).toContain('active')
    expect(screen.getByRole('button', { name: 'Remoto' }).className).toContain('active')

    // Y el skill ya declarado sigue como chip, con su etiqueta del catálogo.
    expect(await screen.findByText('React')).toBeTruthy()
    expect(screen.queryByText(/fuera del catálogo/i)).toBeNull()

    // La foto existente se muestra, sin pedir volver a subirla.
    const photo = document.querySelector('img')
    expect(photo?.getAttribute('src')).toBe('https://example.com/foto.png')
  })
})
