import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ROLE_CATEGORY } from '@avocado/schemas'

const db = vi.hoisted(() => ({ roleColumn: true }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const result =
          table === 'skill_aliases'
            ? { data: [], error: null }
            : columns.includes('role_categories') && !db.roleColumn
              ? { data: null, error: { message: 'column skills.role_categories does not exist' } }
              : {
                  data: [
                    { name: 'nodejs', label: 'Node.js', ...(db.roleColumn ? { role_categories: ['backend', 'fullstack'] } : {}) },
                    { name: 'figma', label: 'Figma', ...(db.roleColumn ? { role_categories: [] } : {}) },
                  ],
                  error: null,
                }
        const q: any = { order: () => q, then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) }
        return q
      },
    }),
  },
}))

import skillsRouter from '../../src/routes/community/skills.routes'

const app = () => {
  const a = express()
  a.use('/api/community/skills', skillsRouter)
  return a
}

beforeEach(() => { db.roleColumn = true })

describe('GET /skills with role categories', () => {
  it('returns the roles each skill belongs to', async () => {
    const res = await request(app()).get('/api/community/skills').expect(200)

    expect(res.body.skills).toEqual([
      { name: 'nodejs', label: 'Node.js', roleCategories: ['backend', 'fullstack'] },
      { name: 'figma', label: 'Figma', roleCategories: [] },
    ])
  })

  it('still serves the catalog when the role migration is not applied yet', async () => {
    db.roleColumn = false

    const res = await request(app()).get('/api/community/skills').expect(200)

    expect(res.body.skills.map((s: any) => s.name)).toEqual(['nodejs', 'figma'])
    expect(res.body.skills.every((s: any) => Array.isArray(s.roleCategories) && s.roleCategories.length === 0)).toBe(true)
  })
})

describe('skills-role-categories-migration.sql', () => {
  const read = (file: string) => readFileSync(join(__dirname, '../../sql', file), 'utf8').replace(/\r\n/g, '\n')
  const namesIn = (sql: string) => [...sql.matchAll(/^\s*\('([a-z0-9-]+)',\s*'/gm)].map(m => m[1])

  const catalog = [
    ...namesIn(read('seed-skills-catalog.sql').split('INSERT INTO skill_aliases')[0]),
    ...namesIn(read('skills-catalog-expansion.sql').split('INSERT INTO skill_aliases')[0]),
  ]

  const migration = read('skills-role-categories-migration.sql')
  const mapping = new Map<string, string[]>(
    [...migration.matchAll(/^\s*\('([a-z0-9-]+)',\s*ARRAY\[([^\]]*)\]::text\[\]\)/gm)].map(m => [
      m[1],
      [...m[2].matchAll(/'([a-z_]+)'/g)].map(r => r[1]),
    ]),
  )

  it('gives every skill in the catalog at least one role', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(82)
    expect(catalog.filter(name => !mapping.get(name)?.length)).toEqual([])
  })

  it('only mentions skills that exist', () => {
    expect([...mapping.keys()].filter(name => !catalog.includes(name))).toEqual([])
  })

  it('only uses real role categories', () => {
    const valid = new Set<string>(ROLE_CATEGORY)
    const unknown = [...mapping.values()].flat().filter(role => !valid.has(role))
    expect(unknown).toEqual([])
  })

  it('leaves every role with something to offer, administration, finance and human resources included', () => {
    const offered = new Set([...mapping.values()].flat())
    // "otro" muestra el catálogo completo, por eso ningún skill se liga a él.
    expect(ROLE_CATEGORY.filter(role => role !== 'otro' && !offered.has(role))).toEqual([])
    for (const role of ['recursos_humanos', 'administracion', 'finanzas']) expect(offered.has(role)).toBe(true)
  })

  it('does not tie any skill to "otro", which already shows everything', () => {
    expect([...mapping.values()].flat().includes('otro')).toBe(false)
  })

  it('moves the administration and finance skills onto their own categories', () => {
    expect(mapping.get('accounting')).toContain('finanzas')
    expect(mapping.get('recruiting')).toContain('recursos_humanos')
    expect(mapping.get('business-administration')).toContain('administracion')
  })

  it('does not overwrite roles that were adjusted by hand', () => {
    expect(migration).toMatch(/AND s\.role_categories = '\{\}'/)
  })

  it('is safe to run twice', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS role_categories/)
  })
})
