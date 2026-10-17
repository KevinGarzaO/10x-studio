import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { normalizeSkillKey } from '@avocado/schemas'

const sql = (file: string) => readFileSync(join(__dirname, '../../sql', file), 'utf8').replace(/\r\n/g, '\n')

/** Las tuplas ('a', 'b') de un INSERT, ignorando comentarios. */
function tuples(source: string, table: string): [string, string][] {
  const block = source.match(new RegExp(`INSERT INTO ${table} \\([^)]*\\) VALUES([\\s\\S]*?)ON CONFLICT`))
  if (!block) throw new Error(`no se encontró el INSERT de ${table}`)
  const body = block[1].split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
  return [...body.matchAll(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)].map(m => [m[1], m[2]])
}

const base = sql('seed-skills-catalog.sql')
const expansion = sql('skills-catalog-expansion.sql')

const baseSkills = tuples(base, 'skills')
const baseAliases = tuples(base, 'skill_aliases')
const newSkills = tuples(expansion, 'skills')
const newAliases = tuples(expansion, 'skill_aliases')

describe('skills catalog expansion', () => {
  it('adds skills on top of the 37 base ones', () => {
    expect(baseSkills).toHaveLength(37)
    expect(newSkills.length).toBeGreaterThan(0)
  })

  it('uses stable lowercase names with hyphens and never repeats one', () => {
    const names = newSkills.map(([name]) => name)
    for (const name of names) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(new Set(names).size).toBe(names.length)
  })

  it('does not redefine a skill that already exists', () => {
    const existing = new Set(baseSkills.map(([name]) => name))
    expect(newSkills.filter(([name]) => existing.has(name))).toEqual([])
  })

  it('stores every alias already normalized, the way the app looks them up', () => {
    for (const [alias] of newAliases) {
      expect(alias).toBe(normalizeSkillKey(alias))
      expect(alias).toMatch(/^[a-z0-9+#]+$/)
    }
  })

  it('points every alias at a skill that exists', () => {
    const known = new Set([...baseSkills, ...newSkills].map(([name]) => name))
    expect(newAliases.filter(([, skill]) => !known.has(skill))).toEqual([])
  })

  it('never lets two skills answer to the same text', () => {
    const owner = new Map<string, string>()
    const claim = (key: string, skill: string) => {
      const current = owner.get(key)
      expect(current === undefined || current === skill, `"${key}" lo reclaman ${current} y ${skill}`).toBe(true)
      owner.set(key, skill)
    }
    for (const [name, label] of [...baseSkills, ...newSkills]) {
      claim(normalizeSkillKey(name), name)
      claim(normalizeSkillKey(label), name)
    }
    for (const [alias, skill] of [...baseAliases, ...newAliases]) claim(alias, skill)
  })
})
