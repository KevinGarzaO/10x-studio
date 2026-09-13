import { describe, expect, it } from 'vitest'
import { buildStartSkillExamSchema, submitAnswerSchema } from '@avocado/schemas'

const SKILLS = ['react', 'typescript', 'python']

describe('buildStartSkillExamSchema', () => {
  const schema = buildStartSkillExamSchema(SKILLS)

  it('accepts a skill from the catalog', () => {
    expect(schema.safeParse({ skillName: 'react' }).success).toBe(true)
  })

  it('rejects a skill outside the catalog', () => {
    expect(schema.safeParse({ skillName: 'cobol' }).success).toBe(false)
  })

  it('rejects an empty skillName', () => {
    expect(schema.safeParse({ skillName: '' }).success).toBe(false)
  })
})

describe('submitAnswerSchema', () => {
  it('accepts a valid answer', () => {
    expect(submitAnswerSchema.safeParse({ position: 0, selectedOptionIndex: 2 }).success).toBe(true)
  })

  it('rejects a negative position', () => {
    expect(submitAnswerSchema.safeParse({ position: -1, selectedOptionIndex: 0 }).success).toBe(false)
  })

  it('accepts position 0', () => {
    expect(submitAnswerSchema.safeParse({ position: 0, selectedOptionIndex: 0 }).success).toBe(true)
  })

  it('rejects a negative selectedOptionIndex', () => {
    expect(submitAnswerSchema.safeParse({ position: 0, selectedOptionIndex: -1 }).success).toBe(false)
  })

  it('rejects selectedOptionIndex above the 6-option maximum', () => {
    expect(submitAnswerSchema.safeParse({ position: 0, selectedOptionIndex: 6 }).success).toBe(false)
  })

  it('accepts selectedOptionIndex at the maximum (5)', () => {
    expect(submitAnswerSchema.safeParse({ position: 0, selectedOptionIndex: 5 }).success).toBe(true)
  })

  it('rejects non-integer values', () => {
    expect(submitAnswerSchema.safeParse({ position: 0, selectedOptionIndex: 1.5 }).success).toBe(false)
  })

  it('strips unknown keys instead of trusting them (FR-007)', () => {
    const parsed = submitAnswerSchema.parse({
      position: 0,
      selectedOptionIndex: 1,
      isCorrect: true,
      level: 'avanzado',
    } as never)
    expect(parsed).toEqual({ position: 0, selectedOptionIndex: 1 })
  })
})
