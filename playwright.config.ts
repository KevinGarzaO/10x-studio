import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Estos E2E corren contra `next dev`, que compila cada ruta la primera vez
  // que alguien la visita: la primera navegación a /settings o /onboarding puede
  // tardar varios segundos. Con los 30s por defecto, los tests fallaban por
  // compilación, no por la app.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
    navigationTimeout: 60_000,
  },
})
