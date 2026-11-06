import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingPage } from '@/components/onboarding'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'
import { resetFlowTrackerForTests } from '@/lib/flow-tracker'
import { resetWebAnalyticsForTests, SESSION_KEY } from '@/lib/web-analytics'

/**
 * El perfil se mide paso por paso y campo por campo (flujo `profile_setup`): qué paso se mostró, qué campo bloqueó a la persona y si lo
 * completó. Sin esto no se sabía por qué algunas cuentas se quedaban con el perfil incompleto.
 */
vi.mock('next/navigation', () => {
  const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }
  return { useRouter: () => router }
})
vi.mock('@/lib/session', () => ({
  getToken: () => 'token',
  captureSessionFromUrl: () => false,
  getCachedUser: () => null,
  fetchCurrentUser: async () => ({ username: 'ana', photo_url: 'https://example.com/foto.png' }),
}))

const SESSION = '3f1c2a90-5b7e-4d1a-9c0e-1a2b3c4d5e6f'
let steps: { flow_name: string; step_name: string; is_final: boolean }[] = []
const names = () => steps.filter(step => step.flow_name === 'profile_setup').map(step => step.step_name + (step.is_final ? '*' : ''))

beforeEach(() => {
  ;(globalThis as any).__avoAnalyticsTest = true
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: SESSION, last: Date.now(), seconds: 0, identified: null }))
  resetWebAnalyticsForTests(); resetFlowTrackerForTests(); resetSkillCatalogCache()
  steps = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u === '/api/a/flow') { steps.push(JSON.parse(String(init?.body))); return { ok: true, status: 204 } }
    if (u.startsWith('/api/a/')) return { ok: true, status: 204 }
    if (u.includes('/api/community/skills')) return { ok: true, json: async () => ({ skills: [{ name: 'react', label: 'React' }], aliases: [] }) }
    return { ok: true, json: async () => ({ proposals: [] }) }
  }) as unknown as typeof fetch
})
afterEach(() => { ;(globalThis as any).__avoAnalyticsTest = false; vi.restoreAllMocks() })

describe('profile flow measurement', () => {
  it('starts when the form is shown and says which step the person is on', async () => {
    render(<OnboardingPage />)
    await waitFor(() => expect(names()).toContain('view_basics')) // la foto ya venía: arranca en el puesto
    expect(names()[0]).toBe('start')
    expect(names()).not.toContain('view_photo')
  })

  it('says WHICH field blocked the person, one by one, and does not count a step done until it is', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)
    await screen.findByRole('button', { name: 'Siguiente' })

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(names()).toContain('blocked_role'))
    expect(names()).not.toContain('basics_done')

    await user.selectOptions(screen.getByLabelText(/puesto/i), 'backend')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(names()).toContain('blocked_level'))

    await user.click(screen.getByRole('button', { name: 'Senior' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(names()).toContain('blocked_modality'))

    await user.click(screen.getByRole('button', { name: 'Remoto' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(names()).toContain('basics_done'))
    expect(names()).toContain('view_skills')
  })
})
