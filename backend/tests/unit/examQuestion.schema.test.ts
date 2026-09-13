import { describe, expect, it } from 'vitest'
import { buildExamQuestionSchema } from '@avocado/schemas'

const SKILLS = ['react', 'typescript', 'python']

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    question: '¿Cuál hook de React se usa para efectos secundarios?',
    skillName: 'react',
    options: ['useEffect', 'useState', 'useMemo'],
    correctAnswerIndex: 0,
    difficultyLevel: 'basico',
    ...overrides,
  }
}

describe('examQuestionSchema', () => {
  const schema = buildExamQuestionSchema(SKILLS)

  it('accepts a fully valid payload', () => {
    expect(schema.safeParse(validPayload()).success).toBe(true)
  })

  it('rejects a question under 10 characters', () => {
    expect(schema.safeParse(validPayload({ question: 'corta' })).success).toBe(false)
  })

  it('accepts a question of 15+ characters', () => {
    expect(
      schema.safeParse(validPayload({ question: 'Pregunta suficientemente larga' })).success,
    ).toBe(true)
  })

  it('rejects fewer than 2 options', () => {
    expect(schema.safeParse(validPayload({ options: ['useEffect'] })).success).toBe(false)
  })

  it('accepts exactly 2 options', () => {
    expect(
      schema.safeParse(validPayload({ options: ['useEffect', 'useState'], correctAnswerIndex: 0 }))
        .success,
    ).toBe(true)
  })

  it('rejects duplicate options case-insensitively', () => {
    expect(schema.safeParse(validPayload({ options: ['Sí', 'sí'] })).success).toBe(false)
  })

  it('accepts options without duplicates', () => {
    expect(
      schema.safeParse(validPayload({ options: ['Sí', 'No'], correctAnswerIndex: 0 })).success,
    ).toBe(true)
  })

  it('rejects correctAnswerIndex out of range', () => {
    expect(
      schema.safeParse(validPayload({ options: ['a', 'b', 'c'], correctAnswerIndex: 5 })).success,
    ).toBe(false)
  })

  it('accepts correctAnswerIndex within range', () => {
    expect(
      schema.safeParse(validPayload({ options: ['a', 'b', 'c'], correctAnswerIndex: 0 })).success,
    ).toBe(true)
  })

  it('rejects a difficultyLevel outside the enum', () => {
    expect(schema.safeParse(validPayload({ difficultyLevel: 'experto' })).success).toBe(false)
  })

  it('accepts a valid difficultyLevel', () => {
    expect(schema.safeParse(validPayload({ difficultyLevel: 'basico' })).success).toBe(true)
  })

  it('rejects a skillName not in the catalog', () => {
    expect(schema.safeParse(validPayload({ skillName: 'cobol' })).success).toBe(false)
  })
})
