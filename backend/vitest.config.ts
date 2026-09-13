import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Default glob (**/*.{test,spec}.ts) covers tests/unit and
    // tests/integration. scripts/test-exam-questions-bypass.ts is a manual,
    // one-off verification (not part of `npm test`) named to match the
    // existing backend/scripts/*.ts convention rather than *.test.ts, so it
    // needs to be added explicitly to be run at all — it's still excluded
    // from the default `npm test` / `npm run test:integration` scripts,
    // which target tests/unit and tests/integration specifically.
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', 'scripts/test-exam-questions-bypass.ts'],
  },
})
