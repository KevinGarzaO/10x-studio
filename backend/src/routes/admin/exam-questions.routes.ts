import { Router, Response } from 'express'
import { buildExamQuestionSchema } from '@avocado/schemas'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { requireRole } from '../../middleware/require-role.middleware'

const router = Router()

router.post('/', communityAuthMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data: skillRows, error: skillsError } = await supabase.from('skills').select('name')
    if (skillsError) throw skillsError

    const skillNames = (skillRows || []).map((row) => row.name as string)
    const schema = buildExamQuestionSchema(skillNames)
    const parsed = schema.safeParse(req.body)

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const field = firstIssue.path[0] ?? null
      return res.status(400).json({ error: 'validation_error', field, message: firstIssue.message })
    }

    const { question, skillName, options, correctAnswerIndex, difficultyLevel } = parsed.data

    const { data: questionId, error: insertError } = await supabase.rpc(
      'insert_exam_question_with_options',
      {
        p_question: question,
        p_skill_name: skillName,
        p_options: options,
        p_correct_answer_index: correctAnswerIndex,
        p_difficulty_level: difficultyLevel,
        p_created_by: req.userId,
      },
    )

    if (insertError) throw insertError

    res.status(201).json({
      id: questionId,
      question,
      skillName,
      options,
      correctAnswerIndex,
      difficultyLevel,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Exam question create error:', error)
    res.status(500).json({ error: 'internal_error', message: 'Ocurrió un error, intenta de nuevo' })
  }
})

export default router
