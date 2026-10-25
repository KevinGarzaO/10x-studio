import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// El alta de empresas está en pausa: nadie debe poder mandar un reclamo mientras no se reactive a propósito.
describe('company claims are paused', () => {
  const index = readFileSync(join(__dirname, '../../index.ts'), 'utf-8')

  it('the claim routes are not mounted', () => {
    const mounted = index.split('\n').filter(line => line.includes("/api/community/company-claims") && !line.trim().startsWith('//'))
    expect(mounted).toEqual([])
  })

  it('the claim router is not imported', () => {
    const imported = index.split('\n').filter(line => line.includes('company-claims.routes') && !line.trim().startsWith('//'))
    expect(imported).toEqual([])
  })
})
