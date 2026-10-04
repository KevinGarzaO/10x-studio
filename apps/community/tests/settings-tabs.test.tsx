import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { SettingsPage } from '@/components/account-pages'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings',
}))

const USER = {
  id: 'u1',
  username: 'ana',
  display_name: 'Ana Pérez',
  email: 'ana@correo.com',
  bio: '',
  photo_url: 'https://x/a.png',
  website: '',
  github_url: '',
  location: 'Monterrey, MX',
  title: 'Desarrollo Backend',
  role_category: 'backend',
  seniority: 'senior',
  skills: ['nodejs'],
  work_modality: 'Remoto',
  account_type: 'candidate',
  profile_completed: true,
  cv: { summary: 'Ingeniera backend con 6 años', experience: [] },
  cv_public: false,
  created_at: '2026-01-01',
}

const CATALOG = {
  skills: [
    { name: 'nodejs', label: 'Node.js', roleCategories: ['backend'] },
    { name: 'figma', label: 'Figma', roleCategories: ['ux_ui'] },
  ],
  aliases: [],
}

vi.mock('@/lib/session', () => ({
  getToken: () => 'tok',
  fetchCurrentUser: vi.fn(async () => USER),
  saveSession: vi.fn(),
}))

beforeEach(() => {
  resetSkillCatalogCache()
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/api/community/skills')) return { ok: true, json: async () => CATALOG }
    return { ok: true, json: async () => ({ proposals: [] }) }
  }) as unknown as typeof fetch
})

async function open() {
  render(<SettingsPage />)
  await screen.findByRole('tab', { name: 'Perfil' })
}

describe('Settings tabs', () => {
  it('has the profile, the CV and the preview as three sections', async () => {
    await open()

    expect(screen.getByRole('tab', { name: 'Perfil' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Mi CV' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Vista previa' }).getAttribute('aria-selected')).toBe('false')
  })

  it('starts on the profile form, with one role list instead of a typed title', async () => {
    await open()

    expect(screen.getByLabelText('Puesto')).toBeTruthy()
    expect(screen.queryByText('Título profesional')).toBeNull()
    expect(screen.queryByText('Categoría de rol')).toBeNull()
  })

  it('lists the roles in Spanish, administration, finance and HR included', async () => {
    await open()

    const options = [...(screen.getByLabelText('Puesto') as HTMLSelectElement).options].map(o => o.textContent)
    expect(options).toEqual(expect.arrayContaining(['Desarrollo Backend', 'Atención al Cliente', 'Recursos Humanos', 'Administración', 'Finanzas y Contabilidad']))
    expect(options.some(label => /^(Backend|Customer Support|Data Engineer)$/.test(label || ''))).toBe(false)
  })

  it('shows the CV form in "Mi CV", loaded with what was saved', async () => {
    await open()

    fireEvent.click(screen.getByRole('tab', { name: 'Mi CV' }))

    expect(screen.getByRole('tab', { name: 'Mi CV' }).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByLabelText('Resumen profesional') as HTMLTextAreaElement).value).toBe('Ingeniera backend con 6 años')
    expect(screen.getByRole('button', { name: /Guardar CV/ })).toBeTruthy()
  })

  it('shows the CV sheet in "Vista previa" with the name and role from the profile', async () => {
    await open()

    fireEvent.click(screen.getByRole('tab', { name: 'Vista previa' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeTruthy()
    expect(screen.getByText('Desarrollo Backend · Senior')).toBeTruthy()
    expect(screen.getByText('Ingeniera backend con 6 años')).toBeTruthy()
    // El formulario de perfil sigue en el DOM (oculto), así que se busca dentro de la hoja.
    const sheet = screen.getByRole('article', { name: 'Vista del CV' })
    await waitFor(() => expect(within(sheet).getByText('Node.js')).toBeTruthy())
  })

  it('updates the preview with a profile change that is not saved yet', async () => {
    await open()

    fireEvent.change(screen.getByLabelText('Puesto'), { target: { value: 'finanzas' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Vista previa' }))

    expect(screen.getByText('Finanzas y Contabilidad · Senior')).toBeTruthy()
  })

  it('keeps what was typed in the CV when going to another tab and coming back', async () => {
    await open()
    fireEvent.click(screen.getByRole('tab', { name: 'Mi CV' }))
    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Texto nuevo sin guardar' } })

    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Mi CV' }))

    expect((screen.getByLabelText('Resumen profesional') as HTMLTextAreaElement).value).toBe('Texto nuevo sin guardar')
  })
})
