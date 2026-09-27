import { describe, it, expect } from 'vitest'
import {
  normalizeSkillKey,
  resolveSkill,
  skillProposalSchema,
  MAX_SKILL_TEXT_LENGTH,
  type SkillCatalog,
} from '@avocado/schemas'

const catalog: SkillCatalog = {
  skills: [
    { name: 'react', label: 'React' },
    { name: 'nodejs', label: 'Node.js' },
    { name: 'golang', label: 'Go' },
    { name: 'ia', label: 'IA / Machine Learning' },
  ],
  aliases: [
    { alias: 'reactjs', skillName: 'react' },
    { alias: 'node', skillName: 'nodejs' },
    { alias: 'ml', skillName: 'ia' },
    { alias: 'huerfano', skillName: 'skill-que-no-existe' },
  ],
}

describe('normalizeSkillKey (T004)', () => {
  it('trims, lowercases and drops punctuation', () => {
    expect(normalizeSkillKey('  React.js ')).toBe('reactjs')
    expect(normalizeSkillKey('Node.js')).toBe('nodejs')
    expect(normalizeSkillKey('Google Ads')).toBe('googleads')
    expect(normalizeSkillKey('adobe-suite')).toBe('adobesuite')
  })

  it('strips accents so "Diseño" and "diseno" are the same key', () => {
    expect(normalizeSkillKey('Diseño')).toBe('diseno')
    expect(normalizeSkillKey('Análisis')).toBe('analisis')
  })

  // La razón de conservar + y # (FR-011): sin esto los tres serían "c".
  it('keeps + and # so C, C++ and C# stay distinct', () => {
    expect(normalizeSkillKey('C')).toBe('c')
    expect(normalizeSkillKey('C++')).toBe('c++')
    expect(normalizeSkillKey('C#')).toBe('c#')
    expect(new Set(['C', 'C++', 'C#'].map(normalizeSkillKey)).size).toBe(3)
  })

  it('returns an empty key for text with nothing usable', () => {
    expect(normalizeSkillKey('')).toBe('')
    expect(normalizeSkillKey('   ')).toBe('')
    expect(normalizeSkillKey('--- ...')).toBe('')
  })
})

describe('resolveSkill (T004)', () => {
  it('resolves by canonical name', () => {
    expect(resolveSkill('react', catalog)?.name).toBe('react')
    expect(resolveSkill('  REACT  ', catalog)?.name).toBe('react')
  })

  it('resolves by visible label', () => {
    expect(resolveSkill('Node.js', catalog)?.name).toBe('nodejs')
    expect(resolveSkill('IA / Machine Learning', catalog)?.name).toBe('ia')
    expect(resolveSkill('Go', catalog)?.name).toBe('golang')
  })

  it('resolves by alias', () => {
    expect(resolveSkill('reactjs', catalog)?.name).toBe('react')
    expect(resolveSkill('React.js', catalog)?.name).toBe('react')
    expect(resolveSkill('ML', catalog)?.name).toBe('ia')
  })

  it('returns null when nothing matches', () => {
    expect(resolveSkill('rust', catalog)).toBeNull()
    expect(resolveSkill('   ', catalog)).toBeNull()
  })

  it('returns null for an alias pointing at a skill that is not in the catalog', () => {
    expect(resolveSkill('huerfano', catalog)).toBeNull()
  })
})

describe('skillProposalSchema (T004)', () => {
  it('accepts a real name and trims it', () => {
    const parsed = skillProposalSchema.parse({ text: '  Rust  ' })
    expect(parsed.text).toBe('Rust')
  })

  it('rejects empty or blank text', () => {
    expect(skillProposalSchema.safeParse({ text: '' }).success).toBe(false)
    expect(skillProposalSchema.safeParse({ text: '    ' }).success).toBe(false)
  })

  it(`rejects text longer than ${MAX_SKILL_TEXT_LENGTH} characters`, () => {
    const tooLong = 'a'.repeat(MAX_SKILL_TEXT_LENGTH + 1)
    expect(skillProposalSchema.safeParse({ text: tooLong }).success).toBe(false)
    expect(skillProposalSchema.safeParse({ text: 'a'.repeat(MAX_SKILL_TEXT_LENGTH) }).success).toBe(
      true,
    )
  })

  it('rejects text made only of punctuation, which would normalize to nothing', () => {
    expect(skillProposalSchema.safeParse({ text: '...' }).success).toBe(false)
    expect(skillProposalSchema.safeParse({ text: '-/-' }).success).toBe(false)
  })
})
