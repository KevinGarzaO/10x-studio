/**
 * E2E (Nivel 5): UI real -> API real -> DB real, no mocks, against whatever
 * apps/community (port 3002) and backend (port 3001) are already running at
 * E2E_BASE_URL / process.env.API_URL. This suite does not start those
 * servers itself — see the project README/CLAUDE.md warning that starting
 * `backend` fires real scraper/content-orchestrator crons against
 * production, which this suite must not trigger as a side effect of a test
 * run.
 *
 * Login is done by injecting a real Supabase session into localStorage
 * (same keys apps/community/lib/session.ts's saveSession() writes) rather
 * than typing a password into the login form — we don't have these test
 * users' passwords. The session tokens themselves are still real, generated
 * server-side via the Supabase Admin API (see scripts/generate-test-session
 * usage in beforeAll). Everything AC1-AC6 actually test — the form's
 * validation, the real POST, the real DB write — runs through the real
 * rendered UI with no mocks.
 */
import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { createSessionFor } from './session'

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') })

// Used only to clean up the row this suite itself creates via AC5's real
// submission (see afterAll) — no assertions run against this client.
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_KEY || '')
const E2E_QUESTION_MARKER = '[E2E exam-question-form]'

// Las sesiones se emiten al correr la suite (e2e/session.ts). Antes salían de
// variables de entorno que nada generaba, así que sin prepararlas a mano estos
// tests acababan en la pantalla de login.
const SUPERADMIN_EMAIL = 'exam-questions-e2e-admin@avocado-studio.com'
const NON_SUPERADMIN_EMAIL = 'kgarzaortiz@gmail.com'

interface E2ELogin {
  access_token: string
  refresh_token: string
  user: { is_superadmin: boolean }
}

let ADMIN_SESSION: E2ELogin
let NON_ADMIN_SESSION: E2ELogin

const FORM_URL = '/admin/exam-questions/new'

async function loginAs(page: Page, session: E2ELogin) {
  await page.goto('/')
  await page.evaluate((s) => {
    localStorage.setItem('avocado_token', s.access_token)
    localStorage.setItem('avocado_refresh_token', s.refresh_token)
    localStorage.setItem('avocado_user', JSON.stringify(s.user))
  }, session)
}

test.describe('Exam question form (AC1-AC6)', () => {
  test.beforeAll(async () => {
    const [superadmin, plain] = await Promise.all([
      createSessionFor(SUPERADMIN_EMAIL),
      createSessionFor(NON_SUPERADMIN_EMAIL),
    ])
    ADMIN_SESSION = {
      access_token: superadmin.accessToken,
      refresh_token: superadmin.refreshToken,
      user: { is_superadmin: true },
    }
    NON_ADMIN_SESSION = {
      access_token: plain.accessToken,
      refresh_token: plain.refreshToken,
      user: { is_superadmin: false },
    }
  })

  test.afterAll(async () => {
    await supabase.from('exam_questions').delete().ilike('question', `%${E2E_QUESTION_MARKER}%`)
  })

  test('AC6: a non-admin cannot reach the form', async ({ page }) => {
    await loginAs(page, NON_ADMIN_SESSION)
    await page.goto(FORM_URL)
    await expect(page.getByRole('heading', { name: 'Nueva pregunta de examen' })).not.toBeVisible()
  })

  test('AC1-AC5: full negative-then-positive flow', async ({ page }) => {
    await loginAs(page, ADMIN_SESSION)
    await page.goto(FORM_URL)
    await expect(page.getByRole('heading', { name: 'Nueva pregunta de examen' })).toBeVisible()

    // AC1: empty question
    await page.getByLabel('Pregunta').click()
    await page.getByLabel('Pregunta').blur()
    await expect(page.getByText('La pregunta es obligatoria')).toBeVisible()

    // AC2: fewer than 2 filled options
    await page.getByLabel('Pregunta').fill(`Pregunta suficientemente larga para el examen ${E2E_QUESTION_MARKER}`)
    await page.getByLabel('Opción 1', { exact: true }).fill('useEffect')
    await expect(page.getByText('Se requieren al menos 2 opciones')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar pregunta' })).toBeDisabled()

    // AC3: no correct answer marked
    await page.getByLabel('Opción 2', { exact: true }).fill('useState')
    await page.getByRole('button', { name: 'Guardar pregunta' }).click()
    await expect(page.getByText('Selecciona la respuesta correcta')).toBeVisible()

    // AC4: duplicate options (case-insensitive)
    await page.getByLabel('Opción 2', { exact: true }).fill('USEEFFECT')
    await page.getByLabel('Marcar opción 1 como correcta').check()
    await page.getByRole('button', { name: 'Guardar pregunta' }).click()
    await expect(page.getByText('Las opciones no pueden repetirse')).toBeVisible()

    // AC5: fix the duplicate, submit successfully, form clears
    await page.getByLabel('Opción 2', { exact: true }).fill('useState')
    await page.getByRole('button', { name: 'Guardar pregunta' }).click()
    await expect(page.getByText('Pregunta guardada correctamente.')).toBeVisible()
    await expect(page.getByLabel('Pregunta')).toHaveValue('')
  })
})
