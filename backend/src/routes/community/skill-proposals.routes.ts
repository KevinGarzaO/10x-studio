import { Router, Response } from 'express'
import { skillProposalSchema } from '@avocado/schemas'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { requireAccountType } from '../../middleware/require-account-type.middleware'
import { proposeSkill, proposalsForUser } from '../../services/skill-proposal.service'

const router = Router()

/**
 * POST /api/community/skill-proposals — proponer un skill que no existe.
 *
 * AUTH: communityAuthMiddleware + requireAccountType('candidate'). Opera solo
 * sobre req.userId: el body no acepta ningún id de usuario, así que nadie puede
 * proponer en nombre de otro.
 */
router.post(
  '/',
  communityAuthMiddleware,
  requireAccountType('candidate'),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = skillProposalSchema.safeParse(req.body)

      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return res
          .status(400)
          .json({ error: 'validation_error', field: 'text', message: issue.message })
      }

      const result = await proposeSkill(req.userId!, parsed.data.text)

      switch (result.outcome) {
        case 'resolved':
          return res.status(200).json({ outcome: 'resolved', skill: result.skill })
        case 'joined':
          return res.status(200).json({ outcome: 'joined', proposal: result.proposal })
        case 'created':
          return res.status(201).json({ outcome: 'created', proposal: result.proposal })
        case 'rejected':
          return res.status(409).json({ error: 'skill_rejected', reason: result.reason })
        case 'limit_reached':
          return res.status(409).json({ error: 'proposal_limit', limit: result.limit })
      }
    } catch (error) {
      console.error('Community Propose skill error:', error)
      res.status(500).json({ error: 'Error al proponer el skill' })
    }
  },
)

/**
 * GET /api/community/skill-proposals/mine — el estado de mis propuestas.
 *
 * AUTH: igual que arriba. Devuelve solo las propuestas donde req.userId es
 * interesado, así el candidato ve el resultado de las decisiones que el
 * superadmin toma en la base de datos (FR-018).
 */
router.get(
  '/mine',
  communityAuthMiddleware,
  requireAccountType('candidate'),
  async (req: AuthRequest, res: Response) => {
    try {
      res.json({ proposals: await proposalsForUser(req.userId!) })
    } catch (error) {
      console.error('Community Get my skill proposals error:', error)
      res.status(500).json({ error: 'Error al obtener tus propuestas' })
    }
  },
)

export default router
