import { Router } from 'express'
import * as AiController from '../controllers/ai.controller'

const router = Router()

/**
 * @swagger
 * /api/generate:
 *   post:
 *     summary: Generar contenido usando AI
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Contenido generado
 */
router.post('/generate', AiController.generate)

/**
 * @swagger
 * /api/suggest:
 *   post:
 *     summary: Sugerir temas usando AI
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Temas sugeridos
 */
router.post('/suggest', AiController.suggest)

export default router
