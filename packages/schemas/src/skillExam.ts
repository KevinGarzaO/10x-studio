import { z } from 'zod'

/** Máximo de opciones por pregunta, heredado de la regla de 001. */
export const MAX_OPTIONS_PER_QUESTION = 6

/**
 * skillNames must be the current list of skills the candidate may be examined
 * on. Passed in rather than fetched here so this package has no DB dependency —
 * same approach as buildExamQuestionSchema in ./examQuestion.ts.
 */
export function buildStartSkillExamSchema(skillNames: string[]) {
  return z.object({
    skillName: z.string().refine((value) => skillNames.includes(value), {
      message: 'skillName must be one of the existing skills',
    }),
  })
}

export const submitAnswerSchema = z.object({
  position: z.number().int().min(0),
  selectedOptionIndex: z.number().int().min(0).max(MAX_OPTIONS_PER_QUESTION - 1),
})

export type StartSkillExamInput = z.infer<ReturnType<typeof buildStartSkillExamSchema>>
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>
