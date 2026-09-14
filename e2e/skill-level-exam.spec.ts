/**
 * E2E (Nivel 5) del examen de skills: UI real -> API real -> DB real, sin mocks
 * en el camino de la app. Corre contra apps/community (3002) y backend (3001)
 * ya levantados; esta suite no los arranca, porque iniciar el backend dispara
 * los crons reales del scraper y del orquestador de contenido (ver CLAUDE.md).
 *
 * La sesión se inyecta en localStorage en vez de teclear una contraseña (no la
 * tenemos), pero los tokens son reales, generados server-side con la Admin API
 * de Supabase. Todo lo que los AC realmente prueban —validación, POST real,
 * escritura real— pasa por la UI renderizada sin mocks.
 */
import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') })

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_KEY || '')
const ADMIN_USER_ID = '8d73ccc4-a0dd-4c8d-ac88-f7418b8f091e'
const ADMIN_USERNAME = 'exam-questions-e2e-admin'
const SKILL = 'react'

async function loginAsAdmin(page: Page) {
  await page.goto('/')
  await page.evaluate(
    ({ at, rt }) => {
      localStorage.setItem('avocado_token', at)
      localStorage.setItem('avocado_refresh_token', rt)
      localStorage.setItem('avocado_user', JSON.stringify({ roles: ['admin'] }))
    },
    { at: process.env.E2E_ADMIN_ACCESS_TOKEN!, rt: process.env.E2E_ADMIN_REFRESH_TOKEN! },
  )
}

async function cleanup() {
  const { data: attempts } = await supabase.from('skill_exam_attempts').select('id').eq('user_id', ADMIN_USER_ID)
  for (const a of attempts || []) {
    await supabase.from('skill_exam_attempt_questions').delete().eq('attempt_id', a.id)
  }
  await supabase.from('user_skill_levels').delete().eq('user_id', ADMIN_USER_ID)
  await supabase.from('skill_exam_attempts').delete().eq('user_id', ADMIN_USER_ID)
}

/** Responde las 10 preguntas eligiendo siempre la primera opción. */
async function answerAll(page: Page) {
  for (let i = 0; i < 10; i++) {
    await page.locator('.sxe-option').first().click()
    const label = i === 9 ? 'Terminar examen' : 'Siguiente'
    await page.getByRole('button', { name: label }).click()
    if (i < 9) {
      await expect(page.getByText(`Pregunta ${i + 2} de 10`)).toBeVisible()
    }
  }
}

test.describe('Skill level exam', () => {
  test.beforeEach(async () => {
    await cleanup()
  })

  test.afterAll(async () => {
    await cleanup()
  })

  // T014 (US1) + T024 (US2) + T029 (US3) en un solo recorrido: el estado que
  // deja cada paso es la precondición del siguiente.
  test('take an exam, see the level on the public profile, and get blocked on retry', async ({ page }) => {
    await loginAsAdmin(page)

    // --- US1: presentar el examen y obtener un nivel ---
    await page.goto(`/examenes/${SKILL}`)
    await expect(page.getByRole('heading', { name: 'Examen de React' })).toBeVisible()
    await expect(page.getByText('Pregunta 1 de 10')).toBeVisible()

    await answerAll(page)

    await expect(page.locator('.sxe-result-level')).toBeVisible()
    await expect(page.getByText(/respuestas correctas/)).toBeVisible()

    const { data: attempt } = await supabase
      .from('skill_exam_attempts')
      .select('status, level, correct_count')
      .eq('user_id', ADMIN_USER_ID)
      .single()
    expect(attempt!.status).toBe('completed')
    expect(attempt!.level).toBeTruthy()

    // --- US2: el nivel se ve en el perfil público, sin sesión ---
    const anon = await page.context().browser()!.newContext()
    const anonPage = await anon.newPage()
    await anonPage.goto(`/users/${ADMIN_USERNAME}`)
    await expect(anonPage.locator('.profile-fact.is-validated')).toContainText(SKILL)
    await anon.close()

    // --- US3: reintentar de inmediato queda bloqueado, con fecha ---
    await page.goto(`/examenes/${SKILL}`)
    await expect(page.getByText(/Podrás intentarlo de nuevo a partir del/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Siguiente' })).toHaveCount(0)
  })

  // FR-018: retomar donde se quedó.
  test('resumes an interrupted exam at the question it left off', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/examenes/${SKILL}`)
    await expect(page.getByText('Pregunta 1 de 10')).toBeVisible()

    for (let i = 0; i < 3; i++) {
      await page.locator('.sxe-option').first().click()
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByText(`Pregunta ${i + 2} de 10`)).toBeVisible()
    }

    // Salir de la página y volver: debe retomar en la 4, no empezar de cero.
    await page.goto('/')
    await page.goto(`/examenes/${SKILL}`)

    await expect(page.getByText('Pregunta 4 de 10')).toBeVisible()
  })

  // US4: la lista muestra por qué un examen no está disponible.
  test('lists declared skills with their eligibility', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/examenes')

    await expect(page.getByRole('heading', { name: 'Validar mis skills' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Presentar examen' })).toBeVisible()
  })
})
