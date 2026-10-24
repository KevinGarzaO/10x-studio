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

const mocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(async () => null as unknown),
}))

vi.mock('next/navigation', () => {
  // Router estable: si cada render devuelve un objeto nuevo, el efecto de
  // precarga se re-dispara y regresa el asistente al paso inicial.
  const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }
  return { useRouter: () => router }
})

vi.mock('@/lib/session', () => ({
  getToken: () => 'token',
  captureSessionFromUrl: () => false,
  fetchCurrentUser: () => mocks.fetchCurrentUser(),
}))

beforeEach(() => {
  mocks.fetchCurrentUser.mockResolvedValue(EXISTING_USER)
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
  it('preloads every field the account already has and skips the photo step', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)

    // La cuenta ya trae foto (la subió antes o vino de la red social): el
    // formulario arranca directo en el puesto y solo tiene 2 pasos.
    await waitFor(() => {
      const photo = document.querySelector('img:not(.brand-mark)')
      expect(photo?.getAttribute('src')).toBe('https://example.com/foto.png')
    })
    expect(screen.getByText('Paso 1 de 2')).toBeTruthy()
    expect(screen.queryByLabelText(/título profesional/i)).toBeNull()

    // Paso 1: el puesto, el nivel y la modalidad quedan seleccionados.
    expect(screen.getByLabelText(/puesto/i)).toHaveValue('backend')
    expect(screen.getByRole('button', { name: 'Senior' }).className).toContain('active')
    expect(screen.getByRole('button', { name: 'Remoto' }).className).toContain('active')

    // Paso 2: el skill ya declarado sigue como chip y la ubicación capturada.
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Paso 2 de 2')).toBeTruthy()
    expect(await screen.findByText('React')).toBeTruthy()
    expect(screen.getByLabelText(/ubicación/i)).toHaveValue('Monterrey, MX')
    expect(screen.queryByText(/fuera del catálogo/i)).toBeNull()
  })

  it('shows the full 3-step wizard when the account has no photo yet', async () => {
    mocks.fetchCurrentUser.mockResolvedValue({ ...EXISTING_USER, photo_url: null })
    render(<OnboardingPage />)

    await waitFor(() => {
      expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
    })
    expect(screen.queryByLabelText(/puesto/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeTruthy()
  })
})
