import { z } from 'zod'

export const DIFFICULTY_LEVELS = ['basico', 'intermedio', 'avanzado'] as const

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]

/**
 * skillNames must be the current list of valid skills (skills.name in DB).
 * Passed in rather than fetched here so this package has no DB dependency.
 */
export function buildExamQuestionSchema(skillNames: string[]) {
  return z
    .object({
      question: z.string().trim().min(10).max(500),
      skillName: z.string().refine((value) => skillNames.includes(value), {
        message: 'skillName must be one of the existing skills',
      }),
      options: z
        .array(z.string().trim().min(1).max(200))
        .min(2)
        .max(6)
        .refine(
          (options) =>
            new Set(options.map((option) => option.toLowerCase())).size === options.length,
          { message: 'Las opciones no pueden repetirse' },
        ),
      correctAnswerIndex: z.number().int().min(0),
      difficultyLevel: z.enum(DIFFICULTY_LEVELS),
    })
    .refine((data) => data.correctAnswerIndex < data.options.length, {
      message: 'correctAnswerIndex must be less than the number of options',
      path: ['correctAnswerIndex'],
    })
}

export type ExamQuestionInput = z.infer<ReturnType<typeof buildExamQuestionSchema>>
