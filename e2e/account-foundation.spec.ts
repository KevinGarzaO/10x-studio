/**
 * E2E (Nivel 5) de la fundación de cuentas: UI real -> API real -> DB real, sin
 * mocks en el camino de la app. Corre contra apps/community (3002) y backend
 * (3001) ya levantados; esta suite no los arranca, porque iniciar el backend
 * dispara los crons reales del scraper y del orquestador de contenido
 * (ver CLAUDE.md).
 *
 * Cubre las tres historias que se ven desde el navegador:
 * - US1: un alias se guarda como el skill canónico.
 * - US2: proponer un skill que no existe.
 * - US4: sin foto, cualquier pantalla con sesión lleva a onboarding.
 */
import { test, expect, type Page } from '@playwright/test'
import { admin, createSessionFor } from './session'

const CANDIDATE_ID = '8d73ccc4-a0dd-4c8d-ac88-f7418b8f091e' // exam-questions-e2e-admin
const CANDIDATE_EMAIL = 'exam-questions-e2e-admin@avocado-studio.com'

let originalProfile: Record<string, unknown>

async function login(page: Page) {
  const session = await createSessionFor(CANDIDATE_EMAIL)
  await page.goto('/')
  await page.evaluate(
    ({ at, rt }) => {
      localStorage.setItem('avocado_token', at)
      localStorage.setItem('avocado_refresh_token', rt)
      localStorage.removeItem('avocado_user')
    },
    { at: session.accessToken, rt: session.refreshToken },
  )
}

test.beforeAll(async () => {
  const { data } = await admin
    .from('users')
    .select('photo_url, title, role_category, seniority, skills, location, work_modality')
    .eq('id', CANDIDATE_ID)
    .single()
  originalProfile = data as Record<string, unknown>

  if (!originalProfile.photo_url) {
    throw new Error('La cuenta de prueba necesita foto: la foto es obligatoria (FR-024)')
  }
})

test.afterAll(async () => {
  // Se restaura el perfil y se borran las propuestas que dejó la suite.
  await admin.from('users').update(originalProfile).eq('id', CANDIDATE_ID)

  const { data: proposals } = await admin.from('skill_proposals').select('id, normalized_key')
  for (const row of proposals || []) {
    if ((row.normalized_key as string).startsWith('e2e')) {
      await admin.from('skill_proposal_supporters').delete().eq('proposal_id', row.id)
      await admin.from('skill_proposals').delete().eq('id', row.id)
    }
  }
})

test('US1: a known alias is saved as the canonical skill', async ({ page }) => {
  await login(page)
  await page.goto('/settings')

  const skillsInput = page.getByPlaceholder(/escribe y elige/i)
  await expect(skillsInput).toBeEnabled()

  // "reactjs" es un alias de React: debe quedar como el skill del catálogo.
  await skillsInput.fill('reactjs')
  await skillsInput.press('Enter')

  await expect(page.getByText('React', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /guardar cambios/i }).click()
  await expect(page.getByRole('button', { name: /guardado/i })).toBeVisible()

  // Lo que quedó en la base es el nombre canónico, no el texto escrito.
  const { data } = await admin.from('users').select('skills').eq('id', CANDIDATE_ID).single()
  expect(data!.skills).toContain('react')
  expect(data!.skills).not.toContain('reactjs')
})

test('US2: proposing a missing skill leaves it pending and out of the profile', async ({ page }) => {
  await login(page)
  await page.goto('/settings')

  const skillsInput = page.getByPlaceholder(/escribe y elige/i)
  await expect(skillsInput).toBeEnabled()

  const proposed = `E2E Skill ${Date.now().toString(36)}`
  await skillsInput.fill(proposed)

  // No hay coincidencia: la UI ofrece proponerlo en vez de agregarlo.
  await page.getByRole('button', { name: /proponer/i }).click()

  await expect(page.getByText(/te avisamos aquí cuando se revise/i)).toBeVisible()
  await expect(page.getByText(/en revisión/i)).toBeVisible()

  // Y no entró al perfil.
  const { data } = await admin.from('users').select('skills').eq('id', CANDIDATE_ID).single()
  expect((data!.skills as string[]).join(',')).not.toContain('e2eskill')
})

test('US4: a candidate without a photo cannot reach /settings', async ({ page }) => {
  // Cuenta nueva de verdad: usuario de auth + fila en users, sin foto. Es el
  // estado exacto de alguien que acaba de confirmar su correo (FR-024).
  const stamp = Date.now().toString(36)
  const email = `e2e-sinfoto-${stamp}@avocado-studio.com`
  const password = `E2e-${stamp}-${Math.random().toString(36).slice(2)}`

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  expect(createError, createError?.message).toBeNull()
  const userId = created!.user!.id

  const { error: rowError } = await admin
    .from('users')
    .insert({ id: userId, email, username: `e2e-sinfoto-${stamp}`, display_name: 'Sin foto E2E' })
  expect(rowError, rowError?.message).toBeNull()

  try {
    const session = await admin.auth.signInWithPassword({ email, password })
    expect(session.error, session.error?.message).toBeNull()

    await page.goto('/')
    await page.evaluate(
      ({ at, rt }) => {
        localStorage.setItem('avocado_token', at)
        localStorage.setItem('avocado_refresh_token', rt)
        localStorage.removeItem('avocado_user')
      },
      {
        at: session.data.session!.access_token,
        rt: session.data.session!.refresh_token,
      },
    )

    // Entrar directo a ajustes, que vive fuera del shell del feed: antes de esta
    // feature esa pantalla no tenía ninguna verificación (FR-025).
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByText(/completa tu perfil/i)).toBeVisible()
  } finally {
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
  }
})

test('the company profile of a scraped company still resolves by its slug', async ({ page }) => {
  await page.goto('/empresas/twilio')

  await expect(page.getByText(/twilio/i).first()).toBeVisible()
  await expect(page.getByText(/empresa no encontrada/i)).toHaveCount(0)
})

test.afterEach(async () => {
  // Cada caso deja el perfil de la cuenta de prueba como estaba.
  await admin.from('users').update(originalProfile).eq('id', CANDIDATE_ID)
})
